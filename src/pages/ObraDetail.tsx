import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutDashboard, Package, Wrench, ArrowDownToLine, ArrowUpFromLine, Users } from 'lucide-react';
import DashboardTab from '@/components/obra/DashboardTab';
import ProdutosTab from '@/components/obra/ProdutosTab';
import FerramentasTab from '@/components/obra/FerramentasTab';
import EntradasTab from '@/components/obra/EntradasTab';
import SaidasTab from '@/components/obra/SaidasTab';
import PessoasTab from '@/components/obra/PessoasTab';

export default function ObraDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: obra } = useQuery({
    queryKey: ['obra', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('obras').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (!obra) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate('/obras')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="font-display font-bold truncate">{obra.nome}</h1>
          {obra.endereco && <p className="text-xs text-muted-foreground truncate">{obra.endereco}</p>}
        </div>
      </header>

      <Tabs defaultValue="dashboard" className="w-full">
        <div className="border-b bg-card sticky top-[57px] z-10 overflow-x-auto">
          <TabsList className="h-auto p-1 bg-transparent w-full justify-start gap-0">
            <TabsTrigger value="dashboard" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="produtos" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Package className="h-3.5 w-3.5" /> Produtos
            </TabsTrigger>
            <TabsTrigger value="ferramentas" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Wrench className="h-3.5 w-3.5" /> Ferramentas
            </TabsTrigger>
            <TabsTrigger value="entradas" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <ArrowDownToLine className="h-3.5 w-3.5" /> Entradas
            </TabsTrigger>
            <TabsTrigger value="saidas" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <ArrowUpFromLine className="h-3.5 w-3.5" /> Saídas
            </TabsTrigger>
            <TabsTrigger value="pessoas" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Users className="h-3.5 w-3.5" /> Pessoas
            </TabsTrigger>
          </TabsList>
        </div>

        <main className="container max-w-3xl py-4">
          <TabsContent value="dashboard"><DashboardTab obraId={id!} /></TabsContent>
          <TabsContent value="produtos"><ProdutosTab obraId={id!} /></TabsContent>
          <TabsContent value="ferramentas"><FerramentasTab obraId={id!} /></TabsContent>
          <TabsContent value="entradas"><EntradasTab obraId={id!} /></TabsContent>
          <TabsContent value="saidas"><SaidasTab obraId={id!} /></TabsContent>
          <TabsContent value="pessoas"><PessoasTab obraId={id!} /></TabsContent>
        </main>
      </Tabs>
    </div>
  );
}
