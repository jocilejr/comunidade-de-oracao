

## Problema

O fluxo começa pelo grupo "Start" (index 0), que normalmente contém um único bloco do tipo `start`. O engine:

1. Não reconhece `start` como bubble nem input → vai para `processLogicBlock` → cai no `default` → retorna `'continue'`
2. Após o loop, tenta seguir o edge do último bloco via `lastBlock.outgoingEdgeId` ou `findEdgeFromBlock(lastBlock.id)`
3. **Porém**, no Typebot, o edge do grupo Start usa `from.groupId` (não `from.blockId`), então `findEdgeFromBlock` não encontra nada
4. Resultado: `yield { type: 'end' }` → "Conversa finalizada" imediatamente

## Solução em `src/lib/typebot-engine.ts`

1. **Adicionar `findEdgeFromGroup(groupId)`** — busca edges onde `e.from.groupId === groupId` (sem `blockId`)
2. **Em `processGroup`**, após falhar em encontrar edge pelo último bloco, tentar `findEdgeFromGroup(group.id)` antes de emitir `'end'`
3. **No `normalizeBlockType`**, reconhecer o tipo `start` explicitamente para que não gere warning no console

### Código resumido da correção

```typescript
// Novo método
private findEdgeFromGroup(groupId: string): TypebotEdge | undefined {
  return this.flow.edges.find(e => e.from.groupId === groupId && !e.from.blockId);
}

// Em processGroup, antes de yield 'end':
const groupEdge = this.findEdgeFromGroup(group.id);
if (groupEdge) {
  yield* this.processFromEdge(groupEdge.id);
  return;
}

// Em normalizeBlockType:
if (t === 'start') return 'start';
```

### Arquivo alterado
- `src/lib/typebot-engine.ts`

