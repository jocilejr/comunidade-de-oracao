import { useState, useEffect, useRef, useCallback } from 'react';
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

const TYPING_DELAY = 600;
const MESSAGE_DELAY = 400;

const ChatRenderer = ({ flow, botName, botAvatar }: ChatRendererProps) => {
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [inputBlock, setInputBlock] = useState<TypebotBlock | null>(null);
  const [choiceBlock, setChoiceBlock] = useState<ChoiceInputBlock | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ended, setEnded] = useState(false);
  const engineRef = useRef<TypebotEngine | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventQueueRef = useRef<EngineEvent[]>([]);
  const processingRef = useRef(false);

  const name = botName || flow.name || 'Assistente';

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
            await delay(TYPING_DELAY);

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
              content: `<p style="color: hsl(var(--destructive))">${event.message}</p>`,
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
    const engine = new TypebotEngine(flow);
    engineRef.current = engine;
    collectEvents(engine.start());
    return () => { engineRef.current = null; eventQueueRef.current = []; };
  }, [flow]);

  const handleInputSubmit = useCallback((value: string) => {
    if (!engineRef.current || !inputBlock) return;
    setDisplayItems(prev => [...prev, { type: 'user', content: value }]);
    setInputBlock(null);
    scrollToBottom();
    collectEvents(engineRef.current.continueAfterInput(inputBlock, value));
  }, [inputBlock, collectEvents, scrollToBottom]);

  const handleChoiceSelect = useCallback((itemId: string, value: string) => {
    if (!engineRef.current || !choiceBlock) return;
    setDisplayItems(prev => [...prev, { type: 'user', content: value }]);
    setChoiceBlock(null);
    scrollToBottom();
    collectEvents(engineRef.current.continueAfterChoice(choiceBlock, itemId, value));
  }, [choiceBlock, collectEvents, scrollToBottom]);

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Progress */}
      <div className="shrink-0">
        <Progress value={progress} className="h-0.5 rounded-none [&>div]:bg-[hsl(var(--wa-progress))]" />
      </div>

      {/* WhatsApp Header */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-2 shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-header))' }}>
        <ArrowLeft className="w-5 h-5 cursor-pointer" style={{ color: 'hsl(var(--wa-header-foreground))' }} />
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: 'hsl(var(--wa-header-foreground) / 0.2)', color: 'hsl(var(--wa-header-foreground))' }}>
          {botAvatar ? (
            <img src={botAvatar} alt={name} className="w-full h-full rounded-full object-cover" />
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

      {/* Chat area with wallpaper */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto wa-wallpaper px-3 py-4">
        <div className="max-w-[600px] mx-auto space-y-1.5">
          {/* Date chip */}
          <div className="flex justify-center mb-3">
            <span className="text-[11px] px-3 py-1 rounded-lg shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))', color: 'hsl(var(--wa-time))' }}>
              HOJE
            </span>
          </div>

          {displayItems.map((item, i) => {
            if (item.type === 'typing') return <TypingIndicator key={`typing-${i}`} />;
            if (item.type === 'user') return <UserBubble key={`user-${i}`} content={item.content} />;
            if (item.type === 'bot') return <BotBubble key={item.message.id} message={item.message} botAvatar={botAvatar} botName={name} />;
            return null;
          })}

          {choiceBlock && (
            <ChoiceButtons block={choiceBlock} onSelect={handleChoiceSelect} />
          )}

          {ended && (
            <div className="flex justify-center py-3">
              <span className="text-[11px] px-3 py-1 rounded-lg shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))', color: 'hsl(var(--wa-time))' }}>
                Conversa finalizada ✓
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      {inputBlock && !ended && (
        <div className="shrink-0">
          <ChatInput block={inputBlock} onSubmit={handleInputSubmit} />
        </div>
      )}
    </div>
  );
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default ChatRenderer;
