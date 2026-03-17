import { ChoiceInputBlock, PictureChoiceBlock } from '@/lib/typebot-types';

interface ChoiceButtonsProps {
  block: ChoiceInputBlock | PictureChoiceBlock;
  onSelect: (itemId: string, value: string) => void;
}

const ChoiceButtons = ({ block, onSelect }: ChoiceButtonsProps) => {
  const isPicture = block.type.toLowerCase().includes('picture');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pt-1">
      <div className={isPicture ? "grid grid-cols-2 gap-2.5" : "flex flex-col gap-2 max-w-[320px]"}>
        {block.items.map((item) => {
          const label = (item as any).title || item.content || 'Opção';
          const picSrc = (item as any).pictureSrc;
          const description = (item as any).description;

          if (isPicture) {
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id, label)}
                className="rounded-xl overflow-hidden text-left transition-all active:scale-95 hover:opacity-90 border"
                style={{
                  backgroundColor: 'hsl(var(--wa-bot-bubble))',
                  borderColor: 'hsl(var(--wa-send) / 0.3)',
                }}
              >
                {picSrc && (
                  <img src={picSrc} alt={label} className="w-full h-28 object-cover" loading="lazy" />
                )}
                <div className="p-2.5">
                  <span className="block text-sm font-medium" style={{ color: 'hsl(var(--wa-bot-foreground))' }}>{label}</span>
                  {description && (
                    <span className="block text-xs mt-0.5" style={{ color: 'hsl(var(--wa-time))' }}>{description}</span>
                  )}
                </div>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id, label)}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-center transition-all active:scale-95 hover:opacity-80 border bg-transparent"
              style={{
                borderColor: 'hsl(var(--wa-send))',
                color: 'hsl(var(--wa-send))',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ChoiceButtons;
