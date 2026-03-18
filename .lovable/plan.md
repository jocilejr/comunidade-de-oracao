## Diagnostico

Testei todas as edge functions e elas **funcionam corretamente**:

- `share` function: retorna HTML com OG tags corretos (titulo, descricao, imagem) quando detecta crawler (WhatsApp, Facebook etc.)
- `preview-image` function: retorna a imagem JPEG binaria corretamente (status 200)

**O problema real**: voce esta compartilhando o link direto `/f/o-chamado-ao-milagre-de-moises` no WhatsApp. Como o app e uma SPA estatica, o WhatsApp le o `index.html` padrao que tem titulo "Comunidade" e a imagem generica do Lovable — nao os dados do funil.

O link que funciona com preview e o gerado pelo botao de copiar (📋) no admin, que aponta para a edge function `share`. Este sim serve os OG tags corretos para crawlers.  
  
Remover o botão de redirecionar a página e manter apenas o botão de copiar URL

## Plano

Tornar o link de compartilhamento mais obvio e acessivel no admin:

### 1. Botao "Copiar link" mais visivel

- Arquivo: `src/pages/Admin.tsx`
- Mudar o botao de Copy de `variant="ghost"` para `variant="outline"` com texto "Compartilhar" ao lado do icone
- Mover para posicao mais destacada na lista de acoes do funil

### 2. Feedback mais claro ao copiar

- Mostrar toast com o link copiado e instrucao: "Cole este link no WhatsApp para compartilhar com preview de imagem"

### 3. Adicionar secao de compartilhamento no dialog de perfil do funil

- No dialog de perfil (CircleUser), adicionar campo de texto readonly com o link de compartilhamento e botao de copiar
- Instrucao visual: "Use este link para compartilhar no WhatsApp/redes sociais"

Nenhuma mudanca de banco, edge functions ou migracao SQL necessaria.