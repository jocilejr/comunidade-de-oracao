

## Plano: Autoplay de áudio, som de notificação WhatsApp e respeitar Wait no preview

### O que será feito

1. **Autoplay de áudio** — Quando uma mensagem de áudio do bot aparecer, ela começa a tocar automaticamente (sem precisar clicar play).

2. **Som de notificação WhatsApp** — A cada nova mensagem do bot, tocar um som curto de notificação estilo WhatsApp. Será usado um arquivo de áudio base64 embutido no código (tom curto ~0.5s) para não depender de arquivo externo.

3. **Respeitar o `wait` entre grupos** — O evento `wait` do engine já existe e funciona com delay, mas atualmente não mostra typing indicator de forma visível entre grupos. Garantir que o wait entre caixas/grupos seja respeitado no preview.

### Alterações técnicas

#### 1. `src/lib/notification-sound.ts` (novo)
- Exporta uma função `playNotificationSound()` que cria um `AudioContext` e toca um beep curto que imita o som de notificação do WhatsApp (dois tons ascendentes, ~300ms).
- Alternativa: usar um data URI de um mp3 curto do som clássico do WhatsApp.

#### 2. `src/components/chat/AudioPlayer.tsx`
- Adicionar prop `autoPlay?: boolean`
- No `useEffect` de montagem, se `autoPlay` for true, chamar `audio.play()` e setar `playing = true` após o metadata carregar.

#### 3. `src/components/chat/BotBubble.tsx`
- Passar `autoPlay={true}` ao `AudioPlayer` quando renderizar áudio do bot.

#### 4. `src/components/chat/ChatRenderer.tsx`
- Importar `playNotificationSound`
- No case `'messages'`, após adicionar cada mensagem bot ao display (após remover typing), chamar `playNotificationSound()`
- O `wait` já está implementado no case `'wait'` — verificar que o delay é respeitado corretamente (já está: `await delay(event.seconds * 1000)`)

### Resumo de arquivos
| Arquivo | Ação |
|---|---|
| `src/lib/notification-sound.ts` | Criar — função de som de notificação |
| `src/components/chat/AudioPlayer.tsx` | Editar — adicionar autoPlay |
| `src/components/chat/BotBubble.tsx` | Editar — passar autoPlay ao AudioPlayer |
| `src/components/chat/ChatRenderer.tsx` | Editar — tocar notificação a cada mensagem bot |

