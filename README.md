# HOD Briefing

Extensão Chrome privada oficial da Home Office Digital. Ela é independente do HOD Hub e transforma conversas do GoHighLevel em contexto prático para a consultoria.

## Arquitetura

- `content.js`: captura do GHL, limpeza da conversa, composição do briefing e cópia rica.
- `background.js`, `briefing.md`, `settings.js`: geração pela Groq, contrato editorial e configurações.
- `v2-ui.js`, `v2-content.css`: botão e painel Neutral Modern, com estados vazio, captura, geração, sucesso e erro.
- `briefing-view.js`: apresentação visual compartilhada pelo painel e popup, sem alterar o HTML copiado para o GHL.
- `popup.html`, `popup.css`, `popup.js`: popup Neutral Modern de 380 px com Briefing, Histórico, Configurações e Aparência.
- `docs/apple-design.md`: cópia íntegra do design MD enviado. O mesmo MD está no ZIP Stitch.
- `docs/canvas-map.md`: mapeamento dos 10 canvases do ZIP Neutral Modern para as superfícies funcionais.
- `docs/briefing-engine.md`: contrato canônico de tags, canais, Perfil do Lead e validação.

O Briefing não usa o backend nem o banco do HOD Hub. A extensão captura no CRM e o processo de fundo chama a Groq. A chave fica no armazenamento local do Chrome, isolada por extensão.

## Instalação

Em `chrome://extensions`, use **Carregar sem compactação** e selecione esta pasta. No popup, salve a chave da Groq e teste a conexão. Mantenha apenas uma instalação do HOD Briefing ativa.

## Verificações

```text
node tests/regression.js
node tests/provider.test.js
node tests/central.test.js
```

Esses testes não substituem a validação no Chrome com captura, geração, edição e cópia para o GHL. O resultado dessa validação deve ser registrado no changelog, incluindo limites e bloqueios.
