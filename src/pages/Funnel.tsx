import { useParams } from 'react-router-dom';
import { getFunnelBySlug } from '@/lib/funnel-storage';
import ChatRenderer from '@/components/chat/ChatRenderer';
import { Link } from 'react-router-dom';

const Funnel = () => {
  const { slug } = useParams<{ slug: string }>();
  const funnel = slug ? getFunnelBySlug(slug) : undefined;

  if (!funnel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-foreground">Funil não encontrado</h1>
          <p className="text-muted-foreground text-sm">O funil "{slug}" não existe ou foi removido.</p>
          <Link to="/admin" className="text-primary text-sm underline hover:no-underline">
            Ir para o painel admin
          </Link>
        </div>
      </div>
    );
  }

  return <ChatRenderer flow={funnel.flow} />;
};

export default Funnel;
