import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, MapPin, FolderPlus, Plus } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useProfile } from '@/hooks/useProfile';
import { getBuddyLogo } from '@/lib/pdf';
import { useMemo } from 'react';

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
  'Disco',
  'Insumos',
  'OUTROS'
];

interface Props {
  obraId: string;
  fabOpen?: boolean;
  onFabClose?: () => void;
}

const emptyForm = { nome: '', categoria: '', unidade: 'un', estoque_minimo: '0', fornecedor: '', localizacao: '', foto_url: '', observacoes: '' };

export default function ProdutosTab({ obraId, fabOpen, onFabClose }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin } = useProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quickEntrada, setQuickEntrada] = useState<any>(null);
  const [quickSaida, setQuickSaida] = useState<any>(null);
  const [quickQtd, setQuickQtd] = useState('');
  const [quickPessoaId, setQuickPessoaId] = useState('');
  const [quickPessoaSearch, setQuickPessoaSearch] = useState('');
  const [showDestinoList, setShowDestinoList] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [filterSemLocalizacao, setFilterSemLocalizacao] = useState(false);
  const [filterOcultarZerados, setFilterOcultarZerados] = useState(false);

  // Categorias personalizadas criadas dinamicamente
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCatDialogOpen, setNewCatDialogOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [accordionValue, setAccordionValue] = useState<string[]>([]);

  useEffect(() => {
    if (fabOpen) { setEditingId(null); setForm(emptyForm); setDialogOpen(true); onFabClose?.(); }
  }, [fabOpen]);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('produtos')
          .select('*')
          .eq('obra_id', obraId)
          .order('nome')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        
        allData = [...allData, ...(data || [])];
        
        if (!data || data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      // Retorna todos os produtos do estoque, incluindo ferramentas
      return allData;
    },
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('pessoas').select('id, nome, status').eq('obra_id', obraId).order('nome');
      return data || [];
    },
    enabled: !!obraId,
  });

  useEffect(() => {
    if (!obraId) return;
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channel = supabase.channel(`produtos-changes-${obraId}-${uniqueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  // Auto-healing effect: sync estoque_atual for [FERRAMENTA] products only — never deletes ferramentas
  useEffect(() => {
    if (!obraId) return;

    const healToolStock = async () => {
      try {
        const { data: allProds } = await supabase
          .from('produtos')
          .select('id, nome, estoque_atual')
          .eq('obra_id', obraId);

        if (!allProds || allProds.length === 0) return;
        const toolProds = allProds.filter((p: any) => p.nome?.startsWith('[FERRAMENTA]'));
        if (toolProds.length === 0) return;

        const { data: entList } = await supabase
          .from('entradas')
          .select('produto_id, quantidade, status_entrega')
          .eq('obra_id', obraId)
          .or('status_entrega.is.null,status_entrega.eq.REALIZADO');

        const sumsMap = new Map<string, number>();
        (entList || []).forEach((e: any) => {
          if (!e.produto_id) return;
          const current = sumsMap.get(e.produto_id) || 0;
          sumsMap.set(e.produto_id, current + (Number(e.quantidade) || 0));
        });

        let updated = false;
        for (const p of toolProds) {
          const totalEntradas = sumsMap.get(p.id) || 0;
          if (totalEntradas === 0) {
            // Se nao possui nenhum registro de compra em entradas, exclui da tabela produtos e ferramentas
            await supabase.from('ferramentas').delete().eq('produto_id', p.id);
            await supabase.from('produtos').delete().eq('id', p.id);
            updated = true;
          } else if (p.estoque_atual !== totalEntradas) {
            await supabase.from('produtos').update({ estoque_atual: totalEntradas }).eq('id', p.id);
            updated = true;
          }
        }

        if (updated) {
          queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
          queryClient.invalidateQueries({ queryKey: ['produtos-short', obraId] });
        }
      } catch (err) {
        console.error("Auto-heal error in ProdutosTab:", err);
      }
    };

    healToolStock();
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { obra_id: obraId, nome: form.nome, categoria: form.categoria || null, unidade: form.unidade, estoque_minimo: Number(form.estoque_minimo), fornecedor: form.fornecedor || null, localizacao: form.localizacao || null, foto_url: form.foto_url || null, observacoes: form.observacoes || null };
      
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
      
      await supabase.from('entradas').delete().eq('produto_id', id);
      await supabase.from('saidas').delete().eq('produto_id', id);
      
      const { error } = await supabase.from('produtos').delete().eq('id', id); if (error) throw error; 

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR',
        entidade: 'PRODUTO',
        detalhes: `Excluiu o produto e histórico: ${prod?.nome || id}`
      });
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] }); 
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] }); 
      queryClient.invalidateQueries({ queryKey: ['saidas', obraId] }); 
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); 
      setDeleteId(null); 
      toast.success('Produto excluído!'); 
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkRemove = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const selectedProds = produtos.filter((p: any) => selectedIds.includes(p.id));
      
      await supabase.from('entradas').delete().in('produto_id', selectedIds);
      await supabase.from('saidas').delete().in('produto_id', selectedIds);

      const { error } = await supabase.from('produtos').delete().in('id', selectedIds);
      if (error) throw error;

      // Log each deletion
      const logs = selectedProds.map(p => ({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR_MASSA',
        entidade: 'PRODUTO',
        detalhes: `Exclusão em massa: ${p.nome}`
      }));
      await supabase.from('logs_atividades' as any).insert(logs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['saidas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      toast.success('Produtos excluídos com sucesso!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const quickAction = useMutation({
    mutationFn: async ({ type, produtoId }: { type: 'entrada' | 'saida'; produtoId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const prod = produtos.find((p: any) => p.id === produtoId);
      const table = type === 'entrada' ? 'entradas' : 'saidas';
      const payload: any = { obra_id: obraId, produto_id: produtoId, quantidade: Number(quickQtd) };
      if (type === 'saida' && quickPessoaId) payload.pessoa_id = quickPessoaId;
      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;

      const pessoaNome = (pessoas as any[]).find((p: any) => p.id === quickPessoaId)?.nome;
      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: type === 'entrada' ? 'ENTRADA' : 'SAIDA',
        entidade: 'ESTOQUE',
        detalhes: type === 'saida'
          ? `Retirou ${quickQtd} ${prod?.unidade || ''} de ${prod?.nome || 'produto'}${pessoaNome ? ` → ${pessoaNome}` : ''}`
          : `Adicionou ${quickQtd} ${prod?.unidade || ''} de ${prod?.nome || 'produto'}`
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      queryClient.invalidateQueries({ queryKey: [vars.type === 'entrada' ? 'entradas' : 'saidas', obraId] });
      setQuickEntrada(null); setQuickSaida(null); setQuickQtd(''); setQuickPessoaId(''); setQuickPessoaSearch('');
      toast.success(vars.type === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({ nome: p.nome, categoria: p.categoria || '', unidade: p.unidade, estoque_minimo: String(p.estoque_minimo), fornecedor: p.fornecedor || '', localizacao: p.localizacao || '', foto_url: p.foto_url || '', observacoes: p.observacoes || '' });
    setDialogOpen(true);
  };

  // Categorias calculadas dinamicamente (padrão + existentes nos produtos + personalizadas criadas)
  const allCategories = useMemo(() => {
    const fromProds = (produtos || []).map((p: any) => p.categoria).filter(Boolean);
    const set = new Set([...CONSTRUCAO_CATEGORIES, ...fromProds, ...customCategories]);
    return Array.from(set);
  }, [produtos, customCategories]);

  const handleAddCategory = () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    if (!allCategories.includes(trimmed)) {
      setCustomCategories(prev => [...prev, trimmed]);
    }
    setForm(f => ({ ...f, categoria: trimmed }));
    setNewCatInput('');
    setNewCatDialogOpen(false);
    toast.success(`Categoria "${trimmed}" criada!`);
  };

  const filtered = produtos.filter((p: any) => {
    const searchTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matchSearch = searchTerms.every(term => 
      p.nome.toLowerCase().includes(term) ||
      (p.categoria && p.categoria.toLowerCase().includes(term)) ||
      (p.localizacao && p.localizacao.toLowerCase().includes(term))
    );
    const matchLocation = filterSemLocalizacao ? !p.localizacao?.trim() : true;
    const matchZerado = filterOcultarZerados ? Number(p.estoque_atual) > 0 : true;
    return matchSearch && matchLocation && matchZerado;
  });

  const toggleAccordion = () => {
    if (accordionValue.length > 0) {
      setAccordionValue([]);
    } else {
      setAccordionValue([...allCategories, 'Não Categorizado']);
    }
  };

  const getStockBadge = (atual: number, minimo: number) => {
    if (atual <= 0) {
      // Only show Crítico if a minimum was defined — otherwise it's just empty stock, not an alert
      if (minimo > 0) return <Badge variant="destructive">Crítico</Badge>;
      return <Badge className="bg-muted text-muted-foreground border-muted-foreground/20">Zerado</Badge>;
    }
    if (minimo > 0 && atual <= minimo) return <Badge className="bg-warning/10 text-warning border-warning/20">Baixo</Badge>;
    return <Badge className="bg-success/10 text-success border-success/20">OK</Badge>;
  };
  
  const handleExportPDF = async () => {
    const logo = await getBuddyLogo();
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.text('Relatório de Estoque - Buddy Estoque', 14, 22);
    
    if (logo) {
      const logoSize = 18;
      const x = doc.internal.pageSize.getWidth() - 14 - logoSize;
      doc.addImage(logo, 'PNG', x, 10, logoSize, logoSize);
    }

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
      startY: 44,
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
          {isAdmin && selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} className="h-9 animate-in fade-in zoom-in duration-200">
              <Trash2 className="h-4 w-4 mr-1.5" />
              Excluir ({selectedIds.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setNewCatDialogOpen(true)} className="h-9 font-semibold text-xs border-primary/30 hover:border-primary">
            <FolderPlus className="h-4 w-4 mr-1.5 text-primary" />
            + Categoria
          </Button>
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

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <Button 
          variant={filterSemLocalizacao ? "default" : "outline"} 
          size="sm" 
          onClick={() => setFilterSemLocalizacao(!filterSemLocalizacao)} 
          className={`h-8 text-xs rounded-full ${filterSemLocalizacao ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        >
          <MapPin className="h-3 w-3 mr-1.5" />
          {filterSemLocalizacao ? 'Mostrando: Sem Localização' : 'Filtrar: Sem Localização'}
        </Button>
        <Button 
          variant={filterOcultarZerados ? "default" : "outline"} 
          size="sm" 
          onClick={() => setFilterOcultarZerados(!filterOcultarZerados)} 
          className={`h-8 text-xs rounded-full ${filterOcultarZerados ? 'bg-destructive text-destructive-foreground' : 'bg-background'}`}
        >
          <ArrowUpFromLine className="h-3 w-3 mr-1.5" />
          {filterOcultarZerados ? 'Mostrando: Com Estoque' : 'Ocultar Itens Zerados'}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={toggleAccordion} 
          className="h-8 text-xs rounded-full bg-background text-muted-foreground hover:text-foreground"
        >
          {accordionValue.length > 0 ? (
            <><ArrowUpFromLine className="h-3 w-3 mr-1.5" /> Recolher Tudo</>
          ) : (
            <><ArrowDownToLine className="h-3 w-3 mr-1.5" /> Expandir Tudo</>
          )}
        </Button>
      </div>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{(search || filterSemLocalizacao || filterOcultarZerados) ? 'Nenhum produto encontrado com os filtros aplicados.' : 'Nenhum produto cadastrado'}</p>
      ) : (
        <Accordion type="multiple" value={accordionValue} onValueChange={setAccordionValue} className="space-y-3">
          {[...allCategories, 'Não Categorizado'].map((cat) => {
            const productsInCat = filtered.filter(p => 
              (cat === 'Não Categorizado' ? !p.categoria : p.categoria === cat)
            );
            
            if (productsInCat.length === 0) return null;

            return (
              <AccordionItem key={cat} value={cat} className="border-none">
                <AccordionTrigger className="hover:no-underline py-2 px-1">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="secondary" 
                      className={`text-xs font-bold border ${
                        cat.toUpperCase().includes('FERRAMENTA')
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40'
                          : 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/40'
                      }`}
                    >
                      {cat.toUpperCase().includes('FERRAMENTA') ? '🛠️ ' : '📦 '}
                      {cat}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-normal">
                      ({productsInCat.length} {productsInCat.length === 1 ? 'produto' : 'produtos'})
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 space-y-2 pb-4">
                  {productsInCat.map((p: any) => {
                    const isTool = p.categoria?.toUpperCase().includes('FERRAMENTA') || p.nome?.startsWith('[FERRAMENTA]');
                    return (
                    <Card key={p.id} className={`border-none shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.995] ${selectedIds.includes(p.id) ? 'ring-2 ring-primary ring-offset-2' : ''}`} onClick={() => setSelectedProduct(p)}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={selectedIds.includes(p.id)} 
                            onCheckedChange={(checked) => {
                              setSelectedIds(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id));
                            }} 
                          />
                        </div>
                        <ImageThumbnail src={p.foto_url} alt={p.nome} type="produto" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{p.nome?.replace(/\[FERRAMENTA\]\s*/g, '')}</p>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isTool 
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40' 
                                : 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/40'
                            }`}>
                              {isTool ? '🛠️ Ferramenta' : '📦 Material'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
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
                  );
                })}
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
                  {isAdmin && (
                    <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(selectedProduct.id); setSelectedProduct(null); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
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
            <div className="space-y-1 relative">
              <label className="text-xs text-muted-foreground ml-1">Para quem (opcional)</label>
              {quickPessoaId ? (
                <div className="flex items-center justify-between px-3 h-12 rounded-lg border bg-muted/40 text-sm">
                  <span className="font-medium text-foreground">{quickPessoaSearch}</span>
                  <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground h-7"
                    onClick={() => { setQuickPessoaId(''); setQuickPessoaSearch(''); }}>
                    Trocar
                  </Button>
                </div>
              ) : (
                <Input
                  placeholder="Buscar pessoa..."
                  value={quickPessoaSearch}
                  onChange={e => { setQuickPessoaSearch(e.target.value); setShowDestinoList(true); }}
                  onFocus={() => setShowDestinoList(true)}
                  onBlur={() => setTimeout(() => setShowDestinoList(false), 150)}
                  className="h-12"
                  autoComplete="off"
                />
              )}
              {showDestinoList && !quickPessoaId && (
                <div className="absolute z-50 w-full mt-1 bg-[#0e1629] border border-white/10 rounded-lg shadow-xl max-h-44 overflow-y-auto">
                  {(pessoas as any[])
                    .filter((p: any) => p.status !== 'DEMITIDO' && p.nome.toLowerCase().includes(quickPessoaSearch.toLowerCase()))
                    .map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-white transition-colors text-sm font-medium"
                        onMouseDown={e => {
                          e.preventDefault();
                          setQuickPessoaId(p.id);
                          setQuickPessoaSearch(p.nome);
                          setShowDestinoList(false);
                        }}
                      >
                        <span className="font-medium text-white">{p.nome}</span>
                      </button>
                    ))
                  }
                  {(pessoas as any[]).filter((p: any) => p.status !== 'DEMITIDO' && p.nome.toLowerCase().includes(quickPessoaSearch.toLowerCase())).length === 0 && (
                    <p className="text-xs text-white/40 p-3 text-center">Nenhuma pessoa encontrada</p>
                  )}
                </div>
              )}
            </div>
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
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground ml-1">Categoria *</label>
                <button
                  type="button"
                  onClick={() => setNewCatDialogOpen(true)}
                  className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Nova Categoria
                </button>
              </div>
              <Select value={form.categoria} onValueChange={v => {
                if (v === '__CREATE_NEW__') {
                  setNewCatDialogOpen(true);
                } else {
                  setForm(f => ({ ...f, categoria: v }));
                }
              }}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__CREATE_NEW__" className="text-primary font-bold">
                    + Criar Nova Categoria...
                  </SelectItem>
                  {allCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground ml-1">Unidade de Medida</label>
                <div className="flex gap-2">
                  <Select 
                    value={['un', 'kg', 'L', 'm', 'm²', 'm³', 'cx', 'pc', 'sc'].includes(form.unidade) ? form.unidade : 'Outro'} 
                    onValueChange={v => setForm(f => ({ ...f, unidade: v === 'Outro' ? '' : v }))}
                  >
                    <SelectTrigger className="h-12 flex-1">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
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
                  {!['un', 'kg', 'L', 'm', 'm²', 'm³', 'cx', 'pc', 'sc'].includes(form.unidade) && (
                    <Input 
                      placeholder="Ex: rolo, galão" 
                      value={form.unidade} 
                      onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                      className="h-12 w-28"
                    />
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground ml-1">Estoque Mínimo</label>
                <Input placeholder="Alerta de falta (ex: 5)" type="number" min="0" value={form.estoque_minimo} onChange={e => setForm(f => ({ ...f, estoque_minimo: e.target.value }))} className="h-12" />
              </div>
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
      
      <ConfirmDialog 
        open={bulkDeleteOpen} 
        onOpenChange={setBulkDeleteOpen} 
        title="Excluir Produtos Selecionados" 
        description={`Tem certeza que deseja excluir ${selectedIds.length} produtos permanentemente? Esta ação não pode ser desfeita.`} 
        onConfirm={() => bulkRemove.mutate()} 
        loading={bulkRemove.isPending} 
      />

      {/* Dialog para Criar Nova Categoria */}
      <Dialog open={newCatDialogOpen} onOpenChange={setNewCatDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FolderPlus className="h-5 w-5 text-primary" />
              Criar Nova Categoria
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-semibold">Nome da Categoria *</label>
              <Input
                placeholder="Ex: Impermeabilização, Gesso & Drywall, etc."
                value={newCatInput}
                onChange={e => setNewCatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setNewCatDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleAddCategory} disabled={!newCatInput.trim()}>
                Criar Categoria
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
