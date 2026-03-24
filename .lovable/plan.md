

## Redesign da visualização de sessão — layout split-panel instantâneo

### Problemas atuais

1. Clicar numa sessão faz query ao banco e mostra skeleton — delay perceptível
2. A timeline da conversa é longa e o usuário precisa rolar até o final para ver onde a pessoa parou
3. Os dados coletados são mostrados como chips compactos difíceis de ler
4. A view substitui toda a lista, impedindo navegação rápida entre sessões

### Nova abordagem: Split Panel

Em vez de substituir a lista pela sessão, usar um layout de **duas colunas**:
- **Esquerda**: Lista de sessões (já carregada, sem re-fetch)
- **Direita**: Painel de detalhes da sessão selecionada

Isso elimina o "voltar para a lista" e permite clicar entre sessões instantaneamente.

### Mudanças em `src/components/admin/SessionLogs.tsx`

**1. Layout split-panel**
- Lista de sessões ocupa ~40% da largura, painel de detalhes ~60%
- Clicar numa sessão a destaca na lista e mostra detalhes à direita
- Sem navegação de página, sem "voltar"

**2. Painel de detalhes reorganizado em 3 abas**
- **Resumo** (default): Etapa atual, status (ativo/encerrado/concluído), horário, nome do funil — tudo visível imediatamente sem scroll
- **Dados**: Tabela limpa com chave/valor para as variáveis coletadas, em vez de chips compactos. Fácil de ler e copiar
- **Timeline**: Conversa completa, mas com scroll automático para o **final** (última mensagem) ao abrir — mostra onde a pessoa parou sem rolar manualmente

**3. Pre-fetch de eventos**
- Ao carregar as sessões, fazer prefetch dos eventos das primeiras 10 sessões em paralelo
- Armazenar em cache local (Map), então clicar em qualquer sessão já carregada mostra instantaneamente
- Sessões não-prefetchadas carregam on-click mas sem skeleton — mostam os dados da sessão (resumo/dados) imediato enquanto a timeline carrega em background

**4. Timeline com auto-scroll**
- Quando a aba Timeline é aberta, faz `scrollIntoView` do último evento
- O usuário já vê a última interação do funil sem precisar rolar

### Visual esperado

```text
┌─────────────────────┬──────────────────────────────────┐
│ Lista de sessões    │  ┌─ Resumo ─┬─ Dados ─┬─ Chat ─┐│
│                     │  │                               ││
│ [João ✓ Group#57] ◀│  │  Funil: Manuscrito do Arcanjo ││
│ [Maria × Group#44] │  │  Etapa: Group #57              ││
│ [Pedro ● Group#35] │  │  Status: Concluído ✓           ││
│ [Ana × Group#23]   │  │  Início: 23/03, 23:57          ││
│  ...                │  │                               ││
│                     │  └───────────────────────────────┘│
└─────────────────────┴──────────────────────────────────┘
```

### Arquivo modificado

1. **`src/components/admin/SessionLogs.tsx`** — Reescrever layout para split-panel com 3 abas, cache de eventos, e auto-scroll na timeline

