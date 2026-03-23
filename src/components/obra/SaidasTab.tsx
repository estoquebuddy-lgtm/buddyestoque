import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowUpFromLine, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';

interface Props { obraId: string; fabOpen?: boolean; onFabClose?: () => void; }
const emptyForm = { produto_id: '', quantidade: '', pessoa_id: '', observacao: '' };

export default function SaidasTab({ obraId, fabOpen, onFabClose }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { if (fabOpen) { setEditingId(null); setForm(emptyForm); setDialogOpen(true); onFabClose?.(); } }, [fabOpen]);

  const { data: produtos = [] } = useQuery({ queryKey: ['produtos', obraId], queryFn: async () => { const { data } = await supabase.from('produtos').select('id, nome, estoque_atual, unidade').eq('obra_id', obraId).order('nome'); return data || []; } });
  const { data: pessoas = [] } = useQuery({ queryKey: ['pessoas', obraId], queryFn: async () => { const { data } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId).order('nome'); return data || []; } });
  const { data: saidas = [], isLoading } = useQuery({ queryKey: ['saidas', obraId], queryFn: async () => { const { data } = await supabase.from('saidas').select('*, produtos(nome), pessoas(nome)').eq('obra_id', obraId).order('data', { ascending: false }); return data || []; } });

  useEffect(() => {
    const channel = supabase.channel('saidas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['saidas', obraId] });
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { obra_id: obraId, produto_id: form.produto_id, quantidade: Number(form.quantidade), pessoa_id: form.pessoa_id || null, observacao: form.observacao || null };
      if (editingId) { const { error } = await supabase.from('saidas').update(payload).eq('id', editingId); if (error) throw error; }
      else { const { error } = await supabase.from('saidas').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saidas', obraId] }); queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); setDialogOpen(false); setEditingId(null); setForm(emptyForm); toast.success(editingId ? 'Saída atualizada!' : 'Saída registrada!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('saidas').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saidas', obraId] }); queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); setDeleteId(null); toast.success('Saída excluída! Estoque devolvido.'); },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (s: any) => { setEditingId(s.id); setForm({ produto_id: s.produto_id, quantidade: String(s.quantidade), pessoa_id: s.pessoa_id || '', observacao: s.observacao || '' }); setDialogOpen(true); };
  const selectedProduct = produtos.find((p: any) => p.id === form.produto_id);
  const filtered = saidas.filter((s: any) => s.produtos?.nome?.toLowerCase().includes(search.toLowerCase()) || (s.pessoas?.nome && s.pessoas.nome.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Saídas" search={search} onSearchChange={setSearch} searchPlaceholder="Buscar saída..." actionLabel="Saída" onAction={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }} />

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhuma saída encontrada' : 'Nenhuma saída registrada'}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s: any) => (
            <Card key={s.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <ArrowUpFromLine className="h-5 w-5 text-destructive" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{s.produtos?.nome}</p>
                  <p className="text-xs text-muted-foreground">{s.pessoas?.nome && `${s.pessoas.nome} • `}{new Date(s.data).toLocaleDateString('pt-BR')}</p>
                </div>
                <span className="text-lg font-display font-bold text-destructive">-{Number(s.quantidade)}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Saída' : 'Nova Saída'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <Select value={form.produto_id} onValueChange={v => setForm(f => ({ ...f, produto_id: v }))}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>{produtos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome} (disp: {Number(p.estoque_atual)})</SelectItem>)}</SelectContent>
            </Select>
            {selectedProduct && <p className="text-xs text-muted-foreground">Disponível: {Number(selectedProduct.estoque_atual)} {selectedProduct.unidade}</p>}
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
