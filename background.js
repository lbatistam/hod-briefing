importScripts("settings.js");
const DEFAULT_MODEL = "groq-gpt-oss-120b";
const MODEL_CONFIGS = Object.freeze({
  ...HOD_CONFIG.models
});
const MAX_SOURCE_CHARS = 60000;
const MAX_OUTPUT_TOKENS = 4096;
let generationInFlight = false;
let systemPromptPromise;

const ALLOWED_TOPIC_TYPES = new Set(["trabalho", "formacao", "localidade", "familia", "objetivo", "transicao", "conhecimento", "estrutura", "financeiro", "dificuldade", "saude", "relacionamento", "mercado", "comercial", "positivo", "contexto"]);
const schema = {
  type: "object", additionalProperties: false, required: ["nome", "resumo", "topicos", "perfil"],
  properties: {
    nome: { type: "string" },
    perfil: { type: "object", additionalProperties: false, required: ["ocupacao", "situacao", "evidencia"],
      properties: { ocupacao: { type: "string" }, situacao: { type: "string" }, evidencia: { type: "string" } } },
    resumo: { type: "string", maxLength: 420 },
    topicos: { type: "array", minItems: 0, maxItems: 5, items: {
      type: "object", additionalProperties: false, required: ["tipo", "texto", "evidencia"],
      properties: {
        tipo: { type: "string", enum: [...ALLOWED_TOPIC_TYPES] },
        texto: { type: "string", maxLength: 240 },
        evidencia: { type: "string", maxLength: 360 }
      }
    } }
  }
};

function normalizeBriefingData(value) {
  if (!value || typeof value !== "object") return { nome: "", resumo: "", topicos: [] };
  const rawTopics = Array.isArray(value) ? value : value.topicos || value.tópicos || value.topics || value.itens;
  if (!Array.isArray(rawTopics)) return { nome: String(value.nome || value.name || "").trim(), resumo: String(value.resumo || value.summary || "").trim(), topicos: [] };
  const topicos = rawTopics.flatMap(item => {
    if (typeof item === "string") {
      const texto = item.trim();
      return texto ? [{ tipo: "contexto", texto, evidencia: "" }] : [];
    }
    if (!item || typeof item !== "object") return [];
    const texto = String(item.texto || item.text || item.frase || "").trim();
    if (!texto) return [];
    const requestedType = String(item.tipo || item.type || "contexto").trim().toLocaleLowerCase("pt-BR");
    return [{ tipo: ALLOWED_TOPIC_TYPES.has(requestedType) ? requestedType : "contexto", texto, evidencia: String(item.evidencia || item.evidência || item.evidence || "").trim() }];
  }).slice(0, 5);
  const p = value.perfil || {};
  const perfil = { ocupacao: String(p.ocupacao || "").slice(0, 60), situacao: String(p.situacao || "").slice(0, 50), evidencia: String(p.evidencia || "").slice(0, 500) };
  return { nome: String(value.nome || value.name || "").trim(), resumo: String(value.resumo || value.summary || "").trim(), perfil, topicos };
}

function completeJsonObjects(text) {
  const objects = [], stack = [];
  let quoted = false, escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === "{") stack.push(index);
    if (character === "}" && stack.length) objects.push(text.slice(stack.pop(), index + 1));
  }
  return objects;
}

function parseModelBriefing(content) {
  const raw = String(content || "").replace(/^\uFEFF/, "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const candidates = [raw];
  const firstBrace = raw.indexOf("{"), lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try { return { data: normalizeBriefingData(JSON.parse(candidate)), recovered: candidate !== raw }; } catch (_) {}
  }
  const topicos = [];
  for (const objectText of completeJsonObjects(raw)) {
    try {
      const normalized = normalizeBriefingData([JSON.parse(objectText)]);
      if (normalized.topicos.length) topicos.push(...normalized.topicos);
    } catch (_) {}
  }
  const nameMatch = raw.match(/"(?:nome|name)"\s*:\s*("(?:\\.|[^"\\])*")/i);
  let nome = "";
  if (nameMatch) try { nome = JSON.parse(nameMatch[1]); } catch (_) {}
  const summaryMatch = raw.match(/"(?:resumo|summary)"\s*:\s*("(?:\\.|[^"\\])*")/i);
  let resumo = "";
  if (summaryMatch) try { resumo = JSON.parse(summaryMatch[1]); } catch (_) {}
  return { data: { nome, resumo, topicos: topicos.slice(0, 5) }, recovered: true };
}

