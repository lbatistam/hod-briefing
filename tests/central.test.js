const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const context = { console, setTimeout, clearTimeout, AbortController, performance, importScripts() {},
  chrome: { runtime: {onMessage:{addListener(){}},onInstalled:{addListener(){}}}, storage:{} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync("settings.js","utf8"),context);
vm.runInContext(fs.readFileSync("background.js","utf8") + "\nglobalThis.testApi={groqPayload, normalizeBriefingData};",context);
const {groqPayload,normalizeBriefingData}=context.testApi;
for(const [id,m] of Object.entries(context.HOD_CONFIG.models)) {
  const payload=groqPayload("JSON","data",4096,{...context.HOD_CONFIG.defaults,aiModel:id});
  assert.equal(payload.model,m.apiModel);
  assert.equal("reasoning_effort" in payload,m.reasoning);
  assert.equal(payload.response_format.type,m.strict ? "json_schema" : "json_object");
}
assert.equal(normalizeBriefingData({nome:"Ana",resumo:"Teste",perfil:{ocupacao:"Administração",situacao:"Desempregada",evidencia:"Formada em Administração"},topicos:[]}).perfil.ocupacao,"Administração");
const source=fs.readFileSync("content.js","utf8");
const pure=source.slice(0,source.indexOf("  function enableModalWindow"));
vm.runInContext(pure+"\nglobalThis.presentation={formatAiBriefing,briefingClipboardFormats,enrichConversationBriefing};})();",context);
const c=context.presentation;
const evidence="RESPOSTA DO LEAD (EVIDÊNCIA LITERAL): Tô bem e vc\nRESPOSTA DO LEAD (EVIDÊNCIA LITERAL): Sou formada em Administração, estou desempregada.\nRESPOSTA DO LEAD (EVIDÊNCIA LITERAL): Quero ficar perto da família.";
const data={nome:"Ana Paula",resumo:"Busca recolocação para ficar mais perto da família.",perfil:{ocupacao:"Administração",situacao:"Desempregada",evidencia:"Sou formada em Administração, estou desempregada."},topicos:[{tipo:"objetivo",texto:"Quer trabalhar perto da família",evidencia:"Quero ficar perto da família."}]};
const text=c.formatAiBriefing(data,"Ana Paula",{},"instagram",evidence);
const out=c.briefingClipboardFormats(text);
assert(!text.includes("Tô bem"));
assert(out.html.includes("<code>Administração</code></strong>&nbsp;<strong><code>Desempregada</code>"));
assert(out.html.includes("</code></strong></p><p><br></p><p>"));
assert(out.plain.includes("Administração Desempregada"));
assert(!source.includes("const briefingData = enrichConversationBriefing(result.data"));
assert.equal(context.HOD_CONFIG.defaults.historyEnabled,false);
const titled=c.formatAiBriefing({...data,perfil:{ocupacao:"Social Media",situacao:"CLT",evidencia:"Sou social media CLT"}}, "Renan", {}, "instagram", "RESPOSTA DO LEAD: Sou social media CLT");
assert(titled.includes("Social Media"));
assert(titled.includes("CLT"));
const titledConnectors=c.formatAiBriefing({...data,perfil:{ocupacao:"Auxiliar de Atendimento",situacao:"",evidencia:"Sou auxiliar de atendimento"}}, "Renan", {}, "instagram", "RESPOSTA DO LEAD: Sou auxiliar de atendimento");
assert(titledConnectors.includes("Auxiliar de Atendimento"));
for (const sentence of ["trabalho com internet na parte de games", "presta consultoria para empresas", "atua com imóveis", "trabalha com sistemas da IBM"]) {
  const result=c.formatAiBriefing({...data,perfil:{ocupacao:sentence,situacao:"",evidencia:sentence}}, "Daniel", {}, "instagram", "RESPOSTA DO LEAD: " + sentence);
  assert(result.includes(sentence.charAt(0).toUpperCase()+sentence.slice(1)), "Preserva frase natural, sem Title Case");
}
console.log("Central V6.2: capabilities, semantic profile, inline-tag export, no deterministic reinjection: OK");
