import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ShoppingCart, Clock, CheckCircle2, XCircle, FilePlus2, MessageSquare, ShieldAlert, Trash2, ChevronLeft, ChevronRight, Archive, ArchiveRestore, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import SkeletonList from '@/components/SkeletonList';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { Switch } from '@/components/ui/switch';
import { useProfile } from '@/hooks/useProfile';

const emptyForm = { descricao: '', urgencia: 'Normal', destinatario_id: '' };

const columnsList = [
  { 
    id: 'SOLICITADO', 
    label: 'SOLICITADO', 
    dot: 'bg-slate-400',
    titleColor: 'text-slate-600',
    badgeColor: 'bg-slate-200/50 text-slate-700',
    colStyle: 'border-slate-200 bg-slate-50/50',
    progressBarColor: 'bg-slate-300',
    progressPercent: 25
  },
  { 
    id: 'APROVADO', 
    label: 'APROVADO', 
    dot: 'bg-blue-500',
    titleColor: 'text-blue-600',
    badgeColor: 'bg-blue-100/60 text-blue-700',
    colStyle: 'border-blue-200 bg-blue-50/10',
    progressBarColor: 'bg-blue-500',
    progressPercent: 50
  },
  { 
    id: 'COMPRADO', 
    label: 'COMPRADO', 
    dot: 'bg-purple-500',
    titleColor: 'text-purple-600',
    badgeColor: 'bg-purple-100/60 text-purple-700',
    colStyle: 'border-purple-200 bg-purple-50/10',
    progressBarColor: 'bg-purple-500',
    progressPercent: 75
  },
  { 
    id: 'ENTREGUE', 
    label: 'CONCLUÍDO', 
    dot: 'bg-emerald-500',
    titleColor: 'text-emerald-600',
    badgeColor: 'bg-emerald-100/60 text-emerald-700',
    colStyle: 'border-emerald-500 bg-emerald-50/10',
    progressBarColor: 'bg-emerald-500',
    progressPercent: 100
  },
];

const formatUserDisplay = (userObj: any) => {
  if (!userObj) return 'Desconhecido';
  if (userObj.apelido) return userObj.apelido;
  const email = userObj.email;
  if (!email) return 'Desconhecido';
  const name = email.split('@')[0].split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
};

