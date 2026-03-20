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
                className="rounded-xl overflow-hidden text-left transition-all duration-200 active:scale-95 hover:shadow-lg shadow-md"
                style={{ backgroundColor: 'hsl(var(--wa-cta))' }}
              >
                {picSrc && (
                  <img src={picSrc} alt={label} className="w-full h-28 object-cover" loading="lazy" />
                )}
                <div className="p-2.5">
                  <span className="block text-sm font-semibold" style={{ color: 'hsl(var(--wa-cta-foreground))' }}>{label}</span>
                  {description && (
                    <span className="block text-xs mt-0.5 opacity-80" style={{ color: 'hsl(var(--wa-cta-foreground))' }}>{description}</span>
                  )}
                </div>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id, label)}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-center transition-all duration-200 active:scale-95 shadow-md hover:shadow-lg"
              style={{
                backgroundColor: 'hsl(var(--wa-cta))',
                color: 'hsl(var(--wa-cta-foreground))',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--wa-cta-hover))'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--wa-cta))'}
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
