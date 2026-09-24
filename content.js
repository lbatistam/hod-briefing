(() => {
  "use strict";

  // O CRM pode definir/alterar window.chrome. Preserve as APIs reais da
  // extensão no instante em que o content script entra no mundo isolado.
  const extensionRuntime = globalThis.chrome?.runtime;
  const extensionStorage = globalThis.chrome?.storage;

  function extensionDisconnectedError() {
    return new Error("A extensão foi atualizada ou desconectada desta aba. Atualize a página do CRM e tente novamente.");
  }

  async function sendExtensionMessage(message) {
    if (!extensionRuntime?.sendMessage) throw extensionDisconnectedError();
    try {
      return await extensionRuntime.sendMessage(message);
    } catch (error) {
      if (/context invalidated|extension context|receiving end|sendMessage/i.test(String(error?.message || error))) {
        throw extensionDisconnectedError();
      }
      throw error;
    }
  }

  const BUTTON_ID = "hod-v2-briefing-button";
  const POSITION_KEY = "hod-v2-briefing-button-position";
  const DEFAULT_SETTINGS = {
    enabled: true, displayMode: "conversation", buttonSize: "normal", buttonTheme: "auto", customColor: "#0aa69b", showStatus: true,
    iconOnly: false, buttonLabel: "Briefing", agentName: "FELIPE",
    groupMessages: true, includeContactHeader: true, ...HOD_CONFIG.defaults
  };
  let currentSettings = { ...DEFAULT_SETTINGS };
  let captureInfo = {};
  let captureBusy = false;
  let v2Current = null;
  let v2Capture = null;
  const TIME_RE = /(?:\b(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM)?\b)/i;
  const TIME_ONLY_RE = /^(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM)?$/i;
  const RELATIVE_TIME_ONLY_RE = /^(?:a few seconds ago|(?:há|a) poucos segundos|\d+\s+(?:seconds?|minutes?|hours?|segundos?|minutos?|horas?)\s+ago)$/i;
  const PAGE_RE = /(?:^|\n)\s*Página\s*:/i;
  const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const PHONE_RE = /(?<!\d)(?:\+?\d[\s().-]*){8,15}(?!\d)/;
  const DATE_ONLY_RE = /^(?:(?:hoje|ontem|today|yesterday)|(?:\d{1,2}[/-]){1,2}\d{2,4}|(?:jan|feb|fev|mar|apr|abr|may|mai|jun|jul|aug|ago|sep|set|oct|out|nov|dec|dez)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\s+(?:jan|feb|fev|mar|apr|abr|may|mai|jun|jul|aug|ago|sep|set|oct|out|nov|dec|dez)[a-z]*(?:\s+\d{4})?)$/i;
  const AUTOMATION_RE = /\b(?:appointment\b.*\bcreated|opportunity\b.*\b(?:created|moved)|reuni[aã]o agendada|consulta agendada|workflow|automa[cç][aã]o)\b/i;
  // Chaves internas estáveis. O GHL muda o texto visível dos campos conforme
  // o funil, portanto os rótulos exibidos são resolvidos por aliases abaixo.
  const CONTACT_FIELDS = ["Nome", "Sobrenome", "Data de nascimento", "Fonte de contato", "Tipo de contato", "Situação", "Reserva", "Investimento", "Computador", "Renda", "Motivo", "Dificuldade", "Justificativa", "Idade", "Score", "Plataforma de Pagamento", "Tempo disponível", "Acompanha Felipe", "Formação", "Experiência", "Estado", "Gênero", "Situação financeira", "Capacidade para investir"];
  const CONTACT_FIELD_ALIASES = new Map([
    ["nome", "Nome"], ["sobrenome", "Sobrenome"], ["data de nascimento", "Data de nascimento"],
    ["fonte de contato", "Fonte de contato"], ["tipo de contato", "Tipo de contato"],
    ["situação", "Situação"], ["situacao", "Situação"], ["situação profissional atual", "Situação"], ["situacao profissional atual", "Situação"],
    ["reserva", "Reserva"], ["investimento", "Investimento"], ["capacidade para investir", "Capacidade para investir"],
    ["computador", "Computador"], ["possui computador", "Computador"],
    ["renda", "Renda"], ["faixa de renda mensal", "Renda"], ["renda mensal", "Renda"],
    ["motivo", "Motivo"], ["dificuldade", "Dificuldade"], ["justificativa", "Justificativa"],
    ["idade", "Idade"], ["idade do lead", "Idade"], ["score", "Score"], ["score do lead (0 a 100)", "Score"], ["score do lead", "Score"], ["lead score", "Score"],
    ["plataforma de pagamento", "Plataforma de Pagamento"], ["tempo disponível por dia", "Tempo disponível"], ["tempo disponivel por dia", "Tempo disponível"], ["tempo disponível", "Tempo disponível"],
    ["há quanto tempo acompanha o felipe", "Acompanha Felipe"], ["ha quanto tempo acompanha o felipe", "Acompanha Felipe"],
    ["formação acadêmica", "Formação"], ["formacao academica", "Formação"], ["formação", "Formação"], ["formacao", "Formação"],
    ["experiência", "Experiência"], ["experiencia", "Experiência"], ["estado", "Estado"], ["gênero", "Gênero"], ["genero", "Gênero"],
    ["situação financeira atual", "Situação financeira"], ["situacao financeira atual", "Situação financeira"], ["situação financeira", "Situação financeira"], ["situacao financeira", "Situação financeira"]
  ]);
  const ACTIVITY_FIELD_ALIASES = new Map([
    ["full name", "Nome"], ["nome completo", "Nome"],
    ["date of birth", "Data de nascimento"], ["data de nascimento", "Data de nascimento"],
    ["score do lead", "Score"], ["lead score", "Score"], ["score", "Score"],
    ["renda", "Renda"], ["situação", "Situação"], ["situacao", "Situação"],
    ["motivo", "Motivo"], ["idade", "Idade"], ["reserva", "Reserva"],
    ["investimento", "Investimento"], ["computador", "Computador"],
    ["dificuldade", "Dificuldade"], ["justificativa", "Justificativa"],
    ["plataforma de pagamento", "Plataforma de Pagamento"]
  ]);

  const contactFieldForLabel = label => CONTACT_FIELD_ALIASES.get(normalize(label).toLocaleLowerCase("pt-BR")) || "";
  const MESSAGE_SELECTORS = [
    '[data-testid*="message" i]', '[data-test*="message" i]',
    '[class*="message-item" i]', '[class*="conversation-message" i]',
    '[class*="chat-message" i]', '[class*="message-bubble" i]'
  ];


  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = text => (text || "")
    .replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  function isMeetingAvailabilityText(text) {
    const clean = normalize(text);
    if (!clean) return false;
    const clock = /(?:(?:^|\s)(?:às?|as?)\s*(?:[01]?\d|2[0-3])(?::[0-5]\d)?(?=\s|$|[,.])|\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b(?:[01]?\d|2[0-3])\s*(?:h|horas?)\b)/i;
    const clockOnly = /^(?:às?|as?)?\s*(?:(?:[01]?\d|2[0-3])(?::[0-5]\d)?|uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|vinte e uma|vinte e duas|vinte e tr[eê]s)\s*(?:h|hr|horas?)?(?:\s+(?:da|de)\s+(?:manh[aã]|tarde|noite))?\s*$/i;
    const period = /\b(?:final|fim) do dia\b/i;
    const meeting = /\b(?:conversa|consultoria|reuni[aã]o|call|liga[cç][aã]o|chamada|google meet|agenda(?:mento|r)?|hor[aá]rio de disponibilidade)\b/i;
    const availability = /\b(?:dispon[ií]vel|disponibilidade|disponibiliza|livre|posso|pode|consigo|consegue|indica|informou|hor[aá]rio)\b/i;
    const professional = /\b(?:trabalh\w*|atividade|rotina profissional|expediente|turno|escala|por dia|por semana)\b/i;
    const narratedSchedule = /(?:indica|informou|disse|disponibiliza)/i.test(clean) &&
      (clock.test(clean) || period.test(clean)) && /(?:hor[aá]rio|disponibilidade)/i.test(clean);
    return clockOnly.test(clean) || meeting.test(clean) && (availability.test(clean) || clock.test(clean) || period.test(clean)) ||
      (clock.test(clean) || period.test(clean)) && availability.test(clean) && !professional.test(clean) ||
      narratedSchedule;
  }

  function isGenericInterestText(text) {
    const clean = normalize(text);
    if (!clean) return false;
    if (/\b(?:motivos? pessoais?|filh[oa]s?|fam[ií]lia|sa[uú]de|mudan[cç]a|desempreg|endividad|cidade|rotina|hor[aá]rios?)\b/i.test(clean)) return false;
    if (/quer (?:saber|conhecer|entender) mais|(?:saber|conhecer|entender) mais detalhes|conheceu.*(?:v[ií]deo|empresa)|\b(?:curso|consultoria|mentoria)\b.*\b(?:detalhes|funciona)\b/i.test(clean)) return true;
    return /(?:demonstra|demonstrou|mostra|mostrou|tem|confirmou) interesse|(?:est[aá] aberto|topa|aceitou|receptiv[oa]|dispost[oa] a participar)/i.test(clean) &&
      /(?:aprofundar|saber mais|conhecer (?:melhor|mais|a [aá]rea)|entender (?:melhor|mais)|proposta|consultoria|oportunidade|home office|trabalho remoto)/i.test(clean);
  }

  function isBareAffirmativeReply(text) {
    const clean = normalize(text);
    if (!clean) return false;
    return /^(?:sim\s+(?:tenho|consigo)(?:\s+sim)?(?:\s+(?:irm[aã]o|amigo|cara|mano|meu amigo))?|(?:tenho|consigo)\s+sim(?:\s+(?:irm[aã]o|amigo|cara|mano|meu amigo))?|sim\s+(?:irm[aã]o|amigo|cara|mano|meu amigo))[!,.\s]*$/i.test(clean);
  }

  function painTopicType(text) {
    const clean = normalize(text).toLocaleLowerCase("pt-BR");
    if (!clean) return "";
    if (/\b(?:depress[aã]o|ansiedade|burnout|p[aâ]nico|doen[cç]a|tratamento|sa[uú]de)\b/i.test(clean)) return "saude";
    if (/(?:contas? atrasad|endividad|d[ií]vida|sem renda|n[aã]o tenho renda|dificuldade financeira|urg[eê]ncia financeira|preciso (?:urgente |muito )?(?:de )?dinheiro|sal[aá]rio (?:baixo|insuficiente)|n[aã]o consigo pagar)/i.test(clean)) return "financeiro";
    if (/(?:cansad[oa]|exaust[oa]|desgast(?:e|ad[oa])|estressad[oa]|sobrecarga|jornada excessiva|trabalho exaustivo|falta de reconhecimento|sem crescimento|ambiente t[oó]xico|(?:problema|briga|conflito|ruim|chat[oa]|t[oó]xico).{0,45}(?:chefe|colega|companheir[oa] de trabalho)|(?:chefe|colega|companheir[oa] de trabalho).{0,45}(?:problema|briga|conflito|ruim|chat[oa]|t[oó]xico))/i.test(clean)) return "dificuldade";
    if (/(?:medo|receio|inseguran[cç]a|desconfian[cç]a).{0,100}(?:home office|digital|[aá]rea|trabalho remoto|conseguir|golpe|fraude|pagar|pagamento|investir|investimento|curso|consultoria)/i.test(clean)) return "dificuldade";
    if (/(?:curso|consultoria|mentoria|plataforma|tentativa).{0,100}(?:n[aã]o deu certo|n[aã]o funcionou|sem resultado|n[aã]o tive resultado|perdi dinheiro)/i.test(clean)) return "dificuldade";
    if (/(?:n[aã]o sei por onde come[cç]ar|dificuldade (?:em|para) (?:achar|encontrar|escolher|entrar|come[cç]ar)|n[aã]o encontro vagas?|n[aã]o consigo entrar|n[aã]o sei (?:qual|que) [aá]rea|n[aã]o sei onde estudar)/i.test(clean)) return "dificuldade";
    return "";
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.height > 4 && r.width > 20 && s.display !== "none" && s.visibility !== "hidden";
  }

  function scoreScroller(el) {
    const r = el.getBoundingClientRect();
    if (!visible(el) || el.scrollHeight <= el.clientHeight + 60) return -1;
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY)) return -1;
    const centerBias = r.left < innerWidth * .78 && r.right > innerWidth * .22 ? 50000 : 0;
    return centerBias + Math.min(el.scrollHeight, 100000) + r.width * r.height;
  }

  function findScroller() {
    let anchors = [...document.querySelectorAll(MESSAGE_SELECTORS.join(","))];
    // O fallback amplo só é necessário quando o GHL muda os seletores. Evita
    // ler innerText de milhares de nós em toda execução normal.
    if (!anchors.length) {
      anchors = [...document.querySelectorAll("div,li")].slice(-1200).filter(el => {
        const t = el.textContent || "";
        return t.length < 1200 && (PAGE_RE.test(t) || TIME_RE.test(t));
      });
    }
    const candidates = new Set();
    for (const anchor of anchors) {
      let node = anchor.parentElement;
      for (let i = 0; node && i < 9; i++, node = node.parentElement) candidates.add(node);
    }
    if (!candidates.size) document.querySelectorAll("main div, [role=main] div").forEach(x => candidates.add(x));
    return [...candidates].sort((a, b) => scoreScroller(b) - scoreScroller(a))[0] || null;
  }

  function smallestMessageBlocks(root) {
    // O GHL fornece um identificador estável no contêiner real de cada
    // mensagem. Ele deve vencer os seletores genéricos internos; capturar o
    // `.chat-message` filho fazia a mesma mensagem reaparecer a cada rolagem.
    const stable = [...root.querySelectorAll("[data-message-id]")].filter(visible);
    if (stable.length) return stable.filter(el => !el.parentElement?.closest("[data-message-id]"));
    const selected = new Set(root.querySelectorAll(MESSAGE_SELECTORS.join(",")));
    if (!selected.size) {
      [...root.querySelectorAll("div, li, article")].slice(-800).forEach(el => {
        const text = normalize(el.textContent);
        if (!text || text.length > 700 || !visible(el)) return;
        if (!(PAGE_RE.test(text) || TIME_RE.test(text))) return;
        const childMatches = [...el.children].filter(child => {
          const t = normalize(child.textContent);
          return t && (PAGE_RE.test(t) || TIME_RE.test(t));
        });
        if (childMatches.length < 2) selected.add(el);
      });
    }
    const visibleCandidates = [...selected].filter(el => visible(el));
    return visibleCandidates.filter(el => !visibleCandidates.some(other =>
      other !== el && el.contains(other) && normalize(other.innerText).length > 1
    ));
  }

  function isOpaqueMediaArtifact(value) {
    const text = normalize(value);
    if (!text) return false;
    return /(?:^|[?&\s])asset_?id\s*=|(?:^|[?&\s])signature\s*=|(?:cdn|media|attachment|signed)[_-]?(?:url|id)\s*=|[?&](?:expires|token|key|policy)=/i.test(text) ||
      (/^[?&]/.test(text) && /=[A-Za-z0-9_%-]{12,}/.test(text));
  }

  function isLowValueLeadChatter(value) {
    const text = normalize(value).replace(/[.!?,;:\s]+$/g, "").toLocaleLowerCase("pt-BR");
    if (/^(?:(?:t[oô]|estou|tudo)\s+(?:bem|bom|certo))(?:\s+\w+){0,5}$/.test(text)) return true;
    return /^(?:o+i+|ol[aá]|bom dia|boa tarde|boa noite|tudo (?:bem|bom|certo)(?: e (?:voc[eê]|contigo))?|joia|prazer|bora+|perfeito|show+|legal|beleza|ok|obrigad[oa]|at[eé] mais|entendi|faz sentido(?: sim)?|como funciona|perfeito[, ]*como funciona|claro(?: meu|minha)?(?: amigo|amiga)?|quero saber mais detalhes(?: sobre (?:o|a) (?:curso|consultoria|mentoria))?|teria que pagar algo|(?:possuo|possui|tenho) sim[, ]*(?:eu )?consigo|pode ser(?: hoje mesmo)?|o hor[aá]rio que ficar bom(?: pra|para) (?:ti|voc[eê])|desde j[aá] agrade[cç]o)$/.test(text);
  }

  function cleanMessage(raw) {
    const lines = normalize(raw)
      .split("\n")
      .map(line => line.trim())
      .filter(line => {
        if (!line || /^Página\s*:/i.test(line) || TIME_ONLY_RE.test(line) || RELATIVE_TIME_ONLY_RE.test(line) || DATE_ONLY_RE.test(line)) return false;
        if (EMAIL_RE.test(line) || PHONE_RE.test(line) || AUTOMATION_RE.test(line) || isOpaqueMediaArtifact(line)) return false;
        return !/^(?:Detalhes|more_vert|expand_more|editar|excluir|responder|encaminhar|copiar|curtir|status|enviado|entregue|lido|falhou|adicionar|a[cç][oõ]es)$/i.test(line);
      });
    const body = normalize(lines.join("\n"));
    return isOpaqueMediaArtifact(body) ? "" : body;
  }

  function directionFor(el, scroller) {
    // No GHL atual o `data-message-id` fica num contêiner de largura total,
    // enquanto a direção está na bolha interna. Consultar o descendente antes
    // da geometria evita classificar toda a conversa como lead.
    if (el.querySelector?.(".chat-bubble-outbound")) return "outgoing";
    if (el.querySelector?.(".chat-bubble-inbound")) return "incoming";
    const messageContainer = el.querySelector?.(".message-container");
    const containerClasses = typeof messageContainer?.className === "string" ? messageContainer.className : "";
    if (/(?:^|\s)ml-auto(?:\s|$)|flex-row-reverse/i.test(containerClasses)) return "outgoing";
    if (/(?:^|\s)mr-auto(?:\s|$)/i.test(containerClasses)) return "incoming";
    let node = el;
    let attributes = "";
    let classes = "";
    for (let i = 0; node && node !== scroller && i < 5; i++, node = node.parentElement) {
      classes += ` ${typeof node.className === "string" ? node.className : ""}`;
      attributes += ` ${node.getAttribute?.("data-direction") || ""} ${node.getAttribute?.("data-message-direction") || ""} ${node.getAttribute?.("data-sender-type") || ""}`;
    }
    if (/\b(?:outbound|outgoing|sent|from-me)\b/i.test(attributes)) return "outgoing";
    if (/\b(?:inbound|incoming|received|from-them)\b/i.test(attributes)) return "incoming";
    if (/(?:^|[\s_-])(?:chat-bubble-outbound|message-right|justify-end|flex-end|from-me)(?:$|[\s_-])/i.test(classes)) return "outgoing";
    if (/(?:^|[\s_-])(?:chat-bubble-inbound|message-left|justify-start|flex-start|from-them)(?:$|[\s_-])/i.test(classes)) return "incoming";
    const er = el.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    return er.left + er.width / 2 > sr.left + sr.width / 2 ? "outgoing" : "incoming";
  }

  function validContactName(value) {
    let clean = String(value || "").replace(/\u00a0/g, " ").trim();
    clean = clean.split(/\n+/)[0].replace(/[ \t]+/g, " ").trim();
    // Alguns cabeçalhos do Instagram não separam semanticamente o usuário do
    // próximo campo e entregam textos como "takcno E-mail" em um único nó.
    clean = clean
      .replace(/^@/, "")
      .replace(/\s*\|\s*.+$/, "")
      .replace(/\s+(?:e-?mail|telefone|phone|nome|sobrenome|contato|propriet[aá]rio|seguidores|tags?|fonte de contato|tipo de contato|situa[cç][aã]o|data de nascimento)(?:\s.*)?$/i, "")
      .trim();
    if (!clean || clean.length > 80) return "";
    if (/^(?:nome|sobrenome|contato|--|null|undefined|lead|instagram|whatsapp|facebook|conversas|us)$/i.test(clean)) return "";
    if (TIME_RE.test(clean) || EMAIL_RE.test(clean) || PHONE_RE.test(clean)) return "";
    return clean;
  }

  function firstValidText(elements) {
    for (const element of elements) {
      const value = validContactName(element?.value || element?.innerText || element?.textContent);
      if (value) return value;
    }
    return "";
  }

  function fieldValue(labelText) {
    const labels = [...document.querySelectorAll("label,dt,span,div")]
      .filter(el => normalize(el.innerText) === labelText && el.children.length < 2);
    for (const label of labels) {
      const containers = [label.parentElement].filter(Boolean);
      for (const container of containers) {
        const inputValue = firstValidText([...container.querySelectorAll("input,textarea,[contenteditable=true]")]);
        if (inputValue) return inputValue;
        const descendants = [...container.querySelectorAll(":scope > *, :scope > * > *")]
          .filter(el => el !== label && !el.contains(label) && normalize(el.innerText) !== labelText);
        const value = firstValidText(descendants);
        if (value) return value;
      }
      const siblingValue = firstValidText([label.nextElementSibling, label.parentElement?.nextElementSibling]);
      if (siblingValue) return siblingValue;
    }
    return "";
  }

  function validFieldValue(value, label = "") {
    const clean = normalize(value);
    if (!clean || clean === normalize(label) || clean.length > 500) return "";
    if (/^(?:-{2,}|null|undefined|n\/a|digite aqui\.{0,3}|selecione|não informado)$/i.test(clean)) return "";
    // Cabeçalhos do drawer do CRM às vezes surgem como o valor do campo anterior.
    if (/^(?:origem|perfil|informações gerais|campos personalizados|detalhes do contato|atribuição|atividade)$/i.test(clean)) return "";
    if (EMAIL_RE.test(clean) || PHONE_RE.test(clean)) return "";
    return clean;
  }

  function findContactDetailsPanel() {
    // Nas rotas abertas pela busca geral do CRM o painel se chama "Contato Informações"
    // e não possui o aria-label de Detalhes do contato. A região de campos é a
    // referência estável e existe tanto nessa tela quanto na caixa lateral.
    const fieldsRegion = document.querySelector('[aria-label="Campos personalizados organizados por pastas"]');
    if (fieldsRegion && visible(fieldsRegion)) {
      return fieldsRegion.closest('[aria-label="Detalhes do contato"],aside,[class*="contact-detail" i]') || fieldsRegion;
    }
    const exactPanel = [...document.querySelectorAll('[aria-label="Detalhes do contato"],aside[aria-label="Detalhes do contato"]')]
      .find(panel => panel.querySelector('[aria-label="Campos personalizados organizados por pastas"]'));
    if (exactPanel) return exactPanel;
    const heading = [...document.querySelectorAll("h1,h2,h3,h4,[role=heading],div,span")]
      .find(el => visible(el) && /^Detalhes do contato$/i.test(normalize(el.innerText)));
    if (!heading) return null;
    const semantic = heading.closest('[role="dialog"],aside,[class*="drawer" i],[class*="contact-detail" i],[class*="sidebar" i]');
    if (semantic) return semantic;
    let node = heading.parentElement;
    for (let i = 0; node && i < 8; i++, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.height > innerHeight * .55 && rect.width > 280 && rect.width < innerWidth * .75 && rect.right > innerWidth * .75) return node;
    }
    return heading.parentElement;
  }

  function findContactDetailsTrigger() {
    const exactIcon = document.querySelector('#sidebar-contact-icon');
    const exactButton = exactIcon?.closest('button,[role="button"]');
    if (exactButton && visible(exactButton)) return exactButton;
    const routeLink = [...document.querySelectorAll('a[href*="view="]')].find(el => {
      if (!visible(el)) return false;
      try {
        const url = new URL(el.href, location.href);
        return url.pathname === location.pathname && url.searchParams.get("view") === "contact";
      } catch (_) { return false; }
    });
    if (routeLink) return routeLink;
    const candidates = [...document.querySelectorAll('button,[role="button"],[aria-label],[title],[data-testid],[data-test]')];
    return candidates.find(el => {
      if (!visible(el)) return false;
      const descriptions = [el.innerText, el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("data-testid"), el.getAttribute("data-test")]
        .filter(Boolean).map(value => normalize(value).replace(/[-_]+/g, " "));
      return descriptions.some(description => /^(?:abrir\s+)?detalhes? do contato(?:\s+bot[aã]o)?$|^(?:open\s+)?contact (?:details?|information)(?:\s+button)?$/i.test(description));
    }) || null;
  }

  async function openContactDetailsPanel() {
    let panel = findContactDetailsPanel();
    if (panel) return { panel, openedByExtension: false, previousView: null };
    if (new URL(location.href).searchParams.get("view") === "contact") {
      for (let attempt = 0; attempt < 18; attempt++) {
        await sleep(150);
        panel = findContactDetailsPanel();
        if (panel) return { panel, openedByExtension: false, previousView: null };
      }
    }
    const trigger = findContactDetailsTrigger();
    if (!trigger) return { panel: null, openedByExtension: false, previousView: null };
    const previousView = new URL(location.href).searchParams.get("view");
    trigger.click();
    for (let attempt = 0; attempt < 16; attempt++) {
      await sleep(150); panel = findContactDetailsPanel();
      if (panel) return { panel, openedByExtension: true, previousView };
    }
    return { panel: null, openedByExtension: false, previousView };
  }

  function restorePreviousContactView(previousView, panel) {
    if (previousView && previousView !== "contact") {
      const exactPreviousIcon = document.querySelector(`#sidebar-${CSS.escape(previousView)}-icon`);
      const exactPreviousButton = exactPreviousIcon?.closest('button,[role="button"]');
      if (exactPreviousButton) { exactPreviousButton.click(); return; }
      const previousLink = [...document.querySelectorAll('a[href*="view="]')].find(el => {
        try {
          const url = new URL(el.href, location.href);
          return url.pathname === location.pathname && url.searchParams.get("view") === previousView;
        } catch (_) { return false; }
      });
      if (previousLink) { previousLink.click(); return; }
    }
    const close = [...panel.querySelectorAll('button,[role="button"]')].find(el => /^(?:×|fechar|close)$/i.test(normalize(el.innerText) || el.getAttribute("aria-label") || el.getAttribute("title") || ""));
    close?.click();
  }

  function readFieldFromLabel(label, panel, labelText) {
    const input = label.parentElement?.querySelector("input,textarea,select,[contenteditable=true]");
    const inputValue = validFieldValue(input?.value || input?.innerText, labelText);
    if (inputValue) return inputValue;
    let node = label.parentElement;
    for (let depth = 0; node && node !== panel && depth < 4; depth++, node = node.parentElement) {
      const lines = normalize(node.innerText).split("\n").map(normalize).filter(Boolean);
      const index = lines.findIndex(line => contactFieldForLabel(line) === labelText);
      if (index >= 0) {
        for (const candidate of lines.slice(index + 1)) {
          const value = validFieldValue(candidate, labelText);
          if (value && !contactFieldForLabel(value)) return value;
        }
      }
      if (normalize(node.innerText).length > 700) break;
    }
    return validFieldValue(label.nextElementSibling?.innerText || label.nextElementSibling?.value, labelText);
  }

  function scanContactText(panel, result) {
    const lines = String(panel?.innerText || "").split(/\n+/).map(normalize).filter(Boolean);
    for (let index = 0; index < lines.length; index++) {
      const field = contactFieldForLabel(lines[index]);
      if (!field || result[field]) continue;
      for (let cursor = index + 1; cursor < Math.min(lines.length, index + 6); cursor++) {
        if (contactFieldForLabel(lines[cursor])) break;
        const value = validFieldValue(lines[cursor], field);
        if (!value || /^(?:expand_more|arrow_drop_down|keyboard_arrow_down)$/i.test(value)) continue;
        result[field] = value;
        break;
      }
    }
  }

  function scanExactGhlFields(panel, result) {
    const region = panel.querySelector('[aria-label="Campos personalizados organizados por pastas"]') || panel;
    const containers = [...region.querySelectorAll('[data-pendo-id^="contact-details-field-"]')];
    for (const container of containers) {
      const labelText = normalize(container.querySelector('.hr-form-item-label__text,label')?.textContent);
      const field = contactFieldForLabel(labelText);
      if (!field || result[field]) continue;
      const editable = container.querySelector('input:not([type="hidden"]),textarea');
      let value = validFieldValue(editable?.value, field);
      if (!value) {
        const blank = container.querySelector('.hr-form-item-blank,[class*="form-item-blank"]') || container;
        const lines = String(blank.innerText || blank.textContent || "").split(/\n+/).map(normalize).filter(Boolean);
        value = lines.map(line => validFieldValue(line, field)).find(line => line && !/^(?:loading|expand_more|arrow_drop_down|keyboard_arrow_down)$/i.test(line)) || "";
      }
      if (value) result[field] = value;
    }
  }

  function scanContactFields(panel, result) {
    scanExactGhlFields(panel, result);
    scanContactText(panel, result);
    const labels = [...panel.querySelectorAll("label,dt,span,div,p")]
      .filter(el => el.children.length < 3 && contactFieldForLabel(el.innerText));
    for (const label of labels) {
      const field = contactFieldForLabel(label.innerText);
      if (!field || result[field]) continue;
      const value = readFieldFromLabel(label, panel, field);
      if (value) result[field] = value;
    }
  }

  async function readContactDetails() {
    const opened = await openContactDetailsPanel();
    let panel = opened.panel;
    const openedByExtension = opened.openedByExtension;
    if (!panel) return {};
    const result = {};
    const exactRegion = panel.querySelector('[aria-label="Campos personalizados organizados por pastas"]');
    if (exactRegion) {
      let previousSignature = "";
      let stablePasses = 0;
      for (let attempt = 0; attempt < 18; attempt++) {
        scanExactGhlFields(panel, result);
        scanContactText(panel, result);
        const signature = JSON.stringify(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
        if (signature !== "[]" && signature === previousSignature) stablePasses++;
        else stablePasses = 0;
        previousSignature = signature;
        if (stablePasses >= 2 && (result.Score || attempt >= 5)) break;
        await sleep(120);
      }
      if (openedByExtension) restorePreviousContactView(opened.previousView, panel);
      const merged = { ...result };
      if (merged.Score && !/^(?:100|[1-9]?\d)$/.test(merged.Score.trim())) delete merged.Score;
      return merged;
    }
    const panelRect = panel.getBoundingClientRect();
    const scrollables = [panel, ...panel.querySelectorAll("div,section,main")]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return el.scrollHeight > el.clientHeight + 40 && rect.width > 220 && rect.height > 180 &&
          rect.left >= panelRect.left - 8 && rect.right <= panelRect.right + 8;
      });
    const scroller = scrollables.sort((a,b) =>
      (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight) ||
      b.getBoundingClientRect().height - a.getBoundingClientRect().height
    )[0];
    const original = scroller?.scrollTop || 0;
    try {
      if (!scroller) scanContactFields(panel, result);
      else {
        const step = Math.max(180, scroller.clientHeight * .58);
        for (let top = 0, pass = 0; pass < 24; pass++, top += step) {
          scroller.scrollTop = Math.min(top, scroller.scrollHeight - scroller.clientHeight);
          scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
          await sleep(120); scanContactFields(panel, result);
          if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
        }
      }
    } finally {
      if (scroller) { scroller.scrollTop = original; scroller.dispatchEvent(new Event("scroll", { bubbles: true })); }
      if (openedByExtension) {
        restorePreviousContactView(opened.previousView, panel);
      }
    }
    const merged = { ...result };
    if (merged.Score && !/^(?:100|[1-9]?\d)$/.test(merged.Score.trim())) delete merged.Score;
    return merged;
  }

  function findActivitiesPanel() {
    const icon = document.querySelector("#sidebar-activities-icon");
    const sidebar = icon?.closest("aside") || icon?.parentElement?.parentElement;
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,[role=heading],div")]
      .filter(el => visible(el) && /^Atividade(?:\s*\(|$)/i.test(normalize(el.innerText)));
    for (const heading of headings) {
      let node = heading.closest('[role="dialog"],aside,[class*="drawer" i],[class*="sidebar" i]') || heading.parentElement;
      for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        if (rect.height > innerHeight * .45 && rect.width > 260 && rect.right > innerWidth * .7) return node;
      }
    }
    return sidebar && /Pesquisa respondida|Página visitada|Contato Criado/i.test(sidebar.innerText || "") ? sidebar : null;
  }

  function findActivityDetailsModal() {
    const title = [...document.querySelectorAll("h1,h2,h3,h4,[role=heading],div,span")]
      .find(el => visible(el) && /^Detalhes da atividade$/i.test(normalize(el.innerText)));
    if (!title) return null;
    return title.closest('[role="dialog"],[aria-modal="true"],[class*="modal" i]') || (() => {
      let node = title.parentElement;
      for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 500 && rect.height > 350 && rect.left > 0 && rect.right < innerWidth) return node;
      }
      return title.parentElement;
    })();
  }

  function closeActivityModal(modal) {
    const close = [...modal.querySelectorAll('button,[role="button"]')].find(el => {
      const text = normalize(el.innerText || el.getAttribute("aria-label") || el.getAttribute("title"));
      return /^(?:fechar|close|×)$/i.test(text);
    });
    close?.click();
  }

  function scanActivitySurvey(modal) {
    const result = {};
    const rows = [...modal.querySelectorAll("tr,[role=row]")];
    for (const row of rows) {
      const cells = [...row.querySelectorAll(":scope > th,:scope > td,:scope > [role=cell],:scope > [role=gridcell],:scope > [role=rowheader]")]
        .map(cell => normalize(cell.innerText || cell.textContent)).filter(Boolean);
      if (cells.length < 2) continue;
      const field = ACTIVITY_FIELD_ALIASES.get(cells[0].toLocaleLowerCase("pt-BR"));
      const value = field && validFieldValue(cells.slice(1).join(" "), field);
      if (field && value) result[field] = value;
    }
    if (!Object.keys(result).length) {
      const lines = String(modal.innerText || "").split(/\n+/).map(normalize).filter(Boolean);
      for (let index = 0; index < lines.length - 1; index++) {
        const field = ACTIVITY_FIELD_ALIASES.get(lines[index].toLocaleLowerCase("pt-BR"));
        if (!field) continue;
        const value = validFieldValue(lines[index + 1], field);
        if (value) result[field] = value;
      }
    }
    if (result.Score && !/^(?:100|[1-9]?\d)$/.test(result.Score.trim())) delete result.Score;
    return result;
  }

  function findSurveyActivity(panel) {
    const labels = [...panel.querySelectorAll("div,span,p,strong,h3,h4")]
      .filter(el => visible(el) && /^Pesquisa respondida$/i.test(normalize(el.innerText)));
    for (const label of labels) {
      const clickable = label.closest('button,a,[role="button"],[tabindex]');
      if (clickable && visible(clickable)) return clickable;
      let node = label;
      for (let depth = 0; node && node !== panel && depth < 5; depth++, node = node.parentElement) {
        const text = normalize(node.innerText);
        const rect = node.getBoundingClientRect();
        const detailButton = [...node.querySelectorAll('button,[role="button"]')]
          .find(button => visible(button) && normalize(button.innerText).length > 2 && !/^(?:Pesquisa respondida|Icon only button)$/i.test(normalize(button.innerText)));
        if (detailButton && /Pesquisa respondida/i.test(text) && text.length < 900) return detailButton;
        if (/Pesquisa respondida/i.test(text) && text.length < 700 && rect.width > 180 && rect.height > 35) {
          if (getComputedStyle(node).cursor === "pointer" || node.onclick || node.matches('[class*="activity" i],[class*="timeline" i]')) return node;
        }
      }
    }
    return null;
  }

  async function readActivitySurveyDetails() {
    const trigger = document.querySelector("#sidebar-activities-icon")?.closest('button,[role="button"],a');
    if (!trigger || !visible(trigger)) return {};
    const previousView = new URL(location.href).searchParams.get("view");
    let panel = findActivitiesPanel();
    const openedByExtension = !panel;
    if (!panel) {
      trigger.click();
      for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(150);
        panel = findActivitiesPanel();
        if (panel) break;
      }
    }
    if (!panel) return {};
    let result = {};
    try {
      let survey = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        survey = findSurveyActivity(panel);
        if (survey) break;
        await sleep(120);
      }
      if (!survey) return {};
      survey.click();
      let modal = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(150);
        modal = findActivityDetailsModal();
        if (modal) break;
      }
      if (!modal) return {};
      result = scanActivitySurvey(modal);
      closeActivityModal(modal);
      await sleep(120);
      return result;
    } finally {
      if (openedByExtension) restorePreviousContactView(previousView, panel);
    }
  }

  async function readBestContactData(channel = "unknown") {
    const contact = await readContactDetails();
    const resolvedChannel = resolveConversationChannel(channel, contact);
    if (/^(?:100|[1-9]?\d)$/.test(contact.Score || "") || resolvedChannel === "instagram") return contact;
    const activity = await readActivitySurveyDetails();
    return { ...activity, ...contact };
  }

  function contactName(scroller) {
    const headerSelectors = [
      '[data-testid="contact-name"]', '[data-test="contact-name"]',
      '[data-testid*="conversation-header" i] [data-testid*="name" i]',
      '[data-test*="conversation-header" i] [data-test*="name" i]',
      '[class*="conversation-header" i] [class*="contact-name" i]',
      '[class*="conversation-header" i] h1', '[class*="conversation-header" i] h2',
      '[class*="conversation-header" i] h3'
    ];
    const headerName = firstValidText(headerSelectors.flatMap(selector => [...document.querySelectorAll(selector)]));
    if (headerName) return headerName;

    const realName = fieldValue("Nome");
    if (realName) return realName;

    const instagramSelectors = [
      '[data-testid*="instagram" i] [data-testid*="name" i]',
      '[data-test*="instagram" i] [data-test*="name" i]',
      '[class*="instagram" i] [class*="username" i]',
      '[aria-label*="Instagram" i]'
    ];
    const instagramName = firstValidText(instagramSelectors.flatMap(selector => [...document.querySelectorAll(selector)]));
    if (instagramName) return instagramName;

    const panel = scroller?.parentElement?.parentElement;
    const nearbyHeader = panel ? firstValidText([...panel.querySelectorAll("header h1,header h2,header h3")]) : "";
    return nearbyHeader || "Lead";
  }

  function conversationChannel() {
    const channelButton = [...document.querySelectorAll('button,[role="button"]')]
      .find(el => /alterar canal de mensagem/i.test(el.getAttribute("aria-label") || el.getAttribute("title") || ""));
    const description = normalize(channelButton?.getAttribute("aria-label") || channelButton?.getAttribute("title"));
    if (/instagram/i.test(description)) return "instagram";
    if (/whatsapp/i.test(description)) return "whatsapp";
    const source = validFieldValue(fieldValue("Fonte de contato"), "Fonte de contato");
    return resolveConversationChannel("unknown", { "Fonte de contato": source });
  }

  function resolveConversationChannel(channel = "unknown", contactData = {}) {
    if (channel === "instagram" || channel === "whatsapp") return channel;
    const source = validFieldValue(contactData["Fonte de contato"], "Fonte de contato");
    if (/instagram/i.test(source)) return "instagram";
    if (/whatsapp/i.test(source)) return "whatsapp";
    return "unknown";
  }

  function formatExport(messages, fullContactName) {
    const incomingName = (fullContactName || "Lead").toLocaleUpperCase("pt-BR");
    const agentName = (currentSettings.agentName || "FELIPE").toLocaleUpperCase("pt-BR");
    const groups = [];
    for (const message of messages) {
      const speaker = message.direction === "outgoing" ? agentName : incomingName;
      const last = groups[groups.length - 1];
      if (currentSettings.groupMessages && last?.speaker === speaker) last.messages.push(message.body);
      else groups.push({ speaker, messages: [message.body] });
    }
    const conversation = groups.map(group => `${group.speaker}:\n${group.messages.join("\n")}`).join("\n\n");
    return `${currentSettings.includeContactHeader ? `CONTATO: ${fullContactName}\n\n` : ""}${conversation}`.trim();
  }

  async function collect(scroller) {
    if (captureBusy) throw new Error("Uma captura já está em andamento.");
    captureBusy = true;
    const started = performance.now();
    const pace = HOD_CONFIG.capture[currentSettings.captureSpeed] || HOD_CONFIG.capture.safe;
    const progress = document.createElement("div");
    progress.id = "hod-capture-progress";
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");
    document.body.append(progress);
    captureInfo = { phase: "Iniciando", total: 0, lead: 0, sdr: 0, topStable: false };
    const original = scroller.scrollTop;
    const originalConversation = location.pathname + location.search;
    const originalContact = contactName(scroller);
    const found = new Map();
    let chronologicalKeys = [];
    const scanCurrentChunk = () => {
      if (location.pathname + location.search !== originalConversation || contactName(scroller) !== originalContact || scroller.isConnected === false) throw new Error("A conversa mudou durante a captura. Abra o contato desejado e tente novamente.");
      const before = found.size;
      const sr = scroller.getBoundingClientRect();
      const chunkKeys = [];
      const blocks = smallestMessageBlocks(scroller).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      for (const el of blocks) {
        const messageId = normalize(el.getAttribute?.("data-message-id"));
        const outboundBubble = el.querySelector?.(".chat-bubble-outbound");
        const inboundBubble = el.querySelector?.(".chat-bubble-inbound");
        // Cards, eventos e avisos automáticos também recebem message-id no
        // GHL, mas não são falas de nenhum dos lados.
        if (messageId && !outboundBubble && !inboundBubble) continue;
        const messageTextNodes = [...(el.querySelectorAll?.(".chat-message") || [])];
        const raw = normalize(messageTextNodes.length ? messageTextNodes.map(node => node.innerText).join("\n") : el.innerText);
        const body = cleanMessage(raw);
        if (!body || body.length < 2) continue;
        // A classe da bolha é a fonte definitiva. Não permitir que largura,
        // posição ou heurísticas antigas sobrescrevam o lado identificado.
        const direction = outboundBubble ? "outgoing" : inboundBubble ? "incoming" : directionFor(el, scroller);
        const rect = (outboundBubble || inboundBubble || el).getBoundingClientRect();
        const position = scroller.scrollTop + rect.top - sr.top;
        const centerRatio = (rect.left + rect.width / 2 - sr.left) / Math.max(1, sr.width);
        const key = messageId ? `id:${messageId}` : `${direction}|${body.toLocaleLowerCase("pt-BR")}`;
        chunkKeys.push(key);
        found.set(key, { body, direction, position, centerRatio, messageId });
      }

      if (!chronologicalKeys.length) chronologicalKeys = [...chunkKeys];
      else {
        const known = chunkKeys.filter(key => chronologicalKeys.includes(key));
        if (!known.length) chronologicalKeys = [...chunkKeys.filter(key => !chronologicalKeys.includes(key)), ...chronologicalKeys];
        else {
          const firstKnownInChunk = chunkKeys.indexOf(known[0]);
          const lastKnownInChunk = chunkKeys.lastIndexOf(known[known.length - 1]);
          const beforeKeys = chunkKeys.slice(0, firstKnownInChunk).filter(key => !chronologicalKeys.includes(key));
          const afterKeys = chunkKeys.slice(lastKnownInChunk + 1).filter(key => !chronologicalKeys.includes(key));
          const firstKnownInOrder = chronologicalKeys.indexOf(known[0]);
          chronologicalKeys.splice(firstKnownInOrder, 0, ...beforeKeys);
          const lastKnownInOrder = chronologicalKeys.indexOf(known[known.length - 1]);
          chronologicalKeys.splice(lastKnownInOrder + 1, 0, ...afterKeys);
        }
      }
      const values = [...found.values()];
      captureInfo.total = values.length;
      captureInfo.lead = values.filter(m => m.direction === "incoming").length;
      captureInfo.sdr = values.length - captureInfo.lead;
      progress.textContent = captureInfo.phase + " · " + captureInfo.total + " mensagens · Lead " + captureInfo.lead + " / SDR " + captureInfo.sdr;
      return found.size - before;
    };
    try {
      const sweep = async direction => {
        captureInfo.phase = direction === "up" ? "Buscando início" : "Conferindo histórico";
        const bottom = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTop = direction === "up" ? bottom() : 0;
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(pace.step);
        scanCurrentChunk();
        for (let step = 0; ; step++) {
          if (step >= 2000 || performance.now() - started > 120000) throw new Error("A captura não terminou dentro do tempo seguro. Nenhum histórico parcial foi enviado para IA.");
          const current = scroller.scrollTop;
          const distance = Math.max(240, scroller.clientHeight * .68);
          const next = direction === "up" ? Math.max(0, current - distance) : Math.min(bottom(), current + distance);
          if (Math.abs(next - current) < 2) break;
          scroller.scrollTop = next;
          scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
          // O GHL precisa renderizar a nova janela virtual antes da leitura.
          await sleep(pace.step);
          scanCurrentChunk();
        }
      };

      // 1) Varre devagar do fim ao início, capturando também o miolo que a
      // lista virtual remove do DOM quando o usuário pula diretamente.
      await sweep("up");

      // 2) Permanece no topo para o GHL buscar páginas antigas no servidor.
      // Três leituras estáveis confirmam que o carregamento terminou.
      let stableTopRounds = 0;
      captureInfo.phase = "Aguardando histórico antigo";
      let historyExpanded = false;
      let previousOldest = chronologicalKeys[0] || "";
      for (let pass = 0; pass < 24 && stableTopRounds < pace.rounds; pass++) {
        scroller.scrollTop = 0;
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        const heightBefore = scroller.scrollHeight;
        await sleep(pace.top);
        const added = scanCurrentChunk();
        const oldest = chronologicalKeys[0] || "";
        const loading = [...scroller.querySelectorAll('[role="progressbar"],[aria-busy="true"],.loading-spinner')].some(visible);
        if (added > 0 || oldest !== previousOldest || scroller.scrollTop > 2 || heightBefore !== scroller.scrollHeight || loading) {
          historyExpanded = true;
          stableTopRounds = 0;
        }
        else stableTopRounds += 1;
        previousOldest = oldest;
      }

      // 3) Depois que todo o histórico foi disponibilizado, volta do início
      // ao fim para capturar qualquer janela intermediária carregada no topo.
      captureInfo.topStable = stableTopRounds >= pace.rounds;
      if (!captureInfo.topStable) throw new Error("O início do histórico ainda não estabilizou. Espere o CRM carregar e repita a captura.");
      await sweep("down");
    } finally {
      scroller.scrollTop = original;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      captureInfo.durationMs = Math.round(performance.now() - started);
      captureBusy = false;
      progress.remove();
    }
    const ordered = chronologicalKeys.map(key => found.get(key)).filter(Boolean);
    const messages = ordered.length ? ordered : [...found.values()].sort((a, b) => a.position - b.position);
    // Duplicatas exatas do mesmo lado não acrescentam contexto ao handoff e
    // eram uma das maiores fontes de tokens, demora e associação errada.
    const seen = new Set();
    const unique = messages.filter(message => {
      const key = message.messageId ? "id:" + message.messageId : `${message.direction}|${normalize(message.body).toLocaleLowerCase("pt-BR")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return formatExport(unique, contactName(scroller));
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return; } catch (_) {}
    const area = document.createElement("textarea");
    area.value = text; area.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(area); area.select();
    const ok = document.execCommand("copy"); area.remove();
    if (!ok) throw new Error("O navegador recusou acesso à área de transferência.");
  }

  function escapeHtml(text) {
    return String(text || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function briefingClipboardFormats(text) {
    const blocks = String(text || "").split(/\n\s*\n+/).map(line => line.trim()).filter(Boolean);
    const plain = blocks.map(line => line.replace(/\*\*|`/g, "")).join("\n\n");
    const inline = line => escapeHtml(line)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // O editor do GHL colapsa quebras de texto dentro de um parágrafo.
      // Cada item de lista compacta precisa de um <br> real no HTML copiado.
      .replace(/\n/g, "<br>");
    const header = blocks[0]?.match(/^\*\*(.+)\*\*$/);
    const htmlBlocks = blocks.map((line, index) => {
      if (index === 0 && header) return `<p><strong>${escapeHtml(header[1])}</strong></p>`;
      const chips = [...line.matchAll(/`([^`]+)`/g)].map(match => match[1].trim()).filter(Boolean);
      if (chips.length && line.replace(/`[^`]+`|　|\s/g, "") === "") {
        return `<p>${chips.map(chip => `<strong><code>${escapeHtml(chip)}</code></strong>`).join("&nbsp;")}</p>`;
      }
      const code = line.match(/^`([^`]+)`$/);
      // O GoHighLevel remove estilos inline do HTML colado. A tag semântica
      // <code> sobrevive à sanitização do editor e mantém a fonte distinta.
      if (code) return `<p><strong><code>${escapeHtml(code[1])}</code></strong></p>`;
      return `<p>${inline(line.replace(/^[-•]\s*/, ""))}</p>`;
    });
    // Um parágrafo vazio reproduz o espaçamento visual do Shift+Enter no GHL,
    // sem transportar cor de fundo, fonte ou tema da extensão.
    return { plain, html: htmlBlocks.join("<p><br></p>") };
  }

  function sanitizeFinalBriefing(value) {
    const output = [];
    const seen = new Set();
    for (const rawLine of String(value || "").split(/\n+/)) {
      const line = rawLine.trim();
      if (!line || line === "\\") continue;
      if (/^CONTATO\s*:/i.test(line) || /^[A-ZÀ-Ü][A-ZÀ-Ü\s.'-]{1,48}:\s*(?:$|\S)/u.test(line)) break;
      if (isOpaqueMediaArtifact(line)) continue;
      const content = line
        .replace(/^[-•]\s*/, "")
        .replace(/^[^À-\u024F\p{L}\p{N}*`]+/u, "")
        .replace(/\*\*|`/g, "")
        .trim();
      if (isLowValueLeadChatter(content)) continue;
      const key = content.toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      output.push(line);
    }
    return output.reduce((text, line, index) => {
      const previous = output[index - 1] || "";
      const consecutiveCodes = /^`[^`]+`$/.test(line) && /^`[^`]+`$/.test(previous);
      // Tópicos interpretativos e Perfil do Lead formam listas compactas;
      // o espaço fica entre blocos, não entre itens da mesma lista.
      const consecutiveListItems = /^(?:•|[\p{Extended_Pictographic}])/u.test(line) && /^(?:•|[\p{Extended_Pictographic}])/u.test(previous);
      return text + (index ? (consecutiveCodes || consecutiveListItems ? "\n" : "\n\n") : "") + line;
    }, "").trim();
  }

  function sanitizeBriefingHtml(source) {
    const template = document.createElement("template");
    template.innerHTML = String(source || "");
    const allowed = new Set(["P", "STRONG", "B", "BR", "CODE"]);
    for (const element of [...template.content.querySelectorAll("*")]) {
      if (element.tagName === "DIV") {
        const paragraph=document.createElement("p"); paragraph.append(...element.childNodes); element.replaceWith(paragraph); continue;
      }
      if (!allowed.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        continue;
      }
      for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
      if (element.tagName === "B") {
        const strong = document.createElement("strong");
        strong.append(...element.childNodes); element.replaceWith(strong);
      }
    }
    return template.innerHTML;
  }

  async function copyRichBriefing(editor, plain, html) {
    html = sanitizeBriefingHtml(html);
    // Intercepta a cópia antes dos listeners do CRM. Sem isso, o Chrome criava
    // um item MIME text/html cujo conteúdo era apenas texto puro.
    let richCopyWritten = false;
    const writeRichClipboard = event => {
      if (!event.clipboardData) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.clipboardData.setData("text/html", html);
      event.clipboardData.setData("text/plain", plain);
      richCopyWritten = true;
    };
    document.addEventListener("copy", writeRichClipboard, true);
    const selection = getSelection();
    const previous = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const range = document.createRange();
    editor.focus({ preventScroll: true });
    range.selectNodeContents(editor);
    selection?.removeAllRanges(); selection?.addRange(range);
    let ok = false;
    try { ok = document.execCommand("copy"); }
    finally {
      document.removeEventListener("copy", writeRichClipboard, true);
      selection?.removeAllRanges();
      if (previous) selection?.addRange(previous);
    }
    if (ok && richCopyWritten) return;
    // Reserva moderna: grava explicitamente os dois MIME types caso o caminho
    // de seleção seja recusado pelo navegador.
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" })
        })]);
        return;
      } catch (_) {}
    }
    await copyText(plain);
  }

  const TOPIC_EMOJI = {
    trabalho: "💼", formacao: "🎓", localidade: "📍", familia: "👨‍👩‍👧",
    objetivo: "🎯", transicao: "🔄", conhecimento: "🧠", financeiro: "💰",
    dificuldade: "🧭", saude: "❤️", relacionamento: "👤", mercado: "🌐",
    comercial: "💳", positivo: "🔥", estrutura: "🖥️"
  };

  function isUsefulEquipmentFact(text) {
    const clean = normalize(text);
    if (!/\b(?:computador|notebook|macbook|pc|imac|desktop|gamer)\b/i.test(clean)) return false;
    return /\b(?:i[3579]|m[1-9]|ryzen|intel|amd|apple|macbook|imac|gamer|\d+\s*(?:gb|tb)|ssd|placa de v[ií]deo|rtx|gtx)\b/i.test(clean);
  }

  function topicTypeFor(suggested, text) {
    const clean = normalize(text).toLocaleLowerCase("pt-BR");
    if (/^(?:est[aá]\s+)?desempregad[oa](?:\s+no momento)?$/.test(clean)) return "transicao";
    if (["transicao", "formacao", "objetivo"].includes(suggested)) return suggested;
    if (suggested === "trabalho" && /\b(?:atua|trabalha|trabalhou|professor[ae]?|profiss[aã]o|carreira|emprego|aut[oô]nom[oa]|empreendedor)\b/i.test(clean)) return "trabalho";
    const painType = painTopicType(clean);
    if (painType) return painType;
    if (/\b(?:depress[aã]o|ansiedade|sa[uú]de|doen[cç]a|tratamento|afastad[oa])\b/i.test(clean)) return "saude";
    if (/\b(?:filh[oa]s?|fam[ií]lia|m[aã]e|pai|espos[oa]|marido|c[oô]njuge)\b/i.test(clean)) return "familia";
    if (/\b(?:mora|reside|cidade|interior|regi[aã]o|mudar de cidade)\b/i.test(clean)) return "localidade";
    if (/\b(?:faculdade|gradua[cç][aã]o|p[oó]s-gradua[cç][aã]o|formad[oa]|curso t[eé]cnico|doutorado|mestrado)\b/i.test(clean)) return "formacao";
    if (/\b(?:an[aá]lise de indicadores|acompanhamento de resultados|planejamento|tomada de decis[aã]o)\b/i.test(clean)) return "conhecimento";
    if (/\b(?:experi[eê]ncia|gest[aã]o operacional|opera[cç][oõ]es|log[ií]stica|transporte|lideran[cç]a)\b/i.test(clean)) return "trabalho";
    if (/\b(?:inform[aá]tica|tecnologia|automa[cç][aã]o|crm|intelig[eê]ncia artificial|\bia\b|ingl[eê]s|excel|power bi|sistemas?)\b/i.test(clean)) return "conhecimento";
    if (/\b(?:acompanha|segue|conhece o felipe|conheceu (?:agora|recentemente)|conheci (?:agora|recentemente)|seu trabalho|trabalho do felipe|conte[uú]do do felipe)\b/i.test(clean)) return "relacionamento";
    if (/\b(?:conhece|pesquisou|tentou|plataforma|mercado de trabalho remoto|trabalho para empresas de tecnologia)\b/i.test(clean)) return "mercado";
    if (/\b(?:investir|investimento|planejamento financeiro|acompanhamento pago)\b/i.test(clean)) return "comercial";
    if (/\b(?:atua|trabalha|trabalhou|profiss[aã]o|carreira|emprego|aut[oô]nom[oa]|empreendedor)\b/i.test(clean)) return "trabalho";
    if (isUsefulEquipmentFact(clean)) return "estrutura";
    if (/\b(?:manh[aã]|tarde|noite|fim de semana|hor[aá]rio|disponibilidade|computador|notebook|equipamento|pc)\b/i.test(clean)) return "contexto";
    return TOPIC_EMOJI[suggested] ? suggested : "contexto";
  }

  function humanizeFormAnswer(value, field = "") {
    let clean = validFieldValue(value, field).replace(/[.!;,:\s]+$/, "");
    if (!clean) return "";
    clean = clean
      .replace(/^quero\s+/i, "Busca ")
      .replace(/^busco\s+/i, "Busca ")
      .replace(/^gostaria de\s+/i, "Busca ")
      .replace(/^preciso de\s+/i, "Precisa de ");
    return clean.charAt(0).toLocaleUpperCase("pt-BR") + clean.slice(1);
  }

  function meaningfulFormAnswer(value, field) {
    const clean = validFieldValue(value, field);
    if (!clean || /^(?:sim|n[aã]o|talvez|--|nenhum(?:a)?|n[aã]o se aplica)$/i.test(clean)) return "";
    return humanizeFormAnswer(clean, field);
  }

  function semanticSignature(text) {
    const stop = new Set("a o as os de da do das dos e em um uma para com por que como ao na no nas nos se sua seu busca quer possui tem".split(" "));
    return new Set(normalize(text).toLocaleLowerCase("pt-BR")
      .replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
      .filter(word => word.length > 2 && !stop.has(word)));
  }

  function evidenceTokens(text) {
    const stop = new Set("para como uma umas uns esse essa isso sobre mais menos muito pouco pode consegue conseguir possui tenho tem busca quer pretende trabalhar trabalho remoto casa area renda conversa consultoria lead hod".split(" "));
    return new Set(normalize(text).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(word => word.length >= 4 && !stop.has(word))
      .map(word => word.slice(0, 7)));
  }

  function supportedByEvidence(text, source, type = "contexto") {
    const factsOnly = String(source || "").split("\n")
      .filter(line => /^(?:RESPOSTA DO LEAD|FALA DO LEAD|FATO CONTEXTUALIZADO DETERMINÍSTICO|CRM \(FATO DO FORMULÁRIO)/.test(line))
      .join(" ");
    const normalizedFacts = normalize(factsOnly).toLocaleLowerCase("pt-BR");
    const categoryEvidence = {
      familia: /\b(?:filh[oa]s?|fam[ií]lia|m[aã]e|pai|espos[oa]|marido|mulher|c[oô]njuge)\b/i,
      localidade: /\b(?:mora|reside|cidade|interior|regi[aã]o|estado|mudan[cç]a de cidade)\b/i,
      financeiro: /(?:r\$|reais?|invest|reserva|sal[aá]rio|renda|d[ií]vida|endividad|contas? atrasad)/i,
      saude: /\b(?:depress[aã]o|ansiedade|sa[uú]de|doen[cç]a|tratamento|afastad[oa])\b/i,
      formacao: /\b(?:curso|faculdade|gradua[cç][aã]o|p[oó]s|formad[oa]|t[eé]cnico|mestrado|doutorado)\b/i,
      transicao: /\b(?:transi[cç][aã]o|migrar|mudar de carreira|realoca[cç][aã]o)\b/i,
      relacionamento: /\b(?:acompanha|segue|felipe|conte[uú]do)\b/i,
      mercado: /\b(?:mercado|plataforma|tentou|pesquisou|conhece|trabalho remoto)\b/i,
      estrutura: /\b(?:computador|notebook|equipamento|pc)\b/i,
      comercial: /(?:r\$|reais?|invest|planejamento|pago)/i
    };
    if (categoryEvidence[type] && !categoryEvidence[type].test(normalizedFacts)) return false;
    const claim = evidenceTokens(text);
    if (!claim.size) return false;
    const evidence = evidenceTokens(factsOnly);
    const matches = [...claim].filter(token => evidence.has(token)).length;
    const minimum = claim.size >= 4 ? Math.max(2, Math.ceil(claim.size * .5)) : 1;
    return matches >= minimum;
  }

  function literalEvidenceExists(quote, source) {
    const cleanQuote = normalize(quote)
      .replace(/^(?:RESPOSTA DO LEAD(?: \(EVIDÊNCIA LITERAL\))?|FALA DO LEAD|FATO CONTEXTUALIZADO DETERMINÍSTICO|CRM(?: \(FATO DO FORMULÁRIO\))?)\s*:\s*/i, "")
      .replace(/^['\"]|['\"]$/g, "")
      .replace(/\s*\/no_think\s*$/i, "")
      .toLocaleLowerCase("pt-BR");
    if (cleanQuote.length < 3) return false;
    return String(source || "").split("\n")
      .filter(line => /^(?:RESPOSTA DO LEAD|FALA DO LEAD|FATO CONTEXTUALIZADO DETERMINÍSTICO|CRM \(FATO DO FORMULÁRIO)/.test(line))
      .map(line => normalize(line.replace(/^[^:]+:\s*/, "")).toLocaleLowerCase("pt-BR"))
      .some(fact => fact.includes(cleanQuote));
  }

  function humanizeEvidenceFact(value) {
    let text = normalize(value).replace(/[.!;,\s]+$/, "")
      .replace(/^(?:bom dia|boa tarde|boa noite|oi+|ol[aá])[,!\s]*/i, "")
      .replace(/^eu\s+trabalho\b/i, "Trabalha")
      .replace(/^eu\s+atuo\b/i, "Atua")
      .replace(/^eu\s+busco\b/i, "Busca")
      .replace(/^eu\s+quero\b/i, "Quer")
      .replace(/^eu\s+pretendo\b/i, "Pretende")
      .replace(/^eu\s+tenho\b/i, "Possui")
      .replace(/^hoje\s+sou\s+/i, "Atua como ")
      .replace(/^hoje\s+trabalho\b/i, "Trabalha")
      .replace(/^hoje\s+atuo\b/i, "Atua")
      .replace(/^tenho\b/i, "Possui")
      .replace(/^sou\s+/i, "Atua como ")
      .replace(/^estou\s+buscando\b/i, "Busca")
      .replace(/^gostaria\s+de\b/i, "Busca");
    if (/^Conheci agora (?:o )?seu trabalho/i.test(text)) return "Conheceu o trabalho do Felipe recentemente";
    if (/^(?:Sim,?\s*)?(?:tenho|possuo)\s+disponibilidade\s+e\s+equipamentos?/i.test(text)) return "";
    if (!text) return "";
    return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
  }

  function humanizePainFact(value) {
    return humanizeEvidenceFact(value)
      .replace(/^Possui\s+(medo|receio|inseguran[cç]a)\b/i, "Demonstra $1")
      .replace(/^Possui\s+(depress[aã]o|ansiedade|burnout)\b/i, "Relata $1")
      .replace(/^Possui\s+problemas?\s+com\b/i, "Relata problemas com")
      .replace(/^Estou\b/i, "Relata que está")
      .replace(/^Minhas\s+contas\s+est[aã]o\s+atrasadas\b/i, "Relata contas atrasadas")
      .replace(/^N[aã]o\s+tenho\s+renda\b/i, "Está sem renda")
      .replace(/^N[aã]o\s+sei\b/i, "Relata não saber")
      .replace(/^(?:Eu\s+)?j[aá]\s+comprei\b/i, "Já comprou")
      .replace(/^(?:Eu\s+)?j[aá]\s+fiz\b/i, "Já fez")
      .replace(/^(?:Eu\s+)?j[aá]\s+paguei\b/i, "Já pagou");
  }

  function titleProfileLabel(value) {
    // Preserve semantic casing from the model; never turn a sentence into a title.
    // Only repair its first letter, keeping proper names and acronyms intact.
    return normalize(value).replace(/\p{L}/u, letter => letter.toLocaleUpperCase("pt-BR"));
  }

  function instagramProfileChips(evidenceSource, topics, semanticProfile) {
    if (semanticProfile) {
      const chips = [];
      const literal = String(evidenceSource || "").split("\n").filter(line => /^(?:RESPOSTA DO LEAD|CRM \(FATO)/.test(line)).join(" ");
      const evidence = normalize(semanticProfile.evidencia);
      if (evidence.length >= 4 && literal.toLocaleLowerCase("pt-BR").includes(evidence.toLocaleLowerCase("pt-BR"))) {
        for (const value of [semanticProfile.ocupacao, semanticProfile.situacao]) {
          const chip = normalize(value);
          if (chip && chip.length <= 60 && !isLowValueLeadChatter(chip) && !chips.includes(chip)) chips.push(chip);
        }
        if (chips.length) return chips;
      }
    }
    // A faixa do Instagram precisa ser útil de relance, mas não pode repetir o
    // erro antigo de transformar uma saudação ou uma intenção em "profissão".
    // Portanto, função e situação só entram com evidência literal do lead ou
    // de um tópico de trabalho já validado contra essa evidência.
    const leadFacts = String(evidenceSource || "").split("\n")
      .filter(line => /^(?:RESPOSTA DO LEAD|FALA DO LEAD|FATO CONTEXTUALIZADO DETERMINÍSTICO)(?:\s*\([^)]*\))?:/i.test(line))
      .map(line => normalize(line.replace(/^[^:]+:\s*/, "")))
      .filter(Boolean);
    const allFacts = leadFacts.join("\n");
    const cleanChip = value => normalize(value)
      .replace(/^(?:eu\s+)?(?:sou|trabalho|atuo)\s+(?:como\s+|na\s+[aá]rea\s+(?:de\s+)?|no\s+setor\s+(?:de\s+)?|em\s+)?/i, "")
      .replace(/\b(?:hoje|atualmente)\b/gi, "")
      .replace(/\s+(?:em\s+regime\b|há\s+\w+|desde\s+os?\s+\d+|e\s+(?:tenho|tem|possui|possuo|deseja|busca|quer|est[aá]|conta)\b).*$/i, "")
      .replace(/\s+(?:mas|por[eé]m|porque|quando)\s+.*$/i, "")
      .replace(/[.!;,\s]+$/, "").trim();
    const sensible = value => value && value.length >= 3 && value.length <= 44
      && !isLowValueLeadChatter(value)
      && !/^(?:sim|n[aã]o|isso|claro|interessad[oa]|disponibilidade|equipamentos?|desempregad[oa])$/i.test(value);
    let role = "";
    for (const fact of leadFacts) {
      const match = fact.match(/\b(?:eu\s+)?(?:sou|era|fui)\s+(?:um(?:a)?\s+)?([^.!?\n]{2,70})/i)
        || fact.match(/\b(?:trabalho|atuo|atua|trabalhava|atuava)\s+(?:como\s+|na\s+[aá]rea\s+(?:de\s+)?|no\s+setor\s+(?:de\s+)?|em\s+)([^.!?\n]{2,80})/i);
      const candidate = cleanChip(match?.[1] || "");
      if (sensible(candidate)) { role = candidate; break; }
    }
    if (!role) {
      const workTopic = (topics || []).find(item => normalize(item?.tipo).toLocaleLowerCase("pt-BR") === "trabalho"
        && !/\b(?:bom dia|boa tarde|boa noite|tudo bem)\b/i.test(normalize(item?.texto))
        && !/^desempregad[oa]$/i.test(normalize(item?.texto)));
      const text = normalize(workTopic?.texto);
      const match = text.match(/\b(?:como|na\s+[aá]rea\s+(?:de\s+)?|no\s+setor\s+(?:de\s+)?|em)\s+([^.;!?]{3,80})/i);
      const candidate = cleanChip(match?.[1] || "");
      if (sensible(candidate)) role = candidate;
    }
    let situation = "";
    if (/\bdesempregad[oa]\b/i.test(allFacts)) situation = "Desempregado(a)";
    else if (/\baposentad[oa]\b/i.test(allFacts)) situation = "Aposentada";
    else if (/\bCLT\b/i.test(allFacts)) situation = "CLT";
    else if (/\b(?:motorista de aplicativo|uber|aut[oô]nomo[a]?)\b/i.test(allFacts)) situation = "Autônomo";
    else if (/\b(?:trabalho|atua|recebo|ganho)\s+por projetos?\b|\bentre (?:um )?projeto e outro\b/i.test(allFacts)) situation = "Por projetos";
    const chips = [];
    if (role) chips.push(role.charAt(0).toLocaleUpperCase("pt-BR") + role.slice(1));
    if (situation && !new RegExp(`^${situation}$`, "i").test(role)) chips.push(situation);
    return chips.slice(0, 3);
  }

  function ensureEvidenceCoverage(topics, evidenceSource) {
    const result = [...topics];
    const evidenceFacts = String(evidenceSource || "").split("\n")
      .filter(line => /^(?:RESPOSTA DO LEAD(?: \(EVIDÊNCIA LITERAL\))?|FALA DO LEAD(?: \(ÚNICA FONTE DE FATOS\))?|FATO CONTEXTUALIZADO DETERMINÍSTICO):/i.test(line))
      .map(line => humanizeEvidenceFact(line.replace(/^[^:]+:\s*/, "")))
      .filter(Boolean)
      .filter(text => !isGenericInterestText(text) && !isMeetingAvailabilityText(text))
      .filter(text => !/\b(?:computador|notebook|equipamentos?|disponibilidade|tempo para se dedicar|horas? por dia)\b/i.test(text))
      .filter(text => !isBareAffirmativeReply(text))
      .filter(text => !/^(?:sim|n[aã]o|ok|tenho sim|consigo sim)[!,\.\s]*$/i.test(text));
    for (const fact of evidenceFacts.slice(0, 12)) {
      if (/\b(?:estou|est[aá])\s+em busca de emprego\b/i.test(fact) && result.some(topic => /\best[aá]\s+em busca de emprego\b/i.test(normalize(topic?.texto)))) continue;
      const factTokens = evidenceTokens(fact);
      if (!factTokens.size) continue;
      const combinedTopicTokens = new Set(result.flatMap(topic => [...evidenceTokens(topic.texto)]));
      const globallyCovered = [...factTokens].filter(token => combinedTopicTokens.has(token)).length;
      if (globallyCovered >= Math.max(2, Math.ceil(factTokens.size * .62))) continue;
      const covered = result.some(topic => {
        const topicTokens = evidenceTokens(topic.texto);
        const matches = [...factTokens].filter(token => topicTokens.has(token)).length;
        return matches >= Math.max(1, Math.ceil(factTokens.size * .55));
      });
      if (covered) continue;
      const tipo = topicTypeFor("contexto", fact);
      if (tipo === "contexto") continue;
      if (supportedByEvidence(fact, evidenceSource, tipo)) result.push({ tipo, texto: fact });
    }
    return result;
  }

  function formatAiBriefing(data, detectedName, contactData = {}, channel = "unknown", evidenceSource = "") {
    const crmName = validContactName([contactData.Nome, contactData.Sobrenome].map(normalize).filter(Boolean).join(" "));
    const nome = crmName || validContactName(detectedName) || validContactName(data?.nome) || "Lead";
    const score = /^(?:100|[1-9]?\d)$/.test(contactData.Score || "") ? contactData.Score : "";

    const profile = [];
    const instagramWithoutScore = channel === "instagram";
    const whatsappWithProfile = channel === "whatsapp";
    if (whatsappWithProfile) {
      if (score) profile.push(`Score ${score}`);
      const occupation = normalize(data?.perfil?.ocupacao);
      if (occupation && occupation.length <= 60) profile.push(titleProfileLabel(occupation));
      const situation = validFieldValue(contactData["Situação"], "Situação");
      if (situation && !profile.some(item => normalize(item).toLocaleLowerCase("pt-BR") === normalize(situation).toLocaleLowerCase("pt-BR"))) profile.push(situation.charAt(0).toLocaleUpperCase("pt-BR") + situation.slice(1));
    } else if (!instagramWithoutScore) {
      if (score) profile.push(`Score ${score}`);
      const age = validFieldValue(contactData.Idade, "Idade");
      const situation = validFieldValue(contactData["Situação"], "Situação");
      const income = validFieldValue(contactData.Renda, "Renda");
      if (age) profile.push(`${age} anos`);
      if (situation) profile.push(situation.charAt(0).toLocaleUpperCase("pt-BR") + situation.slice(1));
      if (income) profile.push(income.replace(/^renda\s*/i, ""));
    }

    const genericGoal = /^(?:(?:busca|quer|deseja|procura|tem interesse em)\s+)?(?:uma\s+)?(?:oportunidade\s+(?:real\s+)?(?:para|pra)\s+)?(?:trabalhar|trabalho)(?:\s+de casa|\s+em home office|\s+remoto)$|^(?:(?:busca|quer|deseja|procura)\s+)?(?:aumentar|complementar)\s+(?:a\s+)?renda(?:\s+atual)?$|^(?:busca|quer|deseja|procura)?\s*(?:informa[cç][aã]o|informa[cç][oõ]es|entender|saber)\s+(?:mais\s+)?sobre\s+(?:como\s+)?funciona(?:r)?\s+(?:o\s+)?home office$/i;
    const lines = [];
    const signatures = [];
    const add = (emoji, text, type = "contexto") => {
      const clean = normalize(text).replace(/[.!;,\s]+$/, "");
      // "Busca aumentar a renda" é um objetivo real, não a intenção genérica
      // de saber como funciona o home office.
      if (!clean || (genericGoal.test(clean) && !/\baumentar\s+(?:a\s+)?renda\b/i.test(clean))) return;
      const signature = semanticSignature(clean);
      const duplicate = signatures.some(previous => {
        if (previous.type !== type) return false;
        const intersection = [...signature].filter(word => previous.words.has(word)).length;
        return intersection / Math.max(1, Math.min(signature.size, previous.words.size)) >= .72;
      });
      if (!duplicate) {
        signatures.push({ type, words: signature });
        lines.push(`${emoji} ${clean}`);
      }
    };

    const investment = meaningfulFormAnswer(contactData.Investimento, "Investimento");
    if (investment && /(?:R\$|reais?|por m[eê]s|mensal|at[eé]\s*\d|\d)/i.test(investment)) {
      add("💳", `Informou disponibilidade para investir ${investment.replace(/^(?:investir|investimento)\s*/i, "")}`, "comercial");
    }
    const reserve = validFieldValue(contactData.Reserva, "Reserva");
    if (/^sim$/i.test(reserve)) {
      add("💰", "Informou possuir reserva financeira no formulário", "financeiro");
    } else if (/^n[aã]o$/i.test(reserve)) {
      add("💰", "Informou não possuir reserva financeira no formulário", "financeiro");
    } else if (reserve) {
      add("💰", humanizeFormAnswer(reserve, "Reserva"), "financeiro");
    }
    const aiTopics = [];
    for (const item of Array.isArray(data?.topicos) ? data.topicos : []) {
      const tipo = normalize(item?.tipo).toLocaleLowerCase("pt-BR");
      const deterministic = item?.deterministic === true;
      const literalEvidence = normalize(item?.evidencia);
      if (literalEvidence && isLowValueLeadChatter(literalEvidence)) continue;
      let text = normalize(typeof item === "string" ? item : item?.texto)
        .replace(/^[-•]\s*/, "")
        .replace(/^\*\*[^:]+:\*\*\s*/, "")
        .replace(/^(?:a pessoa|o contato)\s+/i, "")
        .replace(/\b(?:o|a)\s+lead\s+/gi, "")
        .replace(/\b(?:do|da)\s+lead\b/gi, "")
        .replace(/^Quero\b/i, "Quer")
        .replace(/^Busco\b/i, "Busca")
        .replace(/^Tenho\b/i, "Tem")
        .replace(/^Possuo\b/i, "Possui");
      if (!text || isLowValueLeadChatter(text)) continue;
      // Situação já exibida no cabeçalho do Instagram não precisa ocupar um
      // dos tópicos limitados do briefing.
      if (channel === "instagram" && /^está aposentada$/i.test(text)) continue;
      // Não deixe uma resposta com aposentadoria, emprego anterior e objetivo
      // virar um único tópico gigante; os fatos já são reconstruídos abaixo.
      if (/\baposentad[oa]\b.{0,100}\btrabalh(?:ei|ava|ou)\b.{0,100}\b(?:busc|quer|desej|pretend)/i.test(text)) continue;
      if (/\b(?:experi[eê]ncia profissional|atua profissionalmente|trabalha)\b.{0,60}\b(?:bom dia|boa tarde|boa noite|tudo bem)\b/i.test(text)) continue;
      if (/\bconheceu (?:o )?contato hoje\b/i.test(text)) continue;
      if (tipo === "disponibilidade") continue;
      if (/\b(?:tempo para se dedicar|horas? por dia)\b/i.test(text) && !isUsefulEquipmentFact(text)) continue;
      if (/\b(?:computador|notebook|equipamentos?)\b/i.test(text) && !isUsefulEquipmentFact(text)) continue;
      if (isBareAffirmativeReply(text)) continue;
      if (/\b(?:atua|trabalha|experi[eê]ncia|rotina|produtividade)\b.{0,80}\b(?:canal de instagram|canal no instagram|instagram)\b/i.test(text)) continue;
      if (isGenericInterestText(text)) continue;
      if (isMeetingAvailabilityText(text)) continue;
      if (/(?:dedicar|disponibilidade|dispon[ií]vel).*(?:conversa|consultoria)|(?:uma|duas|\d+)\s*horas?.*(?:conversa|consultoria)/i.test(text)) continue;
      if (tipo === "disponibilidade" && /(?:\b\d{1,2}(?::\d{2})?\s*(?:h|horas?)\b|final do dia|fim do dia|hor[aá]rio de disponibilidade)/i.test(text) && !/(?:trabalho|atividade|rotina profissional|dedicar|por dia|por semana)/i.test(text)) continue;
      if (/(?:possui|tem).*(?:conhecimento|experi[eê]ncia).*(?:an[aá]lise|avalia[cç][aã]o).*(?:an[uú]ncios?|textos?).*(?:imagens?|v[ií]deos?)/i.test(text)) continue;
      text = text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
      const resolvedType = topicTypeFor(tipo, text);
      if (resolvedType === "contexto") continue;
      // Extrações determinísticas vieram diretamente da conversa. Elas são a
      // fonte de verdade; o modelo pequeno não pode apagá-las por uma paráfrase ruim.
      const grounded = literalEvidenceExists(literalEvidence, evidenceSource) || supportedByEvidence(text, evidenceSource, resolvedType);
      if (!deterministic && !grounded) continue;
      aiTopics.push({ tipo: resolvedType, texto: text, deterministic });
    }
    const coveredTopics = data?.resumo ? aiTopics : ensureEvidenceCoverage(aiTopics, evidenceSource);
    aiTopics.splice(0, aiTopics.length, ...coveredTopics.filter(topic => !/\baposentad[oa]\b.{0,100}\btrabalh(?:ei|ava|ou)\b.{0,100}\b(?:busc|quer|desej|pretend)/i.test(normalize(topic?.texto))));
    // Nunca entrega um briefing vazio. Se o modelo pequeno falhar, preserva
    // diretamente as falas factuais já limpas e enviadas à IA.
    if (!aiTopics.length) {
      const fallbackFacts = String(evidenceSource || "").split("\n")
        .filter(line => /^(?:RESPOSTA DO LEAD|FATO CONTEXTUALIZADO DETERMINÍSTICO|FALA DO LEAD|CRM \(FATO DO FORMULÁRIO)/.test(line))
        .map(line => normalize(line.replace(/^[^:]+:\s*/, "")))
        .filter(text => text && !genericGoal.test(text))
        .filter(text => !isGenericInterestText(text) && !isMeetingAvailabilityText(text))
        .filter(text => !isBareAffirmativeReply(text))
        .filter(text => !/\b(?:disponibilidade|tempo para se dedicar|horas? por dia)\b/i.test(text) || isUsefulEquipmentFact(text))
        .filter(text => !/\b(?:computador|notebook|equipamentos?)\b/i.test(text) || isUsefulEquipmentFact(text))
        .filter(text => !/^(?:sim|n[aã]o|ok|tenho sim|consigo sim)[!,\.\s]*$/i.test(text))
        .slice(0, 4);
      for (let text of fallbackFacts) {
        text = humanizeEvidenceFact(text);
        const resolvedType = topicTypeFor("contexto", text);
        if (resolvedType !== "contexto" && supportedByEvidence(text, evidenceSource, resolvedType)) aiTopics.push({ tipo: resolvedType, texto: text });
      }
    }
    const order = ["trabalho", "transicao", "dificuldade", "objetivo", "financeiro", "formacao", "conhecimento", "mercado", "estrutura", "familia", "localidade", "saude", "relacionamento", "comercial", "positivo"];
    aiTopics.sort((a, b) => order.indexOf(a.tipo) - order.indexOf(b.tipo));
    const compactPresentation = normalize(data?.resumo).length >= 20;
    const selectedTopics = [];
    for (const topic of aiTopics) {
      const text = normalize(topic.texto);
      if (/^(?:est[aá]\s+)?desempregad[oa](?:\s+no momento)?$/i.test(text)
        && selectedTopics.some(item => /desempregad[oa]/i.test(normalize(item.texto)))) continue;
      // Trajetória digital e tentativa frustrada podem cair ambas em "mercado",
      // mas são informações diferentes e úteis em conversas ricas.
      if (compactPresentation && selectedTopics.some(item => item.tipo === topic.tipo) && !["transicao", "mercado"].includes(topic.tipo)) continue;
      selectedTopics.push(topic);
      if (compactPresentation && selectedTopics.length === Number(currentSettings.topicCount || 3)) break;
    }
    if (instagramWithoutScore) profile.push(...instagramProfileChips(evidenceSource, aiTopics, data?.perfil));
    for (const topic of selectedTopics) {
      const normalizedTopic = normalize(topic.texto).toLocaleLowerCase("pt-BR");
      if (profile.some(chip => normalizedTopic === normalize(chip).toLocaleLowerCase("pt-BR"))) continue;
      if (data?.resumo && normalizedTopic === normalize(data.resumo).replace(/[.!]+$/, "").toLocaleLowerCase("pt-BR")) continue;
      const emoji = TOPIC_EMOJI[topic.tipo];
      if (emoji) add(emoji, topic.texto, topic.tipo);
    }

    profile.forEach((label, index) => { profile[index] = titleProfileLabel(label); });
    let summary = normalize(data?.resumo)
      .replace(/^(?:resumo|perfil)\s*:\s*/i, "")
      .replace(/\b(?:o|a)\s+lead\b/gi, nome.split(/\s+/)[0])
      .replace(/\b(?:a pessoa|o contato)\b/gi, nome.split(/\s+/)[0])
      .trim();
    if (summary && (isLowValueLeadChatter(summary) || /\b(?:consultoria|google meet|dispost[oa] a participar)\b/i.test(summary))) summary = "";

    // Dados do Perfil do Lead são apresentados como fatos separados, e não
    // entregues ao modelo como história. Isso mantém idade, score e renda
    // exatos, evita inferências e deixa o HTML colado no CRM fácil de ler.
    const ghlProfileLines = [];
    if (whatsappWithProfile) {
      const field = name => validFieldValue(contactData[name], name);
      const age = field("Idade");
      const identity = [age && (/^\d{1,3}$/.test(age) ? `${age} anos` : age), field("Estado"), field("Gênero")].filter(Boolean);
      if (identity.length) ghlProfileLines.push(`• ${identity.join(" · ")}`);

      const computer = field("Computador");
      const time = field("Tempo disponível");
      if (computer || time) ghlProfileLines.push(`• ${[computer && `Computador: ${computer}`, time && `Tempo: ${time}`].filter(Boolean).join(" · ")}`);

      const income = field("Renda");
      const financial = field("Situação financeira");
      if (income || financial) ghlProfileLines.push(`• ${[income && `Renda: ${income}`, financial && `Situação: ${financial}`].filter(Boolean).join(" · ")}`);

      const follows = field("Acompanha Felipe");
      if (follows) ghlProfileLines.push(`• Acompanha Felipe: ${follows}`);

      const education = field("Formação");
      const experience = field("Experiência");
      if (education || experience) ghlProfileLines.push(`• ${[education && `Formação: ${education}`, experience && `Experiência: ${experience}`].filter(Boolean).join(" · ")}`);

      const investmentCapacity = field("Capacidade para investir");
      if (investmentCapacity) ghlProfileLines.push(`• Capacidade para investir: ${investmentCapacity}`);
    }

    return sanitizeFinalBriefing([
      `**${nome}**`,
      // Tags ficam no mesmo bloco para o HTML copiado mantê-las lado a lado.
      profile.length ? profile.map(item => `\`${item}\``).join(" ") : "",
      summary,
      // As leituras da conversa são uma lista única: o GHL recebe uma linha
      // por emoji, sem criar um "Shift+Enter" visual entre elas.
      ...(lines.length ? [(summary ? lines.slice(0, Number(currentSettings.topicCount || 4)) : lines).join("\n")] : []),
      // Uma única sequência preserva a lista visual compacta no HTML do GHL:
      // há respiro antes do perfil, mas não entre seus próprios tópicos.
      ...(ghlProfileLines.length ? ["**Perfil do Lead**", ghlProfileLines.join("\n")] : [])
    ].filter(Boolean).join("\n\n"));
  }

  function aiInput(conversation, channel = "unknown", contactData = {}) {
    const compact = compactForAi(conversation, channel);
    const crmFields = ["Situação", "Renda", "Motivo", "Dificuldade", "Justificativa", "Investimento", "Reserva"];
    // O perfil detalhado é um recurso do WhatsApp/GHL. No Instagram não
    // promovemos campos vazios ou parciais a contexto da conversa.
    if (channel === "whatsapp") crmFields.push("Computador", "Tempo disponível", "Formação", "Experiência", "Acompanha Felipe", "Situação financeira", "Capacidade para investir");
    const crm = crmFields
      .map(field => [field, validFieldValue(contactData[field], field)])
      .filter(([, value]) => value)
      .map(([field, value]) => `CRM (FATO DO FORMULÁRIO): ${field}: ${value.slice(0, 700)}`);
    const source = [compact, ...crm].filter(Boolean).join("\n");
    const channelLabel = channel === "instagram" ? "Instagram" : channel === "whatsapp" ? "WhatsApp" : "canal não identificado";
    return [
      `CANAL DO CONTATO: ${channelLabel}`,
      "Cubra todos os fatos relevantes sem inventar e sem usar logística de reunião",
      "",
      source
    ].join("\n");
  }

  function enrichConversationBriefing(data, conversation) {
    const enriched = { ...(data || {}), topicos: Array.isArray(data?.topicos) ? [...data.topicos] : [] };
    const existing = () => enriched.topicos.map(item => normalize(typeof item === "string" ? item : item?.texto).toLocaleLowerCase("pt-BR")).join(" ");
    const add = (tipo, texto, markers = []) => {
      const clean = normalize(texto).replace(/[.!;,:\s]+$/, "");
      const haystack = existing();
      if (!clean || haystack.includes(clean.toLocaleLowerCase("pt-BR"))) return;
      enriched.topicos.push({ tipo, texto: clean, deterministic: true });
    };
    const agent = (currentSettings.agentName || "FELIPE").toLocaleUpperCase("pt-BR");
    let previousAgentBody = "";
    let remoteGoalRebuilt = false;
    let unemployedNow = false;
    for (const block of String(conversation || "").split(/\n\n+/)) {
      const match = block.match(/^([^:\n]{1,80}):\s*\n?([\s\S]*)$/);
      if (!match) continue;
      const speaker = normalize(match[1]).toLocaleUpperCase("pt-BR");
      const body = normalize(match[2]);
      if (speaker === agent) { previousAgentBody = body; continue; }
      if (!body || speaker === "CONTATO") continue;

      const followDuration = body.match(/\b(?:acompanho|sigo|conhe[cç]o)\b.{0,45}\b(?:h[aá]|faz)?\s*(um(?:a)?|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\s+(dias?|semanas?|m[eê]s|meses|anos?)\b/i)
        || (/\b(?:acompanha|segue|conhece).{0,55}(?:felipe|conte[uú]do)|h[aá] quanto tempo.{0,30}(?:acompanha|segue)\b/i.test(previousAgentBody)
          ? body.match(/^\s*(um(?:a)?|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\s+(dias?|semanas?|m[eê]s|meses|anos?)\s*$/i)
          : null);
      if (followDuration) add("relacionamento", `Acompanha Felipe há ${followDuration[1]} ${followDuration[2]}`, [followDuration[1], followDuration[2]]);
      if (/\bconheci\s+(?:agora|recentemente)\s+(?:o\s+)?(?:seu\s+)?trabalho\b/i.test(body)) {
        add("relacionamento", "Conheceu o trabalho do Felipe recentemente", ["conheceu recentemente"]);
      }
      if (/\b(?:conhe[cç]o|j[aá] vi|j[aá] pesquisei|j[aá] tentei|j[aá] trabalhei)\b/i.test(body) && /\b(?:mercado|plataforma|trabalho remoto|empresa de tecnologia|home office|projeto)\b/i.test(body + " " + previousAgentBody)) {
        add("mercado", humanizeEvidenceFact(body), [body]);
      }
      if (/^(?:n[aã]o|ainda n[aã]o|nunca)[!,.\s]*$/i.test(body) && /\b(?:conhece|ouviu falar|sabe).{0,70}(?:mercado|trabalho remoto|empresas de tecnologia)\b/i.test(previousAgentBody)) {
        add("mercado", "Ainda não conhecia o mercado de trabalhos remotos para empresas de tecnologia", ["não conhecia o mercado"]);
      }

      const education = body.match(/\b(?:eu\s+)?sou\s+formad[oa]\s+em\s+([^\n.;!?]{3,180})/i);
      if (education) {
        const detail = normalize(education[1]);
        add("formacao", `Possui formação em ${detail}`, [detail]);
      }

      // Fatos curtos de trajetória e momento não podem desaparecer quando a
      // resposta do modelo os comprime em um resumo único.
      if (/\b(?:sou|estou|já estou)\s+aposentad[oa]\b|\bme aposentei\b/i.test(body)) {
        add("transicao", "Está aposentada", ["aposentada"]);
      }
      const formerCompany = body.match(/\b(?:trabalhei|trabalhava|atuei)\s+(?:na|no|em)\s+([A-ZÀ-Ý][\wÀ-ÿ&.-]*(?:\s+[A-ZÀ-Ý][\wÀ-ÿ&.-]*){0,5})/u);
      if (formerCompany) add("trabalho", `Trabalhou na ${normalize(formerCompany[1])}${/aposentad|aposentei/i.test(body) ? " antes de se aposentar" : ""}`, [normalize(formerCompany[1])]);
      if (/\b(?:busco|busca|quero|quer|desejo|deseja|pretendo)\s+(?:aumentar|melhorar)\s+(?:a\s+)?(?:minha|sua|a)\s+renda\b/i.test(body)) {
        add("objetivo", "Busca aumentar a renda", ["aumentar a renda"]);
      }
      if (/\b(?:acabei\s+de\s+conhecer|acabou\s+de\s+conhecer|conheci|conheceu)\s+(?:o\s+)?(?:trabalho\s+do\s+)?felipe\b/i.test(body)) {
        add("relacionamento", "Conheceu o Felipe recentemente", ["conheceu o Felipe"]);
      }

      if (/\b(?:estou|encontro-me)\s+em\s+busca\s+de\s+(?:um\s+)?emprego\b/i.test(body)) {
        add("transicao", "Está em busca de emprego", ["busca de emprego"]);
      }

      const desiredAreas = body.match(/\btanto\s+em\s+([^\n.;!?]{2,80}?)\s+como\s+([^\n.;!?]{2,80})/i);
      if (desiredAreas && /\b(?:emprego|vaga|busca|procur)/i.test(previousAgentBody + " " + body)) {
        add("objetivo", `Busca oportunidades tanto em ${normalize(desiredAreas[1])} quanto em ${normalize(desiredAreas[2])}`, [normalize(desiredAreas[1]), normalize(desiredAreas[2])]);
      }

      if (/\b(?:no momento|atualmente)?\s*(?:eu\s+)?estou desempregad[oa]\b/i.test(body)) {
        unemployedNow = true;
        enriched.topicos = enriched.topicos.filter(item => !/\b(?:atua|trabalha)\b.*\b(?:recursos humanos|contabilidade|departamento pessoal)\b/i.test(normalize(item?.texto)));
        add("transicao", "Está desempregada no momento", ["desempregada"]);
      }

      // Regra universal: entende qualquer profissão, cargo, setor ou área pela
      // autodeclaração ou pela resposta à pergunta profissional anterior.
      const declaredWork = body.match(/\b(?:trabalho|atuo|trabalhava|atuava|sou)\s+(?:(?:atualmente|hoje)\s+)?(?:como\s+|com\s+|em\s+|na\s+[aá]rea\s+de\s+|no\s+setor\s+de\s+)([^.;!?\n]{2,180})/i);
      const workQuestion = /\b(?:com o que|qual (?:[aá]rea|setor|profiss[aã]o|cargo)|em que (?:[aá]rea|setor)).{0,90}(?:atua|trabalha|exerce|est[aá])?\b/i.test(previousAgentBody);
      const formerWork = workQuestion ? body.match(/^\s*(?:eu\s+)?(?:era|fui)\s+(?:um(?:a)?\s+)?([^.;!?\n]{3,120})/i) : null;
      const contextualWork = workQuestion && !/\b(?:bem|contigo|voc[eê]|vc|obrigad[oa]|oi|ol[aá]|tarde|noite|dia)\b/i.test(body)
        ? body.match(/^(?:[aá]rea\s+|setor\s+)?([\p{L}À-ÿ][\p{L}À-ÿ\s/&+-]{2,120})(?:[.!?]|$)/u)
        : null;
      let rawWork = normalize(declaredWork?.[1] || formerWork?.[1] || contextualWork?.[1]);
      // Uma frase como "sou aposentada, trabalhei na Fiat..." contém vários
      // fatos; não trate o restante da frase como se fosse uma profissão única.
      if (/^aposentad[oa]\b[,:].*\b(?:trabalhei|trabalhava|busco|quero)\b/i.test(rawWork)) rawWork = "";
      if (rawWork && !isLowValueLeadChatter(rawWork) && !/^(?:sim|n[aã]o|home office|remot[oa]|renda|liberdade|emprego)$/i.test(rawWork)) {
        const work = rawWork.replace(/\s*[\/]\s*/g, " e ").replace(/\(([^)]+)\)/g, "$1");
        add("trabalho", unemployedNow || /desempregad/i.test(body)
          ? `Possui experiência profissional em ${work}`
          : `Atua profissionalmente em ${work}`, [work]);
      }

      if (/\bclt\b/i.test(previousAgentBody) && /\bsim\b/i.test(body) && /\bhor[aá]rio comercial\b/i.test(body + " " + previousAgentBody)) {
        add("trabalho", "Trabalha como CLT em horário comercial", ["CLT", "horário comercial"]);
      }

      if (/\bgostaria\s+de\s+atuar\s+(?:hoje|home)\s*office\b/i.test(body)) {
        const expand = /\bampliar\s+(?:minhas|suas)\s+entregas\b/i.test(body);
        add("objetivo", `Busca atuar em home office${expand ? " e ampliar suas entregas" : ""}`, ["home office", "ampliar entregas"]);
      }

      const elapsedOutsideArea = body.match(/\b(?:j[aá]\s+)?(?:tem|faz|h[aá])\s+(um(?:a)?|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\s+(dias?|semanas?|m[eê]s|meses|anos?)\b/i);
      if (elapsedOutsideArea && /\b(?:saiu|fora).{0,45}(?:[aá]rea|empresa)|\bfaz tempo\b|\bquanto tempo\b/i.test(previousAgentBody)) {
        add("transicao", `Está fora da área profissional há ${elapsedOutsideArea[1]} ${elapsedOutsideArea[2]}`, [elapsedOutsideArea[1], elapsedOutsideArea[2]]);
      }

      const bareSearchDuration = body.match(/^\s*(um(?:a)?|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\s+(dias?|semanas?|m[eê]s|meses|anos?)\s*$/i);
      if (bareSearchDuration && /\b(?:em busca|procurando|desempregad|sem emprego|quanto tempo)\b/i.test(previousAgentBody)) {
        add("transicao", `Está em busca de emprego há ${bareSearchDuration[1]} ${bareSearchDuration[2]}`, [bareSearchDuration[1], bareSearchDuration[2]]);
      }
      const contextualSearchDuration = body.match(/(?:^|\s)(um(?:a)?|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\s+(dias?|semanas?|m[eê]s|meses|anos?)(?:\s|$)/i);
      if (contextualSearchDuration && /\b(?:em busca.{0,25}(?:tempo|desde quando)|procurando emprego|desempregad|sem emprego|quanto tempo)\b/i.test(previousAgentBody)) {
        enriched.topicos = enriched.topicos.filter(item => !/^Est[aá] em busca de emprego$/i.test(normalize(item?.texto)));
        add("transicao", `Está em busca de emprego há ${contextualSearchDuration[1]} ${contextualSearchDuration[2]}`, [contextualSearchDuration[1], contextualSearchDuration[2]]);
      }

      const years = body.match(/\b(?:mais de\s+)?(\d{1,2})\s+anos?\s+de\s+experi[eê]ncia\s+em\s+([^.;!?]{3,160})/i);
      if (years) add("trabalho", `Possui mais de ${years[1]} anos de experiência em ${normalize(years[2]).replace(/,\s*com.*$/i, "")}`, [`${years[1]} anos`, "experiência"]);

      const responsibilities = body.match(/\b(?:atualmente\s+)?trabalho\s+bastante\s+com\s+([^.;!?]{5,260})/i);
      if (responsibilities) add("conhecimento", `Tem experiência com ${normalize(responsibilities[1])}`, ["gestão operacional", "planejamento", "liderança"]);

      const broadCareerYears = body.match(/\b(?:sempre\s+)?trabalh(?:ei|ou|ava)\s+(?:com|na\s+[aá]rea\s+de|no\s+setor\s+de)\s+([^,.;!?]{2,100}?)(?:\s+(?:a\s+minha\s+vida\s+toda|durante|por)|,)?\s*(\d{1,2})\s+anos?\b/i);
      if (broadCareerYears) {
        const careerArea = normalize(broadCareerYears[1]).replace(/\s+a\s+minha\s+vida\s+toda$/i, "");
        add("trabalho", `Possui trajetória de ${broadCareerYears[2]} anos em ${careerArea}`, [`${broadCareerYears[2]} anos`, careerArea]);
      }

      const marketGap = body.match(/\bsa[ií]\s+do\s+mercado\s+(?:h[aá]|a|faz)\s+(?:mais\s+ou\s+menos\s+|cerca\s+de\s+|aproximadamente\s+)?(\d{1,2})\s+anos?\b/i);
      if (marketGap) add("transicao", `Está fora da área anterior há aproximadamente ${marketGap[1]} anos`, [`${marketGap[1]} anos`, "fora da área"]);

      if (/\b(?:agora|atualmente)\s+(?:eu\s+)?(?:estou|trabalho|atuo)\s+(?:de|como)\s+uber\b/i.test(body)) {
        add("trabalho", "Atualmente trabalha como motorista de aplicativo", ["motorista de aplicativo"]);
      }

      const previousRole = body.match(/\b(?:eu\s+)?trabalhava\s+como\s+(.{2,100}?)(?=\s+e\s+(?:eu\s+)?fazia\b|[,.;!?]|$)/i);
      if (previousRole) add("trabalho", `Já trabalhou como ${normalize(previousRole[1])}`, [normalize(previousRole[1])]);

      const previousResponsibilities = body.match(/\b(?:eu\s+)?fazia\s+(?:toda\s+)?(?:a\s+)?parte\s+de\s+([^.;!?]{3,220})/i);
      if (previousResponsibilities) {
        const detail = normalize(previousResponsibilities[1]).replace(/\s+(?:e|mas|porém)\s+(?=(?:agora|atualmente|quero|busco|pretendo)\b).*$/i, "");
        add("conhecimento", `Possui experiência com ${detail}`, [detail]);
      }

      if (/\b(?:quero|busco|pretendo)\s+voltar\s+ao\s+mercado\b/i.test(body)) {
        const remotePriority = /\b(?:principalmente|preferencialmente|de prefer[eê]ncia)\s+(?:em\s+)?(?:home|home office|remot[oa])\b/i.test(body);
        add("transicao", remotePriority
          ? "Quer retornar ao mercado priorizando uma oportunidade em home office"
          : "Quer retornar ao mercado de trabalho", ["retornar ao mercado", "home office"]);
      }

      const averageWorkHours = body.match(/\btrabalho\s+(?:em\s+)?m[eé]dia\s+(\d{1,2})\s+horas?\b/i);
      if (averageWorkHours) {
        enriched.topicos = enriched.topicos.filter(item => !/\b(?:m[eé]dia\s+)?\d{1,2}\s+horas?|hor[aá]rios? de pico|canal de instagram\b/i.test(normalize(item?.texto)));
        const peak = /\bhor[aá]rios? de pico\b/i.test(body);
        const drivingContext = /\b(?:uber|motorista|rodando|rodar)\b/i.test(previousAgentBody);
        add("trabalho", drivingContext
          ? `Trabalha como motorista de aplicativo, com jornada média de ${averageWorkHours[1]} horas concentrada nos horários de pico`
          : `Trabalha em média ${averageWorkHours[1]} horas por dia${peak ? ", concentrando a rotina nos horários de pico" : ""}`,
        [`${averageWorkHours[1]} horas`, "horários de pico"]);
      }

      if (/\btransi[cç][aã]o de carreira\b/i.test(body) && /\b(?:comercial|estrat[eé]gica)\b/i.test(body)) {
        enriched.topicos = enriched.topicos.filter(item => {
          const value = normalize(item?.texto).toLocaleLowerCase("pt-BR");
          return !/\b(?:transi[cç][aã]o|comercial|estrat[eé]gica|novas compet[eê]ncias)\b/i.test(value);
        });
        add("transicao", "Busca uma transição para uma área comercial ou estratégica, aproveitando a experiência em gestão e relacionamento", ["transição", "comercial"]);
      }

      if (/\b(?:orienta[cç][aã]o|direcionamento)\b/i.test(body) && /\b(?:caminhos?|[aá]reas?|perfil)\b/i.test(body)) {
        add("dificuldade", "Busca orientação para identificar os caminhos e áreas mais adequados ao perfil", ["orientação", "caminhos"]);
      }

      const schedule = body.match(/(?:acordo|come[cç]o|inicio|entro)\s+(?:[àa]s?\s*)?(\d{1,2})(?::\d{2})?\s*(?:h|hr|horas?)?.{0,80}?(?:trabalho|vou|fico|at[eé])\s+(?:at[eé]\s*)?(\d{1,2})(?::\d{2})?\s*(?:h|hr|horas?)/i);
      if (schedule) add("trabalho", `A rotina profissional começa às ${schedule[1]}h e termina às ${schedule[2]}h`, ["rotina profissional", `às ${schedule[1]}h`]);

      const investment = body.match(/(?:m[eé]dia\s+)?(?:entre|de)?\s*(?:r\$\s*)?(\d{2,5})\s*(?:-|a|e|at[eé])\s*(?:r\$\s*)?(\d{2,5})\s*(?:reais?)?/i);
      if (investment && /(?:invest|limite|valor|reais|m[eé]dia)/i.test(`${previousAgentBody} ${body}`)) {
        add("financeiro", `Indicou uma faixa de investimento entre R$ ${investment[1]} e R$ ${investment[2]}, condicionada ao limite disponível`, [investment[1], investment[2], "faixa de investimento"]);
      }

      if (/\b(?:renda extra|viver s[oó] disso)\b/i.test(body) && /\b(?:home office|home|remot[oa]|digital)\b/i.test(body)) {
        if (!remoteGoalRebuilt) {
          enriched.topicos = enriched.topicos.filter(item => normalize(item?.tipo).toLocaleLowerCase("pt-BR") !== "objetivo");
          remoteGoalRebuilt = true;
        }
        const wantsBoth = /\brenda extra\b/i.test(body) && /\bviver s[oó] disso\b/i.test(body);
        add("objetivo", wantsBoth
          ? "Busca inicialmente uma renda extra, com possibilidade de viver exclusivamente do trabalho remoto"
          : /\bviver s[oó] disso\b/i.test(body)
            ? "Pretende construir uma renda principal com o trabalho remoto"
            : "Busca gerar renda extra com o trabalho remoto", ["renda extra", "viver exclusivamente", "renda principal"]);
      }
      if (/\b(?:liberdade|tempo pra mim|tempo para mim|qualquer lugar)\b/i.test(body)) {
        add("objetivo", "Valoriza liberdade de tempo e a possibilidade de trabalhar de qualquer lugar", ["liberdade de tempo", "qualquer lugar"]);
      }

      for (const painStatement of splitLeadStatements(body)) {
        const painType = painTopicType(painStatement);
        if (!painType || isBareAffirmativeReply(painStatement)) continue;
        const painFact = humanizePainFact(painStatement);
        if (painFact.length >= 5 && painFact.length <= 420) add(painType, painFact, [painFact]);
      }

      if (/\bj[aá]\s+(?:atuei|trabalhei|tive experi[eê]ncia).{0,45}\bhome(?: office)?\b/i.test(body)) {
        add("trabalho", "Já atuou por um tempo em home office e considera a modalidade ótima", ["atuou por um tempo", "modalidade ótima"]);
      }

      if (/\b(?:tipos? de produto|quais produtos|o que (?:voc[eê] )?vende|produto aliment[ií]cio)\b/i.test(previousAgentBody)) {
        const products = body.split(/\n+|,|\s+e\s+/).map(item => normalize(item).replace(/\bcomo funciona.*$/i, "").trim())
          .filter(item => item.length > 1 && item.length < 45 && !/^(?:como funciona|sim|n[aã]o|entendi)$/i.test(item));
        if (products.length) add("trabalho", `Comercializa produtos como ${products.slice(0, 5).join(", ")}`, products.map(item => item.toLocaleLowerCase("pt-BR")));
      }
    }
    const outsideAreaFact = enriched.topicos.find(item => item?.deterministic && /\best[aá]\s+fora\s+da\s+[aá]rea/i.test(normalize(item?.texto)));
    if (outsideAreaFact) {
      const duration = normalize(outsideAreaFact.texto).match(/\bh[aá]\s+(.+)$/i)?.[1];
      enriched.topicos = enriched.topicos.filter(item => item === outsideAreaFact || item?.deterministic ||
        !(/\b(?:saiu|fora)\b.{0,100}[aá]rea/i.test(normalize(item?.texto)) && (!duration || normalize(item?.texto).toLocaleLowerCase("pt-BR").includes(duration.toLocaleLowerCase("pt-BR")))));
    }
    // Fatos recuperados diretamente da fala aparecem antes das interpretações
    // do modelo, evitando que uma resposta ruim bloqueie a informação correta.
    enriched.topicos.sort((a, b) => Number(Boolean(b?.deterministic)) - Number(Boolean(a?.deterministic)));
    return enriched;
  }

  function splitLeadStatements(text) {
    return String(text || "")
      .split(/\n+|(?<=[.!?])\s+|\s*[;]+\s*/)
      .flatMap(part => part.split(/\s*,?\s+(?:mas|porém|contudo)\s+/i))
      .flatMap(part => part.split(/\s*,\s+(?=(?:agora|atualmente|antes|j[aá]|quero|pretendo|busco|sa[ií]|eu\s+trabalhava|trabalhava|eu\s+fazia|fazia)\b)/i))
      .flatMap(part => part.split(/\s+e\s+(?=(?:tenho|possuo|quero|pretendo|busco|gostaria|desejo|estou|sou|atuo|trabalho|trabalhava|fazia|sa[ií]|moro|resido)\b)/i))
      .map(normalize)
      .filter(Boolean);
  }

  function compactSdrContext(text) {
    const seen = new Set();
    const lines = String(text || "").split(/\n+/).map(normalize).filter(Boolean).filter(line => {
      const key = line.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return false;
      seen.add(key);
      return !/^(?:oi+|ol[aá]|bom dia|boa tarde|boa noite|perfeito|show+|bacana|entendi|obrigad[oa])\b[!,.\s]*$/i.test(line);
    });
    const questions = lines.filter(line => /\?|\b(?:qual|quais|quanto|quantos|como|onde|quando|por que|porque|voc[eê]|hoje|busca|pretende|trabalha|sente|mensalmente|segunda renda|migrar)\b/i.test(line));
    return normalize((questions.length ? questions : lines).slice(-2).join(" ")).slice(-360);
  }

  function compactForAi(conversation, channel = "unknown") {
    const crmNoise = /(?:google meet|consultoria gratuita|convite|whatsapp|e-?mail|telefone|agend(?:ar|amento|ei)|bate[- ]?papo|condi[cç][aã]o especial|hor[aá]rio|amanh[aã]|reuni[aã]o|appointment|opportunity)/i;
    const leadLogistics = /^(?:(?:quero|gostaria|preciso|vim|estou aqui para).*(?:agend|marcar|bate[- ]?papo|consultoria|condi[cç][aã]o especial)|(?:me (?:envie|passa|mande)|envio|segue|aqui est[aá]|pode ser|consigo|sim|n[aã]o)\b.*(?:link|e-?mail|telefone|whatsapp|agend|reuni[aã]o|consultoria|hor[aá]rio)|(?:qual|que) hor[aá]rio\b)/i;
    const genericAnswer = /^(?:sim|quero sim|n[aã]o|tenho sim|consigo sim|pode ser|perfeito|show+|legal|interessante|bora|entendi|realmente|faz total sentido|beleza|ok)[!,.\s]*$/i;
    // "Hoje" aparece com frequência em perguntas profissionais ("hoje você
    // trabalha com o quê?"). Nunca pode, sozinho, classificar a resposta como
    // logística de agenda.
    const meetingQuestion = /\b(?:google meet|consultoria|reuni[aã]o|liga[cç][aã]o|chamada|agend(?:ar|amento)|reservar|qual hor[aá]rio|hor[aá]rio fica melhor|pode (?:hoje|amanh[aã])\s+(?:[aà]s?\s*)?\d)\b/i;
    const qualification = /(?:(?:tem|tenho|possui|possuo|comprei|uso)\s+(?:um\s+|uma\s+)?(?:computador|notebook|note(?:book)?|noot|not|tablet|internet|pc)|(?:computador|notebook|note(?:book)?|noot|not|tablet|internet|pc).*(?:\b\d+\s*h(?:r?s?|oras?)?|dedicar|disponibilidade|tempo)|(?:\b\d+\s*h(?:r?s?|oras?)?\b).*(?:dia|dedicar|disponibilidade))/i;
    const genericInterest = /^(?:(?:posso|gostaria|quero|queria|poderia).*(?:saber|conhecer|entender)\s+mais|(?:me\s+)?(?:fala|conte)\s+mais|(?:sim[,! ]*)?(?:topo|topa|aceito|vamos aprofundar|faz sentido)[!. ]*)$/i;
    const greetingOnly = /^(?:oi+|ol[aá]|bom dia|boa tarde|boa noite|tudo bem|joia)[!?,.\s]*$/i;
    const blocks = String(conversation || "").split(/\n\n+/);
    const seenLead = new Set(); const useful = [];
    let leadName = "";
    let previousAgentBody = "";
    let turn = 0;
    const contextualizedFact = (question, answer) => {
      const q = normalize(question);
      const a = normalize(answer);
      const duration = a.match(/\b(?:h[aá]\s+)?(um(?:a)?|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\s+(dias?|semanas?|m[eê]s|meses|anos?)\b/i);
      if (duration && /\b(?:desempregad|sem emprego|fora do mercado|sem trabalhar|em busca.{0,25}(?:tempo|desde quando)|quanto tempo.{0,35}(?:desempregad|sem emprego|fora|busca))\b/i.test(q)) {
        return `Está sem emprego há ${duration[1]} ${duration[2]}`;
      }
      if (duration && /\b(?:acompanha|segue|conhece).{0,55}(?:felipe|conte[uú]do)|h[aá] quanto tempo.{0,30}(?:acompanha|segue)\b/i.test(q)) {
        return `Acompanha Felipe há ${duration[1]} ${duration[2]}`;
      }
      if (/^(?:n[aã]o|ainda n[aã]o|nunca)[!,.\s]*$/i.test(a) && /\b(?:conhece|ouviu falar|sabe).{0,70}(?:mercado|trabalho remoto|empresas de tecnologia|felipe)\b/i.test(q)) {
        return /felipe/i.test(q) ? "Ainda não acompanhava Felipe" : "Ainda não conhecia esse mercado de trabalho remoto";
      }
      return "";
    };
    for (const block of blocks) {
      const match = block.match(/^([^:\n]{1,50}):\s*\n?([\s\S]*)$/);
      if (!match) continue;
      const speaker = normalize(match[1]).toLocaleUpperCase("pt-BR");
      const body = normalize(match[2]);
      if (!body) continue;
      if (speaker === "CONTATO") { leadName = body.split("\n")[0].slice(0, 80); continue; }
      const outgoing = speaker === (currentSettings.agentName || "FELIPE").toLocaleUpperCase("pt-BR");
      const lines = body.split(/\n+/).map(normalize).filter(Boolean);
      if (outgoing) {
        previousAgentBody = compactSdrContext(body);
        continue;
      }
      for (const line of lines) {
        const statements = splitLeadStatements(line);
        for (const statement of statements) {
          const deterministicFact = contextualizedFact(previousAgentBody, statement);
          const meetingReply = meetingQuestion.test(previousAgentBody) &&
            !/\b(?:trabalho|trabalha|atuo|atua|profiss[aã]o|carreira|rotina profissional)\b/i.test(statement);
          const qualificationReply = qualification.test(previousAgentBody) &&
            (genericAnswer.test(statement) || isBareAffirmativeReply(statement));
          if (!deterministicFact && ((channel === "instagram" ? leadLogistics.test(statement) : crmNoise.test(statement)) ||
              meetingReply || qualificationReply || (isMeetingAvailabilityText(statement) && !qualification.test(statement)) || genericInterest.test(statement) || genericAnswer.test(statement) || greetingOnly.test(statement))) continue;
          let usefulStatement = statement;
          usefulStatement = normalize(usefulStatement.replace(/^(?:tenho|possuo)\s+(?=(?:a\s+)?(?:manh[aã]|tarde|noite)\b)/i, "Tem "));
          if (!usefulStatement || isLowValueLeadChatter(usefulStatement)) continue;
          const key = usefulStatement.toLocaleLowerCase("pt-BR");
          if (seenLead.has(key)) continue;
          seenLead.add(key);
          turn += 1;
          useful.push(`TURNO ${turn}`);
          if (previousAgentBody) useful.push(`PERGUNTA/CONTEXTO DO SDR (SOMENTE PARA INTERPRETAR; NÃO É FATO): ${previousAgentBody}`);
          if (!deterministicFact || !genericAnswer.test(usefulStatement)) useful.push(`RESPOSTA DO LEAD (EVIDÊNCIA LITERAL): ${usefulStatement.slice(0, 520)}`);
          if (deterministicFact) useful.push(`FATO CONTEXTUALIZADO DETERMINÍSTICO: ${deterministicFact}`);
        }
      }
    }
    const joined = `${leadName ? `NOME DO LEAD: ${leadName}\n` : ""}${useful.join("\n")}`;
    return joined;
  }

  function conversationStats(conversation) {
    const agent = (currentSettings.agentName || "FELIPE").toLocaleUpperCase("pt-BR");
    let leadMessages = 0;
    let agentMessages = 0;
    for (const block of String(conversation || "").split(/\n\n+/)) {
      const match = block.match(/^([^:\n]{1,80}):\s*\n?([\s\S]*)$/);
      if (!match) continue;
      const speaker = normalize(match[1]).toLocaleUpperCase("pt-BR");
      if (speaker === "CONTATO") continue;
      const count = normalize(match[2]).split(/\n+/).map(normalize).filter(Boolean).length;
      if (speaker === agent) agentMessages += count;
      else leadMessages += count;
    }
    return { leadMessages, agentMessages, total: leadMessages + agentMessages };
  }

  function enableModalWindow(panel, header, minimize) {
    let drag = null;
    header.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      panel.style.position = "fixed";
      panel.style.left = `${rect.left}px`; panel.style.top = `${rect.top}px`;
      panel.style.width = `${rect.width}px`; panel.style.height = `${rect.height}px`;
      panel.style.margin = "0";
      drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      header.setPointerCapture(event.pointerId); header.classList.add("hod-dragging");
    });
    header.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      const left = Math.min(innerWidth - 120, Math.max(-panel.offsetWidth + 120, event.clientX - drag.dx));
      const top = Math.min(innerHeight - 70, Math.max(0, event.clientY - drag.dy));
      panel.style.left = `${left}px`; panel.style.top = `${top}px`;
    });
    const finish = event => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null; header.classList.remove("hod-dragging");
      try { header.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    header.addEventListener("pointerup", finish); header.addEventListener("pointercancel", finish);
    minimize.addEventListener("click", () => {
      const minimized = panel.classList.toggle("hod-minimized");
      minimize.textContent = minimized ? "+" : "−";
      minimize.title = minimized ? "Restaurar janela" : "Minimizar janela";
    });
    header.addEventListener("dblclick", event => { if (!event.target.closest("button")) minimize.click(); });
  }

  function showBriefingModal(text, conversation, contactData = {}, runtimeInfo = {}) {
    const capturedChannel = runtimeInfo.channel || resolveConversationChannel(conversationChannel(), contactData);
    document.getElementById("hod-briefing-modal")?.remove();
    const overlay = document.createElement("div"); overlay.id = "hod-briefing-modal";
    overlay.dataset.theme = currentSettings.uiTheme;
    overlay.dataset.layout = currentSettings.resultLayout;
    overlay.dataset.density = currentSettings.density;
    overlay.dataset.motion = currentSettings.motionStyle || "smooth";
    if (/^#[0-9a-f]{6}$/i.test(currentSettings.accentColor)) overlay.style.setProperty("--hod-accent", currentSettings.accentColor);
    const panel = document.createElement("section"); panel.className = "hod-modal-panel";
    const header = document.createElement("header");
    const capturedFields = Object.keys(contactData).filter(field => validFieldValue(contactData[field], field));
    const crmStatus = capturedFields.length ? `CRM capturado: ${capturedFields.join(", ")}` : "CRM não capturado";
    const stats = conversationStats(conversation);
    const brand = document.createElement("div"); brand.className = "hod-modal-brand";
    const brandIcon = document.createElement("i"); brandIcon.setAttribute("aria-hidden", "true");
    const logo = document.createElement("img"); logo.src = extensionRuntime?.getURL?.("icons/icon-128.png") || ""; logo.alt = ""; brandIcon.append(logo);
    const providerLabel = `${runtimeInfo?.label || "Groq"} · ${runtimeInfo?.provider || "Groq Cloud"}`;
    const heading = document.createElement("div"); heading.innerHTML = `<b>HOD Briefing</b><span><i></i> ${providerLabel}</span>`;
    brand.append(brandIcon, heading);
    const controls = document.createElement("div"); controls.className = "hod-window-controls";
    const minimize = document.createElement("button"); minimize.type="button"; minimize.className="hod-modal-minimize"; minimize.textContent="−"; minimize.title="Minimizar janela";
    const close = document.createElement("button"); close.type="button"; close.className="hod-modal-close"; close.textContent="×";
    controls.append(minimize, close); header.append(brand,controls);
    const editor = document.createElement("div");
    editor.className = "hod-briefing-editor"; editor.contentEditable = "true"; editor.spellcheck = true;
    const safeText = sanitizeFinalBriefing(text);
    const canonicalHtml = briefingClipboardFormats(safeText).html;
    editor.innerHTML = canonicalHtml;
    editor.addEventListener("copy", event => {
      const selection = getSelection();
      if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
      const container = document.createElement("div");
      container.append(selection.getRangeAt(0).cloneContents());
      event.clipboardData?.setData("text/plain", selection.toString());
      event.clipboardData?.setData("text/html", sanitizeBriefingHtml(container.innerHTML));
      event.preventDefault();
    });
    const meta = document.createElement("div"); meta.className = "hod-modal-meta";
    const tokenInfo = runtimeInfo?.usage?.total ? ` · ${runtimeInfo.usage.total} tokens` : "";
    const sourceInfo = runtimeInfo?.sourceTruncated ? " · conversa compactada" : "";
    meta.textContent = `Lead: ${stats.leadMessages} · SDR: ${stats.agentMessages} · Total: ${stats.total}${tokenInfo}${sourceInfo} · Captura ${((runtimeInfo.captureMs || 0) / 1000).toFixed(1)}s · IA ${((runtimeInfo.latencyMs || 0) / 1000).toFixed(1)}s`;
    meta.title = crmStatus;
    const actions=document.createElement("footer");
    const regenerate=document.createElement("button"); regenerate.type="button"; regenerate.className="hod-secondary hod-regenerate"; regenerate.textContent="Gerar novamente";
    const copyConversation=document.createElement("button"); copyConversation.type="button"; copyConversation.className="hod-secondary"; copyConversation.textContent="Copiar conversa completa";
    const copy=document.createElement("button"); copy.type="button"; copy.className="hod-primary"; copy.textContent="Copiar briefing";
    actions.append(regenerate,copyConversation,copy); panel.append(header,editor,meta,actions); overlay.append(panel); document.body.append(overlay);
    const toolbar = document.createElement("div"); toolbar.className = "hod-tools";
    const format = document.createElement("div"); format.className="hod-format-buttons"; format.setAttribute("aria-label", "Formato de exportação");
    let formatValue = currentSettings.exportFormat;
    const updateFormatButtons = () => format.querySelectorAll("button").forEach(button => {
      const selected = button.dataset.value === formatValue;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    for (const [value,label] of [["ghl","GoHighLevel HTML"],["plain","Texto simples"],["whatsapp","WhatsApp"]]) {
      const button = document.createElement("button"); button.type="button"; button.dataset.value=value; button.textContent=label;
      button.onclick=()=>{ formatValue=value; updateFormatButtons(); if (!preview.hidden) renderPreview(); };
      format.append(button);
    }
    updateFormatButtons();
    const tool = label => { const b = document.createElement("button"); b.type="button"; b.textContent=label; toolbar.append(b); return b; };
    toolbar.append(format);
    const previewButton = tool("Prévia da cópia");
    const summaryButton = tool("Refazer resumo");
    const topicsButton = tool("Refazer tópicos");
    const sourceButton = tool("Ver captura");
    const preview = document.createElement("div"); preview.className="hod-preview"; preview.hidden=true;
    header.after(toolbar); toolbar.after(preview);
    const exportContent = () => {
      const html = sanitizeBriefingHtml(editor.innerHTML);
      const box = document.createElement("div"); box.innerHTML = html;
      const blocks = [...box.querySelectorAll("p")].filter(p => p.textContent.trim());
      const plain = blocks.map(p => p.innerHTML.replace(/<br\s*\/?>(\s*)/gi, "\n").replace(/<[^>]*>/g,"")).map(t => { const el=document.createElement("textarea"); el.innerHTML=t; return el.value; }).join("\n\n");
      const whatsapp = plain.split("\n\n").map((text,index) => index===0 ? "*" + text + "*" : text).join("\n\n");
      return { html, plain: plain || editor.innerText, whatsapp };
    };
    const renderPreview = () => {
      const out = exportContent(); preview.replaceChildren();
      if (formatValue === "ghl") preview.innerHTML = out.html;
      else preview.textContent = formatValue === "whatsapp" ? out.whatsapp : out.plain;
    };
    previewButton.onclick = () => { preview.hidden=!preview.hidden; if (!preview.hidden) renderPreview(); };
    editor.addEventListener("input", () => { if (!preview.hidden) renderPreview(); });
    sourceButton.onclick = () => { preview.hidden=false; preview.textContent=conversation; };
    const partial = async scope => {
      summaryButton.disabled=topicsButton.disabled=regenerate.disabled=true;
      try {
        const channel=capturedChannel;
        const source=aiInput(conversation,channel,contactData);
        const result=await sendExtensionMessage({type:"ai-generate",conversation:source});
        if (!result?.ok) throw new Error(result?.error || "Falha na geração");
        const blocks=[...editor.querySelectorAll("p")].filter(p=>p.textContent.trim());
        const summary=blocks.slice(1).find(p=>!p.querySelector("code"));
        if (scope==="summary") {
          if (!summary) throw new Error("Resumo não encontrado no editor.");
          summary.textContent=result.data.resumo;
        } else {
          if (!summary) throw new Error("Resumo não encontrado no editor.");
          const fresh=document.createElement("div");
          fresh.innerHTML=briefingClipboardFormats(formatAiBriefing(result.data,"",contactData,channel,source)).html;
          const freshBlocks=[...fresh.querySelectorAll("p")].filter(p=>p.textContent.trim() && !p.querySelector("code")).slice(2);
          if (!freshBlocks.length) throw new Error("Nenhum tópico validado.");
          while(summary.nextSibling) summary.nextSibling.remove();
          freshBlocks.forEach(p=>editor.append(p));
        }
        if (!preview.hidden) renderPreview();
      } catch(error) { preview.hidden=false; preview.textContent=error.message; }
      finally { summaryButton.disabled=topicsButton.disabled=regenerate.disabled=false; }
    };
    summaryButton.onclick=()=>partial("summary"); topicsButton.onclick=()=>partial("topics");
    enableModalWindow(panel, header, minimize);
    const dismiss=()=>overlay.remove(); close.onclick=dismiss;
    copy.onclick=async()=>{
      const finalText = exportContent().plain;
      // Nunca reconstrói o HTML a partir de innerText: isso apagava <strong>
      // e <code> antes da cópia. Copia o DOM rico que o usuário está vendo.
      const currentHtml = sanitizeBriefingHtml(editor.innerHTML);
      const richHtml = currentHtml;
      try {
        const out=exportContent();
        if(formatValue==="ghl") await copyRichBriefing(editor, finalText, richHtml);
        else await copyText(formatValue==="whatsapp" ? out.whatsapp : out.plain);
        copy.textContent=formatValue==="ghl" ? "Copiado com formatação ✓" : "Texto copiado ✓";
      } catch(error) { preview.hidden=false; preview.textContent=error.message || "Falha ao copiar"; }
    };
    copyConversation.onclick=async()=>{
      await copyText(conversation);
      copyConversation.textContent="Conversa copiada ✓";
    };
    regenerate.onclick=()=>{overlay.remove();const trigger=document.getElementById(BUTTON_ID);if(trigger)run(trigger)};
  }

  function setStatus(button, text, cls = "") {
    button.textContent = text;
    button.className = cls;
    setTimeout(() => { button.textContent = currentSettings.buttonLabel || "Briefing"; button.className = ""; applyButtonStyle(button); }, 2600);
  }

  function v2Export(editor) {
    const html = sanitizeBriefingHtml(editor.innerHTML);
    const box = document.createElement("div");
    box.innerHTML = html;
    const plain = [...box.querySelectorAll("p")]
      .filter(p => p.textContent.trim())
      .map(p => p.innerHTML.replace(/<br\s*\/?>(\s*)/gi, "\n").replace(/<[^>]*>/g, ""))
      .map(value => { const field = document.createElement("textarea"); field.innerHTML = value; return field.value; })
      .join("\n\n");
    return { html, plain };
  }

  function showV2Result(text, conversation, contactData, runtimeInfo) {
    const channel = runtimeInfo.channel || "unknown";
    const name = runtimeInfo.name || text.match(/^\*\*([^*]+)\*\*/)?.[1] || contactData.Nome || "Lead";
    const formats = briefingClipboardFormats(sanitizeFinalBriefing(text));
    const chips = runtimeInfo.chips || [...text.matchAll(/^`([^`]+)`$/gm)].map(match => match[1]).filter(value => !/^Lead do /i.test(value));
    v2Current = { text, conversation, name, channel, chips, html: runtimeInfo.existingHtml || formats.html, path: location.pathname };
    const open = () => globalThis.HOD_V2_UI.openResult({
      ...v2Current,
      theme: currentSettings.uiTheme,
      motion: currentSettings.motionStyle,
      format: currentSettings.exportFormat,
      onCopy: async (editor, format) => {
        const output = v2Export(editor);
        if (format === "ghl") {
          const copyNode = editor.hidden ? editor.cloneNode(true) : editor;
          if (copyNode !== editor) {
            copyNode.hidden = false;
            copyNode.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none";
            document.body.append(copyNode);
          }
          try { await copyRichBriefing(copyNode, output.plain, output.html); }
          finally { if (copyNode !== editor) copyNode.remove(); }
        }
        else if (format === "whatsapp") await copyText(output.plain.replace(/\n\n/g, "\n"));
        else await copyText(output.plain);
      },
      onCopyConversation: () => copyText(conversation),
      onRegenerate: () => run(document.getElementById(BUTTON_ID)),
      onClear: () => { v2Current = null; },
      onChange: (html, plain) => { if (v2Current) { v2Current.html = sanitizeBriefingHtml(html); v2Current.text = plain; } }
    });
    open();
  }

  async function restoreButtonPosition(button) {
    try {
      const stored = await extensionStorage.sync.get(POSITION_KEY);
      const saved = stored[POSITION_KEY];
      if (!Number.isFinite(saved?.left) || !Number.isFinite(saved?.top)) return;
      const maxLeft = Math.max(8, innerWidth - button.offsetWidth - 8);
      const maxTop = Math.max(8, innerHeight - button.offsetHeight - 8);
      button.style.left = `${Math.min(maxLeft, Math.max(8, saved.left))}px`;
      button.style.top = `${Math.min(maxTop, Math.max(8, saved.top))}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
    } catch (_) {}
  }

  function applyButtonStyle(button) {
    button.dataset.size = currentSettings.buttonSize;
    button.dataset.theme = currentSettings.buttonTheme;
    button.dataset.iconOnly = currentSettings.iconOnly ? "true" : "false";
    button.dataset.showStatus = currentSettings.showStatus === false ? "false" : "true";
    const color = /^#[0-9a-f]{6}$/i.test(currentSettings.customColor || "") ? currentSettings.customColor : "#0aa69b";
    const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16));
    const luminance = (0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])/255;
    button.style.setProperty("--hod-custom-color", color);
    button.style.setProperty("--hod-custom-text", luminance > .62 ? "#17181b" : "#ffffff");
    if (!button.disabled) button.textContent = currentSettings.buttonLabel || "Briefing";
  }

  function shouldShowButton() {
    if (!currentSettings.enabled || currentSettings.displayMode === "never") return false;
    if (currentSettings.displayMode === "always") return true;
    if (currentSettings.displayMode === "contacts") return /\/(contacts|conversations)(?:\/|$)/i.test(location.pathname);
    return Boolean(findScroller());
  }

  function refreshButtonVisibility() {
    const button = document.getElementById(BUTTON_ID);
    if (button) button.style.display = shouldShowButton() ? "inline-flex" : "none";
  }

  function makeDraggable(button) {
    let drag = null;
    let ignoreNextClick = false;
    let frame = 0;
    let nextPosition = null;
    button.addEventListener("pointerdown", event => {
      if (button.disabled || event.button !== 0) return;
      const rect = button.getBoundingClientRect();
      drag = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top, width: rect.width, height: rect.height, startX: event.clientX, startY: event.clientY, moved: false };
      button.setPointerCapture(event.pointerId);
      button.classList.add("ghl-copy-dragging");
    });
    button.addEventListener("pointermove", event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
      if (!drag.moved) return;
      const left = Math.min(innerWidth - drag.width - 8, Math.max(8, event.clientX - drag.dx));
      const top = Math.min(innerHeight - drag.height - 8, Math.max(8, event.clientY - drag.dy));
      nextPosition = { left, top };
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (!nextPosition) return;
        button.style.left = `${nextPosition.left}px`; button.style.top = `${nextPosition.top}px`;
        button.style.right = "auto"; button.style.bottom = "auto";
        nextPosition = null;
      });
    });
    const finish = event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      ignoreNextClick = drag.moved;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (nextPosition) {
        button.style.left = `${nextPosition.left}px`; button.style.top = `${nextPosition.top}px`;
        button.style.right = "auto"; button.style.bottom = "auto";
        nextPosition = null;
      }
      if (drag.moved) {
        const rect = button.getBoundingClientRect();
        extensionStorage.sync.set({ [POSITION_KEY]: { left: Math.round(rect.left), top: Math.round(rect.top) } });
      }
      drag = null;
      button.classList.remove("ghl-copy-dragging");
      try { button.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    button.addEventListener("pointerup", finish);
    button.addEventListener("pointercancel", finish);
    button.addEventListener("click", event => {
      if (ignoreNextClick) { ignoreNextClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    addEventListener("resize", () => restoreButtonPosition(button));
  }

  async function run(button) {
    if (!button || button.disabled) return { ok: false, error: "Abra uma conversa ou aguarde a geração atual." };
    button.disabled = true; button.textContent = "Lendo histórico…";
    globalThis.HOD_V2_UI.setState("capturing", "Lendo a conversa", "Capturando o histórico e identificando as falas do lead e do SDR.", { theme: currentSettings.uiTheme, motion: currentSettings.motionStyle });
    try {
      const scroller = findScroller();
      if (!scroller) throw new Error("Abra uma conversa e tente novamente.");
      const text = v2Capture?.path === location.pathname ? v2Capture.text : await collect(scroller);
      if (!text) throw new Error("Nenhuma mensagem foi encontrada.");
      const stats = conversationStats(text);
      if (!stats.leadMessages || !stats.agentMessages) {
        throw new Error(`Captura incompleta: encontrei ${stats.leadMessages} fala(s) do lead e ${stats.agentMessages} do SDR. Role a conversa para carregar os dois lados e tente novamente.`);
      }
      button.textContent = "Lendo contato…";
      const detectedChannel = conversationChannel();
      const contactData = v2Capture?.path === location.pathname ? v2Capture.contactData : await readBestContactData(detectedChannel);
      const channel = resolveConversationChannel(detectedChannel, contactData);
      button.textContent = "Gerando briefing…";
      globalThis.HOD_V2_UI.setState("generating", "Preparando o briefing", "Organizando os fatos mais úteis para a consultoria.", { theme: currentSettings.uiTheme, motion: currentSettings.motionStyle });
      const source = aiInput(text, channel, contactData);
      const result = await Promise.race([
        sendExtensionMessage({ type: "ai-generate", conversation: source }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("A IA excedeu o tempo total configurado.")), 280000))
      ]);
      if (!result?.ok) throw new Error(result?.error || "Não foi possível gerar o briefing.");
      const briefingData = result.data;
      result.captureMs = captureInfo.durationMs;
      result.channel = channel;
      showV2Result(formatAiBriefing(briefingData, contactName(scroller), contactData, channel, source), text, contactData, result);
      v2Capture = null;
      try {
      const { hodMetrics = [], hodHistory = [] } = await extensionStorage.local.get(["hodMetrics", "hodHistory"]);
      await extensionStorage.local.set({ hodMetrics: [{ date:new Date().toISOString(), captureMs:captureInfo.durationMs, generationMs:result.latencyMs, messages:stats.total, lead:stats.leadMessages, sdr:stats.agentMessages, topStable:captureInfo.topStable, model:result.model, tokens:result.usage?.total || 0 }, ...hodMetrics].slice(0,30) });
      if (currentSettings.historyEnabled) await extensionStorage.local.set({ hodHistory: [{ date:new Date().toISOString(), text:formatAiBriefing(briefingData,contactName(scroller),contactData,channel,source) }, ...hodHistory].slice(0,10) });
      } catch (_) { console.warn("HOD Briefing: não foi possível salvar o diagnóstico local."); }
      setStatus(button, "Briefing pronto ✓", "ghl-copy-ok");
      return { ok: true };
    } catch (error) {
      console.warn("HOD Briefing:", error);
      globalThis.HOD_V2_UI.setState("error", "Não foi possível gerar", error.message || "Tente novamente.", { theme: currentSettings.uiTheme, motion: currentSettings.motionStyle });
      try {
        const { hodMetrics=[] }=await extensionStorage.local.get("hodMetrics");
        await extensionStorage.local.set({hodMetrics:[{date:new Date().toISOString(),status:"error",captureMs:captureInfo.durationMs || 0,messages:captureInfo.total || 0,topStable:Boolean(captureInfo.topStable)},...hodMetrics].slice(0,30)});
      } catch (_) {}
      setStatus(button, error.message || "Não foi possível copiar", "ghl-copy-error");
      return { ok: false, error: error.message || "Não foi possível gerar" };
    } finally { button.disabled = false; }
  }

  function install() {
    if (document.getElementById(BUTTON_ID) || !document.body) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID; button.type = "button"; button.textContent = "Briefing";
    button.title = "Clique para copiar ou arraste para mover";
    makeDraggable(button);
    button.addEventListener("click", () => run(button));
    document.body.appendChild(button);
    restoreButtonPosition(button);
    applyButtonStyle(button);
    refreshButtonVisibility();
  }

  extensionStorage.sync.get(DEFAULT_SETTINGS).then(settings => {
    currentSettings = { ...DEFAULT_SETTINGS, ...settings };
    if (currentSettings.buttonLabel === "Gerar briefing") {
      currentSettings.buttonLabel = "Briefing";
      extensionStorage.sync.set({ buttonLabel: "Briefing" });
    }
    install(); refreshButtonVisibility();
  });
  let refreshTimer;
  let observedRoute = location.pathname + location.search;
  let lastHiddenCheck = 0;
  new MutationObserver(() => {
    // O GHL altera continuamente a árvore de mensagens; varrer o histórico em
    // toda mutação travava o arraste. Reavaliar só em mudança de rota, remoção
    // do botão ou enquanto uma conversa ainda não foi encontrada.
    const route = location.pathname + location.search;
    const changedRoute = route !== observedRoute;
    if (changedRoute) observedRoute = route;
    const button = document.getElementById(BUTTON_ID);
    if (!changedRoute && button && button.style.display !== "none") return;
    if (!changedRoute && button && Date.now() - lastHiddenCheck < 1400) return;
    lastHiddenCheck = Date.now();
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      install(); refreshButtonVisibility();
    }, changedRoute ? 150 : 450);
  }).observe(document.documentElement, { childList: true, subtree: true });
  extensionStorage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULT_SETTINGS) currentSettings[key] = change.newValue ?? DEFAULT_SETTINGS[key];
    }
    const modal=document.getElementById("hod-briefing-modal");
    if(modal) {
      modal.dataset.theme=currentSettings.uiTheme;modal.dataset.layout=currentSettings.resultLayout;modal.dataset.density=currentSettings.density;
      if(/^#[0-9a-f]{6}$/i.test(currentSettings.accentColor))modal.style.setProperty("--hod-accent",currentSettings.accentColor);
    }
    const v2Panel = document.getElementById("hod-v2-panel");
    if (v2Panel) { v2Panel.dataset.theme = currentSettings.uiTheme; v2Panel.dataset.motion = currentSettings.motionStyle; }
    const button = document.getElementById(BUTTON_ID);
    if (button) applyButtonStyle(button);
    if (changes[POSITION_KEY] && !changes[POSITION_KEY].newValue && button) {
      button.style.left = button.style.top = "auto"; button.style.right = button.style.bottom = "24px";
    }
    refreshButtonVisibility();
  });
  extensionRuntime?.onMessage?.addListener((message, _sender, respond) => {
    if (message?.type === "hod-test-capture") {
      (async () => {
        const scroller=findScroller();
        if (!scroller) throw new Error("Abra uma conversa no CRM.");
        const conversation=await collect(scroller);
        const stats=conversationStats(conversation);
        return { ok:true, conversation, capture:{...captureInfo, diagnostic:stats.leadMessages && stats.agentMessages ? "Dois lados encontrados; topo estável." : "Falta um dos lados. Captura não está pronta para IA."} };
      })().then(respond).catch(error=>respond({ok:false,error:error.message}));
      return true;
    }
    if (message?.type === "hod-status") {
      const scroller = findScroller();
      if (v2Current?.path !== location.pathname) { v2Current = null; globalThis.HOD_V2_UI.close(); }
      respond({ active: true, conversation: Boolean(scroller), contact: contactName(scroller), captured: Boolean(v2Capture?.path === location.pathname), result: v2Current ? { name: v2Current.name, channel: v2Current.channel, chips: v2Current.chips, text: v2Current.text, html: v2Current.html } : null });
    }
    if (message?.type === "hod-copy") { const button = document.getElementById(BUTTON_ID); run(button).then(respond).catch(error => respond({ ok: false, error: error.message })); return true; }
    if (message?.type === "hod-v2-capture") {
      (async () => {
        const scroller = findScroller();
        if (!scroller) throw new Error("Abra uma conversa no CRM.");
        globalThis.HOD_V2_UI.setState("capturing", "Lendo a conversa", "Capturando mensagens do lead e do SDR.", { theme: currentSettings.uiTheme, motion: currentSettings.motionStyle });
        const text = await collect(scroller);
        const stats = conversationStats(text);
        if (!stats.leadMessages || !stats.agentMessages) throw new Error("Captura incompleta: não encontrei os dois lados da conversa.");
        const detectedChannel = conversationChannel();
        const contactData = await readBestContactData(detectedChannel);
        v2Capture = { path: location.pathname, text, contactData, stats };
        v2Current = null;
        globalThis.HOD_V2_UI.setState("ready", "Conversa capturada", `${stats.total} mensagens identificadas. Agora você pode gerar o briefing.`, { theme: currentSettings.uiTheme, motion: currentSettings.motionStyle });
        return { ok: true, messages: stats.total };
      })().then(respond).catch(error => { globalThis.HOD_V2_UI.setState("error", "Falha na captura", error.message, { theme: currentSettings.uiTheme, motion: currentSettings.motionStyle }); respond({ ok: false, error: error.message }); });
      return true;
    }
    if (message?.type === "hod-v2-copy-result") {
      (async () => {
        if (!v2Current || v2Current.path !== location.pathname) throw new Error("Gere um briefing para esta conversa primeiro.");
        const editor = document.querySelector(".hod-v2-editor");
        const box = document.createElement("div");
        box.innerHTML = v2Current.html;
        const output = v2Export(editor || box);
        if (message.format === "ghl") {
          const copyNode = editor?.hidden ? editor.cloneNode(true) : editor || box;
          if (copyNode !== editor) { copyNode.hidden = false; copyNode.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none"; document.body.append(copyNode); }
          try { await copyRichBriefing(copyNode, output.plain, output.html); }
          finally { if (copyNode !== editor) copyNode.remove(); }
        } else await copyText(message.format === "whatsapp" ? output.plain.replace(/\n\n/g, "\n") : output.plain);
        return { ok: true };
      })().then(respond).catch(error => respond({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "hod-v2-copy-conversation") {
      (async () => { if (!v2Current || v2Current.path !== location.pathname) throw new Error("Gere um briefing para esta conversa primeiro."); await copyText(v2Current.conversation); return { ok: true }; })().then(respond).catch(error => respond({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "hod-v2-clear") { v2Current = null; globalThis.HOD_V2_UI.close(); respond({ ok: true }); }
    if (message?.type === "hod-v2-open") { if (v2Current) { const saved = v2Current; showV2Result(saved.text, saved.conversation, {}, { channel: saved.channel, name: saved.name, chips: saved.chips, existingHtml: saved.html }); respond({ ok: true }); } else respond({ ok: false }); }
  });
})();
