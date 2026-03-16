interface UserBubbleProps {
  content: string;
}

const UserBubble = ({ content }: UserBubbleProps) => {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="relative rounded-[7.5px] rounded-tr-none px-[9px] pt-[6px] pb-[8px] shadow-sm max-w-[85%]" style={{ backgroundColor: 'hsl(var(--wa-user-bubble))' }}>
        {/* WhatsApp outgoing tail */}
        <svg
          viewBox="0 0 8 13"
          height="13"
          width="8"
          className="absolute -right-[8px] top-0"
          style={{ color: 'hsl(var(--wa-user-bubble))' }}
        >
          <path
            d="M3 0H0v1h4c.2 0 .4.1.6.2L7 3.3c.8.8 1 1.7 1 2.7v7L5 7C4.5 5.7 3.8 4 3.5 3 3.3 2.2 3 1.5 3 1V0z"
            fill="currentColor"
          />
        </svg>
        <p className="text-[14.2px] leading-[19px]" style={{ color: 'hsl(var(--wa-user-foreground))' }}>{content}</p>
        <div className="flex justify-end items-center gap-[3px] mt-[2px]">
          <span className="text-[11px] leading-[15px]" style={{ color: 'hsl(var(--wa-time))' }}>{time}</span>
          {/* Double blue check */}
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
