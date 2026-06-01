import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownToLine, Pencil, Trash2, FileText, Eye, Plus, Search, Package, Wrench, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';
import ImageUpload from '@/components/ImageUpload';
import ImportPdfDialog from '@/components/obra/ImportPdfDialog';
import { useProfile } from '@/hooks/useProfile';
import { Badge } from '@/components/ui/badge';

interface Props { obraId: string; fabOpen?: boolean; onFabClose?: () => void; }

const emptyForm = { produto_id: '', quantidade: '', valor_unitario: '', fornecedor: '', observacao: '', nota_fiscal_url: '' };
const emptyNewProduct = { nome: '', unidade: 'un', categoria: '', estoque_minimo: '', foto_url: '', localizacao: '' };
const emptyNewFerramenta = { nome: '', categoria: 'Ferramentas Elétricas', localizacao: '', codigoPrefixo: '' };

const CONSTRUCAO_CATEGORIES = [
  'Hidráulica', 'Elétrica', 'Esgoto', 'Estrutural', 'Alvenaria',
  'Acabamento', 'Pintura', 'Ferramentas', 'Segurança (EPI)', 'Marcenaria', 'Serralheria', 'OUTROS'
];

const FERRAMENTA_CATEGORIES = [
  'Ferramentas Manuais', 'Ferramentas Elétricas', 'Equipamentos de Proteção (EPI)', 'Equipamentos de Medição', 'OUTROS'
];

