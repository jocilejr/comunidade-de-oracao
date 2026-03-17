

## Mudanças

### 1. Esconder a barra de input quando não houver input ativo

Em `ChatRenderer.tsx` (linhas 279-299), o bloco else que renderiza a barra "Mensagem" desabilitada será removido. A barra de input só aparecerá quando `inputBlock` estiver ativo. Quando não houver input nem choices, nada será exibido no rodapé.

### 2. Reformular os botões de escolha (ChoiceButtons)

Redesign dos botões para ficarem mais parecidos com o estilo WhatsApp — botões com fundo transparente, borda arredondada fina, texto centralizado na cor de destaque (verde WhatsApp), com espaçamento e padding melhorados. Para picture choices, manter o card com imagem mas melhorar o espaçamento.

Mudanças no `ChoiceButtons.tsx`:
- Botões de texto: fundo transparente, borda `1px solid` na cor `--wa-send`, cantos mais arredondados (`rounded-full` ou `rounded-xl`), texto centralizado, cor do texto `--wa-send`, padding maior, sem shadow
- Botões de imagem: manter layout grid mas com cantos mais arredondados e melhor espaçamento
- Adicionar `hover` visual sutil (leve opacidade)

