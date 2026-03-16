import { useState, useEffect, useRef, useCallback } from 'react';
import { TypebotFlow, ChatMessage, TypebotBlock, ChoiceInputBlock } from '@/lib/typebot-types';
import { TypebotEngine, EngineEvent } from '@/lib/typebot-engine';
import BotBubble from './BotBubble';
import UserBubble from './UserBubble';
import TypingIndicator from './TypingIndicator';
import ChatInput from './ChatInput';
import ChoiceButtons from './ChoiceButtons';
import { Progress } from '@/components/ui/progress';

interface ChatRendererProps {
  flow: TypebotFlow;
}

type DisplayItem =
  | { type: 'bot'; message: ChatMessage }
  | { type: 'user'; content: string }
  | { type: 'typing' };

const TYPING_DELAY = 600;
const MESSAGE_DELAY = 400;

const ChatRenderer = ({ flow }: ChatRendererProps) => {
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
            // Show typing
            setIsTyping(true);
            setDisplayItems(prev => [...prev, { type: 'typing' }]);
            scrollToBottom();
            await delay(TYPING_DELAY);

            // Replace typing with message
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
          if (event.isNewTab) {
            window.open(event.url, '_blank');
          } else {
            window.location.href = event.url;
          }
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
              content: `<p class="text-destructive">${event.message}</p>`,
              timestamp: Date.now(),
            },
          }]);
          scrollToBottom();
          break;
        }
      }

      if (engineRef.current) {
        setProgress(engineRef.current.getProgress());
      }
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

    return () => {
      engineRef.current = null;
      eventQueueRef.current = [];
    };
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
    <div className="flex flex-col h-screen max-h-screen bg-background">
      {/* Progress bar */}
      <div className="shrink-0">
        <Progress value={progress} className="h-1 rounded-none [&>div]:bg-[hsl(var(--chat-progress))]" />
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-[600px] mx-auto space-y-3">
          {displayItems.map((item, i) => {
            if (item.type === 'typing') return <TypingIndicator key={`typing-${i}`} />;
            if (item.type === 'user') return <UserBubble key={`user-${i}`} content={item.content} />;
            if (item.type === 'bot') return <BotBubble key={item.message.id} message={item.message} />;
            return null;
          })}

          {/* Choice buttons inside chat area */}
          {choiceBlock && (
            <ChoiceButtons block={choiceBlock} onSelect={handleChoiceSelect} />
          )}

          {ended && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Conversa finalizada ✓</p>
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
