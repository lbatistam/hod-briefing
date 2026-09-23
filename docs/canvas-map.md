# Mapa dos canvases do Stitch

Fonte: `stitch_hod_briefing_apple_design_md (1).zip`. O `apple_design.md` do ZIP é idêntico ao arquivo enviado separadamente, SHA-256 `83fbc614443a9b3d7569e9956a43e7b8740f9d0f939f58b8154f7a7cec3002b2`.

| Canvas | Superfície V2 |
| --- | --- |
| 1 · Botão flutuante | Botão no CRM, preservando arraste e configuração da V1 |
| 2 · Painel vazio | Estado inicial do painel no CRM |
| 3 · Capturando | Estado durante leitura do histórico |
| 4 · Gerando | Estado durante chamada à IA |
| 5 · Briefing pronto | Resultado em hierarquia Stitch; edição em modo separado, cópia rica preservada |
| 6 · Erro | Falha de captura, configuração ou geração no painel |
| 7 · Popup Briefing | Área principal com lead, briefing e ações |
| 8 · Popup Histórico | Histórico opcional, busca e cópia |
| 9 · Popup Configurações | Conexão GHL/Groq, chave e qualidade |
| 10 · Aparência e botão | Subtela própria de Configurações, com prévia do botão |
| Protótipo interativo | Navegação em três áreas com seletor segmentado |

O HTML exportado pelo Stitch é referência visual, não motor funcional. A V2 usa CSS local, sem Tailwind ou CDN. Dados fictícios do protótipo não entram nas regras ou no CRM.

## Fidelity checklist

- Canvases 1–6: botão flutuante grafite com grip e estado verde, cabeçalho arrastável, status compacto, resumo em superfície suave, tópicos com rótulo, ações no rodapé.
- Canvases 7–10: popup de 400px, resumo/tópicos com a mesma gramática, navegação segmentada inferior, histórico e configurações em superfícies compactas.
- Cores e movimento: azul apenas na ação primária, verde para sucesso, laranja para processamento, vermelho para erro e respeito à preferência de movimento reduzido.
- Fidelidade de produção ainda exige comparação visual no Chrome após recarregar a V2; os `screen.png` do ZIP são a referência de QA, não telas do aplicativo.

## Decisões de produto

- A V1 permanece intacta e instalada até aprovação de migração.
- Mesmo modelo e prompt da V1: GPT-OSS 120B pela Groq, raciocínio baixo/médio/alto.
- Fatos do lead vêm do lead ou dos campos reais do CRM; falas do SDR não viram fatos.
- HTML para GHL, texto e WhatsApp preservados no motor. O popup prioriza duas ações: copiar briefing e copiar conversa.
- Histórico continua desligado por padrão e, quando ligado, fica local no navegador.
- O popup não inventa CRM conectado: verifica a conversa ativa antes de habilitar geração.
