const TypingIndicator = () => (
  <div className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
    <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 shadow-sm">
      <div className="flex gap-1.5">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  </div>
);

export default TypingIndicator;
