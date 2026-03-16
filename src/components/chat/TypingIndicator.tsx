const TypingIndicator = () => (
  <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]">
    <div className="relative rounded-lg rounded-tl-none px-4 py-3 shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
      <div className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-r-[8px] border-t-transparent" style={{ borderRightColor: 'hsl(var(--wa-bot-bubble))' }} />
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:0ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
        <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:150ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
        <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:300ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
      </div>
    </div>
  </div>
);

export default TypingIndicator;
