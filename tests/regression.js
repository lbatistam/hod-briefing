const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function backgroundFunctions() {
  const chrome = {
    runtime: { onMessage: { addListener() {} }, onInstalled: { addListener() {} }, getURL() { return ""; } },
    storage: { local: { clear() { return Promise.resolve(); } } }
  };
  const context = { chrome, fetch: async () => {}, AbortController, setTimeout, clearTimeout, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("settings.js", "utf8"), context);
  context.importScripts = () => {};
  vm.runInContext(`${fs.readFileSync("background.js", "utf8")}\nglobalThis.hodBackgroundTest = { parseModelBriefing, redactSensitiveData, limitSource, modelOutputQuality, schema };`, context);
  return context.hodBackgroundTest;
}

function contentFunctions() {
  const source = fs.readFileSync("content.js", "utf8");
  const marker = source.indexOf("  function enableModalWindow");
  assert(marker > 0, "Não foi possível isolar as funções puras do content script");
  const testable = `${source.slice(0, marker)}\n  globalThis.hodContentTest = { aiInput, enrichConversationBriefing, formatAiBriefing, isMeetingAvailabilityText, briefingClipboardFormats, directionFor, validFieldValue };\n})();`;
  const context = { console, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("settings.js", "utf8"), context);
  vm.runInContext(testable, context);
  return context.hodContentTest;
}

const background = backgroundFunctions();
const { parseModelBriefing, redactSensitiveData, limitSource } = background;
const redacted = redactSensitiveData("Contato ana@gmail.com, +55 (35) 99999-8888 e https://exemplo.com");
assert(!/gmail|99999|https/i.test(redacted), "Dados pessoais e links devem ser removidos antes da nuvem");
assert.strictEqual(limitSource("texto curto").truncated, false);
const fullJson = JSON.stringify({
  nome: "Ana Lice",
  topicos: [
    { tipo: "trabalho", texto: "Possui experiência em RH", evidencia: "trabalho na área de recursos humanos" },
    { tipo: "transicao", texto: "Está fora da área há dois anos", evidencia: "Ja tem dois anos" },
    { tipo: "contexto", texto: "Tópico que será cortado", evidencia: "trecho incompleto" }
  ]
});
const truncated = fullJson.slice(0, fullJson.lastIndexOf("trecho incompleto") + 5);
const recovered = parseModelBriefing(truncated);
assert.strictEqual(recovered.recovered, true);
assert.strictEqual(recovered.data.nome, "Ana Lice");
assert.strictEqual(recovered.data.topicos.length, 2, "Deve recuperar os tópicos completos de um JSON cortado");

