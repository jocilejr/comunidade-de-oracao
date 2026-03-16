import { useState, useRef, useEffect } from 'react';
import { TypebotBlock } from '@/lib/typebot-types';
import { Send } from 'lucide-react';

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

    if (blockType.includes('email')) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        setError(options.retryMessageContent || 'Por favor, insira um email válido');
        return false;
      }
    }

    if (blockType.includes('phone')) {
      if (!/^[+]?[\d\s()-]{7,}$/.test(val.replace(/\s/g, ''))) {
        setError(options.retryMessageContent || 'Por favor, insira um telefone válido');
        return false;
      }
    }

    if (blockType.includes('url')) {
      try { new URL(val); } catch {
        setError(options.retryMessageContent || 'Por favor, insira uma URL válida');
        return false;
      }
    }

    if (blockType.includes('number')) {
      if (isNaN(Number(val))) {
        setError('Por favor, insira um número válido');
        return false;
      }
      const content = (block as any).content;
      if (content?.min !== undefined && Number(val) < content.min) {
        setError(`Valor mínimo: ${content.min}`);
        return false;
      }
      if (content?.max !== undefined && Number(val) > content.max) {
        setError(`Valor máximo: ${content.max}`);
        return false;
      }
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
    <div className="border-t border-border bg-card p-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex gap-2 max-w-[600px] mx-auto">
        {isLong ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={placeholder}
            rows={3}
            className="flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        ) : (
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder={placeholder}
            className="flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        <button
          onClick={handleSubmit}
          className="shrink-0 h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {error && (
        <p className="text-destructive text-xs mt-1 max-w-[600px] mx-auto px-1">{error}</p>
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
  return 'Digite sua resposta...';
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
