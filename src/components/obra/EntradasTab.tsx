import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownToLine, Pencil, Trash2, FileText, Eye } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';
import ImageUpload from '@/components/ImageUpload';

interface Props { obraId: string; fabOpen?: boolean; onFabClose?: () => void; }
const emptyForm = { produto_id: '', quantidade: '', valor_unitario: '', fornecedor: '', observacao: '', nota_fiscal_url: '' };

export default function EntradasTab({ obraId, fabOpen, onFabClose }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewNota, setViewNota] = useState<string | null>(null);

  useEffect(() => { if (fabOpen) { setEditingId(null); setForm(emptyForm); setDialogOpen(true); onFabClose?.(); } }, [fabOpen]);

  const { data: produtos = [] } = useQuery({ queryKey: ['produtos', obraId], queryFn: async () => { const { data } = await supabase.from('produtos').select('id, nome').eq('obra_id', obraId).order('nome'); return data || []; } });
  const { data: entradas = [], isLoading } = useQuery({ queryKey: ['entradas', obraId], queryFn: async () => { const { data } = await supabase.from('entradas').select('*, produtos(nome)').eq('obra_id', obraId).order('data', { ascending: false }); return data || []; } });

  useEffect(() => {
    const channel = supabase.channel('entradas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entradas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { obra_id: obraId, produto_id: form.produto_id, quantidade: Number(form.quantidade), valor_unitario: Number(form.valor_unitario) || 0, fornecedor: form.fornecedor || null, observacao: form.observacao || null, nota_fiscal_url: form.nota_fiscal_url || null };
      if (editingId) { const { error } = await supabase.from('entradas').update(payload).eq('id', editingId); if (error) throw error; }
      else { const { error } = await supabase.from('entradas').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['entradas', obraId] }); queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); setDialogOpen(false); setEditingId(null); setForm(emptyForm); toast.success(editingId ? 'Entrada atualizada!' : 'Entrada registrada!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('entradas').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['entradas', obraId] }); queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); setDeleteId(null); toast.success('Entrada excluída! Estoque ajustado.'); },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (e: any) => { setEditingId(e.id); setForm({ produto_id: e.produto_id, quantidade: String(e.quantidade), valor_unitario: String(e.valor_unitario || ''), fornecedor: e.fornecedor || '', observacao: e.observacao || '', nota_fiscal_url: e.nota_fiscal_url || '' }); setDialogOpen(true); };

  const filtered = entradas.filter((e: any) => e.produtos?.nome?.toLowerCase().includes(search.toLowerCase()) || (e.fornecedor && e.fornecedor.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Entradas" search={search} onSearchChange={setSearch} searchPlaceholder="Buscar entrada..." actionLabel="Entrada" onAction={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }} />

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhuma entrada encontrada' : 'Nenhuma entrada registrada'}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((e: any) => (
            <Card key={e.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                  <ArrowDownToLine className="h-5 w-5 text-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{e.produtos?.nome}</p>
                  <p className="text-xs text-muted-foreground">{new Date(e.data).toLocaleDateString('pt-BR')}{e.fornecedor && ` • ${e.fornecedor}`}</p>
                </div>
                <span className="text-lg font-display font-bold text-success">+{Number(e.quantidade)}</span>
                <div className="flex gap-1">
                  {e.nota_fiscal_url && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewNota(e.nota_fiscal_url)}><Eye className="h-4 w-4 text-info" /></Button>}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Nota */}
      <Dialog open={!!viewNota} onOpenChange={(open) => !open && setViewNota(null)}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader><DialogTitle>Nota Fiscal</DialogTitle></DialogHeader>
          {viewNota && (viewNota.endsWith('.pdf') ? <iframe src={viewNota} className="w-full h-[60vh] rounded-lg" /> : <img src={viewNota} alt="Nota Fiscal" className="w-full rounded-lg" />)}
        </DialogContent>
      </Dialog>

      {/* Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Entrada' : 'Nova Entrada'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <Select value={form.produto_id} onValueChange={v => setForm(f => ({ ...f, produto_id: v }))}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>{produtos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Quantidade *" type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} required className="h-12" />
            <Input placeholder="Valor unitário" type="number" step="0.01" value={form.valor_unitario} onChange={e => setForm(f => ({ ...f, valor_unitario: e.target.value }))} className="h-12" />
            <Input placeholder="Fornecedor" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} className="h-12" />
            <Input placeholder="Observação" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="h-12" />
            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1"><FileText className="h-4 w-4" /> Nota Fiscal (opcional)</p>
              <ImageUpload bucket="notas_fiscais" currentUrl={form.nota_fiscal_url} onUpload={url => setForm(f => ({ ...f, nota_fiscal_url: url }))} accept="image/*,.pdf" label="Nota" />
            </div>
            <Button type="submit" className="w-full h-12" disabled={save.isPending || !form.produto_id}>{save.isPending ? 'Registrando...' : editingId ? 'Atualizar' : 'Registrar Entrada'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Entrada" description="A quantidade será subtraída do estoque automaticamente." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />
    </div>
  );
}
