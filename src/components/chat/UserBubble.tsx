interface UserBubbleProps {
  content: string;
}

const UserBubble = ({ content }: UserBubbleProps) => {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="rounded-[7.5px] px-[9px] pt-[6px] pb-[8px] shadow-sm max-w-[85%]" style={{ backgroundColor: 'hsl(var(--wa-user-bubble))' }}>
        <p className="text-[14.2px] leading-[19px]" style={{ color: 'hsl(var(--wa-user-foreground))' }}>{content}</p>
        <div className="flex justify-end items-center mt-[2px]">
          <span className="text-[11px] leading-[15px]" style={{ color: 'hsl(var(--wa-time))' }}>{time}</span>
        </div>
      </div>
    </div>
  );
};

export default UserBubble;