export default function SolicitacoesTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = useProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [observacao, setObservacao] = useState('');
  const [selectedProdutoId, setSelectedProdutoId] = useState('');
  const [selectedQtd, setSelectedQtd] = useState('');

  const { data: usuarios = [] } = useQuery({
    queryKey: ['profiles-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, approved, apelido')
        .eq('approved', true)
        .order('email');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, unidade')
        .eq('obra_id', obraId)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!obraId,
  });

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ['solicitacoes', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitacoes_material' as any)
        .select(`
          *,
          solicitante:profiles!solicitacoes_material_solicitante_id_fkey(email, apelido),
          destinatario:profiles!solicitacoes_material_destinatario_id_fkey(email, apelido)
        `)
        .eq('obra_id', obraId)
        .order('data_solicitacao', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!obraId,
  });

  useEffect(() => {
    const channel = supabase.channel('solicitacoes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_material', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        obra_id: obraId,
        solicitante_id: user?.id,
        destinatario_id: form.destinatario_id,
        descricao_materiais: form.descricao,
        urgencia: form.urgencia,
        status: 'SOLICITADO'
      };
      
      const { error } = await supabase.from('solicitacoes_material' as any).insert(payload);
      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'CADASTRAR',
        entidade: 'SOLICITACAO',
        detalhes: `Nova solicitação de material criada`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast.success('Solicitação enviada com sucesso!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, obs, currentDates }: { id: string, status: string, obs: string, currentDates?: any }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const updateData: any = { status, observacao_resposta: obs };

      if (status === 'SOLICITADO') {
        updateData.data_aprovado = null;
        updateData.data_comprado = null;
        updateData.data_entregue = null;
      } else if (status === 'APROVADO') {
        updateData.data_aprovado = currentDates?.data_aprovado || now;
        updateData.data_comprado = null;
        updateData.data_entregue = null;
      } else if (status === 'COMPRADO') {
        updateData.data_aprovado = currentDates?.data_aprovado || now;
        updateData.data_comprado = currentDates?.data_comprado || now;
        updateData.data_entregue = null;
      } else if (status === 'ENTREGUE') {
        updateData.data_aprovado = currentDates?.data_aprovado || now;
        updateData.data_comprado = currentDates?.data_comprado || now;
        updateData.data_entregue = currentDates?.data_entregue || now;
      }

      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .update(updateData)
        .eq('id', id);
        
      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EDITAR',
        entidade: 'SOLICITACAO',
        detalhes: `Status da solicitação alterado para ${status}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      setStatusDialogOpen(false);
      setSelectedSolicitacao(null);
      setObservacao('');
      toast.success('Status atualizado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSolicitacao = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .delete()
        .eq('id', id);
        
      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR',
        entidade: 'SOLICITACAO',
        detalhes: `Solicitação de material excluída`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      setDeleteId(null);
      toast.success('Solicitação excluída com sucesso!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, arquivado }: { id: string; arquivado: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .update({ arquivado } as any)
        .eq('id', id);
      
      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EDITAR',
        entidade: 'SOLICITACAO',
        detalhes: arquivado ? `Solicitação arquivada` : `Solicitação desarquivada`
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      toast.success(variables.arquivado ? 'Solicitação arquivada!' : 'Solicitação restaurada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = solicitacoes.filter((s: any) => {
    const matchesSearch = s.descricao_materiais.toLowerCase().includes(search.toLowerCase()) || 
      s.solicitante?.email?.toLowerCase().includes(search.toLowerCase());
    const matchesArchived = showArchived ? s.arquivado === true : !s.arquivado;
    return matchesSearch && matchesArchived;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'SOLICITADO': return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20"><Clock className="w-3 h-3 mr-1" /> Solicitado</Badge>;
      case 'APROVADO': return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Aprovado</Badge>;
      case 'COMPRADO': return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20"><ShoppingCart className="w-3 h-3 mr-1" /> Comprado</Badge>;
      case 'ENTREGUE': return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Entregue</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const urgenciaBadge = (urgencia: string) => {
    switch (urgencia) {
      case 'Baixa': return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2.5 py-1 rounded-lg bg-slate-100">Baixa</span>;
      case 'Normal': return <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 px-2.5 py-1 rounded-lg bg-blue-50">Normal</span>;
      case 'Alta': return <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 px-2.5 py-1 rounded-lg bg-amber-50">Alta</span>;
      case 'Urgente': return <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 animate-pulse">Urgente</span>;
      default: return null;
    }
  };

  const openStatusDialog = (solicitacao: any) => {
    setSelectedSolicitacao(solicitacao);
    setNewStatus(solicitacao.status);
    setObservacao(solicitacao.observacao_resposta || '');
    setStatusDialogOpen(true);
  };

  const renderKanban = () => {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 pb-6 items-start">
        {columnsList.map(col => {
          const items = filtered.filter((s: any) => s.status === col.id);
          return (
            <div 
              key={col.id} 
              className={`w-full border-2 rounded-[2rem] p-5 space-y-4 flex flex-col min-h-[480px] max-h-[80vh] md:max-h-[calc(100vh-250px)] overflow-y-auto ${col.colStyle}`}
            >
              {/* Header with Title and Counter */}
              <div className="flex items-center justify-between pb-3 shrink-0">
                <span className={`font-display font-black text-xs tracking-wider ${col.titleColor}`}>{col.label}</span>
                <span className={`font-display font-bold text-xs h-6 min-w-6 flex items-center justify-center px-1.5 rounded-full ${col.badgeColor}`}>
                  {items.length}
                </span>
              </div>

              {/* Card List */}
              <div className="space-y-4 flex-1 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-white/40 border border-dashed border-slate-200/80 rounded-2xl">
                    <p className="text-xs font-semibold text-slate-400">Sem solicitações</p>
                  </div>
                ) : (
                  items.map((s: any) => (
                    <Card 
                      key={s.id} 
                      onClick={() => openStatusDialog(s)}
                      className="border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200 bg-white overflow-hidden relative group cursor-pointer"
                    >
                      {/* Urgency side indicator stripe */}
                      {s.urgencia === 'Urgente' && <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>}
                      {s.urgencia === 'Alta' && <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>}
                      {s.urgencia === 'Normal' && <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>}
                      {s.urgencia === 'Baixa' && <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-300"></div>}
                      
                      <CardContent className="p-5 pl-6 space-y-3.5">
                        {/* Title and Urgency Badge */}
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-bold text-base text-slate-800 leading-normal whitespace-pre-wrap">{s.descricao_materiais}</h4>
                          {urgenciaBadge(s.urgencia)}
                        </div>

                        {/* Metadata Rows (User & Calendar) */}
                        <div className="space-y-1.5 text-[10px] text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">De: <strong className="text-slate-700 font-semibold">{formatUserDisplay(s.solicitante)}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">Para: <strong className="text-slate-700 font-semibold">{formatUserDisplay(s.destinatario)}</strong></span>
                          </div>
                        </div>

                        {/* Observação da resposta (se houver) */}
                        {s.observacao_resposta && (
                          <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-2.5 text-[10px] text-slate-600 italic">
                            <strong className="block text-slate-700 font-bold not-italic mb-0.5">Obs:</strong>
                            {s.observacao_resposta}
                          </div>
                        )}

                        {/* Card Footer Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100/60 mt-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md disabled:opacity-20 transition-all"
                              disabled={col.id === 'SOLICITADO'}
                              onClick={(e) => {
                                e.stopPropagation();
                                const prevStatus = columnsList[columnsList.findIndex(c => c.id === col.id) - 1].id;
                                updateStatus.mutate({ 
                                  id: s.id, 
                                  status: prevStatus, 
                                  obs: s.observacao_resposta || '',
                                  currentDates: {
                                    data_aprovado: s.data_aprovado,
                                    data_comprado: s.data_comprado,
                                    data_entregue: s.data_entregue
                                  }
                                });
                              }}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md disabled:opacity-20 transition-all"
                              disabled={col.id === 'ENTREGUE'}
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextStatus = columnsList[columnsList.findIndex(c => c.id === col.id) + 1].id;
                                updateStatus.mutate({ 
                                  id: s.id, 
                                  status: nextStatus, 
                                  obs: s.observacao_resposta || '',
                                  currentDates: {
                                    data_aprovado: s.data_aprovado,
                                    data_comprado: s.data_comprado,
                                    data_entregue: s.data_entregue
                                  }
                                });
                              }}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] font-bold px-1.5 rounded-md hover:bg-slate-50 text-slate-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                openStatusDialog(s);
                              }}
                            >
                              Status
                            </Button>
                            {s.status === 'ENTREGUE' && !s.arquivado && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  archiveMutation.mutate({ id: s.id, arquivado: true });
                                }}
                                title="Arquivar"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {s.arquivado && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50/5 rounded-md"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  archiveMutation.mutate({ id: s.id, arquivado: false });
                                }}
                                title="Desarquivar"
                              >
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteId(s.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <PageHeader 
            title="Solicitações" 
            count={solicitacoes.filter((s: any) => showArchived ? s.arquivado : !s.arquivado).length} 
            search={search} 
            onSearchChange={setSearch} 
            searchPlaceholder="Buscar por material ou solicitante..." 
            actionLabel="Solicitar Material" 
            onAction={() => { setForm(emptyForm); setDialogOpen(true); }} 
          >
            <div className="flex items-center gap-2 mt-2 select-none">
              <Switch 
                id="show-archived" 
                checked={showArchived} 
                onCheckedChange={setShowArchived} 
                className="data-[state=checked]:bg-primary bg-white/20 border-none"
              />
              <label htmlFor="show-archived" className="text-xs font-bold text-white/75 cursor-pointer uppercase tracking-wider">
                Ver Solicitações Arquivadas
              </label>
            </div>
          </PageHeader>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Solicitados</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-amber-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'SOLICITADO' && (showArchived ? s.arquivado : !s.arquivado)).length}</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Aprovados</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-blue-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'APROVADO' && (showArchived ? s.arquivado : !s.arquivado)).length}</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Comprados</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-purple-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'COMPRADO' && (showArchived ? s.arquivado : !s.arquivado)).length}</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Entregues</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-emerald-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'ENTREGUE' && (showArchived ? s.arquivado : !s.arquivado)).length}</span>
              </div>
           </div>
           
           <Button variant="outline" className="h-auto py-4 md:py-0 col-span-2 md:col-span-1 bg-primary/10 border-primary/20 text-primary flex flex-col items-center justify-center gap-1 hover:bg-primary/20 border-none transition-all hover:scale-105" onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
              <FilePlus2 className="h-5 w-5 opacity-90" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-center">Novo Pedido</span>
           </Button>
         </div>
      </div>

      {isLoading ? <SkeletonList /> : renderKanban()}

      {/* Nova Solicitação Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4 pt-4">
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Para quem enviar? *</label>
              <Select value={form.destinatario_id} onValueChange={v => setForm(f => ({ ...f, destinatario_id: v }))}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o destinatário" /></SelectTrigger>
                <SelectContent>
                  {usuarios.map((u: any) => <SelectItem key={u.id} value={u.id}>{formatUserDisplay(u)} ({u.email})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                Grau de Urgência
              </label>
              <Select value={form.urgencia} onValueChange={v => setForm(f => ({ ...f, urgencia: v }))}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Urgência" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixa">Baixa (Pode esperar)</SelectItem>
                  <SelectItem value="Normal">Normal (Rotina)</SelectItem>
                  <SelectItem value="Alta">Alta (Precisa logo)</SelectItem>
                  <SelectItem value="Urgente">Urgente (Obra parada)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Materiais Necessários *</label>
              
              <div className="flex gap-2">
                <Select value={selectedProdutoId} onValueChange={setSelectedProdutoId}>
                  <SelectTrigger className="flex-1 h-11"><SelectValue placeholder="Puxar do estoque..." /></SelectTrigger>
                  <SelectContent>
                    {produtos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input 
                  type="number" 
                  placeholder="Qtd" 
                  className="w-20 h-11" 
                  value={selectedQtd} 
                  onChange={e => setSelectedQtd(e.target.value)} 
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  className="h-11 px-4 font-bold"
                  onClick={() => {
                    const p = produtos.find((x: any) => x.id === selectedProdutoId);
                    if (p && selectedQtd) {
                      const linha = `${selectedQtd} ${p.unidade} - ${p.nome}`;
                      setForm(f => ({ ...f, descricao: f.descricao ? f.descricao + '\n' + linha : linha }));
                      setSelectedProdutoId('');
                      setSelectedQtd('');
                    }
                  }}
                >
                  Adicionar
                </Button>
              </div>

              <Textarea 
                placeholder="Ex: 5 sacos de cimento... (Digite livremente ou adicione usando o estoque acima)" 
                value={form.descricao} 
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} 
                className="min-h-[120px] resize-none mt-2"
                required
              />
            </div>

            <Button type="submit" className="w-full h-12 text-sm font-bold" disabled={save.isPending || !user?.id || !form.destinatario_id || !form.descricao.trim()}>
              {save.isPending ? 'Enviando...' : 'Enviar Solicitação'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Atualizar Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da Solicitação</DialogTitle>
          </DialogHeader>
          {selectedSolicitacao && (
            <div className="space-y-4 pt-4">
              <div className="bg-muted/30 p-4 rounded-xl text-sm mb-4">
                <p className="font-bold text-base whitespace-pre-wrap">{selectedSolicitacao.descricao_materiais}</p>
                <div className="flex flex-col gap-1 mt-3 pt-3 border-t text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 shrink-0" /> De: <strong>{formatUserDisplay(selectedSolicitacao.solicitante)}</strong></span>
                  <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 shrink-0" /> Para: <strong>{formatUserDisplay(selectedSolicitacao.destinatario)}</strong></span>
                </div>
              </div>

              {/* Histórico na Modal */}
              <div className="space-y-2 pb-4 border-b">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Histórico de Andamento</label>
                <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> Solicitado</span>
                    <span className="font-medium text-slate-700">{new Date(selectedSolicitacao.data_solicitacao).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {selectedSolicitacao.data_aprovado && (
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Aprovado</span>
                      <span className="font-medium text-slate-700">{new Date(selectedSolicitacao.data_aprovado).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                  {selectedSolicitacao.data_comprado && (
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5 text-purple-400" /> Comprado</span>
                      <span className="font-medium text-slate-700">{new Date(selectedSolicitacao.data_comprado).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                  {selectedSolicitacao.data_entregue && (
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Concluído</span>
                      <span className="font-medium text-slate-700">{new Date(selectedSolicitacao.data_entregue).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Novo Status</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOLICITADO">Solicitado</SelectItem>
                    <SelectItem value="APROVADO">Aprovado</SelectItem>
                    <SelectItem value="COMPRADO">Comprado</SelectItem>
                    <SelectItem value="ENTREGUE">Entregue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resposta / Observação (Opcional)</label>
                <Textarea 
                  placeholder="Ex: Material comprado, previsão de chegada na terça-feira..." 
                  value={observacao} 
                  onChange={e => setObservacao(e.target.value)} 
                  className="min-h-[100px] resize-none"
                />
              </div>

              <Button 
                onClick={() => updateStatus.mutate({ id: selectedSolicitacao.id, status: newStatus, obs: observacao })} 
                className="w-full h-12 text-sm font-bold" 
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar Exclusão Dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir Solicitação"
        description="Tem certeza de que deseja excluir esta solicitação de material? Esta ação não poderá ser desfeita."
        onConfirm={() => {
          if (deleteId) {
            deleteSolicitacao.mutate(deleteId);
          }
        }}
        loading={deleteSolicitacao.isPending}
      />
    </div>
  );
}
