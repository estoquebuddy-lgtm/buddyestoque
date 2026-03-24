import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownToLine, Pencil, Trash2, FileText, Eye, Plus, Search, Package } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';
import ImageUpload from '@/components/ImageUpload';

interface Props { obraId: string; fabOpen?: boolean; onFabClose?: () => void; }
const emptyForm = { produto_id: '', quantidade: '', valor_unitario: '', fornecedor: '', observacao: '', nota_fiscal_url: '' };
const emptyNewProduct = { nome: '', unidade: 'un', categoria: '', estoque_minimo: '', foto_url: '' };

export default function EntradasTab({ obraId, fabOpen, onFabClose }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewNota, setViewNota] = useState<string | null>(null);

  // New product inline state
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [newProduct, setNewProduct] = useState(emptyNewProduct);
  const [productSearch, setProductSearch] = useState('');
  const [showProductList, setShowProductList] = useState(false);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fabOpen) {
      setEditingId(null);
      setForm(emptyForm);
      setIsNewProduct(false);
      setNewProduct(emptyNewProduct);
      setProductSearch('');
      setDialogOpen(true);
      onFabClose?.();
    }
  }, [fabOpen]);

  // Close product list when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        productListRef.current && !productListRef.current.contains(e.target as Node) &&
        productInputRef.current && !productInputRef.current.contains(e.target as Node)
      ) {
        setShowProductList(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { data: produtos = [] } = useQuery({ queryKey: ['produtos', obraId], queryFn: async () => { const { data } = await supabase.from('produtos').select('id, nome, unidade, categoria, estoque_atual, estoque_minimo').eq('obra_id', obraId).order('nome'); return data || []; } });
  const { data: entradas = [], isLoading } = useQuery({ queryKey: ['entradas', obraId], queryFn: async () => { const { data } = await supabase.from('entradas').select('*, produtos(nome)').eq('obra_id', obraId).order('data', { ascending: false }); return data || []; } });

  useEffect(() => {
    const channel = supabase.channel('entradas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entradas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const filteredProducts = produtos.filter((p: any) =>
    p.nome.toLowerCase().includes(productSearch.toLowerCase())
  );

  const selectedProductName = isNewProduct
    ? newProduct.nome
    : produtos.find((p: any) => p.id === form.produto_id)?.nome || '';

  const save = useMutation({
    mutationFn: async () => {
      let produtoId = form.produto_id;

      // If it's a new product, create it first
      if (isNewProduct) {
        if (!newProduct.nome.trim()) throw new Error('Nome do produto é obrigatório');
        const { data: newProd, error: prodError } = await supabase
          .from('produtos')
          .insert({
            obra_id: obraId,
            nome: newProduct.nome.trim(),
            unidade: newProduct.unidade || 'un',
            categoria: newProduct.categoria || null,
            foto_url: newProduct.foto_url || null,
            estoque_minimo: Number(newProduct.estoque_minimo) || 0,
            estoque_atual: 0,
          })
          .select('id')
          .single();
        if (prodError) throw prodError;
        produtoId = newProd.id;
      }

      if (!produtoId) throw new Error('Selecione ou cadastre um produto');

      const payload = {
        obra_id: obraId,
        produto_id: produtoId,
        quantidade: Number(form.quantidade),
        valor_unitario: Number(form.valor_unitario) || 0,
        fornecedor: form.fornecedor || null,
        observacao: form.observacao || null,
        nota_fiscal_url: form.nota_fiscal_url || null,
      };

      if (editingId) {
        const { error } = await supabase.from('entradas').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('entradas').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setIsNewProduct(false);
      setNewProduct(emptyNewProduct);
      setProductSearch('');
      toast.success(
        isNewProduct
          ? 'Produto cadastrado e entrada registrada!'
          : editingId
            ? 'Entrada atualizada!'
            : 'Entrada registrada!'
      );
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('entradas').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['entradas', obraId] }); queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); setDeleteId(null); toast.success('Entrada excluída! Estoque ajustado.'); },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (e: any) => {
    setEditingId(e.id);
    setForm({ produto_id: e.produto_id, quantidade: String(e.quantidade), valor_unitario: String(e.valor_unitario || ''), fornecedor: e.fornecedor || '', observacao: e.observacao || '', nota_fiscal_url: e.nota_fiscal_url || '' });
    setIsNewProduct(false);
    setNewProduct(emptyNewProduct);
    setProductSearch('');
    setDialogOpen(true);
  };

  const handleSelectProduct = (produtoId: string, produtoNome: string) => {
    setForm(f => ({ ...f, produto_id: produtoId }));
    setProductSearch(produtoNome);
    setIsNewProduct(false);
    setNewProduct(emptyNewProduct);
    setShowProductList(false);
  };

  const handleNewProduct = () => {
    setIsNewProduct(true);
    setNewProduct({ ...emptyNewProduct, nome: productSearch });
    setForm(f => ({ ...f, produto_id: '' }));
    setShowProductList(false);
  };

  const resetDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsNewProduct(false);
    setNewProduct(emptyNewProduct);
    setProductSearch('');
    setShowProductList(false);
    setDialogOpen(true);
  };

  const filtered = entradas.filter((e: any) => e.produtos?.nome?.toLowerCase().includes(search.toLowerCase()) || (e.fornecedor && e.fornecedor.toLowerCase().includes(search.toLowerCase())));

  const canSubmit = isNewProduct
    ? !!newProduct.nome.trim() && !!form.quantidade
    : !!form.produto_id && !!form.quantidade;

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Entradas" search={search} onSearchChange={setSearch} searchPlaceholder="Buscar entrada..." actionLabel="Entrada" onAction={resetDialog} />

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

            {/* Product selector */}
            {editingId ? (
              // When editing, show a simple select
              <Select value={form.produto_id} onValueChange={v => setForm(f => ({ ...f, produto_id: v }))}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>{produtos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              // When creating, show searchable combo with "new product" option
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={productInputRef}
                    placeholder="Buscar ou cadastrar produto..."
                    value={isNewProduct ? newProduct.nome : productSearch}
                    onChange={e => {
                      if (isNewProduct) {
                        setNewProduct(p => ({ ...p, nome: e.target.value }));
                      } else {
                        setProductSearch(e.target.value);
                        setForm(f => ({ ...f, produto_id: '' }));
                        setShowProductList(true);
                      }
                    }}
                    onFocus={() => { if (!isNewProduct) setShowProductList(true); }}
                    className="h-12 pl-10"
                    autoComplete="off"
                  />
                </div>

                {/* Selected product badge */}
                {(form.produto_id || isNewProduct) && (
                  <div className="mt-2 flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isNewProduct ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>
                        {isNewProduct ? <Plus className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">
                          {isNewProduct ? `Novo: ${newProduct.nome}` : selectedProductName}
                        </p>
                        {!isNewProduct && produtos.find((p: any) => p.id === form.produto_id) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Estoque atual: {produtos.find((p: any) => p.id === form.produto_id)?.estoque_atual || 0} {produtos.find((p: any) => p.id === form.produto_id)?.unidade} | 
                            Mínimo: {produtos.find((p: any) => p.id === form.produto_id)?.estoque_minimo || 0}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => {
                        setIsNewProduct(false);
                        setNewProduct(emptyNewProduct);
                        setForm(f => ({ ...f, produto_id: '' }));
                        setProductSearch('');
                      }}
                    >
                      Trocar
                    </Button>
                  </div>
                )}

                {/* Product dropdown list */}
                {showProductList && !isNewProduct && (
                  <div ref={productListRef} className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredProducts.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors flex items-center gap-3 text-sm"
                        onClick={() => handleSelectProduct(p.id, p.nome)}
                      >
                        <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{p.nome} {p.categoria && <span className="text-muted-foreground font-normal ml-1">• {p.categoria}</span>}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            Estoque atual: {p.estoque_atual || 0} {p.unidade} | Mínimo: {p.estoque_minimo || 0}
                          </span>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors flex items-center gap-2 text-sm text-primary font-medium border-t"
                      onClick={handleNewProduct}
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      {productSearch ? `Cadastrar "${productSearch}" como novo produto` : 'Cadastrar novo produto'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Extra fields when creating a new product */}
            {isNewProduct && !editingId && (
              <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/10 mb-4">
                <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
                  <Package className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-primary">Dados do novo produto</p>
                </div>
                
                <div>
                  <label className="text-xs text-muted-foreground ml-1">Foto do Produto (opcional)</label>
                  <div className="mt-1">
                    <ImageUpload bucket="produtos" currentUrl={newProduct.foto_url} onUpload={url => setNewProduct(p => ({ ...p, foto_url: url }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground ml-1">Unidade</label>
                    <Input placeholder="ex: un, kg, m" value={newProduct.unidade} onChange={e => setNewProduct(p => ({ ...p, unidade: e.target.value }))} className="h-10" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground ml-1">Categoria</label>
                    <Input placeholder="Opcional" value={newProduct.categoria} onChange={e => setNewProduct(p => ({ ...p, categoria: e.target.value }))} className="h-10" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs text-muted-foreground ml-1">Estoque Mínimo</label>
                    <Input placeholder="Alerta de estoque baixo (ex: 5)" type="number" min="0" value={newProduct.estoque_minimo} onChange={e => setNewProduct(p => ({ ...p, estoque_minimo: e.target.value }))} className="h-10" />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1 mt-4">
              <label className="text-xs text-muted-foreground ml-1">Quantidade da Entrada *</label>
              <Input placeholder="Ao menos 1" type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} required className="h-12" />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Valor Total (opcional)</label>
              <Input placeholder="R$" type="number" step="0.01" value={form.valor_unitario} onChange={e => setForm(f => ({ ...f, valor_unitario: e.target.value }))} className="h-12" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Fornecedor (opcional)</label>
              <Input placeholder="De onde veio?" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} className="h-12" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Observação (opcional)</label>
              <Input placeholder="Qualquer descrição extra" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="h-12" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1"><FileText className="h-4 w-4" /> Nota Fiscal (opcional)</p>
              <ImageUpload bucket="notas_fiscais" currentUrl={form.nota_fiscal_url} onUpload={url => setForm(f => ({ ...f, nota_fiscal_url: url }))} accept="image/*,.pdf" label="Nota" />
            </div>
            <Button type="submit" className="w-full h-12" disabled={save.isPending || !canSubmit}>
              {save.isPending ? 'Registrando...' : editingId ? 'Atualizar' : isNewProduct ? 'Cadastrar Produto e Registrar Entrada' : 'Registrar Entrada'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Entrada" description="A quantidade será subtraída do estoque automaticamente." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />
    </div>
  );
}

