const TypingIndicator = () => (
  <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]" style={{ marginLeft: '34px' }}>
    <div className="rounded-[7.5px] px-[12px] py-[8px] shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
      <div className="flex gap-[4px]">
        <span className="w-[7px] h-[7px] rounded-full animate-bounce [animation-delay:0ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
        <span className="w-[7px] h-[7px] rounded-full animate-bounce [animation-delay:150ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
        <span className="w-[7px] h-[7px] rounded-full animate-bounce [animation-delay:300ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
      </div>
    </div>
  </div>
);

export default TypingIndicator;
