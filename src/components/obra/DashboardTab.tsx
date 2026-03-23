import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, ArrowUpFromLine, Wrench, Package, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import SkeletonList from '@/components/SkeletonList';

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

  const { data: todaySaidas = [] } = useQuery({
    queryKey: ['today-saidas', obraId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('saidas')
        .select('*, produtos(nome)')
        .eq('obra_id', obraId)
        .gte('data', today);
      return data || [];
    },
  });

  const { data: ferramentasEmUso = [] } = useQuery({
    queryKey: ['ferramentas-uso', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ferramentas')
        .select('*, pessoas:responsavel_id(nome)')
        .eq('obra_id', obraId)
        .eq('estado', 'em_uso');
      return data || [];
    },
  });

  if (loadingProdutos) return <SkeletonList count={3} />;

  const cards = [
    { label: 'Total Produtos', value: totalProdutos, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Estoque Baixo', value: lowStock.length, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Sem Estoque', value: zeroStock.length, icon: TrendingDown, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Ferramentas em Uso', value: ferramentasEmUso.length, icon: Wrench, color: 'text-info', bg: 'bg-info/10' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="border-none shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <Card className="border-warning/30 shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-warning mb-3">
              <AlertTriangle className="h-4 w-4" /> Produtos com Estoque Baixo
            </h3>
            <div className="space-y-2">
              {lowStock.slice(0, 5).map((p: any) => (
                <div key={p.id} className="flex justify-between items-center text-sm">
                  <span className="truncate">{p.nome}</span>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${Number(p.estoque_atual) <= 0 ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                    {Number(p.estoque_atual)} {p.unidade}
                  </span>
                </div>
              ))}
              {lowStock.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">+{lowStock.length - 5} itens</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Exits */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <ArrowUpFromLine className="h-4 w-4 text-primary" /> Saídas de Hoje ({todaySaidas.length})
          </h3>
          {todaySaidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma saída registrada hoje</p>
          ) : (
            <div className="space-y-2">
              {todaySaidas.map((s: any) => (
                <div key={s.id} className="flex justify-between items-center text-sm">
                  <span className="truncate">{s.produtos?.nome}</span>
                  <span className="font-semibold text-destructive">-{Number(s.quantidade)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tools in Use */}
      {ferramentasEmUso.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Wrench className="h-4 w-4 text-info" /> Ferramentas em Uso
            </h3>
            <div className="space-y-2">
              {ferramentasEmUso.map((f: any) => (
                <div key={f.id} className="flex justify-between items-center text-sm">
                  <span className="truncate">{f.nome}</span>
                  <span className="text-xs text-muted-foreground">{f.pessoas?.nome || '—'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
