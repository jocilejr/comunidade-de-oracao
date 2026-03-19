

## Correção do Audio Bubble — Adicionar avatar circular à direita

### Problema
No WhatsApp real (imagem 1), o bubble de áudio exibe a **foto/avatar do bot** em um círculo à direita da waveform. Atualmente (imagem 2), o avatar não aparece dentro do bubble de áudio.

### Alterações

**1. `src/components/chat/AudioPlayer.tsx`**
- Adicionar prop opcional `avatar?: string` e `avatarFallback?: string`
- Após a waveform (lado direito do flex), renderizar um círculo de ~34px com a imagem do avatar (ou fallback com inicial do nome)
- Estilo: `rounded-full`, `overflow-hidden`, `shrink-0`, posicionado como último item no flex row principal

**2. `src/components/chat/BotBubble.tsx`**
- No bloco de renderização do áudio (~linha 93), passar `avatar={botAvatar}` e `avatarFallback={botName}` para o `AudioPlayer`

### Layout resultante
```text
[ ▶ ] [|||waveform|||] [ 🟢avatar ]
       0:12              14:32
```

