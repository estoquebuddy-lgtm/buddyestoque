import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowUpFromLine, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';

interface Props { obraId: string; fabOpen?: boolean; onFabClose?: () => void; }
const emptyForm = { produto_id: '', quantidade: '', pessoa_id: '', observacao: '' };

export default function SaidasTab({ obraId, fabOpen, onFabClose }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin } = useProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { if (fabOpen) { setEditingId(null); setForm(emptyForm); setDialogOpen(true); onFabClose?.(); } }, [fabOpen]);

  const [productSearch, setProductSearch] = useState('');
  const [showProductList, setShowProductList] = useState(false);

  useEffect(() => {
    if (!dialogOpen) {
      setProductSearch('');
      setShowProductList(false);
    }
  }, [dialogOpen]);

  const { data: produtos = [] } = useQuery({ queryKey: ['produtos', obraId], queryFn: async () => { const { data } = await supabase.from('produtos').select('id, nome, estoque_atual, unidade').eq('obra_id', obraId).order('nome'); return data || []; } });
  const { data: pessoas = [] } = useQuery({ queryKey: ['pessoas', obraId], queryFn: async () => { const { data } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId).order('nome'); return data || []; } });
  const [limit, setLimit] = useState(15);
  const { data: saidas = [], isLoading } = useQuery({
    queryKey: ['saidas', obraId, limit],
    queryFn: async () => {
      const { data } = await supabase
        .from('saidas')
        .select('*, produtos(nome), pessoas(nome)')
        .eq('obra_id', obraId)
        .order('data', { ascending: false })
        .range(0, limit - 1);
      return data || [];
    }
  });

  useEffect(() => {
    if (!obraId) return;
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channel = supabase.channel(`saidas-changes-${obraId}-${uniqueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['saidas', obraId] });
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { obra_id: obraId, produto_id: form.produto_id, quantidade: Number(form.quantidade), pessoa_id: form.pessoa_id || null, observacao: form.observacao || null };
      
      let res;
      if (editingId) { res = await supabase.from('saidas').update(payload).eq('id', editingId); }
      else { res = await supabase.from('saidas').insert(payload); }
      if (res.error) throw res.error;

      const prod = produtos.find((p: any) => p.id === form.produto_id);
      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: editingId ? 'EDITAR' : 'SAIDA',
        entidade: 'ESTOQUE',
        detalhes: editingId 
          ? `Editou saída de: ${prod?.nome}` 
          : `Registrou saída de ${form.quantidade} ${prod?.unidade || ''} de ${prod?.nome}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saidas', obraId] }); queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDialogOpen(false); setEditingId(null); setForm(emptyForm); toast.success(editingId ? 'Saída atualizada!' : 'Saída registrada!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { 
      const { data: { user } } = await supabase.auth.getUser();
      const s = saidas.find((x: any) => x.id === id);
      const { error } = await supabase.from('saidas').delete().eq('id', id); if (error) throw error; 

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR',
        entidade: 'ESTOQUE',
        detalhes: `Excluiu saída de: ${s?.produtos?.nome || id}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saidas', obraId] }); queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDeleteId(null); toast.success('Saída excluída! Estoque devolvido.'); },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (s: any) => { setEditingId(s.id); setForm({ produto_id: s.produto_id, quantidade: String(s.quantidade), pessoa_id: s.pessoa_id || '', observacao: s.observacao || '' }); setDialogOpen(true); };
  const selectedProduct = produtos.find((p: any) => p.id === form.produto_id);
  const searchTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = saidas.filter((s: any) =>
    searchTerms.every(term =>
      (s.produtos?.nome && s.produtos.nome.toLowerCase().includes(term)) ||
      (s.pessoas?.nome && s.pessoas.nome.toLowerCase().includes(term)) ||
      (s.observacao && s.observacao.toLowerCase().includes(term))
    )
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <PageHeader 
            title="Saídas" 
            search={search} 
            onSearchChange={setSearch} 
            searchPlaceholder="Buscar saída..." 
            actionLabel="Saída" 
            onAction={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}
          />
        </div>
        <div className="flex gap-4 mt-6">
           <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Total Saídas</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-white leading-none">{saidas.length}</span>
                <span className="text-xs text-white/40 mb-1">registros</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Volume Total</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-destructive leading-none">{saidas.reduce((acc: number, s: any) => acc + Number(s.quantidade), 0)}</span>
                <span className="text-xs text-white/40 mb-1">unidades</span>
              </div>
           </div>
        </div>
      </div>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhuma saída encontrada' : 'Nenhuma saída registrada'}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s: any) => (
            <Card key={s.id} className="border-destructive/10 border shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-destructive flex items-center justify-center shrink-0 shadow-sm">
                  <ArrowUpFromLine className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{s.produtos?.nome}</p>
                  <p className="text-xs text-muted-foreground font-medium">{s.pessoas?.nome && `${s.pessoas.nome} • `}{new Date(s.data).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                   <span className="text-lg font-display font-bold text-destructive">-{Number(s.quantidade)}</span>
                   <span className="text-[10px] text-muted-foreground uppercase">{s.produtos?.unidade || 'un'}</span>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {isAdmin && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              </CardContent>
            </Card>
          ))}
          {saidas.length === limit && (
            <div className="flex justify-center mt-4 pb-6">
              <Button variant="outline" onClick={() => setLimit(prev => prev + 15)}>
                Carregar Mais
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Saída' : 'Nova Saída'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <div className="relative">
              {!form.produto_id ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto no estoque..."
                    value={productSearch}
                    onChange={e => {
                      setProductSearch(e.target.value);
                      setShowProductList(true);
                    }}
                    onFocus={() => setShowProductList(true)}
                    onBlur={() => setShowProductList(false)}
                    className="h-12 pl-9 bg-background"
                    autoComplete="off"
                  />
                  {showProductList && (
                    <div className="absolute z-50 w-full mt-1 bg-[#0e1629] border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {produtos
                        .filter((p: any) => p.nome.toLowerCase().includes(productSearch.toLowerCase()))
                        .map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-4 py-2.5 hover:bg-white/10 transition-colors flex flex-col justify-center text-sm min-h-[44px]"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm(f => ({ ...f, produto_id: p.id }));
                              setProductSearch('');
                              setShowProductList(false);
                            }}
                          >
                            <span className="font-medium truncate text-white flex items-center gap-2">
                              {p.nome.replace('[FERRAMENTA] ', '').replace('[FERRAMENTA]', '')}
                              {p.nome.startsWith('[FERRAMENTA]') && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">Ferramenta</span>}
                            </span>
                            <span className="text-[10px] text-white/40 mt-0.5">Disponível: {Number(p.estoque_atual)} {p.unidade}</span>
                          </button>
                        ))
                      }
                      {produtos
                        .filter((p: any) => p.nome.toLowerCase().includes(productSearch.toLowerCase()))
                        .length === 0 && (
                        <p className="text-xs text-white/40 p-3 text-center">Nenhum produto encontrado</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 h-12 rounded-lg border bg-muted/40 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate text-foreground flex items-center gap-2">
                      {produtos.find((p: any) => p.id === form.produto_id)?.nome.replace('[FERRAMENTA] ', '').replace('[FERRAMENTA]', '')}
                      {produtos.find((p: any) => p.id === form.produto_id)?.nome.startsWith('[FERRAMENTA]') && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">Ferramenta</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Disponível: {Number(selectedProduct?.estoque_atual || 0)} {selectedProduct?.unidade || ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-muted ml-2"
                    onClick={() => {
                      setForm(f => ({ ...f, produto_id: '' }));
                      setProductSearch('');
                    }}
                  >
                    Trocar
                  </Button>
                </div>
              )}
            </div>
            <Input placeholder="Quantidade *" type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} required className="h-12" />
            <Select value={form.pessoa_id} onValueChange={v => setForm(f => ({ ...f, pessoa_id: v }))}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Pessoa (opcional)" /></SelectTrigger>
              <SelectContent>{pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Observação" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="h-12" />
            <Button type="submit" variant="destructive" className="w-full h-12" disabled={save.isPending || !form.produto_id}>{save.isPending ? 'Registrando...' : editingId ? 'Atualizar' : 'Registrar Saída'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Saída" description="A quantidade será devolvida ao estoque automaticamente." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />
    </div>
  );
}
