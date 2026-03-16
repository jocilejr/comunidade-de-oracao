import { ChoiceInputBlock, PictureChoiceBlock } from '@/lib/typebot-types';

interface ChoiceButtonsProps {
  block: ChoiceInputBlock | PictureChoiceBlock;
  onSelect: (itemId: string, value: string) => void;
}

const ChoiceButtons = ({ block, onSelect }: ChoiceButtonsProps) => {
  const isPicture = block.type.toLowerCase().includes('picture');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={
        isPicture
          ? "grid grid-cols-2 gap-2"
          : "flex flex-col gap-2"
      }>
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
                  ? "rounded-xl border-2 border-border bg-card overflow-hidden hover:border-primary transition-colors text-left"
                  : "w-full rounded-xl border-2 border-primary/20 bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-150"
              }
            >
              {isPicture && picSrc && (
                <img src={picSrc} alt={label} className="w-full h-28 object-cover" loading="lazy" />
              )}
              <div className={isPicture ? "p-3" : ""}>
                <span className="block text-sm font-medium">{label}</span>
                {description && (
                  <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
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