const content = contentFunctions();
const viewContext = {};
vm.createContext(viewContext);
vm.runInContext(fs.readFileSync("briefing-view.js", "utf8"), viewContext);
const viewData = viewContext.HOD_BRIEFING_VIEW.parse("**Nair**\n\n`Lead do WhatsApp` `Score 31` `Autônoma`\n\nBusca renda extra\n\n🎯 Quer trabalhar de casa\n💬 Tem dúvida sobre custos\n\n**Perfil do Lead**\n\n• 41 anos · São Paulo");
assert.strictEqual(viewData.summary, "Busca renda extra");
assert.strictEqual(viewData.topics.length, 2);
assert.strictEqual(viewData.profile.length, 1);
const editedView = viewContext.HOD_BRIEFING_VIEW.parse("Nair\nLead do WhatsApp\nAutônoma\nBusca renda extra\n🎯 Quer trabalhar de casa", "Nair", ["Autônoma"]);
assert.strictEqual(editedView.summary, "Busca renda extra", "Depois da edição, nome e perfil não podem virar resumo visual");
assert.strictEqual(content.validFieldValue("Origem", "Capacidade para investir"), "", "Cabeçalho do CRM não pode ser tratado como capacidade financeira");
const whatsappProfileFixture = content.formatAiBriefing({ nome: "Nair", resumo: "Busca renda extra", topicos: [] }, "Nair", { "Capacidade para investir": "Origem", Idade: "41", Estado: "São Paulo" }, "whatsapp", "");
assert(!/Capacidade para investir: Origem/i.test(whatsappProfileFixture));
assert(/\*\*Perfil do Lead\*\*/.test(whatsappProfileFixture), "Perfil do Lead válido só aparece no WhatsApp");
const instagramProfileFixture = content.formatAiBriefing({ nome: "Nair", resumo: "Busca renda extra", topicos: [] }, "Nair", { Idade: "41", Score: "31", Estado: "São Paulo", "Capacidade para investir": "R$ 500" }, "instagram", "");
assert(!/Perfil do Lead|Score 31|41 anos|Capacidade para investir/i.test(instagramProfileFixture), "Campos do formulário não pertencem ao briefing do Instagram");
const whatsappTagsFixture = content.formatAiBriefing({ nome: "Nair", perfil: { ocupacao: "Freelancer", situacao: "", evidencia: "sou freelancer" }, resumo: "Busca renda extra", topicos: [] }, "Nair", { Score: "31", Situação: "Autônoma" }, "whatsapp", "RESPOSTA DO LEAD: sou freelancer");
assert(/`Lead do WhatsApp` `Score 31` `Freelancer` `Autônoma`/.test(whatsappTagsFixture), "WhatsApp deve gerar tags de canal, Score e perfil na mesma linha");
const richTags = content.briefingClipboardFormats("**Nair**\n\n`Lead do WhatsApp` `Score 31` `Autônoma`\n\nBusca renda extra");
assert(/<code>Lead do WhatsApp<\/code><\/strong>&nbsp;<strong><code>Score 31<\/code>/.test(richTags.html), "Tags precisam sair lado a lado no HTML para GHL");
const inboundBubble = { className: "relative user-message chat-bubble-inbound", parentElement: null, getAttribute() { return ""; } };
const inboundText = { className: "chat-message", parentElement: inboundBubble, getAttribute() { return ""; }, getBoundingClientRect() { return { left: 100, width: 200 }; } };
const fakeScroller = { getBoundingClientRect() { return { left: 0, width: 1000 }; } };
assert.strictEqual(content.directionFor(inboundText, fakeScroller), "incoming", "Classe genérica não pode sobrescrever chat-bubble-inbound");
const stableOutbound = {
  className: "message-item", parentElement: null,
  getAttribute() { return ""; },
  querySelector(selector) { return selector === ".chat-bubble-outbound" ? {} : null; },
  getBoundingClientRect() { return { left: 0, width: 1000 }; }
};
const stableInbound = {
  className: "message-item", parentElement: null,
  getAttribute() { return ""; },
  querySelector(selector) { return selector === ".chat-bubble-inbound" ? {} : null; },
  getBoundingClientRect() { return { left: 0, width: 1000 }; }
};
assert.strictEqual(content.directionFor(stableOutbound, fakeScroller), "outgoing", "Contêiner estável deve ler a bolha outbound interna");
assert.strictEqual(content.directionFor(stableInbound, fakeScroller), "incoming", "Contêiner estável deve ler a bolha inbound interna");
const conversation = [
  "CONTATO: Lead",
  "LEAD:\nQuero agendar um bate papo e aproveitar uma vaga da condição especial.\nEu quero\nQuero agendar um bate papo e aproveitar uma vaga da condição especial.",
  "FELIPE:\nBom diaa Ana, joia?\nMe conta, qual área vc atua e o que você tá buscando pra entrar no home office?",
  "LEAD:\nBom dia, no momento estou desempregada, porém trabalho na área de recursos humanos e contabilidade( departamento pessoal)\nBom dia, no momento estou desempregada, porém trabalho na área de recursos humanos e contabilidade( departamento pessoal)",
  "FELIPE:\nAhh sim Ana, e vc ja saiu faz tempo dessa area? Ou no caso da empresa que voce atuava?",
  "LEAD:\nJa tem dois anos\nJa tem dois anos\nInteressante\nInteressante",
  "FELIPE:\nConsigo reservar um horário para você amanha, qual horario vc pode?",
  "LEAD:\nAs nove horas\nPode ser"
].join("\n\n");

const source = content.aiInput(conversation, "instagram", {});
assert(!/As nove horas/i.test(source), "Horário de reunião não pode ser enviado à IA");
assert.strictEqual((source.match(/Ja tem dois anos/g) || []).length, 1, "Falas duplicadas devem ser compactadas");

const deliberatelyBadModelOutput = {
  nome: "Ana Lice",
  topicos: [
    {
      tipo: "trabalho",
      texto: "Atua na área de recursos humanos e contabilidade no departamento pessoal e também está desempregada e também saiu da área há dois anos",
      evidencia: "no momento estou desempregada, porém trabalho na área de recursos humanos e contabilidade"
    },
    { tipo: "contexto", texto: "Às nove horas", evidencia: "As nove horas" }
  ]
};
const enriched = content.enrichConversationBriefing(deliberatelyBadModelOutput, conversation);
const briefing = content.formatAiBriefing(enriched, "Ana Lice", {}, "instagram", source);

assert(/Está desempregada no momento/i.test(briefing));
assert(/experiência profissional.*recursos humanos.*contabilidade.*departamento pessoal/i.test(briefing));
assert(/Está fora da área profissional há dois anos/i.test(briefing));
assert(!/nove horas/i.test(briefing), "Horário de agendamento não pode aparecer no briefing");
assert(!/e também/i.test(briefing), "Fatos independentes não podem ser fundidos em uma frase longa");
assert.strictEqual((briefing.match(/dois anos/gi) || []).length, 1, "A saída da área não pode ser repetida");

