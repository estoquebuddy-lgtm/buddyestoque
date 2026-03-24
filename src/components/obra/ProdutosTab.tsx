import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import ImageThumbnail from '@/components/ImageThumbnail';
import ImageUpload from '@/components/ImageUpload';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const CONSTRUCAO_CATEGORIES = [
  'Hidráulica',
  'Elétrica',
  'Esgoto',
  'Estrutural',
  'Alvenaria',
  'Acabamento',
  'Pintura',
  'Ferramentas',
  'Segurança (EPI)',
  'Marcenaria',
  'Serralheria',
  'OUTROS'
];

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
  const [quickEntrada, setQuickEntrada] = useState<any>(null);
  const [quickSaida, setQuickSaida] = useState<any>(null);
  const [quickQtd, setQuickQtd] = useState('');

  useEffect(() => {
    if (fabOpen) { setEditingId(null); setForm(emptyForm); setDialogOpen(true); onFabClose?.(); }
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
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { obra_id: obraId, nome: form.nome, categoria: form.categoria || null, unidade: form.unidade, estoque_minimo: Number(form.estoque_minimo), custo_unitario: Number(form.custo_unitario), fornecedor: form.fornecedor || null, localizacao: form.localizacao || null, foto_url: form.foto_url || null, observacoes: form.observacoes || null };
      
      let res;
      if (editingId) { res = await supabase.from('produtos').update(payload).eq('id', editingId); }
      else { res = await supabase.from('produtos').insert(payload); }
      
      if (res.error) throw res.error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: editingId ? 'EDITAR' : 'CADASTRAR',
        entidade: 'PRODUTO',
        detalhes: `${editingId ? 'Editou' : 'Cadastrou'} o produto: ${form.nome}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDialogOpen(false); setEditingId(null); setForm(emptyForm); toast.success(editingId ? 'Produto atualizado!' : 'Produto adicionado!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { 
      const { data: { user } } = await supabase.auth.getUser();
      const prod = produtos.find((p: any) => p.id === id);
      const { error } = await supabase.from('produtos').delete().eq('id', id); if (error) throw error; 

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR',
        entidade: 'PRODUTO',
        detalhes: `Excluiu o produto: ${prod?.nome || id}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDeleteId(null); toast.success('Produto excluído!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const quickAction = useMutation({
    mutationFn: async ({ type, produtoId }: { type: 'entrada' | 'saida'; produtoId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const prod = produtos.find((p: any) => p.id === produtoId);
      const table = type === 'entrada' ? 'entradas' : 'saidas';
      const { error } = await supabase.from(table).insert({ obra_id: obraId, produto_id: produtoId, quantidade: Number(quickQtd) });
      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: type === 'entrada' ? 'ENTRADA' : 'SAIDA',
        entidade: 'ESTOQUE',
        detalhes: `${type === 'entrada' ? 'Adicionou' : 'Retirou'} ${quickQtd} ${prod?.unidade || ''} de ${prod?.nome || 'produto'}`
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      queryClient.invalidateQueries({ queryKey: [vars.type === 'entrada' ? 'entradas' : 'saidas', obraId] });
      setQuickEntrada(null); setQuickSaida(null); setQuickQtd('');
      toast.success(vars.type === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({ nome: p.nome, categoria: p.categoria || '', unidade: p.unidade, estoque_minimo: String(p.estoque_minimo), custo_unitario: String(p.custo_unitario || 0), fornecedor: p.fornecedor || '', localizacao: p.localizacao || '', foto_url: p.foto_url || '', observacoes: p.observacoes || '' });
    setDialogOpen(true);
  };

  const filtered = produtos.filter((p: any) => p.nome.toLowerCase().includes(search.toLowerCase()) || (p.categoria && p.categoria.toLowerCase().includes(search.toLowerCase())));

  const getStockBadge = (atual: number, minimo: number) => {
    if (atual <= 0) return <Badge variant="destructive">Crítico</Badge>;
    if (atual <= minimo) return <Badge className="bg-warning/10 text-warning border-warning/20">Baixo</Badge>;
    return <Badge className="bg-success/10 text-success border-success/20">OK</Badge>;
  };
  
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.text('Relatório de Estoque - Buddy Estoque', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Data: ${dataAtual}`, 14, 30);
    
    const tableData = filtered.map((p: any) => [
      p.nome,
      p.categoria || '-',
      `${Number(p.estoque_atual)} ${p.unidade}`,
      `${Number(p.estoque_minimo)} ${p.unidade}`,
      p.localizacao || '-',
      p.fornecedor || '-'
    ]);

    autoTable(doc, {
      startY: 36,
      head: [['Produto', 'Categoria', 'Estoque Atual', 'Estoque Mínimo', 'Localização', 'Fornecedor']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }, // primary-600 approx
    });

    doc.save(`estoque-${dataAtual.replace(/\//g, '-')}.pdf`);
    toast.success('Relatório PDF gerado com sucesso!');
  };

  const handleExportExcel = () => {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    const worksheetData = filtered.map((p: any) => ({
      'Produto': p.nome,
      'Categoria': p.categoria || '-',
      'Estoque Atual': Number(p.estoque_atual),
      'Unidade': p.unidade,
      'Estoque Mínimo': Number(p.estoque_minimo),
      'Localização': p.localizacao || '-',
      'Fornecedor': p.fornecedor || '-',
      'Observações': p.observacoes || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estoque');

    XLSX.writeFile(workbook, `estoque-${dataAtual.replace(/\//g, '-')}.xlsx`);
    toast.success('Planilha Excel gerada com sucesso!');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Estoque"
        count={produtos.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar produto por nome ou categoria..."
        actionLabel="Produto"
        onAction={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="h-9">
            <FileText className="h-4 w-4 mr-1.5 text-destructive" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-9">
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-success" />
            Excel
          </Button>
        </div>
      </PageHeader>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}</p>
      ) : (
        <Accordion type="multiple" defaultValue={CONSTRUCAO_CATEGORIES} className="space-y-3">
          {[...CONSTRUCAO_CATEGORIES, 'Não Categorizado'].map((cat) => {
            const productsInCat = filtered.filter(p => 
              (cat === 'Não Categorizado' ? !p.categoria : p.categoria === cat)
            );
            
            if (productsInCat.length === 0) return null;

            return (
              <AccordionItem key={cat} value={cat} className="border-none">
                <AccordionTrigger className="hover:no-underline py-2 px-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
                      {cat}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-normal">
                      ({productsInCat.length} {productsInCat.length === 1 ? 'produto' : 'produtos'})
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 space-y-2 pb-4">
                  {productsInCat.map((p: any) => (
                    <Card key={p.id} className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.995]" onClick={() => setSelectedProduct(p)}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <ImageThumbnail src={p.foto_url} alt={p.nome} type="produto" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{p.nome}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.localizacao ? (
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/50 text-[10px] text-muted-foreground font-medium border border-border/50">
                                <MapPin className="h-2.5 w-2.5 opacity-70" />
                                {p.localizacao}
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40 italic">Sem localização</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          <span className="text-lg font-display font-bold">{Number(p.estoque_atual)}</span>
                          <span className="text-[10px] text-muted-foreground">{p.unidade}</span>
                        </div>
                        {getStockBadge(Number(p.estoque_atual), Number(p.estoque_minimo))}
                      </CardContent>
                    </Card>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Product Detail Sheet */}
      <Sheet open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selectedProduct && (
            <SheetHeader className="text-left">
              <SheetTitle>{selectedProduct.nome}</SheetTitle>
              <div className="space-y-4 pt-3">
                <div className="flex items-center gap-3">
                  <ImageThumbnail src={selectedProduct.foto_url} alt={selectedProduct.nome} type="produto" size="md" />
                  <div>
                    <div className="text-2xl font-display font-bold">{Number(selectedProduct.estoque_atual)} <span className="text-sm font-normal text-muted-foreground">{selectedProduct.unidade}</span></div>
                    {selectedProduct.categoria && <p className="text-sm text-muted-foreground">{selectedProduct.categoria}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="bg-success hover:bg-success/90 text-success-foreground h-12" onClick={() => { setQuickEntrada(selectedProduct); setSelectedProduct(null); }}>
                    <ArrowDownToLine className="h-4 w-4 mr-1.5" /> Dar Entrada
                  </Button>
                  <Button variant="destructive" className="h-12" onClick={() => { setQuickSaida(selectedProduct); setSelectedProduct(null); }}>
                    <ArrowUpFromLine className="h-4 w-4 mr-1.5" /> Dar Saída
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { startEdit(selectedProduct); setSelectedProduct(null); }}>
                    <Pencil className="h-4 w-4 mr-1.5" /> Editar
                  </Button>
                  <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(selectedProduct.id); setSelectedProduct(null); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>

      {/* Quick Entrada */}
      <Dialog open={!!quickEntrada} onOpenChange={(open) => !open && setQuickEntrada(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Entrada Rápida — {quickEntrada?.nome}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); quickAction.mutate({ type: 'entrada', produtoId: quickEntrada.id }); }} className="space-y-3">
            <Input placeholder="Quantidade *" type="number" value={quickQtd} onChange={e => setQuickQtd(e.target.value)} required autoFocus className="h-12" />
            <Button type="submit" className="w-full h-12 bg-success hover:bg-success/90 text-success-foreground" disabled={quickAction.isPending || !quickQtd}>
              {quickAction.isPending ? 'Registrando...' : 'Registrar Entrada'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Saída */}
      <Dialog open={!!quickSaida} onOpenChange={(open) => !open && setQuickSaida(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Saída Rápida — {quickSaida?.nome}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Disponível: {quickSaida && Number(quickSaida.estoque_atual)} {quickSaida?.unidade}</p>
          <form onSubmit={e => { e.preventDefault(); quickAction.mutate({ type: 'saida', produtoId: quickSaida.id }); }} className="space-y-3">
            <Input placeholder="Quantidade *" type="number" value={quickQtd} onChange={e => setQuickQtd(e.target.value)} required autoFocus className="h-12" />
            <Button type="submit" variant="destructive" className="w-full h-12" disabled={quickAction.isPending || !quickQtd}>
              {quickAction.isPending ? 'Registrando...' : 'Registrar Saída'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Produto' : 'Novo Produto'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-muted-foreground ml-1">Foto do Produto</label>
              <ImageUpload bucket="produtos" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Nome do Produto *</label>
              <Input placeholder="Ex: Cimento CP II 50kg" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required className="h-12" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Categoria *</label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CONSTRUCAO_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground ml-1">Unidade de Medida</label>
                <Input placeholder="Ex: un, kg, m, sc" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} className="h-12" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground ml-1">Estoque Mínimo</label>
                <Input placeholder="Alerta de falta (ex: 5)" type="number" min="0" value={form.estoque_minimo} onChange={e => setForm(f => ({ ...f, estoque_minimo: e.target.value }))} className="h-12" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Custo Unitário Padrão</label>
              <Input placeholder="R$" type="number" step="0.01" value={form.custo_unitario} onChange={e => setForm(f => ({ ...f, custo_unitario: e.target.value }))} className="h-12" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Fornecedor Principal (Opcional)</label>
              <Input placeholder="Ex: Loja do Zé, Leroy Merlin" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} className="h-12" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Localização no Estoque (Opcional)</label>
              <Input placeholder="Ex: Prateleira 3, Galpão A" value={form.localizacao} onChange={e => setForm(f => ({ ...f, localizacao: e.target.value }))} className="h-12" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground ml-1">Observações Gerais</label>
              <Input placeholder="Qualquer descrição extra" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} className="h-12" />
            </div>

            <Button type="submit" className="w-full h-12 mt-2" disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar Produto'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Produto" description="Tem certeza? Isso removerá permanentemente o produto." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />
    </div>
  );
}
