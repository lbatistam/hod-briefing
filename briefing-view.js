(() => {
  "use strict";

  const labels = {
    "💼": "Momento profissional", "🎯": "Objetivo ou necessidade",
    "💻": "Equipamento e disponibilidade", "⏱️": "Disponibilidade",
    "🧠": "Experiência e conhecimento", "🧭": "Contexto importante",
    "💬": "Dúvida ou objeção", "❓": "Dúvida ou objeção",
    "🚀": "Melhor encaminhamento", "👤": "Contexto do lead",
    "📍": "Localidade", "👪": "Família", "👨‍👩‍👧": "Família",
    "💰": "Situação financeira", "🎓": "Formação", "🔄": "Transição",
    "❤️": "Saúde", "🌐": "Experiência de mercado", "💳": "Questão comercial",
    "🔥": "Ponto positivo", "🖥️": "Estrutura disponível"
  };

  function parse(text, name = "", chips = []) {
    const lines = String(text || "").split(/\n/).map(value => value.trim()).filter(Boolean);
    const content = lines.filter(line => !/^\*\*[^*]+\*\*$/.test(line)
      && !/^`[^`]+`$/.test(line)
      && line !== name
      && !chips.includes(line)
      && !/^(?:Lead do (?:Instagram|WhatsApp|CRM)|Score\s+\d+|Perfil do GHL)$/i.test(line));
    const summary = content.find(line => !/^(?:•|[\p{Extended_Pictographic}])/u.test(line)) || "";
    const topics = content.filter(line => /^(?:[\p{Extended_Pictographic}])/u.test(line)).map(line => {
      const match = line.match(/^([^\s]+)\s+(.+)$/u);
      return match ? { emoji: match[1], text: match[2], label: labels[match[1]] || "Ponto importante" } : null;
    }).filter(Boolean);
    const profile = content.filter(line => line.startsWith("• ")).map(line => line.slice(2));
    return { summary, topics, profile };
  }

  function render(doc, text, name = "", chips = []) {
    const data = parse(text, name, chips);
    const root = doc.createElement("div");
    root.className = "hod-visual-briefing";
    if (data.summary) {
      const summary = doc.createElement("p");
      summary.className = "hod-visual-summary";
      summary.textContent = data.summary;
      root.append(summary);
    }
    const list = doc.createElement("div");
    list.className = "hod-visual-topics";
    for (const topic of data.topics) {
      const row = doc.createElement("div");
      row.className = "hod-visual-topic";
      const icon = doc.createElement("span");
      icon.className = "hod-visual-emoji";
      icon.textContent = topic.emoji;
      const copy = doc.createElement("div");
      const label = doc.createElement("span");
      label.className = "hod-visual-label";
      label.textContent = topic.label;
      const value = doc.createElement("span");
      value.className = "hod-visual-value";
      value.textContent = topic.text;
      copy.append(label, value);
      row.append(icon, copy);
      list.append(row);
    }
    root.append(list);
    if (data.profile.length) {
      const title = doc.createElement("h3");
      title.className = "hod-visual-profile-title";
      title.textContent = "Perfil do GHL";
      root.append(title);
      for (const value of data.profile) {
        const row = doc.createElement("p");
        row.className = "hod-visual-profile-line";
        row.textContent = `• ${value}`;
        root.append(row);
      }
    }
    return root;
  }

  globalThis.HOD_BRIEFING_VIEW = Object.freeze({ parse, render });
})();
