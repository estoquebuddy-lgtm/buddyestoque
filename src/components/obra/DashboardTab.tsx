import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowUpFromLine, Wrench, Package, TrendingDown, DollarSign } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { motion } from 'framer-motion';
import { SkeletonCards } from '@/components/SkeletonList';
import SkeletonList from '@/components/SkeletonList';
import ImageThumbnail from '@/components/ImageThumbnail';

export default function DashboardTab({ obraId }: { obraId: string }) {
  const { data: produtos = [], isLoading: loadingProdutos } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('produtos').select('*').eq('obra_id', obraId).order('nome');
      return data || [];
    },
  });

  const lowStock = produtos.filter((p: any) => Number(p.estoque_atual) <= Number(p.estoque_minimo));
  const zeroStock = produtos.filter((p: any) => Number(p.estoque_atual) <= 0);
  const totalProdutos = produtos.length;
  const valorTotal = produtos.reduce((acc: number, p: any) => acc + (Number(p.estoque_atual) * Number(p.custo_unitario || 0)), 0);

  const { data: todaySaidas = [] } = useQuery({
    queryKey: ['today-saidas', obraId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase.from('saidas').select('*, produtos(nome)').eq('obra_id', obraId).gte('data', today);
      return data || [];
    },
  });

  const { data: ferramentasEmUso = [] } = useQuery({
    queryKey: ['ferramentas-uso', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('ferramentas').select('*, pessoas:responsavel_id(nome)').eq('obra_id', obraId).eq('estado', 'em_uso');
      return data || [];
    },
  });

  if (loadingProdutos) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <h1 className="text-xl lg:text-2xl font-display font-bold">Dashboard</h1>
        </div>
        <SkeletonCards />
        <SkeletonList count={3} />
      </div>
    );
  }

  const summaryCards = [
    { label: 'Total de Produtos', value: totalProdutos, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Estoque Baixo', value: lowStock.length, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Ferramentas em Uso', value: ferramentasEmUso.length, icon: Wrench, color: 'text-info', bg: 'bg-info/10' },
    { label: 'Valor em Estoque', value: `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'text-success', bg: 'bg-success/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="lg:hidden -ml-1" />
        <h1 className="text-xl lg:text-2xl font-display font-bold">Dashboard</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className={`h-10 w-10 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                </div>
                <p className="text-2xl font-display font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Low Stock */}
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Produtos com Estoque Baixo
            </h3>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Todos os produtos estão com estoque adequado ✓</p>
            ) : (
              <div className="divide-y divide-border">
                {lowStock.slice(0, 6).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <ImageThumbnail src={p.foto_url} alt={p.nome} type="produto" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.nome}</p>
                      {p.categoria && <p className="text-xs text-muted-foreground">{p.categoria}</p>}
                    </div>
                    <Badge variant={Number(p.estoque_atual) <= 0 ? 'destructive' : 'secondary'} className={Number(p.estoque_atual) <= 0 ? '' : 'bg-warning/10 text-warning border-warning/20'}>
                      {Number(p.estoque_atual) <= 0 ? 'Crítico' : 'Baixo'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tools in Use */}
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <Wrench className="h-4 w-4 text-info" />
              Ferramentas em Uso
            </h3>
            {ferramentasEmUso.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma ferramenta em uso</p>
            ) : (
              <div className="divide-y divide-border">
                {ferramentasEmUso.slice(0, 6).map((f: any) => (
                  <div key={f.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <ImageThumbnail src={f.foto_url} alt={f.nome} type="ferramenta" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.nome}</p>
                      <p className="text-xs text-muted-foreground">{f.pessoas?.nome || 'Sem responsável'}</p>
                    </div>
                    <Badge className="bg-warning/10 text-warning border-warning/20">Em uso</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's Exits */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <ArrowUpFromLine className="h-4 w-4 text-destructive" />
            Saídas de Hoje
            <Badge variant="secondary" className="ml-auto">{todaySaidas.length}</Badge>
          </h3>
          {todaySaidas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma saída registrada hoje</p>
          ) : (
            <div className="divide-y divide-border">
              {todaySaidas.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span className="text-sm truncate">{s.produtos?.nome}</span>
                  <span className="text-sm font-bold text-destructive">-{Number(s.quantidade)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
