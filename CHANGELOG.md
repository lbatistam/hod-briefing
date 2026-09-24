# Changelog

## 2.2.5 · tags e tópicos em todos os canais

- A extração de profissão passa a funcionar igualmente em Instagram e WhatsApp, inclusive quando a IA não devolve `perfil` válido.
- O fluxo de produção volta a enriquecer o resultado com fatos determinísticos da conversa antes da apresentação, evitando resumos sem tópicos e emojis.
- Conhecimento explícito, como “começando do zero”, mantém categoria própria e não é descartado como repetição da profissão.
- Adicionada regressão completa de Rafael: `Lava-car` em HTML e pelo menos três tópicos úteis com emojis nos dois canais.

## 2.2.4 · profissão dupla em tag HTML

- Tags passam a reconhecer construções como “experiência como”, “trabalhei de” e “atuou como”.
- Maurício recebe `Despachante e empreiteiro`, convertido na cópia para HTML semântico compatível com GHL.
- Funções atuais e antigas declaradas pelo lead passam pela mesma extração de tag; “já mexi com” e “experiência de” também são reconhecidos.

## 2.2.3 · tags de profissão recuperáveis

- Corrigido o fallback de tags do Instagram: quando a evidência retornada pela IA vier vazia ou não for literal, a extensão volta a extrair uma profissão objetiva da fala real do lead.
- Cobertos representantes comerciais autônomos e consultores empresariais em home office, sem colocar a frase inteira dentro da tag.

## 2.2.2 · origem fora das tags

- O popup também deixa de exibir a origem da conversa como chip. A faixa abaixo do nome contém somente as tags úteis do briefing.

## 2.2.1 · validação e tags mais limpas

- Corrigido o bloqueio indevido “Não foi possível validar fatos relevantes na resposta”.
- A extensão continua aceitando apenas fatos do lead ou formulário, mas tolera diferenças pequenas de flexão e pontuação entre a citação da IA e a conversa capturada.
- Sem fatos capturados, a geração continua bloqueada de forma explícita.
- Removidas as tags de origem (`Lead do WhatsApp`, `Lead do Instagram` e `Lead do CRM`). O cabeçalho agora mostra apenas profissão, situação e Score válido no WhatsApp.

## 2.2.0 · Contrato de briefing oficial

- HOD Briefing passa a ser o nome oficial da extensão; a implementação anterior foi aposentada e a pasta atual se torna a única instalação oficial.
- `briefing.md` foi reescrito como contrato editorial: tags classificam, resumo conta a história e tópicos adicionam fatos sem repetir a narrativa.
- Tags do cabeçalho agora são copiadas na mesma linha, com HTML semântico compatível com o GHL.
- WhatsApp gera Score válido e perfil comprovado; seus campos reais aparecem no bloco **Perfil do Lead**. Instagram mantém apenas perfil confirmado, sem Score nem formulário.
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
