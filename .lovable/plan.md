

## Redesign dos botões de escolha — verde escuro profissional com fundo sólido

### Problema
Os botões atuais usam `bg-transparent` com apenas `border` e texto verde — visual fraco, sem destaque, sem confiança.

### Solução
Trocar para botões com **fundo sólido verde escuro** (tipo `#1B5E3A` / `#1A6B3C`), texto branco, sombra suave e hover escurecendo. Transmite profissionalismo e confiança.

### Mudanças no `src/components/chat/ChoiceButtons.tsx`

**Botões de texto (não-picture):**
- Fundo: verde escuro sólido (`#1B5E3A`)
- Texto: branco
- Hover: verde ainda mais escuro (`#154D30`)
- Sombra suave para dar profundidade
- Remover `border` e `bg-transparent`

**Botões picture:**
- Manter estrutura com imagem
- Footer com fundo verde escuro e texto branco (em vez de bubble color)
- Hover escurecendo levemente

### Visual esperado
Botões sólidos, verdes escuros, com texto branco — estilo CTA profissional que transmite confiança e autoridade.

