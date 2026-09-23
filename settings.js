/* One capability table shared by popup, content script and service worker. */
globalThis.HOD_CONFIG = Object.freeze({
  models: {
    "groq-gpt-oss-120b": { apiModel: "openai/gpt-oss-120b", label: "GPT-OSS 120B", reasoning: true, strict: true }
  },
  defaults: {
    aiModel: "groq-gpt-oss-120b", reasoning: "medium", aiPreset: "balanced",
    timeoutSeconds: 35, retries: 1, captureSpeed: "safe", topicCount: 4,
    uiTheme: "system", accentColor: "#206bc4", density: "comfortable", motionStyle: "smooth",
    resultLayout: "modal", historyEnabled: false, exportFormat: "ghl"
  },
  presets: {
    fast: { reasoning: "low", timeoutSeconds: 20, retries: 0 },
    balanced: { reasoning: "medium", timeoutSeconds: 35, retries: 1 },
    thorough: { reasoning: "high", timeoutSeconds: 60, retries: 1 }
  },
  capture: {
    safe: { step: 350, top: 900, rounds: 3 },
    normal: { step: 250, top: 650, rounds: 3 },
    fast: { step: 180, top: 450, rounds: 3 }
  }
});
