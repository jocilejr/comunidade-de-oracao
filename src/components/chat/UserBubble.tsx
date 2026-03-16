interface UserBubbleProps {
  content: string;
}

const UserBubble = ({ content }: UserBubbleProps) => (
  <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
    <div className="rounded-2xl rounded-br-sm bg-primary px-4 py-3 shadow-sm max-w-[85%]">
      <p className="text-primary-foreground text-sm leading-relaxed">{content}</p>
    </div>
  </div>
);

export default UserBubble;
