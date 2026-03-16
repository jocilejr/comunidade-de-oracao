interface UserBubbleProps {
  content: string;
}

const UserBubble = ({ content }: UserBubbleProps) => {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="relative rounded-lg rounded-tr-none px-3 py-2 shadow-sm max-w-[85%]" style={{ backgroundColor: 'hsl(var(--wa-user-bubble))' }}>
        {/* WhatsApp tail */}
        <div className="absolute -right-2 top-0 w-0 h-0 border-t-[8px] border-l-[8px] border-t-transparent" style={{ borderLeftColor: 'hsl(var(--wa-user-bubble))' }} />
        <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--wa-user-foreground))' }}>{content}</p>
        <div className="flex justify-end items-center gap-1 mt-0.5">
          <span className="text-[10px] leading-none" style={{ color: 'hsl(var(--wa-time))' }}>{time}</span>
          {/* Double check mark */}
          <svg width="16" height="10" viewBox="0 0 16 10" className="inline-block" style={{ color: 'hsl(196, 100%, 50%)' }}>
            <path d="M1 5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default UserBubble;