export default function EntradasTab({ obraId, fabOpen, onFabClose }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin } = useProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewNota, setViewNota] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  // Entry type: 'material' or 'ferramenta'
  const [entryType, setEntryType] = useState<'material' | 'ferramenta'>('material');
  const [newFerramenta, setNewFerramenta] = useState(emptyNewFerramenta);

  // New product inline state
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [newProduct, setNewProduct] = useState(emptyNewProduct);
  const [productSearch, setProductSearch] = useState('');
  const [showProductList, setShowProductList] = useState(false);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fabOpen) {
      resetDialog();
      onFabClose?.();
    }
  }, [fabOpen]);

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
  const { data: entradas = [], isLoading } = useQuery({ queryKey: ['entradas', obraId], queryFn: async () => { const { data } = await supabase.from('entradas').select('*, produtos(nome, unidade)').eq('obra_id', obraId).order('data', { ascending: false }); return data || []; } });

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

  // Save entry for MATERIAL
  const saveMaterial = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let produtoId = form.produto_id;

      if (isNewProduct) {
        if (!newProduct.nome.trim()) throw new Error('Nome do produto é obrigatório');
        const { data: newProd, error: prodError } = await supabase
          .from('produtos')
          .insert({
            obra_id: obraId,
            nome: newProduct.nome.trim(),
            unidade: newProduct.unidade || 'un',
            categoria: newProduct.categoria || null,
            localizacao: newProduct.localizacao || null,
            foto_url: newProduct.foto_url || null,
            estoque_minimo: Number(newProduct.estoque_minimo) || 0,
            estoque_atual: 0,
          })
          .select('id')
          .single();
        if (prodError) throw prodError;
        produtoId = newProd.id;

        await supabase.from('logs_atividades' as any).insert({
          obra_id: obraId, user_id: user?.id, user_email: user?.email,
          acao: 'CADASTRAR', entidade: 'PRODUTO',
          detalhes: `Cadastrou o produto: ${newProduct.nome.trim()}`
        });
      }

      if (!produtoId) throw new Error('Selecione ou cadastre um produto');
      const prod = produtos.find((p: any) => p.id === produtoId) || { nome: newProduct.nome };

      const payload = {
        obra_id: obraId, produto_id: produtoId,
        quantidade: Number(form.quantidade),
        valor_unitario: Number(form.valor_unitario) || 0,
        fornecedor: form.fornecedor || null,
        observacao: form.observacao || null,
        nota_fiscal_url: form.nota_fiscal_url || null,
      };

      let res;
      if (editingId) { res = await supabase.from('entradas').update(payload).eq('id', editingId); }
      else { res = await supabase.from('entradas').insert(payload); }
      if (res.error) throw res.error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId, user_id: user?.id, user_email: user?.email,
        acao: editingId ? 'EDITAR' : 'ENTRADA', entidade: 'ESTOQUE',
        detalhes: editingId
          ? `Editou entrada de: ${prod?.nome}`
          : `Registrou entrada de ${form.quantidade} ${'unidade' in prod ? prod.unidade : ''} de ${prod?.nome}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setIsNewProduct(false);
      setNewProduct(emptyNewProduct);
      setProductSearch('');
      toast.success(isNewProduct ? 'Produto cadastrado e entrada registrada!' : editingId ? 'Entrada atualizada!' : 'Entrada registrada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Save entry for FERRAMENTA: creates N individual tools + 1 financial entry
  const saveFerramenta = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const quantidade = Number(form.quantidade);
      const valorUnitario = Number(form.valor_unitario) || 0;

      if (!newFerramenta.nome.trim()) throw new Error('Nome da ferramenta é obrigatório');
      if (!quantidade || quantidade < 1) throw new Error('Quantidade deve ser ao menos 1');

      // 1. Create a "virtual" product in the products table to register the financial entry
      // (or find existing one with same name)
      let produtoId: string;
      const { data: existingProd } = await supabase
        .from('produtos')
        .select('id')
        .eq('obra_id', obraId)
        .eq('nome', `[FERRAMENTA] ${newFerramenta.nome.trim()}`)
        .maybeSingle();

      if (existingProd) {
        produtoId = existingProd.id;
        // Update estoque_atual (sum)
        const { data: prodData } = await supabase.from('produtos').select('estoque_atual').eq('id', produtoId).single();
        await supabase.from('produtos').update({ estoque_atual: (prodData?.estoque_atual || 0) + quantidade }).eq('id', produtoId);
      } else {
        const { data: newProd, error: prodError } = await supabase
          .from('produtos')
          .insert({
            obra_id: obraId,
            nome: `[FERRAMENTA] ${newFerramenta.nome.trim()}`,
            unidade: 'un',
            categoria: 'Ferramentas',
            estoque_minimo: 0,
            estoque_atual: 0, // trigger will handle this
          })
          .select('id')
          .single();
        if (prodError) throw prodError;
        produtoId = newProd.id;
      }

      // 2. Register financial entry (entradas table)
      const { error: entradaError } = await supabase.from('entradas').insert({
        obra_id: obraId,
        produto_id: produtoId,
        quantidade: quantidade,
        valor_unitario: valorUnitario,
        fornecedor: form.fornecedor || null,
        observacao: form.observacao ? `[FERRAMENTA] ${form.observacao}` : '[FERRAMENTA]',
        nota_fiscal_url: form.nota_fiscal_url || null,
      });
      if (entradaError) throw entradaError;

      // 3. Create individual ferramentas (one per unit)
      const ferramentasToInsert = Array.from({ length: quantidade }, (_, i) => ({
        obra_id: obraId,
        nome: newFerramenta.nome.trim(),
        codigo: newFerramenta.codigoPrefixo ? `${newFerramenta.codigoPrefixo}-${String(i + 1).padStart(2, '0')}` : null,
        estado: 'disponivel',
        status: 'DISPONIVEL',
        qr_code: `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        observacoes: `[CAT:${newFerramenta.categoria}] [LOC:${newFerramenta.localizacao || ''}]`,
      }));

      const { error: ferrError } = await supabase.from('ferramentas').insert(ferramentasToInsert);
      if (ferrError) throw ferrError;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId, user_id: user?.id, user_email: user?.email,
        acao: 'ENTRADA', entidade: 'FERRAMENTA',
        detalhes: `Registrou entrada de ${quantidade} unidade(s) de "${newFerramenta.nome.trim()}" como ferramentas individuais`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      setDialogOpen(false);
      setForm(emptyForm);
      setNewFerramenta(emptyNewFerramenta);
      const qtd = Number(form.quantidade);
      toast.success(`${qtd} ferramenta(s) criada(s) individualmente e entrada financeira registrada!`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const ent = entradas.find((e: any) => e.id === id);
      const { error } = await supabase.from('entradas').delete().eq('id', id); if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId, user_id: user?.id, user_email: user?.email,
        acao: 'EXCLUIR', entidade: 'ESTOQUE',
        detalhes: `Excluiu entrada de: ${ent?.produtos?.nome || id}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      setDeleteId(null);
      toast.success('Entrada excluída! Estoque ajustado.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (e: any) => {
    setEditingId(e.id);
    setEntryType('material');
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
    setEntryType('material');
    setIsNewProduct(false);
    setNewProduct(emptyNewProduct);
    setNewFerramenta(emptyNewFerramenta);
    setProductSearch('');
    setShowProductList(false);
    setDialogOpen(true);
  };

  const filtered = entradas.filter((e: any) => e.produtos?.nome?.toLowerCase().includes(search.toLowerCase()) || (e.fornecedor && e.fornecedor.toLowerCase().includes(search.toLowerCase())));

  const isFerramenta = (e: any) => e.observacao?.startsWith('[FERRAMENTA]') || e.produtos?.nome?.startsWith('[FERRAMENTA]');

  const canSubmit = entryType === 'ferramenta'
    ? !!newFerramenta.nome.trim() && !!form.quantidade && !!form.valor_unitario
    : isNewProduct
      ? !!newProduct.nome.trim() && !!form.quantidade && !!form.valor_unitario
      : !!form.produto_id && !!form.quantidade && !!form.valor_unitario;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (entryType === 'ferramenta') saveFerramenta.mutate();
    else saveMaterial.mutate();
  };

  const isPending = saveMaterial.isPending || saveFerramenta.isPending;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <PageHeader
                title="Entradas"
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Buscar entrada..."
              />
            </div>
            <div className="flex flex-col gap-2 shrink-0 pt-1">
              <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={resetDialog}>
                <ArrowDownToLine className="h-4 w-4 mr-1" /> Entrada
              </Button>
              <Button size="sm" className="bg-info/20 hover:bg-info/30 text-info border border-info/50" onClick={() => setPdfOpen(true)}>
                <FileText className="h-4 w-4 mr-1" /> Importar PDF
              </Button>
            </div>
          </div>
        </div>
        <div className="flex gap-4 mt-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1 backdrop-blur-sm">
            <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Total Entradas</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-display font-bold text-white leading-none">{entradas.length}</span>
              <span className="text-xs text-white/30 mb-1">registros</span>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1 backdrop-blur-sm">
            <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Volume Total</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-display font-bold text-primary-foreground leading-none">{entradas.reduce((acc: number, e: any) => acc + Number(e.quantidade), 0)}</span>
              <span className="text-xs text-white/30 mb-1">unidades</span>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhuma entrada encontrada' : 'Nenhuma entrada registrada'}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((e: any) => {
            const isTool = isFerramenta(e);
            const displayName = isTool
              ? e.produtos?.nome?.replace('[FERRAMENTA] ', '') || 'Ferramenta'
              : e.produtos?.nome;
            return (
              <Card key={e.id} className="border-primary/10 border shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${isTool ? 'bg-warning/20' : 'bg-primary'}`}>
                    {isTool ? <Wrench className="h-5 w-5 text-warning" /> : <ArrowDownToLine className="h-5 w-5 text-primary-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{displayName}</p>
                      {isTool && <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px]">Ferramenta</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">{new Date(e.data).toLocaleDateString('pt-BR')}{e.fornecedor && ` • ${e.fornecedor}`}</p>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className="text-lg font-display font-bold text-primary">+{Number(e.quantidade)}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{e.produtos?.unidade || 'un'}</span>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {e.nota_fiscal_url && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewNota(e.nota_fiscal_url)}><Eye className="h-4 w-4 text-info" /></Button>}
                    {!isTool && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>}
                    {isAdmin && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* View Nota */}
      <Dialog open={!!viewNota} onOpenChange={(open) => !open && setViewNota(null)}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader><DialogTitle>Nota Fiscal</DialogTitle></DialogHeader>
          {viewNota && (viewNota.endsWith('.pdf') ? <iframe src={viewNota} className="w-full h-[60vh] rounded-lg" /> : <img src={viewNota} alt="Nota Fiscal" className="w-full rounded-lg" />)}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Entrada' : 'Nova Entrada'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Entry Type Selector - only for new entries */}
            {!editingId && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
                <button
                  type="button"
                  onClick={() => { setEntryType('material'); setNewFerramenta(emptyNewFerramenta); }}
                  className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all ${entryType === 'material' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Package className="h-4 w-4" />
                  Material / Estoque
                </button>
                <button
                  type="button"
                  onClick={() => { setEntryType('ferramenta'); setForm(emptyForm); setIsNewProduct(false); setProductSearch(''); }}
                  className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all ${entryType === 'ferramenta' ? 'bg-[#0e1629] text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Wrench className="h-4 w-4" />
                  Ferramenta
                </button>
              </div>
            )}

            {/* FERRAMENTA FIELDS */}
            {entryType === 'ferramenta' && !editingId && (
              <div className="space-y-4 p-4 bg-warning/5 border border-warning/20 rounded-xl">
                <div className="flex items-center gap-2 pb-2 border-b border-warning/20">
                  <Wrench className="h-4 w-4 text-warning" />
                  <p className="text-sm font-semibold text-warning">Dados da Ferramenta</p>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg flex gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Cada unidade será criada individualmente na aba <strong>Ferramentas</strong>. O valor total será lançado no <strong>Financeiro</strong>.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground ml-1">Nome da Ferramenta *</label>
                  <Input
                    placeholder="Ex: Furadeira de Impacto Bosch"
                    value={newFerramenta.nome}
                    onChange={e => setNewFerramenta(f => ({ ...f, nome: e.target.value }))}
                    className="h-11"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground ml-1">Categoria</label>
                    <Select value={newFerramenta.categoria} onValueChange={v => setNewFerramenta(f => ({ ...f, categoria: v }))}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FERRAMENTA_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground ml-1">Localização</label>
                    <Input
                      placeholder="Ex: Armário 2"
                      value={newFerramenta.localizacao}
                      onChange={e => setNewFerramenta(f => ({ ...f, localizacao: e.target.value }))}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground ml-1">Prefixo de Código (opcional)</label>
                  <Input
                    placeholder="Ex: FUR → criará FUR-01, FUR-02..."
                    value={newFerramenta.codigoPrefixo}
                    onChange={e => setNewFerramenta(f => ({ ...f, codigoPrefixo: e.target.value.toUpperCase() }))}
                    className="h-10"
                  />
                </div>
              </div>
            )}

            {/* MATERIAL FIELDS */}
            {entryType === 'material' && (
              <div>
                {/* Product selector */}
                {editingId ? (
                  <Select value={form.produto_id} onValueChange={v => setForm(f => ({ ...f, produto_id: v }))}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                    <SelectContent>{produtos.filter((p: any) => !p.nome.startsWith('[FERRAMENTA]')).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <div className="relative">
                    {(!form.produto_id && !isNewProduct) && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          ref={productInputRef}
                          placeholder="Buscar ou cadastrar produto..."
                          value={productSearch}
                          onChange={e => {
                            setProductSearch(e.target.value);
                            setForm(f => ({ ...f, produto_id: '' }));
                            setShowProductList(true);
                          }}
                          onFocus={() => setShowProductList(true)}
                          className="h-12 pl-10"
                          autoComplete="off"
                        />
                      </div>
                    )}

                    {(form.produto_id || isNewProduct) && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            {isNewProduct ? <Plus className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-foreground">
                              {isNewProduct ? (newProduct.nome ? `Novo: ${newProduct.nome}` : 'Novo Produto') : selectedProductName}
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
                          type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground"
                          onClick={() => { setIsNewProduct(false); setNewProduct(emptyNewProduct); setForm(f => ({ ...f, produto_id: '' })); setProductSearch(''); }}
                        >
                          Trocar
                        </Button>
                      </div>
                    )}

                    {showProductList && !isNewProduct && (
                      <div ref={productListRef} className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredProducts.filter((p: any) => !p.nome.startsWith('[FERRAMENTA]')).map((p: any) => (
                          <button
                            key={p.id} type="button"
                            className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors flex items-center gap-3 text-sm"
                            onClick={() => handleSelectProduct(p.id, p.nome)}
                          >
                            <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate">{p.nome} {p.categoria && <span className="text-muted-foreground font-normal ml-1">• {p.categoria}</span>}</span>
                              <span className="text-xs text-muted-foreground truncate">Estoque atual: {p.estoque_atual || 0} {p.unidade} | Mínimo: {p.estoque_minimo || 0}</span>
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

                {/* New product extra fields */}
                {isNewProduct && !editingId && (
                  <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/10 mb-4 mt-3 cursor-default">
                    <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
                      <Package className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold text-primary">Dados do novo produto</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground ml-1">Nome do Produto *</label>
                      <Input placeholder="Ex: Cimento CP II 50kg" value={newProduct.nome} onChange={e => setNewProduct(p => ({ ...p, nome: e.target.value }))} className="h-10" required autoComplete="off" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground ml-1">Foto do Produto (opcional)</label>
                      <div className="mt-1"><ImageUpload bucket="produtos" currentUrl={newProduct.foto_url} onUpload={url => setNewProduct(p => ({ ...p, foto_url: url }))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground ml-1">Unidade</label>
                        <div className="flex gap-2">
                          <Select value={['un', 'kg', 'L', 'm', 'm²', 'm³', 'cx', 'pc', 'sc'].includes(newProduct.unidade) ? newProduct.unidade : 'Outro'} onValueChange={v => setNewProduct(p => ({ ...p, unidade: v === 'Outro' ? '' : v }))}>
                            <SelectTrigger className="h-10 flex-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="un">Unidade (un)</SelectItem>
                              <SelectItem value="kg">Quilograma (kg)</SelectItem>
                              <SelectItem value="L">Litro (L)</SelectItem>
                              <SelectItem value="m">Metro (m)</SelectItem>
                              <SelectItem value="m²">Metro Quadrado (m²)</SelectItem>
                              <SelectItem value="m³">Metro Cúbico (m³)</SelectItem>
                              <SelectItem value="cx">Caixa (cx)</SelectItem>
                              <SelectItem value="pc">Pacote (pc)</SelectItem>
                              <SelectItem value="sc">Saco (sc)</SelectItem>
                              <SelectItem value="Outro">Outro...</SelectItem>
                            </SelectContent>
                          </Select>
                          {!['un', 'kg', 'L', 'm', 'm²', 'm³', 'cx', 'pc', 'sc'].includes(newProduct.unidade) && (
                            <Input placeholder="Qual?" value={newProduct.unidade} onChange={e => setNewProduct(p => ({ ...p, unidade: e.target.value }))} className="h-10 w-24 shrink-0" required autoFocus />
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground ml-1">Categoria</label>
                        <Select value={newProduct.categoria} onValueChange={v => setNewProduct(p => ({ ...p, categoria: v }))}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {CONSTRUCAO_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground ml-1">Estoque Mínimo</label>
                        <Input placeholder="Ex: 5" type="number" min="0" value={newProduct.estoque_minimo} onChange={e => setNewProduct(p => ({ ...p, estoque_minimo: e.target.value }))} className="h-10" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground ml-1">Localização</label>
                        <Input placeholder="Ex: Prateleira 3" value={newProduct.localizacao} onChange={e => setNewProduct(p => ({ ...p, localizacao: e.target.value }))} className="h-10" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Common fields for both types */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground ml-1">
                  {entryType === 'ferramenta' ? 'Quantidade (nº de unidades que serão criadas) *' : 'Quantidade da Entrada *'}
                </label>
                <Input
                  placeholder="Ex: 0,5 ou 15"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.quantidade}
                  onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                  required
                  className="h-12"
                />
                {entryType === 'ferramenta' && form.quantidade && Number(form.quantidade) > 0 && (
                  <p className="text-xs text-warning ml-1">
                    Serão criadas <strong>{form.quantidade}</strong> ferramenta(s) individual(is) na aba Ferramentas.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground ml-1">Valor Unitário (R$) *</label>
                <Input placeholder="R$ por unidade (ex: 2.50)" type="number" step="0.01" value={form.valor_unitario} onChange={e => setForm(f => ({ ...f, valor_unitario: e.target.value }))} required className="h-12" />
                {form.quantidade && form.valor_unitario && Number(form.quantidade) > 0 && Number(form.valor_unitario) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Valor Total: <span className="font-semibold text-foreground">R$ {(Number(form.quantidade) * Number(form.valor_unitario)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                )}
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
            </div>

            <Button type="submit" className="w-full h-12" disabled={isPending || !canSubmit}>
              {isPending
                ? 'Registrando...'
                : entryType === 'ferramenta'
                  ? `Criar ${form.quantidade || 'N'} ferramenta(s) e registrar entrada`
                  : editingId ? 'Atualizar'
                    : isNewProduct ? 'Cadastrar Produto e Registrar Entrada' : 'Registrar Entrada'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Entrada" description="A quantidade será subtraída do estoque automaticamente." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />

      <ImportPdfDialog obraId={obraId} open={pdfOpen} onOpenChange={setPdfOpen} />
    </div>
  );
}
