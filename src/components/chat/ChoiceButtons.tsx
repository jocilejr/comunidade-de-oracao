import { ChoiceInputBlock, PictureChoiceBlock } from '@/lib/typebot-types';

interface ChoiceButtonsProps {
  block: ChoiceInputBlock | PictureChoiceBlock;
  onSelect: (itemId: string, value: string) => void;
}

const ChoiceButtons = ({ block, onSelect }: ChoiceButtonsProps) => {
  const isPicture = block.type.toLowerCase().includes('picture');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={isPicture ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
        {block.items.map((item) => {
          const label = (item as any).title || item.content || 'Opção';
          const picSrc = (item as any).pictureSrc;
          const description = (item as any).description;

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id, label)}
              className={
                isPicture
                  ? "rounded-lg overflow-hidden shadow-sm text-left transition-transform active:scale-95"
                  : "w-full rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-all active:scale-95"
              }
              style={
                isPicture
                  ? { backgroundColor: 'hsl(var(--wa-bot-bubble))', color: 'hsl(var(--wa-bot-foreground))' }
                  : { backgroundColor: 'hsl(var(--wa-bot-bubble))', color: 'hsl(var(--wa-send))', border: '1.5px solid hsl(var(--wa-send))' }
              }
            >
              {isPicture && picSrc && (
                <img src={picSrc} alt={label} className="w-full h-28 object-cover" loading="lazy" />
              )}
              <div className={isPicture ? "p-2.5" : ""}>
                <span className="block text-sm font-medium">{label}</span>
                {description && (
                  <span className="block text-xs mt-0.5" style={{ color: 'hsl(var(--wa-time))' }}>{description}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ChoiceButtons;