console.log("HOD Briefing regression tests: OK");


const priConversation = [
  "CONTATO: Pri Wenzel",
  "FELIPE:\nMe conta o que você busca no home office",
  "PRI WENZEL:\nBusco uma possível renda extra ou conseguir viver só disso e ter mais liberdade e tempo pra mim, afinal posso trabalhar de qualquer lugar",
  "FELIPE:\nVocê tem computador e duas horas por dia?",
  "PRI WENZEL:\nJá atuei um tempo em home e é ótimo\nTenho noot sim e tenho disponibilidade de 2hrs",
  "FELIPE:\nQual horário pode fazer a consultoria?",
  "PRI WENZEL:\nAmanhã a partir das 16hrs"
].join("\n\n");
const priSource = content.aiInput(priConversation, "instagram", {});
assert(/renda extra/i.test(priSource) && /viver só disso/i.test(priSource), "Objetivos distintos do Instagram devem chegar à IA");
assert(/Já atuei um tempo em home/i.test(priSource), "Experiência anterior em home office deve chegar à IA");
assert(/noot|computador|notebook/i.test(priSource), "Equipamento agora é critério obrigatório do playbook");
assert(/2hrs|2 horas/i.test(priSource), "Tempo real de dedicação deve chegar à IA");
assert(!/16hrs/i.test(priSource), `Horário de reunião deve continuar removido:\n${priSource}`);
const priEnriched = content.enrichConversationBriefing({ nome: "Pri Wenzel", topicos: [] }, priConversation);
const priBriefing = content.formatAiBriefing(priEnriched, "Pri Wenzel", {}, "instagram", priSource);
assert(!/computador|notebook|2 horas por dia|Perfil:/i.test(priBriefing));

const gabrielConversation = [
  "CONTATO: Gabriel",
  "FELIPE:\nConte sua rotina e sua insatisfação",
  "GABRIEL:\nTrabalho com vendas de produto a pronta entrega no ramo alimentício\nAcordo 5 hr da manhã e trabalho até 17hr\nA insatisfação é o salário perante ao grande trabalho exaustivo",
  "FELIPE:\nQuais produtos?",
  "GABRIEL:\nHalls, Trident e chocolate",
  "FELIPE:\nQual faixa de investimento faria sentido?",
  "GABRIEL:\nUma média entre 400-800 reais, dependendo do limite"
].join("\n\n");
const gabrielSource = content.aiInput(gabrielConversation, "instagram", {});
for (const evidence of ["produto a pronta entrega", "5 hr", "17hr", "trabalho exaustivo", "Halls", "400-800"]) {
  assert(gabrielSource.includes(evidence), `A evidência \"${evidence}\" deve chegar à IA`);
}

const ingridConversation = [
  "CONTATO: Ingrid",
  "INGRID:\nTudo bem?",
  "FELIPE:\nMe conta qual área você atua e o que busca no home office",
  "INGRID:\nEu sou formada em engenharia mecânica e técnica em logística\nEstou em busca de emprego\nTanto em engenharia como logística",
  "FELIPE:\nVocê tem computador? E voce ta em busca a muito tempo?",
  "INGRID:\nTenho sim\n3 semanas",
  "FELIPE:\nFaz sentido aprofundar?",
  "INGRID:\nSim\nQuero sim"
].join("\n\n");
const ingridSource = content.aiInput(ingridConversation, "instagram", {});
assert(/engenharia mecânica/i.test(ingridSource), "Formação de Ingrid deve chegar à IA");
assert(/técnica em logística/i.test(ingridSource), "Formação técnica deve chegar à IA");
assert(/busca de emprego/i.test(ingridSource), "Busca de emprego deve chegar à IA");
assert(/sem emprego há 3 semanas/i.test(ingridSource), "Duração deve ser contextualizada");
assert(!/Possui computador ou notebook/i.test(ingridSource), "Equipamento não deve consumir o briefing");
assert(!/RESPOSTA DO LEAD[^\n]*: (?:Tudo bem\?|Tenho sim|Sim|Quero sim)$/gim.test(ingridSource), "Cumprimentos e confirmações soltas não podem virar evidência");
const ingridEnriched = content.enrichConversationBriefing({ nome: "Ingrid Araújo", topicos: [] }, ingridConversation);
const ingridBriefing = content.formatAiBriefing(ingridEnriched, "Ingrid Araújo", {}, "instagram", ingridSource);
assert(/formação em engenharia mecânica e técnica em logística/i.test(ingridBriefing));
assert(/busca de emprego/i.test(ingridBriefing));
assert(/há 3 semanas/i.test(ingridBriefing));
assert(!/computador|notebook/i.test(ingridBriefing));
assert(!/Tudo bem|Quero sim|Tenho sim/i.test(ingridBriefing));

