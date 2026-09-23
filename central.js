/* Settings UI uses the existing persistence/event layer in popup.js. */
const centralLink = document.createElement("link");
centralLink.rel = "stylesheet"; centralLink.href = "central.css"; document.head.append(centralLink);
document.body.classList.add("hod-central");
const selectField = (id, title, choices, hint = "") => '<label class="field"><span><b>' + title + '</b><small>' + hint + '</small></span><select id="' + id + '">' + choices.map(([v,l]) => '<option value="' + v + '">' + l + '</option>').join("") + '</select></label>';
const choiceField = (id, title, choices, hint = "") => '<div class="choice-field"><span><b>' + title + '</b><small>' + hint + '</small></span><div class="choice-grid" data-choice-for="' + id + '">' + choices.map(([v,l]) => '<button type="button" class="choice-button" data-value="' + v + '"><em>' + l + '</em></button>').join("") + '</div><select id="' + id + '" class="choice-native" tabindex="-1" aria-hidden="true">' + choices.map(([v,l]) => '<option value="' + v + '">' + l + '</option>').join("") + '</select></div>';
const card = html => '<div class="card settings-card">' + html + '</div>';
document.querySelector("#intelligence .provider-card").insertAdjacentHTML("beforebegin", card(
  choiceField("aiPreset", "Perfil de geração", [["fast","Rápido"],["balanced","Equilibrado"],["thorough","Mais apurado"]], "Escolha com um clique") +
  choiceField("aiModel", "Modelo Groq", Object.entries(HOD_CONFIG.models).map(([id,m]) => [id,m.label])) +
  choiceField("reasoning", "Raciocínio", [["low","Baixo"],["medium","Médio"],["high","Alto"]], "Desativado em modelos sem suporte") +
  choiceField("timeoutSeconds", "Espera por tentativa", [[20,"20 segundos"],[35,"35 segundos"],[60,"60 segundos"],[90,"90 segundos"]]) +
  choiceField("retries", "Novas tentativas", [[0,"Nenhuma"],[1,"Uma"],[2,"Duas"]], "Só para falhas temporárias") +
  choiceField("topicCount", "Máximo de fatos", [[2,"2 fatos"],[3,"3 fatos"],[4,"4 fatos"]], "Nunca completa com informação inútil")
));
document.querySelector("#intelligence .provider-card").insertAdjacentHTML("afterend", '<pre id="aiTestOutput" class="central-output" aria-live="polite">O teste usa um ator fictício e consome uma chamada à API. Mostra o JSON real e a latência.</pre>');
document.querySelector("#appearance .heading").insertAdjacentHTML("afterend", card(
  choiceField("uiTheme", "Tema", [["system","Sistema"],["light","Claro"],["dark","Black"],["night","Noturno azul"]]) +
  '<label class="field"><span><b>Cor principal</b></span><input id="accentColor" type="color" value="#206bc4"></label>' +
  choiceField("density", "Escala", [["compact","Compacta"],["comfortable","Confortável"],["spacious","Espaçosa"]]) +
  choiceField("motionStyle", "Animações", [["smooth","Suave"],["quick","Rápida"],["elastic","Elástica"],["none","Desligada"]], "Movimento da interface e do briefing") +
  choiceField("resultLayout", "Resultado", [["modal","Modal amplo"],["side","Painel lateral"]])
));
document.querySelector("#export .heading").insertAdjacentHTML("afterend", card(
  choiceField("captureSpeed", "Velocidade", [["safe","Segura"],["normal","Normal"],["fast","Rápida"]], "Mais velocidade exige resposta rápida do CRM") +
  choiceField("exportFormat", "Formato de cópia", [["ghl","GoHighLevel HTML"],["plain","Texto simples"],["whatsapp","WhatsApp"]])
));
if (!document.querySelector('nav [data-tab="diagnostics"]')) document.querySelector("nav").insertAdjacentHTML("beforeend", '<button data-tab="diagnostics"><span>◉</span>Testes</button>');
document.querySelector("main").insertAdjacentHTML("beforeend", '<section id="diagnostics" class="tab"><div class="page-heading"><span class="eyebrow">DIAGNÓSTICO</span><h2>Veja o que aconteceu.</h2><p>Teste a captura sem gastar IA. Os logs contêm apenas métricas, nunca a chave ou a conversa.</p></div><button id="testCapture" class="primary">Testar captura · sem IA</button><button id="exportLog" class="secondary">Exportar log técnico</button><pre id="captureOutput" class="central-output" aria-live="polite">Nenhum teste executado.</pre>' +
  card('<label class="toggle"><span><b>Histórico local</b><small>Guarda até 10 briefings neste navegador, incluindo dados pessoais. Desligar apaga o histórico.</small></span><input id="historyEnabled" type="checkbox"><i></i></label>') +
  '<button id="showHistory" class="secondary">Ver últimos briefings</button><button id="clearHistory" class="secondary">Apagar histórico local</button><pre id="historyOutput" class="central-output"></pre></section>');

