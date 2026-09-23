# Motor de briefing

O HOD Briefing roda na própria extensão: `content.js` captura e apresenta, `background.js` chama a Groq e `briefing.md` é o contrato editorial. Não existe API, banco ou backend compartilhado com o HOD Hub.

## Contrato de saída

O modelo devolve JSON validado por evidência. O motor transforma esse JSON no briefing copiável:

```text
Nome
tags confirmadas
resumo humanizado
tópicos complementares
Perfil do Lead (somente WhatsApp, se houver dados reais)
```

Tags são geradas em uma única linha e copiadas como HTML semântico `<strong><code>…</code></strong>`. O GHL remove estilos inline; por isso a extensão não depende de `style`, classes ou cores para manter as tags.

## Regra por canal

| Canal | Tags | Perfil do Lead | Campos do formulário |
| --- | --- | --- | --- |
| WhatsApp | Score válido e ocupação/situação comprovadas | Mostrar somente linhas com valores válidos | Permitidos, como fatos objetivos |
| Instagram | Ocupação e/ou situação comprovadas | Nunca mostrar | Nunca mostrar |
| Desconhecido | Apenas dados confirmados | Nunca presumir | Nunca presumir |

`Perfil do Lead` não é diagnóstico comercial. Idade, estado, computador, renda, tempo disponível, formação, experiência, situação financeira e capacidade de investimento são apenas fatos informativos. Score aparece na tag do WhatsApp, nunca dentro do bloco. A origem do canal nunca é uma tag do briefing.

## Repetição e emojis

- O resumo conta a história; tags classificam; tópicos acrescentam fatos novos.
- Cada tópico recebe no máximo um emoji, escolhido pelo tipo do fato.
- Não repetir profissão, objetivo ou frase do resumo nos tópicos.
- Não usar emoji no Perfil do Lead nem para preencher espaço.

## Proteções

- Falas do SDR não viram fatos do lead.
- A geração só falha se a captura não trouxer nenhuma resposta do lead ou fato do formulário. Uma pequena variação de flexão ou pontuação na citação da IA não descarta sozinha um briefing fundamentado.
- Campos vazios, `---`, cabeçalhos como `Origem` e valores inválidos são descartados.
- Agenda, links, telefone, e-mail, automações e confirmação de reunião não vão para o briefing.
- O HTML permitido é limitado a `p`, `strong`, `code` e `br` antes da cópia.

## Verificação mínima

```text
node tests/regression.js
node tests/provider.test.js
node tests/central.test.js
```

Depois da recarga no Chrome, validar uma conversa real de cada canal e a colagem no editor do GHL. Teste local não comprova captura real, geração real ou colagem.
