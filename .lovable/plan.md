

## Plano: Ordenar grupos seguindo o fluxo real (edges)

### Problema
Os grupos são renderizados na ordem do array JSON (`flow.groups.map`), que é arbitrária. O usuário quer que sigam a sequência real do fluxo: grupo inicial → seguir edges → próximo grupo → etc.

### Solução em `src/components/admin/FunnelInspector.tsx`

Criar uma função `getOrderedGroups(flow)` que:

1. **Encontra o grupo inicial** — o primeiro grupo do array (convenção Typebot: index 0 = Start)
2. **Constrói um mapa de adjacência** a partir de `flow.edges`:
   - Cada edge tem `from.blockId` (ou `from.groupId`) e `to.groupId`
   - Para cada bloco com `outgoingEdgeId`, e para cada item com `outgoingEdgeId` (choices, conditions, AB test), mapear para o grupo destino
3. **Percorre em BFS/DFS** a partir do grupo inicial, coletando grupos na ordem em que são alcançados
4. **Anexa ao final** qualquer grupo não alcançado (grupos órfãos / desconectados), para não perder informação

Substituir `flow.groups.map(...)` por `getOrderedGroups(flow).map(...)` na renderização.

### Detalhes da travessia

```text
edges: [
  { from: { blockId: "b1" }, to: { groupId: "g2" } },
  { from: { blockId: "b3", itemId: "i1" }, to: { groupId: "g5" } },
  ...
]

Mapa: blockId → groupId (via groups[].blocks[].id)
      edgeId → edge (via edges[])
      
Para cada grupo visitado:
  - Para cada bloco do grupo: se tem outgoingEdgeId → buscar edge → to.groupId → enfileirar
  - Para cada item de blocos (choices, conditions): se tem outgoingEdgeId → idem
  
Resultado: grupos ordenados na sequência do fluxo real
```

### Visual
- Adicionar um indicador de número de sequência no header de cada grupo (ex: `#1`, `#2`, `#3`)
- Grupos órfãos (não alcançados) recebem badge `(desconectado)` para ficar claro

### Arquivo alterado
- `src/components/admin/FunnelInspector.tsx`

