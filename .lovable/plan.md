

## Plano: Botão de engrenagem para Inspetor de Funil

Adicionar um ícone de engrenagem (⚙️) na linha de ações de cada funil na listagem que abre um Dialog fullscreen com o **Inspetor de Funil** — uma visualização completa e organizada de todos os blocos do fluxo.

### Implementação

1. **Novo componente `src/components/admin/FunnelInspector.tsx`**
   - Recebe um `TypebotFlow` e renderiza todos os grupos como seções colapsáveis (`Collapsible`)
   - Cada bloco é renderizado com visual distinto por tipo:

   | Tipo | Visual |
   |---|---|
   | Text bubble | HTML renderizado em balão |
   | Image | Thumbnail clicável |
   | Audio | `<audio>` player inline |
   | Video | `<video>` player inline |
   | Wait | Badge com ícone de relógio + duração |
   | Choice/Buttons | Lista de botões com labels |
   | Inputs (text, email, phone...) | Tipo + placeholder |
   | Set Variable | Nome da variável + expressão |
   | Condition | Comparações formatadas |
   | OpenAI | Card roxo com modelo, system prompt, user prompt, tools, responseMapping |
   | Webhook | URL + método + body + responseMapping |
   | Redirect | URL de destino |
   | Script | Bloco `<code>` |
   | Jump | Referência ao grupo destino |

   - No topo: card de resumo com nome, total de grupos/blocos/variáveis, e lista de variáveis definidas
   - Cores por categoria: verde (bubbles), azul (inputs), laranja (lógica), roxo (IA)

2. **Atualizar `src/lib/funnel-storage.ts`**
   - Adicionar `getFunnelById(id)` para carregar o flow completo sob demanda

3. **Atualizar `src/pages/Admin.tsx`**
   - Adicionar botão de engrenagem (`Settings` icon) na barra de ações de cada funil (ao lado de Eye, ExternalLink, Trash)
   - Ao clicar, busca o flow completo via `getFunnelById` e abre Dialog fullscreen com `FunnelInspector`
   - Estado: `inspectFunnel: StoredFunnel | null`

