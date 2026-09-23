# Arquitetura

`content.js` executa no CRM, percorre o histórico, normaliza mensagens, extrai dados do perfil e envia o contexto ao service worker. `background.js` mantém a integração com a Groq fora do DOM, aplicando timeout, novas tentativas, contrato de saída e validação.

`v2-ui.js` e `v2-content.css` implementam o painel flutuante. `briefing-view.js` centraliza a apresentação usada pelo painel e pelo popup. Preferências, chave e histórico opcional usam `chrome.storage.local`.

## Limites

- O DOM do CRM pode mudar sem aviso.
- Histórico virtualizado exige múltiplas varreduras.
- Topo estável é observação do DOM, não garantia do servidor.
- A IA só deve afirmar fatos ligados às evidências enviadas.
- O editor de destino pode sanitizar o HTML copiado.

