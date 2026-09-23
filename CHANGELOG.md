# Changelog

## 2.2.0 · Contrato de briefing oficial

- HOD Briefing passa a ser o nome oficial da extensão; a implementação anterior foi aposentada e a pasta atual se torna a única instalação oficial.
- `briefing.md` foi reescrito como contrato editorial: tags classificam, resumo conta a história e tópicos adicionam fatos sem repetir a narrativa.
- Tags do cabeçalho agora são copiadas na mesma linha, com HTML semântico compatível com o GHL.
- WhatsApp gera `Lead do WhatsApp`, Score válido e perfil comprovado; seus campos reais aparecem no bloco **Perfil do Lead**. Instagram mantém apenas tags de origem e perfil confirmado, sem Score nem formulário.
- O antigo nome **Perfil do GHL** foi removido da geração, visualização, testes e documentação.
- Arquivos visuais sem uso da implementação anterior foram removidos; o preview local cobre somente o popup oficial.

## 2.1.0 · Neutral Modern

- Frontend integralmente refeito a partir de `HOD-Briefing-V2---Neutral-Modern.zip`: botão flutuante, painel e todos os quatro popups usam agora a mesma linguagem visual neutra, compacta e operacional.
- Motor funcional preservado: captura do GoHighLevel, geração pela Groq, briefing editável, cópia rica, conversa, histórico e formatos de exportação continuam no mesmo fluxo.
- Os 10 canvases foram ligados a estados reais. A quantidade de tópicos `2/3/4` deixou de ser apenas visual e passa a configurar `topicCount` no gerador.
- Aparência agora segue o canvas dedicado: tema claro/escuro/sistema, prévia ao vivo, tamanho do botão e indicador de status configurável.
- Arraste continua limitado a uma atualização por quadro e respeita movimento reduzido.
- Verificação local: sintaxe dos scripts, regressão, provedor e central aprovados; os quatro popups foram inspecionados no navegador local em 380 × 600 px. A recarga da extensão e o fluxo real no Chrome/GHL ainda precisam ser confirmados após esta troca visual.

## 2.0.1 · refinamento em validação

- Novo ZIP do Stitch conferido: `apple_design.md` idêntico ao guia já salvo. Hierarquia visual do painel e popup alinhada aos canvases, com resumo, tópicos rotulados, status e rodapé de cópia. Botão flutuante grafite, histórico refinado e subtela própria de aparência com prévia.
- `Perfil do GHL` restrito ao WhatsApp. Instagram não recebe score nem campos do formulário na apresentação; cabeçalhos como `Origem` deixam de ser lidos como capacidade de investimento.
- Arraste do botão e painel limitado a uma atualização por quadro; observação do CRM deixa de revarrer a conversa em toda mutação visual.
- Edição isolada do resumo visual; cópia rica preservada inclusive com editor recolhido.
- Testes locais: regressão, provedor e central aprovados. O usuário confirmou que a V2 anterior funcionava no Chrome; esta revisão visual e de performance ainda requer recarga e nova validação no Chrome.

## 2.0.0 · em validação

- V2 criada em pasta independente, sem alteração da V1.
- Motor V1 de captura, IA, formatação e cópia reutilizado.
- Popup e painel flutuante novos, guiados pelos canvases do Stitch e pelo Apple Design MD.
- Captura e geração separáveis no popup; botão flutuante mantém geração em uma etapa.
- Testes locais da V1 reutilizados e aprovados; manifesto e vínculos do popup conferidos estaticamente.
- Validação real no Chrome ainda pendente. A tentativa de abrir a interface por arquivo local foi bloqueada pela política do controlador do navegador; não foi contornada. Captura real, geração com chave própria da V2, edição no painel e cópia no GHL não devem ser declaradas comprovadas antes do teste manual assistido.
