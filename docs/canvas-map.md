# Mapa dos canvases do Stitch

Fonte atual: `HOD-Briefing-V2---Neutral-Modern.zip`, SHA-256 `9dfaa7f235d7d48c58a702ebd55c1c056c9c79c0be281628d37e3412cc743660`. Os arquivos HTML do ZIP foram tratados somente como referência visual; nenhuma instrução ou dado fictício contido neles foi incorporado ao motor.

| Canvas | Superfície atual |
| --- | --- |
| 1 · Botão flutuante | Botão no CRM, com arraste e preferências persistentes |
| 2 · Painel vazio | Estado inicial do painel no CRM |
| 3 · Capturando | Estado durante leitura do histórico |
| 4 · Gerando | Estado durante chamada à IA |
| 5 · Briefing pronto | Resultado em hierarquia Stitch; edição em modo separado, cópia rica preservada |
| 6 · Erro | Falha de captura, configuração ou geração no painel |
| 7 · Popup Briefing | Área principal com lead, briefing e ações |
| 8 · Popup Histórico | Histórico opcional, busca e cópia |
| 9 · Popup Configurações | Chave Groq, estados GHL/Groq, raciocínio, tópicos, histórico e exportação |
| 10 · Aparência e botão | Tema, prévia, tamanho e indicador de status |

O HTML exportado pelo Stitch é referência visual, não motor funcional. A extensão usa CSS local, sem Tailwind ou CDN. Dados fictícios do protótipo não entram nas regras ou no CRM.

## Fidelity checklist

- Canvases 1–6: botão flutuante branco com grip e estado verde, cabeçalho arrastável, status compacto, resumo em superfície suave, tópicos com rótulo e ações no rodapé.
- Canvases 7–10: popup de 380 px, resumo/tópicos com a mesma gramática, navegação inferior fixa, histórico e configurações em superfícies compactas.
- Cores e movimento: azul apenas na ação primária, verde para sucesso, laranja para processamento, vermelho para erro e respeito à preferência de movimento reduzido.
- Fidelidade de produção ainda exige comparação visual no Chrome após recarregar a extensão; os `screen.png` do ZIP são a referência de QA, não telas do aplicativo.

## Decisões de produto

- Implementações anteriores foram aposentadas; esta é a única extensão oficial.
- Modelo atual: GPT-OSS 120B pela Groq, raciocínio baixo/médio/alto.
- Fatos do lead vêm do lead ou dos campos reais do CRM; falas do SDR não viram fatos.
- HTML para GHL, texto e WhatsApp preservados no motor. O popup prioriza duas ações: copiar briefing e copiar conversa.
- Histórico continua desligado por padrão e, quando ligado, fica local no navegador.
- O popup não inventa CRM conectado: verifica a conversa ativa antes de habilitar geração.
