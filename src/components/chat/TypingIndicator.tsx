const TypingIndicator = () => (
  <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]">
    <div className="relative rounded-[7.5px] rounded-tl-none px-[12px] py-[8px] shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
      {/* Tail */}
      <svg
        viewBox="0 0 8 13"
        height="13"
        width="8"
        className="absolute -left-[8px] top-0"
        style={{ color: 'hsl(var(--wa-bot-bubble))' }}
      >
        <path
          d="M5 0h3v1H4c-.2 0-.4.1-.6.2L1 3.3C.2 4.1 0 5 0 6v7L3 7c.5-1.3 1.2-3 1.5-4 .2-.8.5-1.5.5-2V0z"
          fill="currentColor"
        />
      </svg>
      <div className="flex gap-[4px]">
        <span className="w-[7px] h-[7px] rounded-full animate-bounce [animation-delay:0ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
        <span className="w-[7px] h-[7px] rounded-full animate-bounce [animation-delay:150ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
        <span className="w-[7px] h-[7px] rounded-full animate-bounce [animation-delay:300ms]" style={{ backgroundColor: 'hsl(var(--wa-time))' }} />
      </div>
    </div>
  </div>
);

export default TypingIndicator;
