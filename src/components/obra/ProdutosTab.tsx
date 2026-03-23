import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import ImageThumbnail from '@/components/ImageThumbnail';
import ImageUpload from '@/components/ImageUpload';
import SearchBar from '@/components/SearchBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';

interface Props {
  obraId: string;
  fabOpen?: boolean;
  onFabClose?: () => void;
}

const emptyForm = { nome: '', categoria: '', unidade: 'un', estoque_minimo: '0', custo_unitario: '0', fornecedor: '', localizacao: '', foto_url: '', observacoes: '' };

export default function ProdutosTab({ obraId, fabOpen, onFabClose }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Quick entry/exit dialogs
  const [quickEntrada, setQuickEntrada] = useState<any>(null);
  const [quickSaida, setQuickSaida] = useState<any>(null);
  const [quickQtd, setQuickQtd] = useState('');

  useEffect(() => {
    if (fabOpen) {
      setEditingId(null);
      setForm(emptyForm);
      setDialogOpen(true);
      onFabClose?.();
    }
  }, [fabOpen]);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from('produtos').select('*').eq('obra_id', obraId).order('nome');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase.channel('produtos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        obra_id: obraId,
        nome: form.nome,
        categoria: form.categoria || null,
        unidade: form.unidade,
        estoque_minimo: Number(form.estoque_minimo),
        custo_unitario: Number(form.custo_unitario),
        fornecedor: form.fornecedor || null,
        localizacao: form.localizacao || null,
        foto_url: form.foto_url || null,
        observacoes: form.observacoes || null,
      };
      if (editingId) {
        const { error } = await supabase.from('produtos').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('produtos').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? 'Produto atualizado!' : 'Produto adicionado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('produtos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      setDeleteId(null);
      toast.success('Produto excluído!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const quickAction = useMutation({
    mutationFn: async ({ type, produtoId }: { type: 'entrada' | 'saida'; produtoId: string }) => {
      const table = type === 'entrada' ? 'entradas' : 'saidas';
      const { error } = await supabase.from(table).insert({
        obra_id: obraId,
        produto_id: produtoId,
        quantidade: Number(quickQtd),
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: [vars.type === 'entrada' ? 'entradas' : 'saidas', obraId] });
      setQuickEntrada(null);
      setQuickSaida(null);
      setQuickQtd('');
      toast.success(vars.type === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      categoria: p.categoria || '',
      unidade: p.unidade,
      estoque_minimo: String(p.estoque_minimo),
      custo_unitario: String(p.custo_unitario || 0),
      fornecedor: p.fornecedor || '',
      localizacao: p.localizacao || '',
      foto_url: p.foto_url || '',
      observacoes: p.observacoes || '',
    });
    setDialogOpen(true);
  };

  const filtered = produtos.filter((p: any) =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    (p.categoria && p.categoria.toLowerCase().includes(search.toLowerCase()))
  );

  const getStockColor = (atual: number, minimo: number) => {
    if (atual <= 0) return 'bg-destructive/10 text-destructive';
    if (atual <= minimo) return 'bg-warning/10 text-warning';
    return 'bg-success/10 text-success';
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg">Produtos ({produtos.length})</h3>
        <Button size="sm" onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Buscar produto..." />

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">
          {search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p: any) => (
            <Card key={p.id} className="shadow-sm border-none hover:shadow-md transition-shadow cursor-pointer active:scale-[0.99]" onClick={() => setSelectedProduct(p)}>
              <CardContent className="p-3 flex items-center gap-3">
                <ImageThumbnail src={p.foto_url} alt={p.nome} type="produto" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.nome}</p>
                  {p.categoria && <p className="text-xs text-muted-foreground">{p.categoria}</p>}
                  {p.localizacao && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {p.localizacao}
                    </p>
                  )}
                </div>
                <div className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${getStockColor(Number(p.estoque_atual), Number(p.estoque_minimo))}`}>
                  {Number(p.estoque_atual)} {p.unidade}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Product Detail Sheet */}
      <Sheet open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
          {selectedProduct && (
            <SheetHeader>
              <SheetTitle className="text-left">{selectedProduct.nome}</SheetTitle>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <ImageThumbnail src={selectedProduct.foto_url} alt={selectedProduct.nome} type="produto" size="md" />
                  <div>
                    <div className={`inline-block text-sm font-bold px-3 py-1 rounded-full ${getStockColor(Number(selectedProduct.estoque_atual), Number(selectedProduct.estoque_minimo))}`}>
                      {Number(selectedProduct.estoque_atual)} {selectedProduct.unidade}
                    </div>
                    {selectedProduct.categoria && <p className="text-sm text-muted-foreground mt-1">{selectedProduct.categoria}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => { setQuickEntrada(selectedProduct); setSelectedProduct(null); }}>
                    <ArrowDownToLine className="h-4 w-4 mr-1" /> Dar Entrada
                  </Button>
                  <Button variant="destructive" onClick={() => { setQuickSaida(selectedProduct); setSelectedProduct(null); }}>
                    <ArrowUpFromLine className="h-4 w-4 mr-1" /> Dar Saída
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { startEdit(selectedProduct); setSelectedProduct(null); }}>
                    <Pencil className="h-4 w-4 mr-1" /> Editar
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={() => { setDeleteId(selectedProduct.id); setSelectedProduct(null); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>

      {/* Quick Entrada Dialog */}
      <Dialog open={!!quickEntrada} onOpenChange={(open) => !open && setQuickEntrada(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Entrada Rápida - {quickEntrada?.nome}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); quickAction.mutate({ type: 'entrada', produtoId: quickEntrada.id }); }} className="space-y-3">
            <Input placeholder="Quantidade *" type="number" value={quickQtd} onChange={e => setQuickQtd(e.target.value)} required autoFocus />
            <Button type="submit" className="w-full bg-success hover:bg-success/90 text-success-foreground" disabled={quickAction.isPending || !quickQtd}>
              {quickAction.isPending ? 'Registrando...' : 'Registrar Entrada'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Saída Dialog */}
      <Dialog open={!!quickSaida} onOpenChange={(open) => !open && setQuickSaida(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Saída Rápida - {quickSaida?.nome}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Disponível: {quickSaida && Number(quickSaida.estoque_atual)} {quickSaida?.unidade}</p>
          <form onSubmit={e => { e.preventDefault(); quickAction.mutate({ type: 'saida', produtoId: quickSaida.id }); }} className="space-y-3">
            <Input placeholder="Quantidade *" type="number" value={quickQtd} onChange={e => setQuickQtd(e.target.value)} required autoFocus />
            <Button type="submit" variant="destructive" className="w-full" disabled={quickAction.isPending || !quickQtd}>
              {quickAction.isPending ? 'Registrando...' : 'Registrar Saída'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Produto' : 'Novo Produto'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <ImageUpload bucket="produtos" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
            <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
            <Input placeholder="Categoria" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Unidade" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} />
              <Input placeholder="Estoque mínimo" type="number" value={form.estoque_minimo} onChange={e => setForm(f => ({ ...f, estoque_minimo: e.target.value }))} />
            </div>
            <Input placeholder="Custo unitário" type="number" step="0.01" value={form.custo_unitario} onChange={e => setForm(f => ({ ...f, custo_unitario: e.target.value }))} />
            <Input placeholder="Fornecedor" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} />
            <Input placeholder="Localização" value={form.localizacao} onChange={e => setForm(f => ({ ...f, localizacao: e.target.value }))} />
            <Input placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            <Button type="submit" className="w-full h-12 text-base" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir Produto"
        description="Tem certeza? Isso removerá permanentemente o produto."
        onConfirm={() => deleteId && remove.mutate(deleteId)}
        loading={remove.isPending}
      />
    </div>
  );
}
