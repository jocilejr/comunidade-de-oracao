interface UserBubbleProps {
  content: string;
}

const UserBubble = ({ content }: UserBubbleProps) => {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="rounded-[7.5px] px-[9px] pt-[6px] pb-[8px] shadow-sm max-w-[85%]" style={{ backgroundColor: 'hsl(var(--wa-user-bubble))' }}>
        <p className="text-[14.2px] leading-[19px]" style={{ color: 'hsl(var(--wa-user-foreground))' }}>{content}</p>
        <div className="flex justify-end items-center gap-[3px] mt-[2px]">
          <span className="text-[11px] leading-[15px]" style={{ color: 'hsl(var(--wa-time))' }}>{time}</span>
          <svg width="16" height="11" viewBox="0 0 16 11" className="inline-block">
            <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.336-.154.46.46 0 0 0-.343.146.458.458 0 0 0-.014.643l2.34 2.438a.454.454 0 0 0 .34.161h.043a.477.477 0 0 0 .338-.186l6.502-8.022a.458.458 0 0 0 .016-.643z" fill="hsl(196, 100%, 50%)" />
            <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.25-.58.715 1.45 1.511a.454.454 0 0 0 .34.161h.043a.477.477 0 0 0 .338-.186l6.502-8.022a.458.458 0 0 0 .016-.643z" fill="hsl(196, 100%, 50%)" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default UserBubble;
