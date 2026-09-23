# Motor universal de briefing

Esta é a regra canônica do HOD Briefing V2 para captura, perfil e saída. O motor roda na própria extensão (`content.js` e `background.js`); não há uma API de Briefing no backend do HOD Hub. Mudanças neste contrato devem atualizar os testes e este documento juntos.

## Origem dos fatos

- Conversa: usar falas do lead como evidência. Fala do SDR não é fato do lead.
- CRM: campos confirmados do contato podem complementar o WhatsApp. Valor vazio, placeholder, cabeçalho de seção ou valor igual ao nome do campo deve ser descartado.
- Nunca inferir idade, renda, score, estrutura, investimento ou disponibilidade a partir do tom da conversa.

## Regra por canal

| Canal | Identificação | Perfil do GHL | Score e campos do formulário |
| --- | --- | --- | --- |
| WhatsApp | `Lead do WhatsApp` | Mostrar apenas linhas com valores válidos | Mostrar se existirem e forem válidos |
| Instagram | `Lead do Instagram` | Nunca mostrar | Nunca mostrar no briefing |
| Desconhecido | `Lead do CRM` | Não mostrar | Não presumir origem |

O perfil detalhado do GHL fica separado do resumo e dos tópicos, sem emojis. `Capacidade para investir: Origem` é erro de leitura do cabeçalho **Origem**, não uma resposta. O parser rejeita esse e outros cabeçalhos de seção antes de enviar dados à IA ou construir o briefing.

## Saída

Nome, canal e profissão/situação quando confirmados; resumo útil; tópicos novos com poucos emojis em linhas próprias; `Perfil do GHL` apenas no WhatsApp. HTML para o editor do GHL preserva tags semânticas (`strong`, `code`, `br`, `p`) e separa cabeçalho, resumo e listas. A camada visual da V2 usa `briefing-view.js` para apresentar o mesmo texto em cartões e tópicos, sem alterar o conteúdo copiado.

## Verificação mínima

`node tests/regression.js`, `node tests/provider.test.js` e `node tests/central.test.js`. Também validar no Chrome com um contato de WhatsApp e outro de Instagram, incluindo cópia rica no GHL. Teste local não prova captura, edição ou colagem em produção.