const badQuality = background.modelOutputQuality({ topicos: [
  { tipo: "contexto", texto: "Tudo bem?", evidencia: "Tudo bem?" },
  { tipo: "contexto", texto: "3 semanas", evidencia: "3 semanas" },
  { tipo: "contexto", texto: "Quero sim", evidencia: "Quero sim" }
] }, ingridSource);
assert.strictEqual(badQuality.valid, false, "Resposta superficial deve ser marcada para recuperação determinística");

console.log("HOD Briefing V4 conversation coverage tests: OK");

const playbookInstagram = [
  "CONTATO: Marina Lopes",
  "FELIPE:\nCom o que você trabalha e o que busca no home office?",
  "MARINA LOPES:\nAtuo na área comercial e busco uma renda extra porque a rotina está muito desgastante",
  "FELIPE:\nHá quanto tempo acompanha o Felipe?",
  "MARINA LOPES:\n6 meses",
  "FELIPE:\nVocê já conhece esse mercado ou tentou alguma plataforma?",
  "MARINA LOPES:\nJá pesquisei e tentei uma plataforma, mas não consegui aprovação",
  "FELIPE:\nTem computador e consegue separar 2 horas por dia?",
  "MARINA LOPES:\nTenho sim",
  "FELIPE:\nPode amanhã às 19h para a consultoria?",
  "MARINA LOPES:\nPode ser"
].join("\n\n");
const playbookInstagramSource = content.aiInput(playbookInstagram, "instagram", {});
for (const evidence of ["área comercial", "renda extra", "desgastante", "Acompanha Felipe há 6 meses", "tentei uma plataforma"]) {
  assert(new RegExp(evidence, "i").test(playbookInstagramSource), `Instagram precisa preservar: ${evidence}`);
}
assert(!/19h|Pode ser/i.test(playbookInstagramSource), "Agenda da consultoria não pertence ao briefing");
const playbookInstagramEnriched = content.enrichConversationBriefing({ nome: "Marina Lopes", topicos: [] }, playbookInstagram);
const playbookInstagramBriefing = content.formatAiBriefing(playbookInstagramEnriched, "Marina Lopes", {}, "instagram", playbookInstagramSource);
assert(/Acompanha Felipe há 6 meses/i.test(playbookInstagramBriefing));
assert(!/computador|notebook|2 horas por dia|Perfil:/i.test(playbookInstagramBriefing));

const playbookWhatsapp = [
  "CONTATO: Carlos",
  "FELIPE:\nO que você busca hoje?",
  "CARLOS:\nQuero fazer uma transição de carreira e ter uma segunda renda",
  "FELIPE:\nVocê tem computador e 3 horas por dia para se dedicar?",
  "CARLOS:\nSim tenho",
  "FELIPE:\nQual faixa de investimento seria confortável para você?",
  "CARLOS:\nConsigo me organizar entre 300 e 500 reais por mês",
  "FELIPE:\nQual horário da reunião?",
  "CARLOS:\nAmanhã às 20h"
].join("\n\n");
const playbookWhatsappSource = content.aiInput(playbookWhatsapp, "whatsapp", {});
assert(/300 e 500 reais/i.test(playbookWhatsappSource));
assert(!/Possui computador ou notebook/i.test(playbookWhatsappSource));
assert(!/20h/i.test(playbookWhatsappSource));
const playbookWhatsappEnriched = content.enrichConversationBriefing({ nome: "Carlos", topicos: [] }, playbookWhatsapp);
const playbookWhatsappBriefing = content.formatAiBriefing(playbookWhatsappEnriched, "Carlos", {}, "whatsapp", playbookWhatsappSource);
assert(/R\$ 300 e R\$ 500/i.test(playbookWhatsappBriefing));
assert(!/computador|notebook|Perfil:/i.test(playbookWhatsappBriefing));

const blockedLead = [
  "CONTATO: Joana",
  "FELIPE:\nO que você busca?",
  "JOANA:\nQuero dinheiro imediato trabalhando de casa",
  "FELIPE:\nTem computador e tempo para se dedicar?",
  "JOANA:\nNão tenho computador e não consigo separar tempo agora"
].join("\n\n");
const blockedSource = content.aiInput(blockedLead, "instagram", {});
const blockedEnriched = content.enrichConversationBriefing({ nome: "Joana", topicos: [] }, blockedLead);
const blockedBriefing = content.formatAiBriefing(blockedEnriched, "Joana", {}, "instagram", blockedSource);
assert(!/Perfil:|computador|tempo disponível/i.test(blockedBriefing));

