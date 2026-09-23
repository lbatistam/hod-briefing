"use strict";

const $ = id => document.getElementById(id);
const defaults = {
  reasoning: "medium", uiTheme: "system", exportFormat: "ghl", historyEnabled: false,
  enabled: true, displayMode: "conversation", buttonSize: "normal", iconOnly: false,
  buttonLabel: "Briefing", motionStyle: "smooth"
};
let activeTab;
let contactReady = false;
let lastResult = null;

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("visible"), 2600);
}

function setSegment(id, value) {
  $(id).querySelectorAll("button").forEach(button => {
    const active = button.dataset.value === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(node => node.classList.toggle("active", node.id === page));
  document.querySelectorAll(".bottom-nav button").forEach(node => {
    const active = node.dataset.page === (page === "appearance" ? "settings" : page);
    node.classList.toggle("active", active);
    node.setAttribute("aria-current", active ? "page" : "false");
  });
  if (page === "history") renderHistory();
  document.querySelector(".brand strong").textContent = page === "history" ? "Histórico de Briefings" : page === "settings" ? "Configurações essenciais" : page === "appearance" ? "Aparência e Botão" : "HOD Briefing";
  $("connection").hidden = page !== "briefing";
}

async function tabMessage(message) {
  if (!activeTab?.id) throw new Error("Abra uma conversa no GoHighLevel.");
  return chrome.tabs.sendMessage(activeTab.id, message);
}

function renderBriefing(result) {
  lastResult = result || null;
  $("empty").hidden = Boolean(result);
  $("result").hidden = !result;
  $("result-actions").hidden = !result;
  $("generate").textContent = result ? "Gerar novamente" : "Gerar briefing";
  if (!result) return;
  $("lead-name").textContent = result.name || "Lead";
  $("lead-channel").textContent = result.channel === "whatsapp" ? "Lead do WhatsApp" : result.channel === "instagram" ? "Lead do Instagram" : "Lead do CRM";
  $("lead-chips").querySelectorAll(".small-chip:not(#lead-channel)").forEach(node => node.remove());
  for (const chip of result.chips || []) { const node = document.createElement("span"); node.className = "small-chip"; node.textContent = chip; $("lead-chips").append(node); }
  $("avatar").textContent = (result.name || "L").split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase();
  const preview = $("briefing-preview");
  preview.replaceChildren(globalThis.HOD_BRIEFING_VIEW.render(document, result.text || "", result.name || "", result.chips || []));
}

async function refreshStatus() {
  try {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const state = await tabMessage({ type: "hod-status" });
    contactReady = Boolean(state?.conversation);
    $("connection").textContent = contactReady ? "GHL conectado" : "Sem conversa";
    $("connection").className = `badge ${contactReady ? "ready" : "neutral"}`;
    $("crm-status").textContent = contactReady ? "Conectado" : "Sem conversa";
    $("crm-status").className = `setting-state ${contactReady ? "ready" : ""}`;
    $("operation").textContent = contactReady ? `${state.captured ? "Conversa capturada" : "Conversa aberta"} · ${state.contact || "Lead"}` : "Abra uma conversa no CRM";
    $("generate").disabled = !contactReady;
    $("capture").disabled = !contactReady;
    $("capture").textContent = state.captured ? "Atualizar captura" : "Capturar conversa";
    renderBriefing(state.result);
  } catch (_) {
    contactReady = false;
    $("connection").textContent = "Abra o CRM";
    $("crm-status").textContent = "Indisponível";
    $("generate").disabled = true;
    $("capture").disabled = true;
    $("operation").textContent = "Abra o GoHighLevel para usar a extensão";
  }
}

async function refreshProvider() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "groq-key-status" });
    $("groq-status").textContent = state.configured ? "Chave configurada" : "Sem chave";
    $("groq-status").className = `setting-state ${state.configured ? "ready" : ""}`;
  } catch (_) {
    $("groq-status").textContent = "Indisponível";
    $("groq-status").className = "setting-state error";
  }
}

