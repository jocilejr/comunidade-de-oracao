

## Typebot Runtime Nativo — Plano de Implementação

### Visão Geral
Uma aplicação que lê JSONs exportados do Typebot e renderiza os funis conversacionais nativamente, com performance instantânea, design customizado e suporte a múltiplos funis com URLs únicas.

---

### 1. Painel Admin (`/admin`)
- Página sem autenticação para gerenciar funis
- Upload de arquivos JSON exportados do Typebot
- Lista de funis cadastrados com nome, URL slug e data de upload
- Ações: editar slug, excluir funil, pré-visualizar
- JSONs armazenados em **localStorage** (simples, sem backend)

### 2. Motor de Renderização do Funil (`/f/:slug`)
Cada funil acessível por URL única. O engine interpreta o JSON do Typebot e renderiza os blocos:

- **Mensagens de texto do bot** — Bubbles com animação suave de "slide up + fade" (150ms)
- **Botões / Múltipla escolha** — Grid de botões touch-friendly, full-width no mobile
- **Inputs** (texto, email, telefone, número, URL, data) — Validação nativa por tipo
- **Imagens e vídeos** — Renderização inline nas mensagens do bot
- **Typing indicator** — Simulação de "digitando..." antes das mensagens do bot
- **Lógica condicional** — Avaliação de condições para ramificações (comparações de variáveis)
- **Variáveis** — Sistema de variáveis com substituição dinâmica em textos (`{{nome}}`)
- **Webhooks** — Chamadas HTTP diretas (client-side) com os dados coletados
- **Redirect** — Redirecionamento para URLs externas
- **Set variable** — Blocos que definem variáveis programaticamente

### 3. Design Conversacional
- Layout centralizado (max-width 600px), experiência tipo chat mobile
- **Barra de progresso** fina no topo (verde #10B981) indicando avanço no funil
- Bubbles do bot: fundo branco com borda sutil cinza
- Bubbles do usuário: fundo indigo (#4F46E5)
- Tipografia: **Montserrat** para headers, **Inter** para corpo
- Fundo ultra-light (#F9FAFB), sem sombras pesadas nem gradientes
- Input fixo na parte inferior da tela
- Zero loading spinners — tudo instantâneo

### 4. Estrutura de Rotas
- `/` — Landing page com link para o admin
- `/admin` — Painel de gerenciamento de funis
- `/f/:slug` — Funil ativo renderizado

### 5. Funcionalidades Extras
- Responsivo (mobile-first)
- Suporte a embeds (iframe-friendly)
- Tratamento de erro para JSONs malformados
- Fallback para blocos não suportados (mensagem amigável)

