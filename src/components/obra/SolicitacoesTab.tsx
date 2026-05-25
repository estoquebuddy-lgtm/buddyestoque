import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ShoppingCart, Clock, CheckCircle2, XCircle, FilePlus2, MessageSquare, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import SkeletonList from '@/components/SkeletonList';
import PageHeader from '@/components/PageHeader';

const emptyForm = { descricao: '', urgencia: 'Normal', solicitante_id: '', destinatario_id: '' };

export default function SolicitacoesTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<any>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [observacao, setObservacao] = useState('');

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('pessoas').select('id, nome, funcao').eq('obra_id', obraId).order('nome');
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
          solicitante:pessoas!solicitacoes_material_solicitante_id_fkey(nome),
          destinatario:pessoas!solicitacoes_material_destinatario_id_fkey(nome)
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
        solicitante_id: form.solicitante_id,
        destinatario_id: form.destinatario_id,
        descricao_materiais: form.descricao,
        urgencia: form.urgencia,
        status: 'PENDENTE'
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
    mutationFn: async ({ id, status, obs }: { id: string, status: string, obs: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .update({ status, observacao_resposta: obs })
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

  const filtered = solicitacoes.filter((s: any) => 
    s.descricao_materiais.toLowerCase().includes(search.toLowerCase()) || 
    s.solicitante?.nome?.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PENDENTE': return <Badge className="bg-warning/10 text-warning border-warning/20"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      case 'EM_ANDAMENTO': return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><ShoppingCart className="w-3 h-3 mr-1" /> Em Compra</Badge>;
      case 'ATENDIDA': return <Badge className="bg-success/10 text-success border-success/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Atendida</Badge>;
      case 'CANCELADA': return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="w-3 h-3 mr-1" /> Cancelada</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const urgenciaBadge = (urgencia: string) => {
    switch (urgencia) {
      case 'Baixa': return <span className="text-xs font-medium text-muted-foreground px-2 py-0.5 rounded-full bg-muted">Baixa</span>;
      case 'Normal': return <span className="text-xs font-medium text-blue-500 px-2 py-0.5 rounded-full bg-blue-500/10">Normal</span>;
      case 'Alta': return <span className="text-xs font-medium text-warning px-2 py-0.5 rounded-full bg-warning/10">Alta</span>;
      case 'Urgente': return <span className="text-xs font-bold text-destructive px-2 py-0.5 rounded-full bg-destructive/10 animate-pulse">Urgente</span>;
      default: return null;
    }
  };

  const openStatusDialog = (solicitacao: any) => {
    setSelectedSolicitacao(solicitacao);
    setNewStatus(solicitacao.status);
    setObservacao(solicitacao.observacao_resposta || '');
    setStatusDialogOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <PageHeader 
            title="Solicitações" 
            count={solicitacoes.length} 
            search={search} 
            onSearchChange={setSearch} 
            searchPlaceholder="Buscar por material ou solicitante..." 
            actionLabel="Solicitar Material" 
            onAction={() => { setForm(emptyForm); setDialogOpen(true); }} 
          />
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Pendentes</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-warning leading-none">{solicitacoes.filter((s: any) => s.status === 'PENDENTE').length}</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Em Compra</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-blue-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'EM_ANDAMENTO').length}</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Atendidas</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-success leading-none">{solicitacoes.filter((s: any) => s.status === 'ATENDIDA').length}</span>
              </div>
           </div>
           
           <Button variant="outline" className="h-auto py-4 md:py-5 bg-primary/10 border-primary/20 text-primary flex flex-col items-center justify-center gap-1 hover:bg-primary/20 border-none transition-all hover:scale-105" onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
              <FilePlus2 className="h-5 w-5 opacity-90" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-center">Novo Pedido</span>
           </Button>
        </div>
      </div>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-white rounded-3xl border border-muted/50 border-dashed">
           <ShoppingCart className="h-12 w-12 opacity-20 mb-4" />
           <p className="text-sm font-medium">{search ? 'Nenhuma solicitação encontrada' : 'Nenhuma solicitação de material registrada'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s: any) => (
            <Card key={s.id} className="border-none shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              {s.urgencia === 'Urgente' && <div className="absolute top-0 left-0 w-1 h-full bg-destructive"></div>}
              {s.status === 'PENDENTE' && <div className="absolute top-0 left-0 w-1 h-full bg-warning"></div>}
              {s.status === 'ATENDIDA' && <div className="absolute top-0 left-0 w-1 h-full bg-success"></div>}
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    {statusBadge(s.status)}
                    {urgenciaBadge(s.urgencia)}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {new Date(s.data_solicitacao).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                
                <div className="mb-4">
                  <p className="text-sm text-foreground whitespace-pre-wrap font-medium">{s.descricao_materiais}</p>
                </div>

                <div className="bg-muted/30 rounded-xl p-3 space-y-2 mb-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Solicitado por:</span>
                    <span className="font-bold truncate max-w-[120px]">{s.solicitante?.nome || 'Desconhecido'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Para:</span>
                    <span className="font-bold truncate max-w-[120px]">{s.destinatario?.nome || 'Desconhecido'}</span>
                  </div>
                </div>

                {s.observacao_resposta && (
                  <div className="bg-primary/5 rounded-xl p-3 mb-4 border border-primary/10">
                    <p className="text-[10px] uppercase font-bold text-primary mb-1 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Resposta
                    </p>
                    <p className="text-xs text-foreground italic">{s.observacao_resposta}</p>
                  </div>
                )}

                <Button 
                  variant="secondary" 
                  className="w-full text-xs font-bold" 
                  onClick={() => openStatusDialog(s)}
                >
                  Atualizar Status
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Nova Solicitação Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4 pt-4">
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quem está solicitando? *</label>
              <Select value={form.solicitante_id} onValueChange={v => setForm(f => ({ ...f, solicitante_id: v }))}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o almoxarife/responsável" /></SelectTrigger>
                <SelectContent>
                  {pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome} {p.funcao ? `(${p.funcao})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Para quem enviar? *</label>
              <Select value={form.destinatario_id} onValueChange={v => setForm(f => ({ ...f, destinatario_id: v }))}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o engenheiro/comprador" /></SelectTrigger>
                <SelectContent>
                  {pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
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
              <Textarea 
                placeholder="Ex: 5 sacos de cimento Votorantim, 10 metros de areia fina..." 
                value={form.descricao} 
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} 
                className="min-h-[120px] resize-none"
                required
              />
            </div>

            <Button type="submit" className="w-full h-12 text-sm font-bold" disabled={save.isPending || !form.solicitante_id || !form.destinatario_id || !form.descricao.trim()}>
              {save.isPending ? 'Enviando...' : 'Enviar Solicitação'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Atualizar Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atualizar Solicitação</DialogTitle>
          </DialogHeader>
          {selectedSolicitacao && (
            <div className="space-y-4 pt-4">
              <div className="bg-muted/30 p-4 rounded-xl text-sm mb-4">
                <p className="font-medium">{selectedSolicitacao.descricao_materiais}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Novo Status</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="EM_ANDAMENTO">Em Compra (Andamento)</SelectItem>
                    <SelectItem value="ATENDIDA">Atendida (Entregue)</SelectItem>
                    <SelectItem value="CANCELADA">Cancelada</SelectItem>
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
    </div>
  );
}
