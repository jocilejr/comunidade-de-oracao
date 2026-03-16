
Resumo do problema (reformulado)
- O chat está “saindo da tela” no preview do Admin porque o `ChatRenderer` está travado em `h-[100dvh]`.
- No Admin ele fica dentro de uma moldura fixa (`375x667`), então `100dvh` (altura da janela real) fica maior que a moldura e empurra a barra de input para fora da área visível.

Do I know what the issue is?
- Sim: é conflito entre altura por viewport (`dvh`) e altura de container fixo (mock de celular no Admin).

Arquivos envolvidos
- `src/components/chat/ChatRenderer.tsx`
- `src/pages/Admin.tsx`
- `src/pages/Funnel.tsx`

Plano de implementação
1. Tornar o `ChatRenderer` baseado no container pai (não no viewport)
   - Trocar a raiz de `h-[100dvh] max-h-[100dvh]` para classes de preenchimento do pai (`h-full`, com `min-h-0` para evitar overflow de flex).
2. Garantir comportamento correto em cada tela
   - Admin preview: manter `ChatRenderer` ocupando exatamente a moldura (`h-full` da área 375x667).
   - Rota pública `/f/:slug`: envolver o renderer com container explícito de tela (`h-[100dvh]`) para preservar fullscreen no link final.
3. Blindar scroll/flex para não sumir input
   - Aplicar `min-h-0` no ponto certo do container scrollável para evitar que a área de mensagens force crescimento e empurre a barra inferior.
4. Validar cenários críticos
   - No `/admin` (moldura): abrir preview e confirmar input sempre visível.
   - No `/f/:slug` desktop e mobile: confirmar que continua fullscreen sem espaço artificial.
   - Com input ativo: foco no campo deve manter última mensagem visível sem “vácuo” e sem sair da tela.

Detalhes técnicos
- Causa raiz:
  - `ChatRenderer` hoje assume que sempre é página inteira.
  - No Admin ele é embutido dentro de um “device frame”, então essa suposição quebra layout vertical.
- Correção arquitetural:
  - `ChatRenderer` vira componente agnóstico de contexto (preenche pai).
  - A página (Admin/Funnel) define se o pai é frame fixo ou viewport.
- Resultado esperado:
  - Sem espaço forçado.
  - Sem input cortado.
  - Mesmo comportamento visual do WhatsApp em ambos contextos (preview e rota pública).
