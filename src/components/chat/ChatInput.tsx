import { useState, useRef, useEffect } from 'react';
import { TypebotBlock } from '@/lib/typebot-types';
import { Send, Smile } from 'lucide-react';

interface ChatInputProps {
  block: TypebotBlock;
  onSubmit: (value: string) => void;
}

const ChatInput = ({ block, onSubmit }: ChatInputProps) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const blockType = block.type.toLowerCase();
  const options = (block as any).options || (block as any).content || {};
  const labels = options.labels || {};
  const placeholder = labels.placeholder || options.placeholder || getDefaultPlaceholder(blockType);
  const isLong = options.isLong || (block as any).content?.isLong;

  useEffect(() => {
    setTimeout(() => {
      if (isLong) textareaRef.current?.focus();
      else inputRef.current?.focus();
    }, 100);
  }, [block.id]);

  const validate = (val: string): boolean => {
    if (!val.trim()) {
      setError('Este campo é obrigatório');
      return false;
    }
    if (blockType.includes('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setError(options.retryMessageContent || 'Por favor, insira um email válido');
      return false;
    }
    if (blockType.includes('phone') && !/^[+]?[\d\s()-]{7,}$/.test(val.replace(/\s/g, ''))) {
      setError(options.retryMessageContent || 'Por favor, insira um telefone válido');
      return false;
    }
    if (blockType.includes('url')) {
      try { new URL(val); } catch {
        setError(options.retryMessageContent || 'Por favor, insira uma URL válida');
        return false;
      }
    }
    if (blockType.includes('number') && isNaN(Number(val))) {
      setError('Por favor, insira um número válido');
      return false;
    }
    return true;
  };

  const handleSubmit = () => {
    setError('');
    if (!validate(value)) return;
    onSubmit(value.trim());
    setValue('');
  };

  const inputType = getInputType(blockType);

  return (
    <div className="px-2 py-2 animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ backgroundColor: 'hsl(var(--wa-input-bar))' }}>
      <div className="flex items-end gap-2 max-w-[600px] mx-auto">
        <div className="flex-1 rounded-3xl flex items-end gap-2 px-3 py-2" style={{ backgroundColor: 'hsl(var(--wa-input-bg))' }}>
          <Smile className="w-5 h-5 shrink-0 mb-0.5" style={{ color: 'hsl(var(--wa-time))' }} />
          {isLong ? (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={e => { setValue(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              placeholder={placeholder}
              rows={1}
              className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:opacity-50 max-h-24"
              style={{ color: 'hsl(var(--wa-bot-foreground))' }}
            />
          ) : (
            <input
              ref={inputRef}
              type={inputType}
              value={value}
              onChange={e => { setValue(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
              style={{ color: 'hsl(var(--wa-bot-foreground))' }}
            />
          )}
        </div>
        <button
          onClick={handleSubmit}
          className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: 'hsl(var(--wa-send))' }}
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
      {error && (
        <p className="text-destructive text-xs mt-1 max-w-[600px] mx-auto px-3">{error}</p>
      )}
    </div>
  );
};

function getDefaultPlaceholder(type: string): string {
  if (type.includes('email')) return 'Digite seu email...';
  if (type.includes('phone')) return 'Digite seu telefone...';
  if (type.includes('number')) return 'Digite um número...';
  if (type.includes('url')) return 'Digite uma URL...';
  if (type.includes('date')) return 'Selecione uma data...';
  return 'Mensagem';
}

function getInputType(type: string): string {
  if (type.includes('email')) return 'email';
  if (type.includes('phone')) return 'tel';
  if (type.includes('number')) return 'number';
  if (type.includes('url')) return 'url';
  if (type.includes('date')) return 'date';
  return 'text';
}

export default ChatInput;
