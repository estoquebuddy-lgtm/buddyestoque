import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowUpFromLine, ArrowDownToLine, Wrench, Package, LayoutDashboard, Bell, Clock, ShieldAlert, ChevronDown, ChevronUp, MessageSquarePlus, FileText, Share2, Copy, Check, ExternalLink, Eye, Input as LucideInput } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonCards } from '@/components/SkeletonList';
import SkeletonList from '@/components/SkeletonList';
import ImageThumbnail from '@/components/ImageThumbnail';
import { startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function DashboardTab({ obraId, onTabChange }: { obraId: string; onTabChange?: (tab: string) => void }) {
  const { user } = useAuth();
  const { isAdmin } = useProfile();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // ─── Produtos ────────────────────────────────────────────
  const { data: produtos = [], isLoading: loadingProdutos } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('produtos')
          .select('*')
          .eq('obra_id', obraId)
          .order('nome')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        
        allData = [...allData, ...(data || [])];
        
        if (!data || data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
      return allData;
    },
  });

  // Only consider items with a defined minimum (> 0) as low stock, exclude [FERRAMENTA] virtual products
  const produtosReais = produtos.filter((p: any) => !p.nome?.startsWith('[FERRAMENTA]'));
  const lowStock = produtosReais
    .filter((p: any) => Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) <= Number(p.estoque_minimo));
  const totalProdutos = produtosReais.length;

  // ─── Saídas / Entradas de hoje ────────────────────────────
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

  // ─── Ferramentas em uso ──────────────────────────────────
  const { data: ferramentasEmUso = [] } = useQuery({
    queryKey: ['ferramentas-uso', obraId],
    queryFn: async () => {
      const { data: ferramentasData, error } = await supabase.from('ferramentas').select('*').eq('obra_id', obraId).eq('estado', 'em_uso');
      if (error) return [];
      if (!ferramentasData || ferramentasData.length === 0) return [];
      const { data: pessoasData } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId);
      const pessoasMap = new Map((pessoasData || []).map((p: any) => [p.id, p.nome]));
      return ferramentasData.map((f: any) => ({
        ...f,
        pessoas: f.responsavel_id ? { nome: pessoasMap.get(f.responsavel_id) || null } : null,
      }));
    },
  });

  // ─── Solicitações pendentes para o painel de notificações ──
  const formatUserDisplay = (userObj: any) => {
    if (!userObj) return 'Desconhecido';
    if (userObj.apelido) return userObj.apelido;
    const email = userObj.email;
    if (!email) return 'Desconhecido';
    const name = email.split('@')[0].split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  // Busca solicitações pendentes
  // Admin: todas da obra | Usuário comum: apenas as dele
  const { data: solicitacoesPendentes = [] } = useQuery({
    queryKey: ['solicitacoes-pendentes-dashboard', obraId, isAdmin, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      let query = supabase
        .from('solicitacoes_material' as any)
        .select(`
          *,
          solicitante:profiles!solicitacoes_material_solicitante_id_fkey(email, apelido),
          destinatario:profiles!solicitacoes_material_destinatario_id_fkey(email, apelido)
        `)
        .eq('obra_id', obraId)
        .eq('status', 'SOLICITADO')
        .order('data_solicitacao', { ascending: false });

      // Se NÃO é admin, filtra só as endereçadas a mim
      if (!isAdmin) {
        query = query.eq('destinatario_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!obraId && !!user?.id,
  });

  // ─── Loading ──────────────────────────────────────────────
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
  ];

  const urgenciaColor = (u: string) => {
    switch (u) {
      case 'Urgente': return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'Alta': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'Normal': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      default: return 'bg-muted/30 text-muted-foreground border-muted/30';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Header with Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-[#0e1629] to-slate-800 flex items-center justify-center shadow-xl shadow-slate-900/10 shrink-0">
             <LayoutDashboard className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-black tracking-tight text-slate-800">Controle de Estoque e compras</h1>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">Buddy Construtora</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShareModalOpen(true)}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs h-9 px-3.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all shrink-0"
          >
            <Share2 className="h-4 w-4" />
            <span>Link do Cliente</span>
          </Button>

          <SidebarTrigger className="lg:hidden h-10 w-10 border shadow-sm" />
          <div className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] font-black text-emerald-600 flex items-center gap-2 tracking-wider">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            TEMPO REAL
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTabChange?.('solicitacoes')}
            className="lg:hidden h-8 px-2.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white hover:text-white border-none rounded-xl flex items-center gap-1 shadow-sm active:scale-95 transition-all shrink-0"
          >
            <FileText className="h-3.5 w-3.5" />
            Solicitações
          </Button>
        </div>
      </div>

      {/* ═══════ PAINEL DE SOLICITAÇÕES PENDENTES ═══════ */}
      {solicitacoesPendentes.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="w-full flex items-center gap-3 bg-warning/10 border border-warning/25 rounded-2xl px-5 py-3.5 hover:bg-warning/15 transition-all duration-200 group"
          >
            <span className="relative">
              <Bell className="h-5 w-5 text-warning" />
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center leading-none px-1">
                {solicitacoesPendentes.length}
              </span>
            </span>
            <span className="flex-1 text-left">
              <span className="text-sm font-bold text-warning">
                {solicitacoesPendentes.length === 1
                  ? '1 solicitação pendente'
                  : `${solicitacoesPendentes.length} solicitações pendentes`}
                {isAdmin ? ' nesta obra' : ' para você'}
              </span>
              <span className="block text-xs text-warning/60 font-normal">
                {isAdmin ? 'Você vê todas como administrador' : 'Clique para ver os detalhes'}
              </span>
            </span>
            {notifOpen
              ? <ChevronUp className="h-4 w-4 text-warning/70 group-hover:text-warning transition-colors" />
              : <ChevronDown className="h-4 w-4 text-warning/70 group-hover:text-warning transition-colors" />
            }
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-2 pb-2">
                  {solicitacoesPendentes.map((s: any) => (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
                      onClick={() => {
                        if (onTabChange) {
                          onTabChange('solicitacoes');
                        }
                        navigate(`/obra/${obraId}?tab=solicitacoes`);
                      }}
                    >
                      <div className="mt-0.5 shrink-0">
                        <ShieldAlert className={`h-4 w-4 ${
                          s.urgencia === 'Urgente' ? 'text-red-400'
                          : s.urgencia === 'Alta' ? 'text-orange-400'
                          : 'text-blue-400'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-bold text-foreground">
                            {formatUserDisplay(s.solicitante)}
                          </span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-sm font-medium text-foreground">
                            {formatUserDisplay(s.destinatario)}
                          </span>
                          <Badge className={`text-[10px] font-bold border ${urgenciaColor(s.urgencia)}`}>
                            {s.urgencia}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                          {s.descricao_materiais}
                        </p>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {new Date(s.data_solicitacao).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Hero Stats — 3 cards equidistantes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {summaryCards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            whileHover={{ y: -4 }}
          >
            <Card className="border border-slate-100 dark:border-slate-800/40 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.06)] transition-all duration-300 overflow-hidden group rounded-2xl bg-card">
              <CardContent className="p-6 relative">
                <div className={`absolute -right-5 -top-5 h-28 w-28 rounded-full ${c.bg} opacity-30 group-hover:scale-125 transition-transform duration-500 blur-xl`} />
                <div className="relative z-10">
                  <div className={`h-11 w-11 rounded-xl ${c.bg} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300`}>
                    <c.icon className={`h-5 w-5 ${c.color}`} />
                  </div>
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{c.label}</h4>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-display font-black tabular-nums tracking-tight text-slate-800 dark:text-slate-100">{c.value}</p>
                    {c.label === 'Estoque Baixo' && Number(c.value) > 0 && (
                      <span className="text-[9px] bg-red-500/10 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">ALERTA</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Low Stock */}
        <Card className="border border-slate-100 dark:border-slate-800/40 shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl bg-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Produtos com Estoque Baixo
            </h3>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Todos os produtos estão com estoque adequado ✓</p>
            ) : (
              <div className="space-y-1.5">
                {lowStock.slice(0, 6).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all duration-200 group">
                    <ImageThumbnail src={p.foto_url} alt={p.nome} type="produto" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-primary transition-colors">{p.nome}</p>
                      {p.categoria && <p className="text-xs text-muted-foreground mt-0.5">{p.categoria}</p>}
                    </div>
                    <Badge
                      variant={Number(p.estoque_atual) <= 0 && Number(p.estoque_minimo) > 0 ? 'destructive' : 'secondary'}
                      className={Number(p.estoque_atual) <= 0 && Number(p.estoque_minimo) > 0 ? '' : 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20'}
                    >
                      {Number(p.estoque_atual) <= 0 ? 'Crítico' : 'Baixo'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tools in Use */}
        <Card className="border border-slate-100 dark:border-slate-800/40 shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl bg-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
              <Wrench className="h-4 w-4 text-info" />
              Ferramentas em Uso
            </h3>
            {ferramentasEmUso.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma ferramenta em uso</p>
            ) : (
              <div className="space-y-1.5">
                {ferramentasEmUso.slice(0, 6).map((f: any) => (
                  <div key={f.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all duration-200 group">
                    <ImageThumbnail src={f.foto_url} alt={f.nome} type="ferramenta" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-primary transition-colors">{f.nome}</p>
                        {f.codigo && <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">#{f.codigo}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">{f.pessoas?.nome || 'Sem responsável'}</p>
                    </div>
                    <Badge className="bg-warning/10 text-warning border-warning/20 hover:bg-warning/20">Em uso</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Entries */}
        <Card className="border border-slate-100 dark:border-slate-800/40 shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl bg-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
              <ArrowDownToLine className="h-4 w-4 text-primary" />
              Entradas de Hoje
              <Badge variant="secondary" className="ml-auto bg-primary/10 text-primary hover:bg-primary/20 border-none">{todayEntradas.length}</Badge>
            </h3>
            {todayEntradas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma entrada registrada hoje</p>
            ) : (
              <div className="space-y-1">
                {todayEntradas.slice(0, 8).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all duration-200">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{e.produtos?.nome}</span>
                    <span className="text-sm font-bold text-primary">+{Number(e.quantidade)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Exits */}
        <Card className="border border-slate-100 dark:border-slate-800/40 shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl bg-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
              <ArrowUpFromLine className="h-4 w-4 text-destructive" />
              Saídas de Hoje
              <Badge variant="secondary" className="ml-auto bg-destructive/10 text-destructive hover:bg-destructive/20 border-none">{todaySaidas.length}</Badge>
            </h3>
            {todaySaidas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma saída registrada hoje</p>
            ) : (
              <div className="space-y-1">
                {todaySaidas.slice(0, 8).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all duration-200">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{s.produtos?.nome}</span>
                    <span className="text-sm font-bold text-destructive">-{Number(s.quantidade)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════ MODAL DO GERADOR DE LINK DO CLIENTE ═══════ */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="bg-[#0f172a] border border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-display font-bold text-white flex items-center gap-2">
              <Share2 className="h-5 w-5 text-amber-400" />
              Link de Visualização do Cliente
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Gere um link de leitura para o dono da obra ou clientes acompanharem os custos e lançamentos sem permissão de edição.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Link Público de Acesso:</label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/relatorio-cliente?obraId=${obraId}`}
                  className="bg-slate-900 border-slate-700 text-amber-400 text-xs h-10 font-mono"
                />
                <Button
                  onClick={() => {
                    const link = `${window.location.origin}/relatorio-cliente?obraId=${obraId}`;
                    navigator.clipboard.writeText(link);
                    setCopied(true);
                    toast.success('Link copiado!');
                    setTimeout(() => setCopied(false), 3000);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold h-10 px-3 shrink-0"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-white flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-amber-400" /> Somente Leitura
              </p>
              <p>
                O cliente terá acesso ao Orçamento Total, Realizado, Saldo, Não Previstos, Gráfico de Evolução Físico-Financeira e Lista Filtrável de Lançamentos.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareModalOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              Fechar
            </Button>
            <Button
              size="sm"
              onClick={() => window.open(`/relatorio-cliente?obraId=${obraId}`, '_blank')}
              className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs gap-1.5"
            >
              <ExternalLink className="h-4 w-4 text-amber-400" />
              Abrir Visualização
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