function upgradeSelectToButtons(select) {
  if (!select?.id || select.classList.contains("choice-native")) return;
  const group = document.createElement("div");
  group.className = "choice-grid native-choice-grid";
  group.dataset.choiceFor = select.id;
  [...select.options].forEach(option => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.dataset.value = option.value;
    const text = document.createElement("em");
    text.textContent = option.textContent;
    button.append(text);
    group.append(button);
  });
  select.classList.add("choice-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.insertAdjacentElement("afterend", group);
  select.closest(".field")?.classList.add("button-field");
}
document.querySelectorAll("select").forEach(upgradeSelectToButtons);
function upgradeColorToButtons(input) {
  if (!input?.id || input.type !== "color") return;
  const colors = [["#206bc4","Azul"],["#5b4fd7","Roxo"],["#0d7c8c","Verde"],["#3d4757","Grafite"]];
  const group = document.createElement("div");
  group.className = "choice-grid native-choice-grid color-choice-grid";
  group.dataset.choiceFor = input.id;
  colors.forEach(([value,label]) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "choice-button color-choice"; button.dataset.value = value;
    const text = document.createElement("em"); text.textContent = label; button.append(text); group.append(button);
  });
  input.classList.add("choice-native"); input.tabIndex = -1; input.setAttribute("aria-hidden", "true");
  input.insertAdjacentElement("afterend", group);
  input.closest(".field")?.classList.add("button-field");
}
document.querySelectorAll('input[type="color"]').forEach(upgradeColorToButtons);

function applyCentralPreferences(values) {
  const resolvedTheme = values.uiTheme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : values.uiTheme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.motion = values.motionStyle || "smooth";
  document.body.dataset.theme = resolvedTheme;
  document.body.dataset.motion = values.motionStyle || "smooth";
  document.body.dataset.density = values.density;
  if (/^#[0-9a-f]{6}$/i.test(values.accentColor)) document.documentElement.style.setProperty("--blue", values.accentColor);
  document.getElementById("reasoning").disabled = !HOD_CONFIG.models[values.aiModel]?.reasoning;
  document.querySelector(".provider-head b").textContent = HOD_CONFIG.models[values.aiModel]?.label || "Groq";
  document.querySelectorAll("[data-choice-for]").forEach(group => {
    const select = document.getElementById(group.dataset.choiceFor);
    group.querySelectorAll(".choice-button").forEach(button => {
      const selected = button.dataset.value === select?.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = Boolean(select?.disabled);
    });
  });
}
document.addEventListener("click", event => {
  const button = event.target.closest(".choice-button");
  if (!button || button.disabled) return;
  const group = button.closest("[data-choice-for]");
  const control = document.getElementById(group.dataset.choiceFor);
  if (!control) return;
  control.value = button.dataset.value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
  const liveValues = Object.fromEntries([...document.querySelectorAll("select,input[id]")].map(item => [item.id, item.type === "checkbox" ? item.checked : item.value]));
  applyCentralPreferences({ ...HOD_CONFIG.defaults, ...liveValues, motionStyle: document.getElementById("motionStyle")?.value || "smooth" });
});
document.addEventListener("change", async event => {
  if (event.target.id === "aiPreset") {
    const preset = HOD_CONFIG.presets[event.target.value];
    if (preset) { await chrome.storage.sync.set(preset); for (const [id,value] of Object.entries(preset)) document.getElementById(id).value = value; }
  }
  if (event.target.id === "historyEnabled" && !event.target.checked) await chrome.storage.local.remove("hodHistory");
  // popup.js persists individual values on the same event.
  setTimeout(async () => applyCentralPreferences(await chrome.storage.sync.get(HOD_CONFIG.defaults)), 30);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => applyCentralPreferences(await chrome.storage.sync.get(HOD_CONFIG.defaults)));
document.getElementById("testCapture").onclick = async event => {
  const button = event.currentTarget; button.disabled = true;
  const output = document.getElementById("captureOutput"); output.textContent = "Percorrendo conversa… acompanhe o progresso no CRM.";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, { type: "hod-test-capture" });
    output.textContent = result.ok ? JSON.stringify(result.capture, null, 2) + "\n\n" + result.conversation : result.error;
  } catch (error) { output.textContent = "Abra uma conversa no CRM e recarregue a página se necessário."; }
  finally { button.disabled = false; }
};
document.getElementById("exportLog").onclick = async () => {
  const { hodMetrics = [] } = await chrome.storage.local.get("hodMetrics");
  const url = URL.createObjectURL(new Blob([JSON.stringify({ productVersion: "V1.0.0", buildVersion: "7.4.0", metrics: hodMetrics }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "hod-diagnostico.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.getElementById("showHistory").onclick = async () => {
  const { hodHistory = [] } = await chrome.storage.local.get("hodHistory");
  document.getElementById("historyOutput").textContent = hodHistory.map(entry => entry.date + "\n" + entry.text).join("\n\n────────\n\n") || "Histórico vazio.";
};
document.getElementById("clearHistory").onclick = async () => {
  await chrome.storage.local.remove("hodHistory"); document.getElementById("historyOutput").textContent = "Histórico apagado.";
};