const partialLead = [
  "CONTATO: Pedro",
  "FELIPE:\nO que busca no home office?",
  "PEDRO:\nQuero uma renda extra para ajudar minha família",
  "FELIPE:\nVocê tem notebook?",
  "PEDRO:\nTenho sim"
].join("\n\n");
const partialSource = content.aiInput(partialLead, "instagram", {});
const partialEnriched = content.enrichConversationBriefing({ nome: "Pedro", topicos: [] }, partialLead);
const partialBriefing = content.formatAiBriefing(partialEnriched, "Pedro", {}, "instagram", partialSource);
assert(!/Perfil:|notebook/i.test(partialBriefing));

const crmSource = content.aiInput("CONTATO: Elisa\n\nFELIPE:\nQual seu objetivo?\n\nELISA:\nQuero mudar de carreira", "whatsapp", {
  Computador: "Sim", "Tempo disponível": "Menos de 2 horas", Investimento: "R$ 400 por mês", Reserva: "Não"
});
assert(/CRM \(FATO DO FORMULÁRIO\): Computador: Sim/i.test(crmSource));
assert(/CRM \(FATO DO FORMULÁRIO\): Tempo disponível: Menos de 2 horas/i.test(crmSource));
assert(/CRM \(FATO DO FORMULÁRIO\): Investimento: R\$ 400 por mês/i.test(crmSource));
const crmBriefing = content.formatAiBriefing({ nome: "Elisa", topicos: [] }, "Elisa", {
  Computador: "Sim", "Tempo disponível": "Menos de 2 horas", Investimento: "R$ 400 por mês", Reserva: "Não"
}, "whatsapp", crmSource);
assert(/Lead do WhatsApp/i.test(crmBriefing));
assert(/• Computador: Sim · Tempo: Menos de 2 horas/i.test(crmBriefing));
assert(/R\$ 400 por mês/i.test(crmBriefing));

const whatsappProfileBriefing = content.formatAiBriefing({ nome: "Nair Santana", resumo: "Atua como autônoma e busca oportunidades de trabalho remoto para complementar a renda.", topicos: [] }, "Nair Santana", {
  Score: "31", Idade: "41", Estado: "São Paulo", "Gênero": "Mulher", Computador: "Sim",
  Renda: "Até R$ 1.500", "Tempo disponível": "Menos de 2 horas", "Acompanha Felipe": "Conheci hoje",
  "Situação": "Empreendedor(a) / Autônomo(a)", "Formação": "Ensino superior completo ou pós-graduação",
  "Experiência": "É a primeira vez que estou conhecendo esse tipo de trabalho", "Situação financeira": "---", "Capacidade para investir": "---"
}, "whatsapp", "");
for (const expected of ["Lead do WhatsApp", "Score 31", "41 anos · São Paulo · Mulher", "• Computador: Sim · Tempo: Menos de 2 horas", "• Renda: Até R$ 1.500", "• Formação: Ensino superior completo ou pós-graduação"]) {
  assert(whatsappProfileBriefing.includes(expected), `Perfil do WhatsApp deve preservar: ${expected}`);
}
assert(!/---/.test(whatsappProfileBriefing), "Campos vazios do CRM não entram no briefing");
assert(/não possuir reserva financeira no formulário/i.test(crmBriefing));

console.log("HOD Briefing V4.1 playbook tests: OK");

