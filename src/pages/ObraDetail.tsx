import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import FAB from '@/components/FAB';
import DashboardTab from '@/components/obra/DashboardTab';
import ProdutosTab from '@/components/obra/ProdutosTab';
import FerramentasTab from '@/components/obra/FerramentasTab';
import EntradasTab from '@/components/obra/EntradasTab';
import SaidasTab from '@/components/obra/SaidasTab';
import PessoasTab from '@/components/obra/PessoasTab';
import SkeletonList from '@/components/SkeletonList';

export default function ObraDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [fabAction, setFabAction] = useState<{ type: string; open: boolean } | null>(null);

  const { data: obra, isLoading } = useQuery({
    queryKey: ['obra', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('obras').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleFab = (action: 'produto' | 'entrada' | 'saida') => {
    if (action === 'produto') {
      setActiveTab('produtos');
      setFabAction({ type: 'produto', open: true });
    } else if (action === 'entrada') {
      setActiveTab('entradas');
      setFabAction({ type: 'entrada', open: true });
    } else {
      setActiveTab('saidas');
      setFabAction({ type: 'saida', open: true });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <Button variant="ghost" size="icon" onClick={() => navigate('/obras')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-5 w-40 bg-muted rounded animate-pulse" />
        </header>
        <main className="container max-w-3xl py-4 px-4">
          <SkeletonList />
        </main>
      </div>
    );
  }

  if (!obra) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Obra não encontrada</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-20 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/obras')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-base truncate">{obra.nome}</h1>
          {obra.endereco && <p className="text-xs text-muted-foreground truncate">{obra.endereco}</p>}
        </div>
      </header>

      <main className="container max-w-3xl py-4 px-4 pb-bottom-nav">
        {activeTab === 'dashboard' && <DashboardTab obraId={id!} />}
        {activeTab === 'produtos' && <ProdutosTab obraId={id!} fabOpen={fabAction?.type === 'produto' ? fabAction.open : false} onFabClose={() => setFabAction(null)} />}
        {activeTab === 'ferramentas' && <FerramentasTab obraId={id!} />}
        {activeTab === 'entradas' && <EntradasTab obraId={id!} fabOpen={fabAction?.type === 'entrada' ? fabAction.open : false} onFabClose={() => setFabAction(null)} />}
        {activeTab === 'saidas' && <SaidasTab obraId={id!} fabOpen={fabAction?.type === 'saida' ? fabAction.open : false} onFabClose={() => setFabAction(null)} />}
        {activeTab === 'pessoas' && <PessoasTab obraId={id!} />}
      </main>

      <FAB onAction={handleFab} />
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
