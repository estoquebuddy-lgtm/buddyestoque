import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowUpFromLine, ArrowDownToLine, Wrench, Package, TrendingDown, DollarSign, LayoutDashboard, History, User } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { motion } from 'framer-motion';
import { SkeletonCards } from '@/components/SkeletonList';
import SkeletonList from '@/components/SkeletonList';
import ImageThumbnail from '@/components/ImageThumbnail';
import { startOfDay, endOfDay } from 'date-fns';

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
      const start = startOfDay(new Date()).toISOString();
      const end = endOfDay(new Date()).toISOString();
      const { data } = await supabase.from('saidas').select('*, produtos(nome)').eq('obra_id', obraId).gte('data', start).lte('data', end);
      return data || [];
    },
  });

  const { data: todayEntradas = [] } = useQuery({
    queryKey: ['today-entradas', obraId],
    queryFn: async () => {
      const start = startOfDay(new Date()).toISOString();
      const end = endOfDay(new Date()).toISOString();
      const { data } = await supabase.from('entradas').select('*, produtos(nome)').eq('obra_id', obraId).gte('data', start).lte('data', end);
      return data || [];
    },
  });

  const { data: ferramentasEmUso = [] } = useQuery({
    queryKey: ['ferramentas-uso', obraId],
    queryFn: async () => {
      const { data: ferramentasData, error } = await supabase.from('ferramentas').select('*').eq('obra_id', obraId).eq('estado', 'em_uso');
      
      if (error) {
        console.error('Error fetching ferramentas:', error);
        return [];
      }
      
      if (!ferramentasData || ferramentasData.length === 0) return [];
      
      const { data: pessoasData } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId);
      const pessoasMap = new Map((pessoasData || []).map((p: any) => [p.id, p.nome]));
      
      return ferramentasData.map((f: any) => ({
        ...f,
        pessoas: f.responsavel_id ? { nome: pessoasMap.get(f.responsavel_id) || null } : null,
      }));
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['logs-atividades', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('logs_atividades' as any).select('*').eq('obra_id', obraId).order('data', { ascending: false }).limit(6);
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
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Header with Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
             <LayoutDashboard className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">Controle de Estoque</h1>
            <p className="text-sm text-muted-foreground font-medium">Buddy Construtora</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SidebarTrigger className="lg:hidden h-10 w-10 border shadow-sm" />
          <div className="px-4 py-2 bg-muted/50 rounded-xl border text-[10px] font-bold text-muted-foreground flex items-center gap-2 tracking-wider">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            TEMPO REAL
          </div>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {summaryCards.map((c, i) => (
          <motion.div 
            key={c.label} 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: i * 0.1, duration: 0.4 }}
            whileHover={{ y: -4 }}
          >
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 overflow-hidden group">
              <CardContent className="p-6 relative">
                 {/* Design Element */}
                <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full ${c.bg} opacity-10 group-hover:scale-110 transition-transform duration-500`} />
                
                <div className="relative z-10">
                  <div className={`h-12 w-12 rounded-2xl ${c.bg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <c.icon className={`h-6 w-6 ${c.color}`} />
                  </div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{c.label}</h4>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-display font-bold tabular-nums tracking-tight">{c.value}</p>
                    {c.label === 'Estoque Baixo' && Number(c.value) > 0 && <span className="text-[10px] text-destructive font-bold">ALERTA</span>}
                  </div>
                </div>
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
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold truncate">{f.nome}</p>
                        {f.codigo && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">#{f.codigo}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">{f.pessoas?.nome || 'Sem responsável'}</p>
                    </div>
                    <Badge className="bg-warning/10 text-warning border-warning/20">Em uso</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Entries */}
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <ArrowDownToLine className="h-4 w-4 text-primary" />
              Entradas de Hoje
              <Badge variant="secondary" className="ml-auto bg-primary/10 text-primary hover:bg-primary/20 border-none">{todayEntradas.length}</Badge>
            </h3>
            {todayEntradas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma entrada registrada hoje</p>
            ) : (
              <div className="divide-y divide-border">
                {todayEntradas.slice(0, 8).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <span className="text-sm truncate">{e.produtos?.nome}</span>
                    <span className="text-sm font-bold text-primary">+{Number(e.quantidade)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Exits */}
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <ArrowUpFromLine className="h-4 w-4 text-destructive" />
              Saídas de Hoje
              <Badge variant="secondary" className="ml-auto bg-destructive/10 text-destructive hover:bg-destructive/20 border-none">{todaySaidas.length}</Badge>
            </h3>
            {todaySaidas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma saída registrada hoje</p>
            ) : (
              <div className="divide-y divide-border">
                {todaySaidas.slice(0, 8).map((s: any) => (
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

      {/* Activity Logs */}
      <div className="grid grid-cols-1 gap-6">
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-primary" />
              Últimas Atividades no Sistema
            </h3>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma atividade registrada</p>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {logs.map((log: any) => (
                  <div key={log.id} className="flex gap-3 items-center p-3 bg-muted/30 rounded-xl border border-border/50 group hover:bg-muted/50 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                      <User className="h-5 w-5 text-primary/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold text-primary tracking-widest uppercase">{log.user_email?.split('@')[0] || 'Usuário'}</p>
                        <span className="text-[10px] text-muted-foreground">{new Date(log.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-xs text-foreground font-medium mt-0.5 truncate">{log.detalhes}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
