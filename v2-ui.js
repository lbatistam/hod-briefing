(() => {
  "use strict";

  let panel;
  let body;
  let status;
  let editor;
  let current;
  let drag;
  let dragFrame = 0;
  let dragPosition;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function button(label, className, action) {
    const node = el("button", className, label);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  function makeDraggable() {
    const head = panel.querySelector(".hod-v2-panel-head");
    head.addEventListener("pointerdown", event => {
      if (event.button || event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      head.setPointerCapture(event.pointerId);
    });
    head.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      dragPosition = {
        left: Math.min(innerWidth - 280, Math.max(8, event.clientX - drag.dx)),
        top: Math.min(innerHeight - 70, Math.max(8, event.clientY - drag.dy))
      };
      if (!dragFrame) dragFrame = requestAnimationFrame(() => {
        dragFrame = 0;
        if (!dragPosition) return;
        panel.style.left = `${dragPosition.left}px`;
        panel.style.top = `${dragPosition.top}px`;
        dragPosition = null;
      });
    });
    const stop = () => {
      if (dragFrame) cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      if (dragPosition) { panel.style.left = `${dragPosition.left}px`; panel.style.top = `${dragPosition.top}px`; dragPosition = null; }
      drag = null;
    };
    head.addEventListener("pointerup", stop);
    head.addEventListener("pointercancel", stop);
  }

  function ensure() {
    if (panel?.isConnected) return;
    panel = el("section", "hod-v2-panel");
    panel.id = "hod-v2-panel";
    panel.dataset.theme = "system";
    panel.setAttribute("aria-label", "HOD Briefing");
    const head = el("header", "hod-v2-panel-head");
    const brand = el("div", "hod-v2-brand");
    brand.append(el("span", "hod-v2-grip", "⠿"), el("span", "hod-v2-brand-dot", ""), el("strong", "", "HOD Briefing"));
    status = el("span", "hod-v2-status", "Pronto");
    head.append(brand, status, button("×", "hod-v2-close", () => panel.remove()));
    body = el("div", "hod-v2-panel-body");
    const footer = el("div", "hod-v2-panel-footer");
    panel.append(head, body, footer);
    document.body.append(panel);
    makeDraggable();
  }

  function setState(phase, title, detail, preferences = {}) {
    ensure();
    panel.dataset.theme = preferences.theme || panel.dataset.theme || "system";
    panel.dataset.motion = preferences.motion || panel.dataset.motion || "smooth";
    panel.dataset.phase = phase;
    status.textContent = phase === "error" ? "Erro" : phase === "ready" ? "Pronto" : phase === "capturing" ? "Capturando" : "Gerando";
    body.replaceChildren();
    panel.querySelector(".hod-v2-panel-footer").replaceChildren();
    body.append(el("div", "hod-v2-state-symbol", phase === "error" ? "!" : phase === "ready" ? "✓" : "◌"));
    body.append(el("h2", "", title), el("p", "hod-v2-state-detail", detail));
    if (phase === "ready" && document.getElementById("hod-v2-briefing-button")) {
      body.append(button("Gerar briefing", "hod-v2-state-action", () => document.getElementById("hod-v2-briefing-button")?.click()));
    }
  }

  function openResult({ text, html, conversation, name, channel, chips = [], theme = "system", motion = "smooth", format = "ghl", onCopy, onCopyConversation, onRegenerate, onClear, onChange }) {
    ensure();
    panel.dataset.phase = "ready";
    panel.dataset.theme = theme;
    panel.dataset.motion = motion;
    status.textContent = "✓ Sintetizado";
    current = { text, conversation, name, channel };
    body.replaceChildren();
    const identity = el("div", "hod-v2-identity");
    const label = channel === "whatsapp" ? "Lead do WhatsApp" : channel === "instagram" ? "Lead do Instagram" : "Lead do CRM";
    const lead = el("div", "hod-v2-lead");
    const nameLine = el("div", "hod-v2-name-line");
    nameLine.append(el("h2", "", name || "Lead"), el("span", "hod-v2-channel", label));
    lead.append(nameLine);
    const area = chips.find(chip => !/^Score\s+\d+/i.test(chip));
    if (area) lead.append(el("p", "hod-v2-area", `Área: ${area}`));
    const more = button("⋮", "hod-v2-more", () => { const menu = panel.querySelector(".hod-v2-menu"); menu.hidden = !menu.hidden; });
    more.setAttribute("aria-label", "Mais opções");
    const menu = el("div", "hod-v2-menu");
    menu.hidden = true;
    menu.append(button("Gerar novamente", "hod-v2-menu-item", onRegenerate), button("Limpar resultado", "hod-v2-menu-item", () => { onClear(); setState("ready", "Pronto para começar", "Abra uma conversa no CRM e gere um briefing."); }));
    identity.append(lead, more, menu);
    body.append(identity);
    let visual = globalThis.HOD_BRIEFING_VIEW.render(document, text, name, chips);
    body.append(visual);
    editor = el("div", "hod-v2-editor");
    editor.contentEditable = "true";
    editor.spellcheck = true;
    editor.setAttribute("aria-label", "Editar briefing");
    editor.innerHTML = html;
    editor.hidden = true;
    editor.addEventListener("input", () => onChange?.(editor.innerHTML, editor.innerText));
    body.append(editor);
    const edit = button("Editar briefing", "hod-v2-edit", () => {
      const editing = editor.hidden;
      editor.hidden = !editing;
      visual.hidden = editing;
      edit.textContent = editing ? "Concluir edição" : "Editar briefing";
      if (editing) editor.focus();
      else {
        const revised = globalThis.HOD_BRIEFING_VIEW.render(document, editor.innerText, name, chips);
        visual.replaceWith(revised);
        visual = revised;
      }
    });
    body.append(edit);
    const actions = el("div", "hod-v2-actions");
    const copy = button("Copiar briefing", "hod-v2-primary", async () => {
      try { await onCopy(editor, format); copy.textContent = "Copiado ✓"; }
      catch (error) { copy.textContent = error.message || "Falha ao copiar"; }
      setTimeout(() => { copy.textContent = "Copiar briefing"; }, 2200);
    });
    actions.append(copy, button("Copiar conversa", "hod-v2-secondary", onCopyConversation));
    panel.querySelector(".hod-v2-panel-footer").append(actions);
    return editor;
  }

  globalThis.HOD_V2_UI = Object.freeze({ setState, openResult, close: () => panel?.remove(), getCurrent: () => current });
})();
