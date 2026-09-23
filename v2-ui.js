(() => {
  "use strict";

  let panel, body, status, editor, current, drag, dragPosition;
  let dragFrame = 0;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, className, action) => {
    const node = el("button", className, label);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };

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
      if (dragPosition) {
        panel.style.left = `${dragPosition.left}px`;
        panel.style.top = `${dragPosition.top}px`;
        dragPosition = null;
      }
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
    panel.setAttribute("role", "dialog");
    const head = el("header", "hod-v2-panel-head");
    const brand = el("div", "hod-v2-brand");
    brand.append(el("span", "hod-v2-mark", "H"), el("strong", "", "HOD Briefing"));
    status = el("span", "hod-v2-status", "Pronto");
    const close = button("✕", "hod-v2-close", () => panel.remove());
    close.setAttribute("aria-label", "Fechar painel");
    head.append(brand, status, close);
    body = el("div", "hod-v2-panel-body");
    panel.append(head, body, el("div", "hod-v2-panel-footer"));
    document.body.append(panel);
    makeDraggable();
  }

  function progress(phase) {
    const wrap = el("div", "hod-v2-progress");
    const track = el("div", "hod-v2-progress-track");
    track.append(el("span", "hod-v2-progress-fill"));
    wrap.append(track, el("span", "hod-v2-progress-meta", phase === "capturing" ? "Lendo o histórico da conversa" : "Organizando as informações essenciais"));
    return wrap;
  }

  function setState(phase, title, detail, preferences = {}) {
    ensure();
    panel.dataset.theme = preferences.theme || panel.dataset.theme || "system";
    panel.dataset.motion = preferences.motion || panel.dataset.motion || "smooth";
    panel.dataset.phase = phase;
    status.textContent = phase === "error" ? "Erro" : phase === "ready" ? "Pronto" : phase === "capturing" ? "Capturando" : "Gerando";
    body.replaceChildren();
    const footer = panel.querySelector(".hod-v2-panel-footer");
    footer.replaceChildren();
    footer.hidden = true;
    const state = el("div", "hod-v2-state");
    const symbol = el("div", "hod-v2-state-symbol", phase === "error" ? "!" : phase === "ready" ? "H" : "");
    if (phase === "capturing" || phase === "generating") symbol.classList.add("is-loading");
    state.append(symbol, el("h2", "", title), el("p", "hod-v2-state-detail", detail));
    if (phase === "capturing" || phase === "generating") state.append(progress(phase));
    if (phase === "error") {
      state.append(button("Tentar novamente", "hod-v2-state-action", () => document.getElementById("hod-v2-briefing-button")?.click()));
    } else if (phase === "ready" && document.getElementById("hod-v2-briefing-button")) {
      state.append(button("Gerar briefing", "hod-v2-state-action", () => document.getElementById("hod-v2-briefing-button")?.click()));
    }
    body.append(state);
  }

  function openResult({ text, html, conversation, name, channel, chips = [], theme = "system", motion = "smooth", format = "ghl", onCopy, onCopyConversation, onRegenerate, onClear, onChange }) {
    ensure();
    panel.dataset.phase = "ready";
    panel.dataset.theme = theme;
    panel.dataset.motion = motion;
    status.textContent = "Pronto";
    current = { text, conversation, name, channel };
    body.replaceChildren();

    const identity = el("div", "hod-v2-identity");
    const lead = el("div", "hod-v2-lead");
    lead.append(el("h2", "hod-v2-lead-name", name || "Lead"));
    const meta = el("div", "hod-v2-lead-meta");
    const label = channel === "whatsapp" ? "WhatsApp" : channel === "instagram" ? "Instagram" : "CRM";
    meta.append(el("span", "hod-v2-chip hod-v2-chip-live", `● ${label}`));
    for (const chip of chips.filter(value => value && !new RegExp(label, "i").test(value)).slice(0, 2)) {
      meta.append(el("span", "hod-v2-chip", chip));
    }
    lead.append(meta);
    const more = button("⋯", "hod-v2-more", () => {
      const menu = panel.querySelector(".hod-v2-menu");
      menu.hidden = !menu.hidden;
    });
    more.setAttribute("aria-label", "Mais opções");
    const menu = el("div", "hod-v2-menu");
    menu.hidden = true;
    menu.append(
      button("Gerar novamente", "hod-v2-menu-item", onRegenerate),
      button("Limpar resultado", "hod-v2-menu-item is-danger", () => {
        onClear();
        setState("ready", "Pronto para começar", "Abra uma conversa no CRM e gere um briefing.");
      })
    );
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

    const edit = button("Editar", "hod-v2-edit", () => {
      const editing = editor.hidden;
      editor.hidden = !editing;
      visual.hidden = editing;
      edit.textContent = editing ? "Concluir edição" : "Editar";
      if (editing) editor.focus();
      else {
        const revised = globalThis.HOD_BRIEFING_VIEW.render(document, editor.innerText, name, chips);
        visual.replaceWith(revised);
        visual = revised;
      }
    });
    const secondary = el("div", "hod-v2-secondary-actions");
    secondary.append(edit, button("Gerar novamente", "hod-v2-regenerate", onRegenerate));
    body.append(secondary);

    const footer = panel.querySelector(".hod-v2-panel-footer");
    footer.hidden = false;
    const actions = el("div", "hod-v2-actions");
    const copy = button("Copiar briefing", "hod-v2-primary", async () => {
      try {
        await onCopy(editor, format);
        copy.textContent = "Copiado ✓";
      } catch (error) {
        copy.textContent = error.message || "Falha ao copiar";
      }
      setTimeout(() => { copy.textContent = "Copiar briefing"; }, 2200);
    });
    actions.append(copy, button("Copiar conversa", "hod-v2-secondary", onCopyConversation));
    footer.append(actions);
    return editor;
  }

  globalThis.HOD_V2_UI = Object.freeze({ setState, openResult, close: () => panel?.remove(), getCurrent: () => current });
})();
