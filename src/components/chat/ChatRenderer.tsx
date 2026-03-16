import { useState, useEffect, useRef, useCallback, useMemo, type FocusEvent } from 'react';
import { TypebotFlow, ChatMessage, TypebotBlock, ChoiceInputBlock } from '@/lib/typebot-types';
import { TypebotEngine, EngineEvent } from '@/lib/typebot-engine';
import BotBubble from './BotBubble';
import UserBubble from './UserBubble';
import TypingIndicator from './TypingIndicator';
import ChatInput from './ChatInput';
import ChoiceButtons from './ChoiceButtons';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';

interface ChatRendererProps {
  flow: TypebotFlow;
  botName?: string;
  botAvatar?: string;
}

type DisplayItem =
  | { type: 'bot'; message: ChatMessage }
  | { type: 'user'; content: string }
  | { type: 'typing' };

const MIN_TYPING = 400;
const MAX_TYPING = 2000;
const MESSAGE_DELAY = 300;

/** Typing delay proportional to text length, like real WhatsApp */
function typingDelay(content: string): number {
  const len = content.replace(/<[^>]*>/g, '').length;
  return Math.min(MAX_TYPING, Math.max(MIN_TYPING, len * 15));
}

const ChatRenderer = ({ flow, botName, botAvatar }: ChatRendererProps) => {
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [inputBlock, setInputBlock] = useState<TypebotBlock | null>(null);
  const [choiceBlock, setChoiceBlock] = useState<ChoiceInputBlock | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ended, setEnded] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const engineRef = useRef<TypebotEngine | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventQueueRef = useRef<EngineEvent[]>([]);
  const processingRef = useRef(false);
  

  const flowSessionKey = `${flow.id || flow.name || 'flow'}-${flow.groups.length}-${flow.edges.length}`;
  const sessionFlow = useMemo(() => flow, [flowSessionKey]);
  const name = botName || sessionFlow.name || 'Assistente';

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, []);

  

  const processEvents = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (eventQueueRef.current.length > 0) {
      const event = eventQueueRef.current.shift()!;

      switch (event.type) {
        case 'messages': {
          for (const msg of event.messages) {
            setIsTyping(true);
            setDisplayItems(prev => [...prev, { type: 'typing' }]);
            scrollToBottom();
            await delay(typingDelay(msg.content || ''));

            setDisplayItems(prev => {
              const items = prev.filter(i => i.type !== 'typing');
              return [...items, { type: 'bot', message: msg }];
            });
            setIsTyping(false);
            scrollToBottom();
            await delay(MESSAGE_DELAY);
          }
          break;
        }
        case 'input': {
          setInputBlock(event.block);
          setChoiceBlock(null);
          scrollToBottom();
          break;
        }
        case 'choices': {
          setChoiceBlock(event.block as ChoiceInputBlock);
          setInputBlock(null);
          scrollToBottom();
          break;
        }
        case 'redirect': {
          if (event.isNewTab) window.open(event.url, '_blank');
          else window.location.href = event.url;
          break;
        }
        case 'wait': {
          setIsTyping(true);
          setDisplayItems(prev => [...prev, { type: 'typing' }]);
          scrollToBottom();
          await delay(event.seconds * 1000);
          setDisplayItems(prev => prev.filter(i => i.type !== 'typing'));
          setIsTyping(false);
          break;
        }
        case 'end': {
          setEnded(true);
          setProgress(100);
          break;
        }
        case 'error': {
          setDisplayItems(prev => [...prev, {
            type: 'bot',
            message: {
              id: crypto.randomUUID(),
              type: 'bot',
              content: `<p style=\"color: hsl(var(--destructive))\">${event.message}</p>`,
              timestamp: Date.now(),
            },
          }]);
          scrollToBottom();
          break;
        }
      }

      if (engineRef.current) setProgress(engineRef.current.getProgress());
    }

    processingRef.current = false;
  }, [scrollToBottom]);

  const collectEvents = useCallback(async (generator: AsyncGenerator<EngineEvent>) => {
    for await (const event of generator) {
      eventQueueRef.current.push(event);
    }
    processEvents();
  }, [processEvents]);

  useEffect(() => {
    const engine = new TypebotEngine(sessionFlow);
    engineRef.current = engine;

    // Hard reset only when changing to a new flow session
    eventQueueRef.current = [];
    processingRef.current = false;
    setDisplayItems([]);
    setInputBlock(null);
    setChoiceBlock(null);
    setIsTyping(false);
    setProgress(0);
    setEnded(false);
    setIsComposerFocused(false);

    collectEvents(engine.start());

    return () => {
      engineRef.current = null;
      eventQueueRef.current = [];
      processingRef.current = false;
    };
  }, [sessionFlow, collectEvents]);

  useEffect(() => {
    if (!window.visualViewport) return;

    const visualViewport = window.visualViewport;
    baseViewportHeightRef.current = window.innerHeight;

    const updateKeyboardOffset = () => {
      const baseHeight = baseViewportHeightRef.current || window.innerHeight;
      const nextOffset = Math.max(0, Math.round(baseHeight - visualViewport.height - visualViewport.offsetTop));
      setKeyboardOffset(nextOffset > 80 ? nextOffset : 0);
    };

    const handleOrientationChange = () => {
      baseViewportHeightRef.current = window.innerHeight;
      updateKeyboardOffset();
    };

    updateKeyboardOffset();
    visualViewport.addEventListener('resize', updateKeyboardOffset);
    visualViewport.addEventListener('scroll', updateKeyboardOffset);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      visualViewport.removeEventListener('resize', updateKeyboardOffset);
      visualViewport.removeEventListener('scroll', updateKeyboardOffset);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  useEffect(() => {
    if (isComposerFocused) scrollToBottom();
  }, [isComposerFocused, composerLift, scrollToBottom]);

  const handleComposerFocusCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      setIsComposerFocused(true);
      scrollToBottom();
    }
  }, [scrollToBottom]);

  const handleComposerBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;

    setTimeout(() => {
      const active = document.activeElement;
      const stillTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (!stillTyping) setIsComposerFocused(false);
    }, 0);
  }, []);

  const handleInputSubmit = useCallback((value: string) => {
    if (!engineRef.current || !inputBlock) return;
    setDisplayItems(prev => [...prev, { type: 'user', content: value }]);
    setInputBlock(null);
    setIsComposerFocused(false);
    scrollToBottom();
    collectEvents(engineRef.current.continueAfterInput(inputBlock, value));
  }, [inputBlock, collectEvents, scrollToBottom]);

  const handleChoiceSelect = useCallback((itemId: string, value: string) => {
    if (!engineRef.current || !choiceBlock) return;
    setDisplayItems(prev => [...prev, { type: 'user', content: value }]);
    setChoiceBlock(null);
    setIsComposerFocused(false);
    scrollToBottom();
    collectEvents(engineRef.current.continueAfterChoice(choiceBlock, itemId, value));
  }, [choiceBlock, collectEvents, scrollToBottom]);

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden">
      {/* Progress */}
      <div className="shrink-0">
        <Progress value={progress} className="h-0.5 rounded-none [&>div]:bg-[hsl(var(--wa-progress))]" />
      </div>

      {/* WhatsApp Header */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-2 shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-header))' }}>
        <ArrowLeft className="w-5 h-5 cursor-pointer" style={{ color: 'hsl(var(--wa-header-foreground))' }} />
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden" style={{ backgroundColor: 'hsl(var(--wa-header-foreground) / 0.2)', color: 'hsl(var(--wa-header-foreground))' }}>
          {botAvatar ? (
            <img src={botAvatar} alt={name} className="w-full h-full object-cover" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--wa-header-foreground))' }}>{name}</p>
          <p className="text-[11px]" style={{ color: 'hsl(var(--wa-header-foreground) / 0.7)' }}>
            {isTyping ? 'digitando...' : 'online'}
          </p>
        </div>
        <div className="flex items-center gap-4" style={{ color: 'hsl(var(--wa-header-foreground))' }}>
          <Video className="w-5 h-5" />
          <Phone className="w-5 h-5" />
          <MoreVertical className="w-5 h-5" />
        </div>
      </header>

      {/* Chat area — messages flow naturally, scroll when overflow */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto wa-wallpaper transition-[padding-bottom] duration-300"
        style={{ paddingBottom: composerLift ? `${composerLift}px` : undefined }}
      >
        <div className="px-3 py-3">
          <div className="max-w-[600px] w-full mx-auto space-y-[3px]">
            {/* Date chip */}
            <div className="flex justify-center mb-2">
              <span className="text-[11px] px-3 py-1 rounded-lg shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))', color: 'hsl(var(--wa-time))' }}>
                HOJE
              </span>
            </div>

            {displayItems.map((item, i) => {
              if (item.type === 'typing') return <TypingIndicator key={`typing-${i}`} />;
              if (item.type === 'user') return <UserBubble key={`user-${i}`} content={item.content} />;
              if (item.type === 'bot') {
                const prev = displayItems[i - 1];
                const next = displayItems[i + 1];
                const isFirst = !prev || prev.type !== 'bot';
                const isLast = !next || next.type !== 'bot';
                return <BotBubble key={item.message.id} message={item.message} botAvatar={botAvatar} botName={name} isFirst={isFirst} isLast={isLast} />;
              }
              return null;
            })}

            {choiceBlock && (
              <ChoiceButtons block={choiceBlock} onSelect={handleChoiceSelect} />
            )}

            {ended && (
              <div className="flex justify-center py-2">
                <span className="text-[11px] px-3 py-1 rounded-lg shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))', color: 'hsl(var(--wa-time))' }}>
                  Conversa finalizada ✓
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input bar — always visible */}
      <div
        className="shrink-0 transition-transform duration-300 ease-out"
        style={{
          transform: composerLift ? `translateY(-${composerLift}px)` : 'translateY(0)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onFocusCapture={handleComposerFocusCapture}
        onBlurCapture={handleComposerBlurCapture}
      >
        {inputBlock && !ended ? (
          <ChatInput block={inputBlock} onSubmit={handleInputSubmit} />
        ) : (
          <div className="px-2 py-2" style={{ backgroundColor: 'hsl(var(--wa-input-bar))' }}>
            <div className="flex items-center gap-2 max-w-[600px] mx-auto">
              <div className="flex-1 rounded-3xl px-4 py-2.5" style={{ backgroundColor: 'hsl(var(--wa-input-bg))', opacity: 0.5 }}>
                <span className="text-sm" style={{ color: 'hsl(var(--wa-time))' }}>Mensagem</span>
              </div>
              <div className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center opacity-50" style={{ backgroundColor: 'hsl(var(--wa-send))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default ChatRenderer;