const amandaConversation = [
  "CONTATO: Amanda",
  "FELIPE:\nMe conta, qual área vc atua e o que você está buscando para entrar no home office?",
  "AMANDA:\nAtuo no setor de suprimentos (indústria e florestal)\nEu gostaria de atuar hoje office, ampliar minhas entregas",
  "FELIPE:\nVocê já me acompanha há um tempo ou conheceu meu trabalho agora? Outro ponto, tem computador e duas horas por dia?",
  "AMANDA:\nConheci agora o seu trabalho, e fiquei interessada\nSim, tenho disponibilidade e equipamentos"
].join("\n\n");
const pedroActorConversation = [
  "CONTATO: Pedro Garcia",
  "FELIPE:\nMe conta, hoje você trabalha com o que e o que ta buscando no home office?",
  "PEDRO:\nEu sou ator! Trabalho por projeto; quando tem trabalho eu ganho bem, mas fico um tempo entre um projeto e outro. O home office viria pra garantir previsibilidade da renda com a flexibilidade que preciso",
  "FELIPE:\nE sua área está desgastante?",
  "PEDRO:\nDesgastante sim, mas ainda é minha meta principal"
].join("\n\n");
const pedroActorSource = content.aiInput(pedroActorConversation, "instagram", {});
const pedroActorBriefing = content.formatAiBriefing({ nome: "Pedro Garcia", topicos: [
  { tipo: "trabalho", texto: "É ator e trabalha por projetos", evidencia: "Eu sou ator! Trabalho por projeto" },
  { tipo: "objetivo", texto: "Busca previsibilidade de renda sem abrir mão da flexibilidade", evidencia: "garantir previsibilidade da renda com a flexibilidade" },
  { tipo: "dificuldade", texto: "Considera a área atual desgastante", evidencia: "Desgastante sim" }
] }, "Pedro Garcia", {}, "instagram", pedroActorSource);
assert(/`Lead do Instagram`/i.test(pedroActorBriefing));
assert(/`Ator`/i.test(pedroActorBriefing));
assert(/`Por projetos`/i.test(pedroActorBriefing));
assert(!/Fonte: Instagram|Tudo certo Felipe/i.test(pedroActorBriefing));
const fernandoConversation = [
  "CONTATO: Fernando Godoy",
  "FELIPE:\nBoa tarde Fernando. Hoje você trabalha com o que?",
  "FERNANDO:\nBoa tarde\nEstou desempregado\nEra gerente de loja de móveis e decoração",
  "FELIPE:\nO que busca no home office?",
  "FERNANDO:\nQuero renda e liberdade para conseguir cuidar de outras coisas"
].join("\n\n");
const fernandoSource = content.aiInput(fernandoConversation, "instagram", {});
const fernandoPolluted = content.enrichConversationBriefing({ nome: "Fernando Godoy", resumo: "Fernando está desempregado e já trabalhou como gerente de uma loja de móveis e decoração. Agora procura uma renda com mais liberdade para organizar a vida.", topicos: [
  { tipo: "trabalho", texto: "Possui experiência profissional em Boa tarde", evidencia: "Boa tarde" },
  { tipo: "trabalho", texto: "Era gerente de loja de móveis e decoração", evidencia: "Era gerente de loja de móveis e decoração" },
  { tipo: "transicao", texto: "Desempregado", evidencia: "Estou desempregado" },
  { tipo: "relacionamento", texto: "Conheceu o contato hoje", evidencia: "hoje" },
  { tipo: "objetivo", texto: "Busca renda e liberdade para outras coisas", evidencia: "Quero renda e liberdade" },
  { tipo: "positivo", texto: "Disposto a participar", evidencia: "sim" }
] }, fernandoConversation);
const fernandoBriefing = content.formatAiBriefing(fernandoPolluted, "Fernando Godoy", {}, "instagram", fernandoSource);
assert(/`Lead do Instagram`/i.test(fernandoBriefing));
assert(/`Gerente de loja de móveis e decoração`/i.test(fernandoBriefing));
assert(/`Desempregado\(a\)`/i.test(fernandoBriefing));
assert(!/Boa tarde|Conheceu o contato hoje|Disposto a participar/i.test(fernandoBriefing));
assert((fernandoBriefing.match(/^(?:💼|🔄|🧭|🎯|💰|🎓|🧠|👨‍👩‍👧|📍|❤️|👤|🌐|💳|🔥)/gmu) || []).length <= 3);
const amandaSource = content.aiInput(amandaConversation, "instagram", {});
const amandaEnriched = content.enrichConversationBriefing({ nome: "Amanda Arndt", topicos: [] }, amandaConversation);
const amandaBriefing = content.formatAiBriefing(amandaEnriched, "Amanda Arndt", {}, "instagram", amandaSource);
assert(/profissionalmente.*suprimentos/i.test(amandaBriefing));
assert(/home office e ampliar suas entregas/i.test(amandaBriefing));
assert(/Conheceu o trabalho do Felipe recentemente/i.test(amandaBriefing));
assert(!/📌|Perfil:|equipamento|disponibilidade|Sim, tenho|fiquei interessada/i.test(amandaBriefing));

const felipeConversation = [
  "CONTATO: Felipe Vilote",
  "FELIPE:\nMe conta, qual área vc atua e o que você está buscando para entrar no home office?",
  "LEAD:\nÁrea Administrativa/ financeira",
  "FELIPE:\nE está sendo CLT em horário comercial? Tem computador e duas horas por dia?",
  "LEAD:\nSim. Horário comercial\nLouco para ter a tão sonhada liberdade geográfica",
  "FELIPE:\nQuer saber mais sobre o curso?",
  "LEAD:\nQuero saber mais detalhes sobre o curso\nClaro meu amigo"
].join("\n\n");
const felipeSource = content.aiInput(felipeConversation, "instagram", {});
const felipeEnriched = content.enrichConversationBriefing({ nome: "Felipe Vilote", topicos: [] }, felipeConversation);
const felipeBriefing = content.formatAiBriefing(felipeEnriched, "Felipe Vilote", {}, "instagram", felipeSource);
assert(/profissionalmente.*administrativa e financeira/i.test(felipeBriefing));
assert(/CLT em horário comercial/i.test(felipeBriefing));
assert(/liberdade/i.test(felipeBriefing));
assert(!/📌|Perfil:|computador|2 horas|curso|Claro meu amigo/i.test(felipeBriefing));

