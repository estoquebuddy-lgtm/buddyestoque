import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Hand, RotateCcw, History, ArrowUpFromLine } from 'lucide-react';
import { toast } from 'sonner';
import ImageThumbnail from '@/components/ImageThumbnail';
import ImageUpload from '@/components/ImageUpload';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { motion } from 'framer-motion';

const FERRAMENTA_CATEGORIES = ['Ferramentas Manuais', 'Ferramentas Elétricas', 'Equipamentos de Proteção (EPI)', 'Equipamentos de Medição', 'OUTROS'];
const emptyForm = { nome: '', codigo: '', estado: 'disponivel', foto_url: '', observacoes: '', categoria: '' };

export default function FerramentasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [retirarOpen, setRetirarOpen] = useState(false);
  const [retirarPessoaId, setRetirarPessoaId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => { const { data } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId).order('nome'); return data || []; },
  });

  const { data: ferramentas = [], isLoading } = useQuery({
    queryKey: ['ferramentas', obraId, pessoas],
    queryFn: async () => {
      const { data, error } = await supabase.from('ferramentas').select('*').eq('obra_id', obraId).order('nome');
      if (error) throw error;
      const pessoasMap = new Map(pessoas.map((p: any) => [p.id, p.nome]));
      return (data || []).map((f: any) => {
        const catMatch = f.observacoes?.match(/\[CAT:(.*?)\]/);
        const categoria = catMatch ? catMatch[1] : null;
        const cleanObs = f.observacoes?.replace(/\[CAT:.*?\]/, '').trim() || f.observacoes;
        return {
          ...f,
          categoria,
          observacoes: cleanObs,
          pessoas: f.responsavel_id ? { nome: pessoasMap.get(f.responsavel_id) || null } : null,
        };
      });
    },
    enabled: !!obraId,
  });

  const { data: historico = [] } = useQuery({
    queryKey: ['historico-ferramentas', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('historico_ferramentas' as any).select('*, ferramentas(nome), pessoas(nome)').eq('obra_id', obraId).order('data', { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase.channel('ferramentas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ferramentas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // Workaround: Store category in observations to avoid DB schema errors if column is missing
      const payload: any = { 
        obra_id: obraId, 
        nome: form.nome, 
        codigo: form.codigo || null, 
        estado: form.estado, 
        foto_url: form.foto_url || null, 
        observacoes: `[CAT:${form.categoria}] ${form.observacoes || ''}`.trim()
      };
      
      let res;
      if (editingId) { res = await supabase.from('ferramentas').update(payload).eq('id', editingId); }
      else { res = await supabase.from('ferramentas').insert(payload); }
      
      if (res.error) throw res.error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: editingId ? 'EDITAR' : 'CADASTRAR',
        entidade: 'FERRAMENTA',
        detalhes: `${editingId ? 'Editou' : 'Cadastrou'} a ferramenta: ${form.nome}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDialogOpen(false); setEditingId(null); setForm(emptyForm); toast.success(editingId ? 'Ferramenta atualizada!' : 'Ferramenta adicionada!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { 
      const { data: { user } } = await supabase.auth.getUser();
      const tool = ferramentas.find(f => f.id === id);
      const { error } = await supabase.from('ferramentas').delete().eq('id', id); 
      if (error) throw error; 

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR',
        entidade: 'FERRAMENTA',
        detalhes: `Excluiu a ferramenta: ${tool?.nome || id}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDeleteId(null); toast.success('Ferramenta excluída!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const retirar = useMutation({
    mutationFn: async (id: string) => {
      const { error: updateError } = await supabase.from('ferramentas').update({ estado: 'em_uso', responsavel_id: retirarPessoaId || null, data_retirada: new Date().toISOString(), data_devolucao: null }).eq('id', id);
      if (updateError) throw updateError;
      
      const { error: histError } = await supabase.from('historico_ferramentas' as any).insert({
          ferramenta_id: id,
          obra_id: obraId,
          pessoa_id: retirarPessoaId || null,
          tipo: 'retirada',
          data: new Date().toISOString()
      });
      if (histError) console.error('Error saving history:', histError);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); queryClient.invalidateQueries({ queryKey: ['historico-ferramentas', obraId] }); setRetirarOpen(false); setSelectedTool(null); setRetirarPessoaId(''); toast.success('Ferramenta retirada!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const devolver = useMutation({
    mutationFn: async (id: string) => {
      const { error: updateError } = await supabase.from('ferramentas').update({ estado: 'disponivel', responsavel_id: null, data_devolucao: new Date().toISOString() }).eq('id', id);
      if (updateError) throw updateError;

      const { error: histError } = await supabase.from('historico_ferramentas' as any).insert({
        ferramenta_id: id,
        obra_id: obraId,
        pessoa_id: selectedTool?.responsavel_id || null,
        tipo: 'devolucao',
        data: new Date().toISOString()
      });
      if (histError) console.error('Error saving history:', histError);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); queryClient.invalidateQueries({ queryKey: ['historico-ferramentas', obraId] }); setSelectedTool(null); toast.success('Ferramenta devolvida!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (f: any) => {
    setEditingId(f.id);
    setForm({ nome: f.nome, codigo: f.codigo || '', estado: f.estado, foto_url: f.foto_url || '', observacoes: f.observacoes || '', categoria: f.categoria || '' });
    setDialogOpen(true);
  };

  const filtered = ferramentas.filter((f: any) => f.nome.toLowerCase().includes(search.toLowerCase()) || (f.codigo && f.codigo.toLowerCase().includes(search.toLowerCase())));

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case 'disponivel': return <Badge className="bg-success/10 text-success border-success/20">Disponível</Badge>;
      case 'em_uso': return <Badge className="bg-warning/10 text-warning border-warning/20">Em uso</Badge>;
      case 'manutencao': return <Badge variant="destructive">Manutenção</Badge>;
      default: return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <PageHeader title="Ferramentas" count={ferramentas.length} search={search} onSearchChange={setSearch} searchPlaceholder="Buscar ferramenta..." actionLabel="Ferramenta" onAction={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }} />
        </div>
        <div className="mt-4 flex gap-4">
           <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Monitoramento</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-white leading-none">{ferramentas.filter(f => f.estado === 'em_uso').length}</span>
                <span className="text-xs text-white/30 mb-1">em uso</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Disponível</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-success leading-none">{ferramentas.filter(f => f.estado === 'disponivel').length}</span>
                <span className="text-xs text-white/30 mb-1">ferramentas</span>
              </div>
           </div>
           
           <Button variant="outline" className="h-auto py-5 bg-white/5 border-white/10 text-white flex-1 flex flex-col items-center gap-1 hover:bg-white/10 border-none transition-all hover:scale-105" onClick={() => setHistoryOpen(true)}>
              <History className="h-5 w-5 opacity-50" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Ver Histórico</span>
           </Button>
        </div>
      </div>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhuma ferramenta encontrada' : 'Nenhuma ferramenta cadastrada'}</p>
      ) : (
        <Accordion type="multiple" defaultValue={FERRAMENTA_CATEGORIES} className="space-y-3">
          {[...FERRAMENTA_CATEGORIES, 'Sem Categoria'].map((cat) => {
            const toolsInCat = filtered.filter(f => 
              (cat === 'Sem Categoria' ? !f.categoria : f.categoria === cat)
            );
            
            if (toolsInCat.length === 0) return null;

            return (
              <AccordionItem key={cat} value={cat} className="border-none">
                <AccordionTrigger className="hover:no-underline py-2 group">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm uppercase tracking-widest text-muted-foreground group-data-[state=open]:text-primary transition-colors">{cat}</span>
                    <Badge variant="secondary" className="bg-muted text-[10px] h-4 rounded-full">{toolsInCat.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-1 space-y-2">
                  {toolsInCat.map((f: any) => (
                    <Card key={f.id} className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.995]" onClick={() => setSelectedTool(f)}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <ImageThumbnail src={f.foto_url} alt={f.nome} type="ferramenta" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{f.nome}</p>
                          <div className="flex items-center gap-2">
                            {f.codigo && <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Cód: {f.codigo}</p>}
                            {f.pessoas?.nome && <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">• Com: {f.pessoas.nome}</p>}
                          </div>
                        </div>
                        {estadoBadge(f.estado)}
                      </CardContent>
                    </Card>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedTool} onOpenChange={(open) => !open && setSelectedTool(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selectedTool && (
            <SheetHeader className="text-left">
              <SheetTitle>{selectedTool.nome}</SheetTitle>
              <div className="space-y-4 pt-3">
                <div className="flex items-center gap-3">
                  <ImageThumbnail src={selectedTool.foto_url} alt={selectedTool.nome} type="ferramenta" size="md" />
                  <div>
                    {estadoBadge(selectedTool.estado)}
                    {selectedTool.pessoas?.nome && <p className="text-sm text-muted-foreground mt-1">Com: {selectedTool.pessoas.nome}</p>}
                    {selectedTool.data_retirada && <p className="text-xs text-muted-foreground">Retirada: {new Date(selectedTool.data_retirada).toLocaleDateString('pt-BR')}</p>}
                  </div>
                </div>
                {selectedTool.estado === 'disponivel' && (
                  <Button className="w-full h-12 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => setRetirarOpen(true)}>
                    <Hand className="h-4 w-4 mr-1.5" /> Retirar
                  </Button>
                )}
                {selectedTool.estado === 'em_uso' && (
                  <Button className="w-full h-12 bg-success hover:bg-success/90 text-success-foreground" onClick={() => devolver.mutate(selectedTool.id)} disabled={devolver.isPending}>
                    <RotateCcw className="h-4 w-4 mr-1.5" /> {devolver.isPending ? 'Devolvendo...' : 'Devolver'}
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { startEdit(selectedTool); setSelectedTool(null); }}><Pencil className="h-4 w-4 mr-1.5" /> Editar</Button>
                  <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(selectedTool.id); setSelectedTool(null); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>

      {/* Retirar Dialog */}
      <Dialog open={retirarOpen} onOpenChange={setRetirarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retirar Ferramenta</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); selectedTool && retirar.mutate(selectedTool.id); }} className="space-y-3">
            <Select value={retirarPessoaId} onValueChange={setRetirarPessoaId}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Responsável (opcional)" /></SelectTrigger>
              <SelectContent>{pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" className="w-full h-12 bg-warning hover:bg-warning/90 text-warning-foreground" disabled={retirar.isPending}>{retirar.isPending ? 'Registrando...' : 'Confirmar Retirada'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Ferramenta' : 'Nova Ferramenta'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <ImageUpload bucket="ferramentas" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
            <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required className="h-12" />
            
            <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Categoria *" /></SelectTrigger>
              <SelectContent>
                {FERRAMENTA_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input placeholder="Código" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} className="h-12" />
            <Input placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} className="h-12" />
            <Button type="submit" className="w-full h-12" disabled={save.isPending || !form.nome || !form.categoria}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Ferramenta" description="Tem certeza? Isso removerá permanentemente a ferramenta." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />

      {/* Historico Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
         <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
            <div className="p-6 bg-[#0e1629] text-white">
               <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-white">
                    <History className="h-5 w-5 text-primary" />
                    Histórico de Movimentação
                  </SheetTitle>
                  <p className="text-xs text-white/40">Registro completo de quem pegou e devolveu ferramentas</p>
               </SheetHeader>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
               {historico.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <History className="h-10 w-10 opacity-10 mb-4" />
                    <p className="text-sm">Nenhuma movimentação registrada</p>
                 </div>
               ) : (
                 <div className="space-y-4">
                   {historico.map((h: any) => (
                     <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} key={h.id} className="p-4 bg-white rounded-xl border-none shadow-sm flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                           <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${h.tipo === 'retirada' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                              {h.tipo === 'retirada' ? <ArrowUpFromLine className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                           </div>
                           <div className="min-w-0">
                              <p className="text-sm font-bold truncate">{h.ferramentas?.nome || 'Ferramenta'}</p>
                              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <span className={h.tipo === 'retirada' ? 'text-warning' : 'text-success'}>
                                  {h.tipo === 'retirada' ? 'Retirado por:' : 'Devolvido por:'}
                                </span>
                                {h.pessoas?.nome || 'Sistema'}
                              </p>
                           </div>
                        </div>
                        <div className="text-right shrink-0">
                           <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">{new Date(h.data).toLocaleDateString('pt-BR')}</p>
                           <p className="text-xs font-display font-bold tabular-nums tracking-tighter">{new Date(h.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                     </motion.div>
                   ))}
                 </div>
               )}
            </div>
         </SheetContent>
      </Sheet>
    </div>
  );
}