async function renderHistory() {
  const { hodHistory = [] } = await chrome.storage.local.get("hodHistory");
  const query = $("history-search").value.trim().toLocaleLowerCase("pt-BR");
  const entries = hodHistory.filter(item => String(item.text || "").toLocaleLowerCase("pt-BR").includes(query));
  $("history-count").textContent = `${hodHistory.length} salvo${hodHistory.length === 1 ? "" : "s"}`;
  const list = $("history-list");
  list.replaceChildren();
  if (!entries.length) { const p = document.createElement("p"); p.className = "footnote"; p.textContent = hodHistory.length ? "Nenhum resultado." : "Nenhum briefing salvo ainda."; list.append(p); return; }
  for (const item of entries) {
    const card = document.createElement("article"); card.className = "history-card";
    const name = String(item.text || "").match(/^\*\*([^*]+)\*\*/)?.[1] || "Lead";
    const title = document.createElement("strong"); title.textContent = name;
    const meta = document.createElement("span"); meta.className = "history-meta"; meta.textContent = new Date(item.date).toLocaleString("pt-BR");
    const parsed = globalThis.HOD_BRIEFING_VIEW.parse(item.text || "", name);
    const preview = document.createElement("p"); preview.textContent = parsed.summary || String(item.text || "").replace(/\*\*|`/g, "");
    const copy = document.createElement("button"); copy.textContent = "Copiar";
    copy.onclick = async () => { await navigator.clipboard.writeText(item.text || ""); toast("Briefing copiado"); };
    card.append(title, meta, preview, copy); list.append(card);
  }
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(defaults);
  if (data.buttonLabel === "Gerar briefing") { data.buttonLabel = "Briefing"; await chrome.storage.sync.set({ buttonLabel: "Briefing" }); }
  document.documentElement.dataset.theme = data.uiTheme;
  setSegment("theme", data.uiTheme);
  setSegment("reasoning", data.reasoning);
  $("export-format").value = data.exportFormat;
  $("history-enabled").checked = data.historyEnabled;
  $("enabled").checked = data.enabled;
  $("display-mode").value = data.displayMode;
  $("button-size").value = data.buttonSize;
  $("icon-only").checked = data.iconOnly;
  $("button-label").value = data.buttonLabel;
  $("reduce-motion").checked = data.motionStyle === "reduced";
  updateButtonPreview();
}

function updateButtonPreview() {
  const pill = $("button-preview-pill");
  pill.dataset.size = $("button-size").value;
  pill.dataset.iconOnly = String($("icon-only").checked);
  pill.dataset.enabled = String($("enabled").checked);
  $("button-preview-label").textContent = $("button-label").value.trim() || "Briefing";
}

document.querySelectorAll(".bottom-nav button").forEach(button => button.onclick = () => showPage(button.dataset.page));
$("open-appearance").onclick = () => showPage("appearance");
$("back-settings").onclick = () => showPage("settings");
for (const id of ["theme", "reasoning"]) {
  $(id).querySelectorAll("button").forEach(button => button.onclick = async () => {
    setSegment(id, button.dataset.value);
    const key = id === "theme" ? "uiTheme" : "reasoning";
    const values = id === "reasoning" ? { reasoning: button.dataset.value, aiPreset: button.dataset.value === "low" ? "fast" : button.dataset.value === "high" ? "thorough" : "balanced" } : { uiTheme: button.dataset.value };
    await chrome.storage.sync.set(values);
    if (id === "theme") document.documentElement.dataset.theme = button.dataset.value;
  });
}
const settings = [["export-format","exportFormat"],["history-enabled","historyEnabled"],["enabled","enabled"],["display-mode","displayMode"],["button-size","buttonSize"],["icon-only","iconOnly"],["button-label","buttonLabel"]];
for (const [id,key] of settings) {
  $(id).addEventListener(id === "button-label" ? "input" : "change", async event => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    await chrome.storage.sync.set({ [key]: value });
    if (["enabled", "button-size", "icon-only", "button-label"].includes(id)) updateButtonPreview();
  });
}
$("reduce-motion").onchange = async event => chrome.storage.sync.set({ motionStyle: event.target.checked ? "reduced" : "smooth" });
$("reset-position").onclick = async () => { await chrome.storage.sync.remove("hod-v2-briefing-button-position"); toast("Posição restaurada"); };
$("history-search").oninput = renderHistory;
$("capture").onclick = async () => {
  if (!contactReady) return toast("Abra uma conversa no CRM");
  $("capture").disabled = true;
  $("operation").classList.remove("error");
  $("operation").textContent = "Capturando conversa…";
  try {
    const result = await tabMessage({ type: "hod-v2-capture" });
    if (!result?.ok) throw new Error(result?.error || "Falha na captura");
    $("operation").textContent = `${result.messages} mensagens capturadas`;
    $("capture").textContent = "Atualizar captura";
    toast("Conversa capturada");
  } catch (error) { $("operation").textContent = error.message; $("operation").classList.add("error"); }
  finally { $("capture").disabled = false; }
};
$("save-key").onclick = async () => {
  const key = $("groq-key").value.trim();
  if (!key) return toast("Digite a chave da Groq");
  const result = await chrome.runtime.sendMessage({ type: "groq-save-key", key });
  $("groq-key").value = "";
  if (!result?.ok) return toast(result?.error || "Falha ao salvar");
  toast("Chave salva"); refreshProvider();
};
$("test-key").onclick = async () => {
  $("test-key").disabled = true;
  $("test-key").textContent = "Testando…";
  try { const result = await chrome.runtime.sendMessage({ type: "ai-test-model" }); toast(result?.ok ? "Conexão funcionando" : (result?.error || "Falha na conexão")); }
  catch (error) { toast(error.message); }
  finally { $("test-key").disabled = false; $("test-key").textContent = "Testar conexão"; }
};
$("generate").onclick = async () => {
  if (!contactReady) return toast("Abra uma conversa no CRM");
  $("generate").disabled = true;
  $("operation").classList.remove("error");
  $("operation").textContent = "Capturando conversa e gerando briefing…";
  try {
    const result = await tabMessage({ type: "hod-copy" });
    if (!result?.ok) throw new Error(result?.error || "Falha na geração");
    await refreshStatus();
    toast("Briefing pronto");
  } catch (error) { $("operation").textContent = error.message; $("operation").classList.add("error"); }
  finally { $("generate").disabled = false; }
};
$("copy-briefing").onclick = async () => {
  const { exportFormat = "ghl" } = await chrome.storage.sync.get("exportFormat");
  const result = await tabMessage({ type: "hod-v2-copy-result", format: exportFormat });
  toast(result?.ok ? "Briefing copiado" : (result?.error || "Falha ao copiar"));
};
$("copy-conversation").onclick = async () => { const result = await tabMessage({ type: "hod-v2-copy-conversation" }); toast(result?.ok ? "Conversa copiada" : result?.error || "Falha ao copiar"); };
$("clear-result").onclick = async () => { await tabMessage({ type: "hod-v2-clear" }); renderBriefing(null); toast("Resultado limpo"); };
$("open-panel").onclick = async () => { const result = await tabMessage({ type: "hod-v2-open" }); toast(result?.ok ? "Painel aberto no CRM" : "Sem briefing gerado"); };

Promise.all([loadSettings(), refreshStatus(), refreshProvider()]).catch(error => toast(error.message));