const clipboard = content.briefingClipboardFormats(amandaBriefing);
assert(/<strong>Amanda Arndt<\/strong>/i.test(clipboard.html));
assert(/<strong><code>Lead do Instagram<\/code><\/strong>/i.test(clipboard.html));
assert(!/<span\b|\sstyle=/i.test(clipboard.html), "O GHL remove estilos inline; o marcador precisa ser HTML semântico");
const contentSource = fs.readFileSync("content.js", "utf8");
assert(/copyRichBriefing\(editor, finalText, richHtml\)/.test(contentSource), "O botão deve copiar o DOM rico visível");
assert(!/const formats = briefingClipboardFormats\(finalText\)/.test(contentSource), "O botão não pode destruir o HTML reconstruindo innerText");
assert(/event\.clipboardData\.setData\("text\/html", html\)/.test(contentSource), "O clique precisa escrever HTML real no evento de cópia");
assert(/document\.addEventListener\("copy", writeRichClipboard, true\)/.test(contentSource), "A cópia rica deve interceptar listeners do CRM");
assert(!/\*\*|`/.test(clipboard.html));
const verticalProfile = content.formatAiBriefing({ nome: "Ayonnara Suyane", resumo: "Busca uma nova oportunidade", topicos: [{ tipo: "trabalho", texto: "Trabalha como auxiliar de atendimento", evidencia: "auxiliar de atendimento" }] }, "Ayonnara Suyane", {}, "instagram", "RESPOSTA DO LEAD (EVIDÊNCIA LITERAL): Trabalho como auxiliar de atendimento");
assert(/`Lead do Instagram` `Auxiliar de atendimento`/i.test(verticalProfile), "Tags devem ficar juntas na mesma linha");
const verticalClipboard = content.briefingClipboardFormats(verticalProfile);
assert(/<code>Lead do Instagram<\/code><\/strong>&nbsp;<strong><code>Auxiliar de atendimento<\/code>/i.test(verticalClipboard.html), "Tags devem compartilhar um parágrafo e ficar lado a lado");
const compactEmojiClipboard = content.briefingClipboardFormats("💼 Freelancer, busca algo mais fixo\n🧠 Começou a acompanhar o mercado a partir de um anúncio");
assert(/Freelancer, busca algo mais fixo<br>🧠 Começou/i.test(compactEmojiClipboard.html), "Emojis consecutivos precisam virar linhas reais no HTML do GHL");
const mirianConversation = [
  "CONTATO: Mirian Santos",
  "FELIPE:\nMe conta um pouco sobre você e o que busca hoje",
  "MIRIAN SANTOS:\nSou aposentada, trabalhei na Fiat e agora busco aumentar minha renda. Acabei de conhecer o Felipe"
].join("\n\n");
const mirianBriefing = content.formatAiBriefing(
  content.enrichConversationBriefing({ nome: "Mirian Santos", topicos: [] }, mirianConversation),
  "Mirian Santos", {}, "instagram", content.aiInput(mirianConversation, "instagram", {})
);
assert(/`Lead do Instagram` `Aposentada`/i.test(mirianBriefing), "Instagram deve mostrar canal e situação confirmada");
assert(/Trabalhou na Fiat antes de se aposentar/i.test(mirianBriefing));
assert(/Busca aumentar a renda/i.test(mirianBriefing));
assert(/Conheceu o Felipe recentemente/i.test(mirianBriefing));

console.log("HOD Briefing V4.1.1 relevance and clipboard tests: OK");

const tathianaConversation = [
  "CONTATO: Tathiana Salles de Vilhena",
  "FELIPE:\nHoje você trabalha com o que e o que está buscando no home office?",
  "TATHIANA SALLES DE VILHENA:\nHoje sou professora, dou aulas para o SEBRAE principalmente nos presídios da minha região, moro no perímetro de Tremembé",
  "FELIPE:\nHoje busca uma segunda renda ou pensa em migrar de vez?",
  "TATHIANA SALLES DE VILHENA:\nEu gosto do que faço\nNão me sinto segura de permanecer nos presídios\nSegunda renda até atingir pelo menos 5 K mensalmente constante",
  "FELIPE:\nMe conta mais sobre sua experiência",
  "TATHIANA SALLES DE VILHENA:\nEu sou uma expert em ensinar pessoas, hoje atendo um portfólio de 27 cursos",
  "FELIPE:\nComo funcionam seus finais de semana?",
  "TATHIANA SALLES DE VILHENA:\nEu não costumo trabalhar aos finais de semana, geralmente tiro esse tempo para descansar e viajar"
].join("\n\n");
const tathianaSource = content.aiInput(tathianaConversation, "instagram", {});
for (const evidence of ["professora", "SEBRAE", "presídios", "Tremembé", "gosto do que faço", "não me sinto segura", "5 K", "27 cursos", "descansar e viajar"]) {
  assert(new RegExp(evidence, "i").test(tathianaSource), `Tathiana precisa preservar: ${evidence}`);
}
assert.strictEqual((tathianaSource.match(/27 cursos/gi) || []).length, 1, "Fatos repetidos não podem consumir tokens duas vezes");
const tathianaBriefing = content.formatAiBriefing({ nome: "Tathiana Salles de Vilhena", topicos: [
  { tipo: "trabalho", texto: "Atua como professora para o SEBRAE nos presídios de sua região, considera-se especialista em ensinar pessoas e atende um portfólio de 27 cursos", evidencia: "Hoje sou professora, dou aulas para o SEBRAE principalmente nos presídios da minha região" },
  { tipo: "objetivo", texto: "Busca uma segunda renda mensal constante de pelo menos R$ 5 mil", evidencia: "Segunda renda até atingir pelo menos 5 K mensalmente constante" },
  { tipo: "dificuldade", texto: "Não se sente segura em permanecer trabalhando nos presídios", evidencia: "Não me sinto segura de permanecer nos presídios" },
  { tipo: "localidade", texto: "Mora no perímetro de Tremembé", evidencia: "moro no perímetro de Tremembé" }
] }, "Tathiana Salles de Vilhena", {}, "instagram", tathianaSource);
assert(/\ud83d\udcbc Atua como professora/i.test(tathianaBriefing), "Profissão deve manter emoji de trabalho");
assert(/\ud83d\udccd Mora no perímetro de Tremembé/i.test(tathianaBriefing), "Localidade deve manter emoji de localização");
assert(!/Hoje sou professora/i.test(tathianaBriefing), "Fallback literal não pode repetir a profissão em primeira pessoa");
assert.strictEqual((tathianaBriefing.match(/SEBRAE/gi) || []).length, 1, "Contexto profissional não pode ser repetido");

const richAntonio = content.formatAiBriefing({ nome: "Antonio Lucca", perfil: { ocupacao: "Call Center e Serviços Digitais", situacao: "", evidencia: "trabalho em call center, mas sou freelance de serviços digitais" }, resumo: "Trabalha em call center e também faz serviços digitais como freelancer. Está no mercado digital desde 2007 e ainda busca uma oportunidade mais estável para trabalhar de qualquer lugar.", topicos: [
  { tipo: "mercado", texto: "Teve seu primeiro e-commerce em 2007 e já tentou Google AdSense, afiliados e dropshipping", evidencia: "em 2007 tive meu primeiro e-commerce, depois tentei Google AdSense, afiliado, dropshipping" },
  { tipo: "dificuldade", texto: "Tentou conseguir projetos pela Upwork, mas ainda não teve resultado", evidencia: "Eu tento fazer um freelance na Upwork, mas não consegui até o momento" },
  { tipo: "objetivo", texto: "Busca qualidade de vida e liberdade financeira, de tempo e geográfica", evidencia: "qualidade de vida, as liberdades financeira, de tempo e geografica" },
  { tipo: "estrutura", texto: "Possui notebook i3 para trabalhar", evidencia: "Tenho um notebook i3" }
] }, "Antonio Lucca", {}, "instagram", "RESPOSTA DO LEAD (EVIDÊNCIA LITERAL): em 2007 tive meu primeiro e-commerce, depois tentei Google AdSense, afiliado, dropshipping\nRESPOSTA DO LEAD (EVIDÊNCIA LITERAL): Eu tento fazer um freelance na Upwork, mas não consegui até o momento\nRESPOSTA DO LEAD (EVIDÊNCIA LITERAL): qualidade de vida, as liberdades financeira, de tempo e geografica\nRESPOSTA DO LEAD (EVIDÊNCIA LITERAL): Tenho um notebook i3");
assert(richAntonio.includes("notebook i3"), "Equipamento especificado deve ser preservado");
assert(richAntonio.includes("Upwork"), "Tentativa anterior com dificuldade deve ser preservada");
assert(richAntonio.includes("e-commerce em 2007"), "Trajetória digital concreta deve ser preservada");
console.log("HOD Briefing V6.1.0 compact briefing tests: OK");