function modelOutputQuality(data, source) {
  const topics = Array.isArray(data?.topicos) ? data.topicos : [];
  const lowValue = /^(?:tudo bem\??|oi+|ol[aá]|bom dia|boa tarde|boa noite|sim|quero sim|tenho sim|ok|pode ser|interessante|realmente|claro(?: meu|minha)?(?: amigo|amiga)?|quero saber mais detalhes(?: sobre (?:o|a) (?:curso|consultoria|mentoria))?|\d+\s+(?:dias?|semanas?|meses?|anos?))\s*[!?.]*$/i;
  const usefulEvidence = [...new Set(String(source || "").split("\n")
    .filter(line => /^(?:RESPOSTA DO LEAD|FATO CONTEXTUALIZADO DETERMINÍSTICO|CRM \(FATO DO FORMULÁRIO)/.test(line))
    .map(line => line.replace(/^[^:]+:\s*/, "").trim())
    .filter(text => text.length >= 12 && !lowValue.test(text))
    .filter(text => !/\b(?:telefone|e-?mail|agend|reuni[aã]o|consultoria|google meet|convite)\b/i.test(text))
    .map(text => text.toLocaleLowerCase("pt-BR")))];
  const valuableTopics = topics.filter(item => {
    const text = String(item?.texto || "").trim();
    const evidence = String(item?.evidencia || "").trim();
    const type = String(item?.tipo || "").trim().toLocaleLowerCase("pt-BR");
    return type !== "contexto" && type !== "disponibilidade" && text.length >= 12 && !lowValue.test(text) && !lowValue.test(evidence);
  });
  const minimum = usefulEvidence.length ? Math.min(3, Math.max(1, Math.ceil(usefulEvidence.length * .35))) : 0;
  const hasSummary = String(data?.resumo || "").trim().length >= 45;
  return { valid: hasSummary && valuableTopics.length >= minimum && valuableTopics.length === topics.length && topics.length <= 4, usefulEvidence: usefulEvidence.length, valuableTopics: valuableTopics.length };
}

function leadEvidenceLines(source) {
  return String(source || "").split("\n")
    .filter(line => /^(?:RESPOSTA DO LEAD|CRM \(FATO|FATO CONTEXTUALIZADO)/.test(line))
    .map(line => line.replace(/^[^:]+:\s*/, "").trim())
    .filter(Boolean);
}

function evidenceWords(value) {
  const ignored = new Set(["para", "como", "mais", "menos", "muito", "pouco", "sobre", "porque", "quando", "onde", "esse", "essa", "isso", "tenho", "tem", "trabalho", "trabalhar", "busca", "quer", "quero", "lead"]);
  return new Set(String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(word => word.length >= 4 && !ignored.has(word)));
}

// O modelo às vezes altera flexão ou pontuação da citação literal. Nesse caso,
// aceitamos somente uma correspondência semântica curta com uma fala do lead;
// a camada de apresentação ainda elimina qualquer tópico sem base na conversa.
function evidenceMatchesLead(quote, lines) {
  const normalizedQuote = String(quote || "").trim().toLocaleLowerCase("pt-BR");
  if (normalizedQuote.length < 4) return false;
  if (lines.some(line => line.toLocaleLowerCase("pt-BR").includes(normalizedQuote))) return true;
  const claim = evidenceWords(quote);
  if (!claim.size) return false;
  return lines.some(line => {
    const facts = evidenceWords(line);
    const matches = [...claim].filter(word => facts.has(word)).length;
    const minimum = claim.size <= 2 ? claim.size : Math.max(2, Math.ceil(claim.size * .55));
    return matches >= minimum;
  });
}

function redactSensitiveData(source) {
  return String(source || "")
    .replace(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/g, "[DOCUMENTO REMOVIDO]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL REMOVIDO]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}\b/g, "[TELEFONE REMOVIDO]")
    .replace(/https?:\/\/\S+/gi, "[LINK REMOVIDO]")
    .replace(/\b(?:cpf|cnpj)\s*[:\-]?\s*[\d.\/-]{11,18}\b/gi, "[DOCUMENTO REMOVIDO]")
    .trim();
}

function limitSource(source) {
  const clean = redactSensitiveData(source);
  if (clean.length <= MAX_SOURCE_CHARS) return { text: clean, truncated: false };
  throw new Error("A conversa excede o tamanho seguro para uma chamada. Nenhum trecho foi omitido nem enviado à IA.");
}

async function getGroqKey() {
  const stored = await chrome.storage.local.get({ groqApiKey: "" });
  return String(stored.groqApiKey || "").trim();
}

async function groqFetch(payload, timeout) {
  const apiKey = await getGroqKey();
  if (!apiKey) {
    const error = new Error("Configure sua chave gratuita da Groq na aba IA da extensão.");
    error.configuration = true;
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) {
      const detail = result?.error?.message || "";
      const error = new Error(detail || `A Groq respondeu com erro ${response.status}.`);
      error.status = response.status;
      error.retryable = response.status === 429 || response.status >= 500;
      error.configuration = [400, 401, 403].includes(response.status);
      throw error;
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("A Groq demorou demais para responder.");
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally { clearTimeout(timer); }
}

function groqPayload(system, source, maxOutputTokens = MAX_OUTPUT_TOKENS, options = HOD_CONFIG.defaults) {
  const config = MODEL_CONFIGS[options.aiModel] || MODEL_CONFIGS[DEFAULT_MODEL];
  if (!config.strict) system += "\nSiga esta estrutura JSON: " + JSON.stringify(schema);
  const payload = {
    model: config.apiModel,
    messages: [{ role: "system", content: system }, { role: "user", content: source }],
    max_completion_tokens: maxOutputTokens,
    temperature: 0.1,
    response_format: config.strict ? { type: "json_schema", json_schema: { name: "hod_briefing", strict: true, schema } } : { type: "json_object" }
  };
  if (config.reasoning) { payload.reasoning_effort = options.reasoning; payload.include_reasoning = false; }
  return payload;
}

async function callModel(modelId, system, source, maxOutputTokens = MAX_OUTPUT_TOKENS, options = HOD_CONFIG.defaults) {
  const config = MODEL_CONFIGS[modelId];
  if (!config) throw new Error("Modelo de IA desconhecido.");
  const startedAt = performance.now();
  const raw = await groqFetch(groqPayload(system, source, maxOutputTokens, { ...options, aiModel: modelId }), options.timeoutSeconds * 1000);
  const content = String(raw?.choices?.[0]?.message?.content || "").trim();
  const meta = raw?.usage || {};
  const usage = { input: Number(meta.prompt_tokens || 0), output: Number(meta.completion_tokens || 0), total: Number(meta.total_tokens || 0) };
  if (!content) {
    const error = new Error(`${config.label} não devolveu conteúdo.`);
    error.retryable = true;
    throw error;
  }
  if (raw.choices?.[0]?.finish_reason === "length") throw new Error("A resposta atingiu o limite de saída. Reduza o raciocínio ou tente novamente.");
  return { content, usage, latencyMs: Math.round(performance.now() - startedAt), model: modelId, label: config.label, provider: "Groq Cloud" };
}

async function aiOptions() {
  const o = await chrome.storage.sync.get(HOD_CONFIG.defaults);
  o.aiModel = MODEL_CONFIGS[o.aiModel] ? o.aiModel : DEFAULT_MODEL;
  o.reasoning = ["low", "medium", "high"].includes(o.reasoning) ? o.reasoning : "medium";
  o.timeoutSeconds = Math.min(90, Math.max(10, Number(o.timeoutSeconds) || 35));
  o.retries = Math.min(2, Math.max(0, Number(o.retries) || 0));
  o.topicCount = Math.min(5, Math.max(2, Number(o.topicCount) || 5));
  return o;
}

async function callAi(conversation, ownsLock = false) {
  if (!ownsLock) {
    if (generationInFlight) throw new Error("Um briefing já está sendo gerado. Aguarde alguns segundos.");
    generationInFlight = true;
    try { return await callAi(conversation, true); } finally { generationInFlight = false; }
  }
  if (typeof conversation !== "string" || !conversation.trim()) throw new Error("Nenhuma conversa foi enviada para gerar o briefing.");
  systemPromptPromise ||= fetch(chrome.runtime.getURL("briefing.md")).then(response => {
    if (response.ok === false) throw new Error("Não foi possível carregar as regras do briefing.");
    return response.text();
  }).catch(error => { systemPromptPromise = undefined; throw error; });
  const options = await aiOptions();
  const system = (await systemPromptPromise) + "\nLimite de tópicos: " + options.topicCount + ". Em conversa rica, use todos os tópicos necessários dentro do limite e preserve trajetória, tentativas, contexto e objetivo. Não descarte um fato relevante apenas por ele não caber como tópico: inclua-o no resumo. JSON obrigatório.";
  const limited = limitSource(conversation);
  let answer;
  const started = performance.now();
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try { answer = await callModel(options.aiModel, system, limited.text, options.reasoning === "high" ? 8192 : MAX_OUTPUT_TOKENS, options); break; }
    catch (error) {
      if (!error.retryable || attempt === options.retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  const parsed = parseModelBriefing(answer.content);
  if (!parsed.data.resumo || parsed.recovered) throw new Error("A IA devolveu uma resposta incompleta. Nada foi inventado para preencher o briefing.");
  // Validação usa exclusivamente falas do lead/formulário, nunca alegações do SDR.
  // Não bloqueie um briefing bom apenas porque o modelo flexionou uma evidência.
  const evidenceLines = leadEvidenceLines(limited.text);
  if (!evidenceLines.length) throw new Error("A captura não contém respostas do lead nem dados do formulário para gerar o briefing.");
  parsed.data.topicos = parsed.data.topicos.filter(t => t.evidencia.length >= 4 && evidenceMatchesLead(t.evidencia, evidenceLines)).slice(0, options.topicCount);
  if (!parsed.data.perfil.evidencia || !evidenceMatchesLead(parsed.data.perfil.evidencia, evidenceLines)) parsed.data.perfil = { ocupacao: "", situacao: "", evidencia: "" };
  const quality = modelOutputQuality(parsed.data, limited.text);
  return {
    data: parsed.data,
    model: answer.model,
    provider: answer.provider,
    label: answer.label,
    latencyMs: Math.round(performance.now() - started),
    usedFallback: false,
    recovered: parsed.recovered || !quality.valid,
    quality,
    sourceTruncated: limited.truncated,
    usage: answer.usage
  };
}

async function testModel(modelId) {
  const options = await aiOptions();
  modelId ||= options.aiModel;
  const config = MODEL_CONFIGS[modelId];
  if (!config) throw new Error("Modelo desconhecido.");
  const startedAt = performance.now();
  const result = await callAi("RESPOSTA DO LEAD (EVIDÊNCIA LITERAL): Sou ator e trabalho por projeto. Busco renda previsível para continuar disponível para novos trabalhos.\nRESPOSTA DO LEAD (EVIDÊNCIA LITERAL): Minha carreira de ator continua sendo prioridade.");
  return { ok: true, ...result, label: MODEL_CONFIGS[result.model].label, latencyMs: Math.round(performance.now() - startedAt) };
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === "groq-save-key") {
    chrome.storage.local.set({ groqApiKey: String(message.key || "").trim() }).then(() => respond({ ok: true })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "groq-key-status") {
    getGroqKey().then(key => respond({ ok: true, configured: Boolean(key), masked: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : "" })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "ai-test-model") {
    testModel(message.model).then(respond).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "ai-generate") {
    callAi(message.conversation).then(result => respond({ ok: true, ...result })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(details => {
  chrome.storage.local.remove(["lastBriefing", "lastConversation", "geminiApiKey"]).catch(() => {});
  chrome.storage.sync.remove(["primaryModel", "fallbackModel"]).catch(() => {});
  if (details?.reason === "update" && /^6\.1\./.test(details.previousVersion || "")) {
    chrome.storage.sync.set({ topicCount: 4 }).catch(() => {});
  }
});
