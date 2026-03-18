## Problema: Botão "Salvar perfil" não responde ao clique

### Diagnóstico

O dialog de perfil (`DialogContent`) não possui controle de overflow. Quando o conteúdo interno é maior que a viewport (avatar + galeria + 4 campos de input + botão), o botão "Salvar perfil" fica fora da área visível do dialog. Os cliques do usuário estão atingindo o overlay do dialog (por trás do botão) em vez do próprio botão.

A session replay confirma: o usuário clicou rapidamente diversas vezes sem nenhuma resposta — comportamento típico de clique em overlay.

### Solução

Adicionar `max-height` e `overflow-y-auto` ao conteúdo interno do dialog de perfil, garantindo que o botão fique sempre acessível via scroll.

### Mudanças

`**src/pages/Admin.tsx**` — No dialog de perfil (linhas ~945):

- Envolver o conteúdo do dialog com `max-h-[70vh] overflow-y-auto` para que todo o conteúdo seja scrollável quando maior que a tela.
- Mover o botão "Salvar perfil" para fora da área scrollável (fixo no rodapé do dialog), garantindo que esteja sempre visível e clicável.