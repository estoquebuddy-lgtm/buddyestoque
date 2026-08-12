import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, DollarSign, TrendingUp, BarChart3, Clock, Eye, Download, ArrowUpFromLine, ArrowDownToLine, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import SkeletonList from '@/components/SkeletonList';
import { SidebarTrigger } from '@/components/ui/sidebar';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getBuddyLogo } from '@/lib/pdf';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FinanceiroTabProps {
  obraId: string;
}

export default function FinanceiroTab({ obraId }: FinanceiroTabProps) {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [filterSemCusto, setFilterSemCusto] = useState(false);
  const [filterEstoque, setFilterEstoque] = useState<'todos' | 'zerados' | 'disponiveis'>('todos');
  const [filterCategoria, setFilterCategoria] = useState<string>('todas');
  const queryClient = useQueryClient();

  // Tool mismatch correction states
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedMismatchTool, setSelectedMismatchTool] = useState('');
  const [selectedTargetProductId, setSelectedTargetProductId] = useState('');
  const [resolveStrategy, setResolveStrategy] = useState('rename-product');
  const [executingLink, setExecutingLink] = useState(false);

  // 1. Lightweight global queries (fetching only necessary fields for metrics and calculations)
  const { data: produtosShort = [], isLoading: loadingProds } = useQuery({
    queryKey: ['produtos-short', obraId],
    queryFn: async () => {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('produtos')
          .select('id, nome, estoque_atual, unidade, categoria')
          .eq('obra_id', obraId)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        allData = [...allData, ...(data || [])];
        hasMore = data && data.length === pageSize;
        page++;
      }
      return allData;
    }
  });

  const { data: entradasShort = [], isLoading: loadingEntradas } = useQuery({
    queryKey: ['entradas-short', obraId],
    queryFn: async () => {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('entradas')
          .select('produto_id, quantidade, valor_unitario, status_entrega')
          .eq('obra_id', obraId)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        allData = [...allData, ...(data || [])];
        hasMore = data && data.length === pageSize;
        page++;
      }
      return allData;
    }
  });

  const { data: saidasShort = [], isLoading: loadingSaidas } = useQuery({
    queryKey: ['saidas-short', obraId],
    queryFn: async () => {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('saidas')
          .select('produto_id, quantidade')
          .eq('obra_id', obraId)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        allData = [...allData, ...(data || [])];
        hasMore = data && data.length === pageSize;
        page++;
      }
      return allData;
    }
  });

  const { data: ferramentasShort = [], isLoading: loadingFerramentas } = useQuery({
    queryKey: ['ferramentas-short', obraId],
    queryFn: async () => {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('ferramentas')
          .select('nome, estado')
          .eq('obra_id', obraId)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        allData = [...allData, ...(data || [])];
        hasMore = data && data.length === pageSize;
        page++;
      }
      return allData;
    }
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas-short', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('pessoas')
        .select('id, nome')
        .eq('obra_id', obraId);
      return data || [];
    }
  });

  // 2. Paginated Diário de Compras (Server-side paginated & filtered)
  const [comprasPage, setComprasPage] = useState(0);
  const [comprasSearch, setComprasSearch] = useState('');
  const comprasPageSize = 15;

  const { data: comprasData, isLoading: loadingCompras } = useQuery({
    queryKey: ['compras-paginated', obraId, comprasPage, comprasSearch],
    queryFn: async () => {
      let query = supabase
        .from('entradas')
        .select('id, data, quantidade, valor_unitario, status_entrega, fornecedor, produto:produtos(nome, unidade)', { count: 'exact' })
        .eq('obra_id', obraId)
        .neq('status_entrega', 'PENDENTE')
        .order('data', { ascending: false });

      if (comprasSearch) {
        const { data: matchingProds } = await supabase
          .from('produtos')
          .select('id')
          .eq('obra_id', obraId)
          .ilike('nome', `%${comprasSearch}%`);
        
        const matchingIds = (matchingProds || []).map(p => p.id);
        query = query.or(`fornecedor.ilike.%${comprasSearch}%,produto_id.in.(${matchingIds.join(',') || '00000000-0000-0000-0000-000000000000'})`);
      }

      const { data, count, error } = await query.range(
        comprasPage * comprasPageSize,
        (comprasPage + 1) * comprasPageSize - 1
      );

      if (error) throw error;
      return { data: data || [], count: count || 0 };
    }
  });

  // 3. Paginated Diário de Consumos (Server-side paginated & filtered)
  const [consumosPage, setConsumosPage] = useState(0);
  const [consumosSearch, setConsumosSearch] = useState('');
  const consumosPageSize = 15;

  const { data: consumosData, isLoading: loadingConsumos } = useQuery({
    queryKey: ['consumos-paginated', obraId, consumosPage, consumosSearch],
    queryFn: async () => {
      let query = supabase
        .from('saidas')
        .select('id, data, quantidade, produto:produtos(id, nome, unidade), pessoas(nome)', { count: 'exact' })
        .eq('obra_id', obraId)
        .order('data', { ascending: false });

      if (consumosSearch) {
        const { data: matchingProds } = await supabase
          .from('produtos')
          .select('id')
          .eq('obra_id', obraId)
          .ilike('nome', `%${consumosSearch}%`);
        const matchingIds = (matchingProds || []).map(p => p.id);
        
        const { data: matchingPessoas } = await supabase
          .from('pessoas')
          .select('id')
          .eq('obra_id', obraId)
          .ilike('nome', `%${consumosSearch}%`);
        const matchingPessoaIds = (matchingPessoas || []).map(p => p.id);

        query = query.or(`produto_id.in.(${matchingIds.join(',') || '00000000-0000-0000-0000-000000000000'}),pessoa_id.in.(${matchingPessoaIds.join(',') || '00000000-0000-0000-0000-000000000000'})`);
      }

      const { data, count, error } = await query.range(
        consumosPage * consumosPageSize,
        (consumosPage + 1) * consumosPageSize - 1
      );

      if (error) throw error;
      return { data: data || [], count: count || 0 };
    }
  });

  // 4. Lazy-loaded details for selected product modal
  const { data: selectedProductEntries = [], isLoading: loadingSelectedEntries } = useQuery({
    queryKey: ['selected-product-entries', selectedProduct?.id],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const { data, error } = await supabase
        .from('entradas')
        .select('*')
        .eq('produto_id', selectedProduct.id)
        .order('data', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedProduct
  });

  const { data: selectedProductSaidas = [], isLoading: loadingSelectedSaidas } = useQuery({
    queryKey: ['selected-product-saidas', selectedProduct?.id],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const { data, error } = await supabase
        .from('saidas')
        .select('*, pessoas(nome)')
        .eq('produto_id', selectedProduct.id)
        .order('data', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedProduct
  });

  const { data: selectedProductMovs = [] } = useQuery({
    queryKey: ['selected-product-movs', selectedProduct?.id],
    queryFn: async () => {
      if (!selectedProduct || !selectedProduct.nome?.startsWith('[FERRAMENTA]')) return [];
      const toolName = selectedProduct.nome.replace('[FERRAMENTA] ', '').trim();
      const { data, error } = await supabase
        .from('movimentacoes_ferramentas' as any)
        .select('*, ferramentas(nome)')
        .eq('obra_id', obraId)
        .order('data_hora', { ascending: false });
      if (error) throw error;
      return (data || []).filter((m: any) => m.ferramentas?.nome?.toLowerCase().trim() === toolName.toLowerCase().trim());
    },
    enabled: !!selectedProduct && !!selectedProduct.nome?.startsWith('[FERRAMENTA]')
  });

  const isLoadingGlobal = loadingProds || loadingEntradas || loadingSaidas || loadingFerramentas;

  // Process data in-memory for instant, robust, and clean calculations (using lightweight queries)
  const productsWithCosts = produtosShort.map((prod: any) => {
    const isTool = prod.nome?.startsWith('[FERRAMENTA]');

    const prodEntradas = entradasShort.filter((e: any) => e.produto_id === prod.id && e.status_entrega !== 'PENDENTE');
    const prodSaidas = saidasShort.filter((s: any) => s.produto_id === prod.id);

    const costEntradas = prodEntradas.filter((e: any) => e.valor_unitario !== null && Number(e.valor_unitario) > 0);

    const latestCostEntry = costEntradas[0];
    const ultimoCusto = latestCostEntry ? Number(latestCostEntry.valor_unitario) : 0;
    const safeUltimoCusto = isNaN(ultimoCusto) ? 0 : ultimoCusto;

    const totalQtd = costEntradas.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
    const totalVal = costEntradas.reduce((acc, curr) => {
      const q = Number(curr.quantidade) || 0;
      const v = Number(curr.valor_unitario) || 0;
      return acc + (q * v);
    }, 0);
    const custoMedio = totalQtd > 0 ? totalVal / totalQtd : 0;
    const safeCustoMedio = isNaN(custoMedio) ? 0 : custoMedio;

    const totalInvestido = totalVal;

    const totalPhysicalEntriesQtd = prodEntradas.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
    const totalPhysicalSaidasQtd = prodSaidas.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);

    let estoque_atual = isTool ? 0 : Math.max(0, totalPhysicalEntriesQtd - totalPhysicalSaidasQtd);
    let totalSaidasQtd = totalPhysicalSaidasQtd;
    let totalSaidasValor = totalSaidasQtd * safeCustoMedio;

    if (isTool) {
      const toolName = prod.nome.replace('[FERRAMENTA] ', '').trim();
      const prodTools = ferramentasShort.filter((f: any) => f.nome?.toLowerCase().trim() === toolName.toLowerCase().trim());
      const activeTools = prodTools.filter((t: any) => t.estado !== 'baixa' && t.estado !== 'extraviada' && t.estado !== 'comprado');
      estoque_atual = activeTools.length;

      const lostOrDiscarded = prodTools.filter((t: any) => t.estado === 'baixa' || t.estado === 'extraviada');
      const missingCount = Math.max(0, totalPhysicalEntriesQtd - prodTools.length);

      totalSaidasQtd = lostOrDiscarded.length + missingCount;
      totalSaidasValor = totalSaidasQtd * safeCustoMedio;
    }

    let valorEstoqueEstimado = estoque_atual * safeCustoMedio;

    return {
      ...prod,
      estoque_atual_db: Number(prod.estoque_atual) || 0,
      estoque_atual,
      ultimoCusto: safeUltimoCusto,
      custoMedio: safeCustoMedio,
      totalInvestido,
      totalSaidasQtd,
      totalSaidasValor,
      valorEstoqueEstimado,
      allEntradasCount: prodEntradas.length,
      allSaidasCount: prodSaidas.length
    };
  });

  // Automatically heal database stock discrepancies and clean up excess duplicate tools
  useEffect(() => {
    if (isLoadingGlobal || productsWithCosts.length === 0) return;

    const syncStockToDatabase = async () => {
      // Sync estoque_atual in produtos table ONLY — never delete ferramentas automatically
      // (Ferramentas são deletadas apenas explicitamente pelo usuário)
      const mismatchedProducts = productsWithCosts.filter((p: any) => {
        return p.estoque_atual !== p.estoque_atual_db;
      });

      if (mismatchedProducts.length > 0) {
        console.log(`[FinanceiroTab] Syncing ${mismatchedProducts.length} stock discrepancies back to database...`);
        try {
          const syncPromises = mismatchedProducts.map(async (p: any) => {
            const { error } = await supabase
              .from('produtos')
              .update({ estoque_atual: p.estoque_atual })
              .eq('id', p.id);
            if (error) {
              console.error(`Error syncing stock for product ID ${p.id} (${p.nome}):`, error);
            }
          });
          await Promise.all(syncPromises);
          queryClient.invalidateQueries({ queryKey: ['produtos-short', obraId] });
          queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
        } catch (err) {
          console.error("Error running client-side self-healing stock sync:", err);
        }
      }
    };

    syncStockToDatabase();
  }, [isLoadingGlobal, productsWithCosts, queryClient, obraId, entradasShort, ferramentasShort]);

  // 1. Identify virtual products ([FERRAMENTA]) with no physical tools associated
  const mismatchedProducts = produtosShort.filter((p: any) => {
    if (!p.nome?.startsWith('[FERRAMENTA]')) return false;
    const cleanName = p.nome.replace('[FERRAMENTA] ', '').trim().toLowerCase();
    
    // Check if there are any tools with this name in ferramentasShort
    const hasTools = ferramentasShort.some((f: any) => f.nome?.toLowerCase().trim() === cleanName);
    if (hasTools) return false;

    // Check if it has any financial entries
    const hasEntries = entradasShort.some((e: any) => e.produto_id === p.id);
    return hasEntries;
  });

  // 2. Identify unique tool names that have NO corresponding virtual product in the database
  const uniqueToolNames = Array.from(new Set(ferramentasShort.map((f: any) => f.nome?.trim()).filter(Boolean))) as string[];
  const mismatchedToolNames = uniqueToolNames.filter((toolName: string) => {
    const prodName = `[FERRAMENTA] ${toolName}`;
    const hasProduct = produtosShort.some((p: any) => p.nome?.toLowerCase().trim() === prodName.toLowerCase().trim());
    return !hasProduct;
  });

  const hasMismatches = mismatchedToolNames.length > 0 || mismatchedProducts.length > 0;

  // Execute manual tool and product renaming link/merge
  const handleExecuteLink = async () => {
    if (!selectedMismatchTool || !selectedTargetProductId) return;
    setExecutingLink(true);
    try {
      const targetProduct = produtosShort.find((p: any) => p.id === selectedTargetProductId);
      if (!targetProduct) throw new Error('Produto selecionado não encontrado.');
      const oldProductNameClean = targetProduct.nome.replace('[FERRAMENTA] ', '').trim();
      const newToolName = selectedMismatchTool;

      if (resolveStrategy === 'rename-product') {
        const { error: pError } = await supabase
          .from('produtos')
          .update({ nome: `[FERRAMENTA] ${newToolName}` })
          .eq('id', targetProduct.id);
        if (pError) throw pError;

        await supabase
          .from('ferramentas')
          .update({ nome: newToolName })
          .eq('obra_id', obraId)
          .eq('nome', oldProductNameClean);
      } else if (resolveStrategy === 'rename-tools') {
        const { error: fError } = await supabase
          .from('ferramentas')
          .update({ nome: oldProductNameClean })
          .eq('obra_id', obraId)
          .eq('nome', newToolName);
        if (fError) throw fError;
      }

      toast.success('Divergência resolvida com sucesso!');
      setLinkDialogOpen(false);
      setFixModalOpen(false);
      
      queryClient.invalidateQueries({ queryKey: ['produtos-short', obraId] });
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
    } catch (err: any) {
      toast.error('Erro ao resolver divergência: ' + err.message);
    } finally {
      setExecutingLink(false);
    }
  };

  // Base ativa: exclui produtos órfãos (sem entradas nem saídas nem estoque atual)
  const activeProducts = productsWithCosts.filter(
    (p: any) => p.allEntradasCount > 0 || p.allSaidasCount > 0 || p.totalSaidasQtd > 0 || p.estoque_atual > 0
  );

  // Summary Metrics
  const totalInvestidoObra = activeProducts.reduce((acc, p) => acc + p.totalInvestido, 0);
  const totalSaidasObra = activeProducts.reduce((acc, p) => acc + p.totalSaidasValor, 0);
  const totalEstoqueEstimadoObra = activeProducts.reduce((acc, p) => acc + p.valorEstoqueEstimado, 0);
  const totalProdutosComCusto = activeProducts.filter(p => p.custoMedio > 0).length;

  // Unique categories from active products
  const uniqueCategories = Array.from(
    new Set(activeProducts.map((p: any) => p.categoria).filter(Boolean))
  ) as string[];

  // Filtered List for Summary Tab
  const filteredProducts = activeProducts.filter((p: any) => {
    const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.categoria && p.categoria.toLowerCase().includes(search.toLowerCase()));
    
    const matchesSemCusto = filterSemCusto ? p.custoMedio === 0 : true;
    
    const matchesEstoque = 
      filterEstoque === 'todos' ? true :
      filterEstoque === 'zerados' ? p.estoque_atual === 0 :
      p.estoque_atual > 0;
      
    const matchesCategoria = 
      filterCategoria === 'todas' ? true :
      p.categoria?.toLowerCase() === filterCategoria.toLowerCase();

    return matchesSearch && matchesSemCusto && matchesEstoque && matchesCategoria;
  });

  // Client-side pagination for Summary Tab
  const [resumoPage, setResumoPage] = useState(0);
  const resumoPageSize = 15;
  const paginatedResumoProducts = filteredProducts.slice(
    resumoPage * resumoPageSize,
    (resumoPage + 1) * resumoPageSize
  );

  useEffect(() => {
    setResumoPage(0);
  }, [search, filterSemCusto, filterEstoque, filterCategoria]);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getProductCustoMedio = (produtoId: string) => {
    const p = productsWithCosts.find(prod => prod.id === produtoId);
    return p ? p.custoMedio : 0;
  };

  const exportPDF = async () => {
    const logo = await getBuddyLogo();
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.text('Relatório Financeiro de Estoque', 40, 60);
    
    if (logo) {
      const logoSize = 45;
      const x = doc.internal.pageSize.getWidth() - 40 - logoSize;
      doc.addImage(logo, 'PNG', x, 25, logoSize, logoSize);
    }

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Data de Geração: ${dataAtual}`, 40, 85);
    doc.text(`Total Investido (Entradas): ${formatCurrency(totalInvestidoObra)}`, 40, 102);
    doc.text(`Total Consumido (Saídas): ${formatCurrency(totalSaidasObra)}`, 40, 119);
    doc.text(`Valor Estimado de Estoque: ${formatCurrency(totalEstoqueEstimadoObra)}`, 40, 136);
    
    const tableData = filteredProducts.map((p: any) => [
      p.nome,
      `${p.estoque_atual} ${p.unidade}`,
      p.ultimoCusto > 0 ? formatCurrency(p.ultimoCusto) : '-',
      p.custoMedio > 0 ? formatCurrency(p.custoMedio) : '-',
      p.totalInvestido > 0 ? formatCurrency(p.totalInvestido) : '-',
      p.totalSaidasValor > 0 ? formatCurrency(p.totalSaidasValor) : '-',
      p.valorEstoqueEstimado > 0 ? formatCurrency(p.valorEstoqueEstimado) : '-'
    ]);

    autoTable(doc, {
      startY: 160,
      margin: { left: 40, right: 40, top: 40, bottom: 40 },
      head: [['Produto', 'Estoque', 'Último Custo', 'Custo Médio', 'Total Investido', 'Total Saídas', 'Estoque Estimado']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [14, 22, 41], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 4 },
      rowPageBreak: 'avoid',
    });

    doc.save(`financeiro-estoque-${dataAtual.replace(/\//g, '-')}.pdf`);
    toast.success('Relatório PDF exportado com sucesso!');
  };

  if (isLoadingGlobal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <h1 className="text-xl lg:text-2xl font-display font-bold">Financeiro de Estoque</h1>
        </div>
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Alert Banner for Tool Name Mismatches */}
      {hasMismatches && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex gap-3">
            <div className="p-2 bg-amber-500/15 text-amber-500 rounded-lg shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-foreground">Divergências de Estoque Detectadas</h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Existem ferramentas físicas com nomes divergentes dos lançamentos no Financeiro. Isso afeta o cálculo correto do estoque.
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setFixModalOpen(true)}
            className="h-9 rounded-lg text-xs font-semibold shrink-0 border-amber-500/30 hover:bg-amber-500/15 text-amber-500"
          >
            Visualizar e Corrigir ({mismatchedToolNames.length})
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <h1 className="text-xl lg:text-2xl font-display font-bold">Financeiro de Estoque</h1>
        </div>
        <Button variant="outline" size="sm" onClick={exportPDF} className="h-9">
          <Download className="h-4 w-4 mr-1.5" /> Exportar PDF
        </Button>
      </div>

      {/* Cards de Resumo Financeiro */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-primary/10 border shadow-sm bg-gradient-to-br from-[#0e1629] to-[#1a253e] text-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1.5 min-w-0">
              <p className="text-white/40 text-[9px] uppercase tracking-[0.2em] font-bold truncate">Total Investido (Entradas)</p>
              <h3 className="text-xl font-display font-bold truncate">{formatCurrency(totalInvestidoObra)}</h3>
              <p className="text-xs text-white/50 truncate">Todas as compras registradas</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/20 shrink-0 ml-2">
              <DollarSign className="h-5 w-5 text-primary-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/10 border shadow-sm bg-[#161f30] text-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1.5 min-w-0">
              <p className="text-white/40 text-[9px] uppercase tracking-[0.2em] font-bold truncate">Total Consumido (Saídas)</p>
              <h3 className="text-xl font-display font-bold text-destructive truncate">{formatCurrency(totalSaidasObra)}</h3>
              <p className="text-xs text-white/50 truncate">Materiais retirados do estoque</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-destructive/15 flex items-center justify-center border border-destructive/20 shrink-0 ml-2">
              <ArrowUpFromLine className="h-5 w-5 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 border shadow-sm bg-[#161f30] text-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1.5 min-w-0">
              <p className="text-white/40 text-[9px] uppercase tracking-[0.2em] font-bold truncate">Estoque Atual</p>
              <h3 className="text-xl font-display font-bold text-[#10b981] truncate">{formatCurrency(totalEstoqueEstimadoObra)}</h3>
              <p className="text-xs text-white/50 truncate">Baseado no Custo Médio</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#10b981]/15 flex items-center justify-center border border-[#10b981]/20 shrink-0 ml-2">
              <TrendingUp className="h-5 w-5 text-[#10b981]" />
            </div>
          </CardContent>
        </Card>

        <Card 
          onClick={() => setFilterSemCusto(!filterSemCusto)}
          className={`border-primary/10 border shadow-sm bg-[#161f30] text-white cursor-pointer hover:bg-[#1f2b44] transition-all select-none duration-200 ${
            filterSemCusto ? 'ring-2 ring-[#f59e0b] ring-offset-2 ring-offset-[#0e1629]' : ''
          }`}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1.5 min-w-0">
              <p className="text-white/40 text-[9px] uppercase tracking-[0.2em] font-bold truncate">Métricas de Cobertura</p>
              <h3 className="text-xl font-display font-bold text-[#f59e0b] truncate">{totalProdutosComCusto} / {activeProducts.length}</h3>
              <p className="text-xs text-white/50 truncate">
                {filterSemCusto ? 'Mostrando apenas sem custo' : 'Clique para ver os sem custo'}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#f59e0b]/15 flex items-center justify-center border border-[#f59e0b]/20 shrink-0 ml-2">
              <BarChart3 className="h-5 w-5 text-[#f59e0b]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue="resumo" className="w-full space-y-6">
        <TabsList className="bg-muted/80 p-1 rounded-xl grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="resumo" className="rounded-lg h-9 font-semibold text-xs flex items-center justify-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Resumo do Inventário
          </TabsTrigger>
          <TabsTrigger value="compras" className="rounded-lg h-9 font-semibold text-xs flex items-center justify-center gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5 text-[#10b981]" />
            Diário de Compras
          </TabsTrigger>
          <TabsTrigger value="consumos" className="rounded-lg h-9 font-semibold text-xs flex items-center justify-center gap-1.5">
            <ArrowUpFromLine className="h-3.5 w-3.5 text-destructive" />
            Diário de Consumos
          </TabsTrigger>
        </TabsList>

        {/* Tab: Resumo do Inventário */}
        <TabsContent value="resumo" className="space-y-6">
          <Card className="border-primary/10 border shadow-sm">
            <CardContent className="p-5">
              <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto por nome..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-10 bg-background"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Filtro de Estoque */}
                  <div className="w-[180px]">
                    <Select value={filterEstoque} onValueChange={(val: any) => setFilterEstoque(val)}>
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Estoque" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os Itens</SelectItem>
                        <SelectItem value="disponiveis">Apenas em Estoque</SelectItem>
                        <SelectItem value="zerados">Estoque Zerado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Filtro de Categorias */}
                  <div className="w-[200px]">
                    <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as Categorias</SelectItem>
                        {uniqueCategories.map(cat => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    variant={filterSemCusto ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setFilterSemCusto(!filterSemCusto)} 
                    className={`h-10 text-xs px-3 rounded-lg transition-all duration-200 shrink-0 ${
                      filterSemCusto 
                        ? 'bg-[#f59e0b] hover:bg-[#d97706] text-white border-none' 
                        : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                    Sem Custo
                  </Button>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden bg-card/50">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground text-xs uppercase font-semibold border-b">
                      <tr>
                        <th className="px-5 py-4">Produto</th>
                        <th className="px-5 py-4 text-center">Estoque</th>
                        <th className="px-5 py-4 text-right">Último Custo</th>
                        <th className="px-5 py-4 text-right">Custo Médio</th>
                        <th className="px-5 py-4 text-right">Total Investido</th>
                        <th className="px-5 py-4 text-right">Total Saídas</th>
                        <th className="px-5 py-4 text-right">Valor em Estoque</th>
                        <th className="px-5 py-4 text-center w-20">Histórico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {paginatedResumoProducts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                            Nenhum produto encontrado com os filtros informados.
                          </td>
                        </tr>
                      ) : (
                        paginatedResumoProducts.map((p: any) => (
                          <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-5 py-4">
                              <span className="font-semibold text-foreground">{p.nome}</span>
                              {p.categoria && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                                  {p.categoria}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-center font-mono">
                              {p.estoque_atual} <span className="text-xs text-muted-foreground font-normal">{p.unidade}</span>
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-medium">
                              {p.ultimoCusto > 0 ? formatCurrency(p.ultimoCusto) : <span className="text-muted-foreground">-</span>}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-bold text-primary">
                              {p.custoMedio > 0 ? formatCurrency(p.custoMedio) : <span className="text-muted-foreground">-</span>}
                            </td>
                            <td className="px-5 py-4 text-right font-mono text-muted-foreground">
                              {p.totalInvestido > 0 ? formatCurrency(p.totalInvestido) : '-'}
                            </td>
                            <td className="px-5 py-4 text-right font-mono text-destructive">
                              {p.totalSaidasValor > 0 ? formatCurrency(p.totalSaidasValor) : '-'}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-semibold text-[#10b981]">
                              {p.valorEstoqueEstimado > 0 ? formatCurrency(p.valorEstoqueEstimado) : '-'}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-primary hover:text-primary/80" 
                                onClick={() => setSelectedProduct(p)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Client-side Pagination for Summary */}
              {filteredProducts.length > resumoPageSize && (
                <div className="flex justify-between items-center mt-4">
                  <span className="text-xs text-muted-foreground">
                    Mostrando {resumoPage * resumoPageSize + 1} a {Math.min((resumoPage + 1) * resumoPageSize, filteredProducts.length)} de {filteredProducts.length} produtos
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resumoPage === 0}
                      onClick={() => setResumoPage(prev => prev - 1)}
                      className="h-8 px-2"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(resumoPage + 1) * resumoPageSize >= filteredProducts.length}
                      onClick={() => setResumoPage(prev => prev + 1)}
                      className="h-8 px-2"
                    >
                      Próximo <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Diário de Compras (Entradas) */}
        <TabsContent value="compras">
          <Card className="border-primary/10 border shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por produto ou fornecedor..."
                    value={comprasSearch}
                    onChange={(e) => {
                      setComprasSearch(e.target.value);
                      setComprasPage(0);
                    }}
                    className="pl-9 h-10 bg-background"
                  />
                </div>
              </div>

              {loadingCompras ? (
                <SkeletonList count={3} />
              ) : (
                <>
                  <div className="border rounded-xl overflow-hidden bg-card/50">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase font-semibold border-b">
                          <tr>
                            <th className="px-5 py-4">Data</th>
                            <th className="px-5 py-4">Produto</th>
                            <th className="px-5 py-4">Fornecedor</th>
                            <th className="px-5 py-4 text-center">Quantidade</th>
                            <th className="px-5 py-4 text-right">Valor Unitário</th>
                            <th className="px-5 py-4 text-right">Valor Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {comprasData?.data.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                                Nenhuma entrada / compra registrada.
                              </td>
                            </tr>
                          ) : (
                            comprasData?.data.map((ent: any) => {
                              const valorTotal = ent.valor_unitario ? Number(ent.quantidade) * Number(ent.valor_unitario) : 0;
                              return (
                                <tr key={ent.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="px-5 py-4">
                                    {new Date(ent.data).toLocaleDateString('pt-BR')}
                                  </td>
                                  <td className="px-5 py-4 font-semibold text-foreground">
                                    {ent.produto?.nome || 'Produto não encontrado'}
                                  </td>
                                  <td className="px-5 py-4">
                                    {ent.fornecedor || <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                  <td className="px-5 py-4 text-center font-mono font-medium">
                                    {ent.quantidade} <span className="text-xs text-muted-foreground font-normal">{ent.produto?.unidade}</span>
                                  </td>
                                  <td className="px-5 py-4 text-right font-mono">
                                    {ent.valor_unitario ? formatCurrency(Number(ent.valor_unitario)) : <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                  <td className="px-5 py-4 text-right font-mono font-semibold text-primary">
                                    {valorTotal > 0 ? formatCurrency(valorTotal) : <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Compras Pagination */}
                  {comprasData && comprasData.count > comprasPageSize && (
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-xs text-muted-foreground">
                        Mostrando {comprasPage * comprasPageSize + 1} a {Math.min((comprasPage + 1) * comprasPageSize, comprasData.count)} de {comprasData.count} lançamentos
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={comprasPage === 0}
                          onClick={() => setComprasPage(prev => prev - 1)}
                          className="h-8 px-2"
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={(comprasPage + 1) * comprasPageSize >= comprasData.count}
                          onClick={() => setComprasPage(prev => prev + 1)}
                          className="h-8 px-2"
                        >
                          Próximo <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Diário de Consumos (Saídas) */}
        <TabsContent value="consumos">
          <Card className="border-primary/10 border shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por produto ou responsável..."
                    value={consumosSearch}
                    onChange={(e) => {
                      setConsumosSearch(e.target.value);
                      setConsumosPage(0);
                    }}
                    className="pl-9 h-10 bg-background"
                  />
                </div>
              </div>

              {loadingConsumos ? (
                <SkeletonList count={3} />
              ) : (
                <>
                  <div className="border rounded-xl overflow-hidden bg-card/50">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase font-semibold border-b">
                          <tr>
                            <th className="px-5 py-4">Data</th>
                            <th className="px-5 py-4">Produto</th>
                            <th className="px-5 py-4">Retirado por</th>
                            <th className="px-5 py-4 text-center">Quantidade</th>
                            <th className="px-5 py-4 text-right">Custo Médio Unitário</th>
                            <th className="px-5 py-4 text-right">Custo Consumido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {consumosData?.data.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                                Nenhuma saída / consumo registrado.
                              </td>
                            </tr>
                          ) : (
                            consumosData?.data.map((sai: any) => {
                              const cMedio = getProductCustoMedio(sai.produto?.id);
                              const custoConsumido = Number(sai.quantidade) * cMedio;
                              return (
                                <tr key={sai.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="px-5 py-4">
                                    {new Date(sai.data).toLocaleDateString('pt-BR')}
                                  </td>
                                  <td className="px-5 py-4 font-semibold text-foreground">
                                    {sai.produto?.nome || 'Produto não encontrado'}
                                  </td>
                                  <td className="px-5 py-4">
                                    {sai.pessoas?.nome || <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                  <td className="px-5 py-4 text-center font-mono font-medium text-destructive">
                                    -{sai.quantidade} <span className="text-xs text-muted-foreground font-normal">{sai.produto?.unidade}</span>
                                  </td>
                                  <td className="px-5 py-4 text-right font-mono text-muted-foreground">
                                    {cMedio > 0 ? formatCurrency(cMedio) : <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                  <td className="px-5 py-4 text-right font-mono font-semibold text-destructive">
                                    {custoConsumido > 0 ? formatCurrency(custoConsumido) : <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Consumos Pagination */}
                  {consumosData && consumosData.count > consumosPageSize && (
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-xs text-muted-foreground">
                        Mostrando {consumosPage * consumosPageSize + 1} a {Math.min((consumosPage + 1) * consumosPageSize, consumosData.count)} de {consumosData.count} consumos
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={consumosPage === 0}
                          onClick={() => setConsumosPage(prev => prev - 1)}
                          className="h-8 px-2"
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={(consumosPage + 1) * consumosPageSize >= consumosData.count}
                          onClick={() => setConsumosPage(prev => prev + 1)}
                          className="h-8 px-2"
                        >
                          Próximo <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Histórico de Custos e Consumos do Produto (Lazy Loading) */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Histórico de Movimentações: {selectedProduct?.nome}
            </DialogTitle>
          </DialogHeader>

          {selectedProduct && (
            <div className="space-y-6">
              {/* Resumo rápido do card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border bg-muted/30">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Estoque Atual</p>
                  <p className="text-sm font-semibold mt-0.5">{selectedProduct.estoque_atual} {selectedProduct.unidade}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Último Custo</p>
                  <p className="text-sm font-semibold mt-0.5">{selectedProduct.ultimoCusto > 0 ? formatCurrency(selectedProduct.ultimoCusto) : '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Custo Médio</p>
                  <p className="text-sm font-bold text-primary mt-0.5">{selectedProduct.custoMedio > 0 ? formatCurrency(selectedProduct.custoMedio) : '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Investimento Total</p>
                  <p className="text-sm font-semibold mt-0.5">{formatCurrency(selectedProduct.totalInvestido)}</p>
                </div>
              </div>

              {/* Tabs para Entradas vs Saídas no Modal */}
              <Tabs defaultValue="entradas" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1 rounded-xl">
                  <TabsTrigger value="entradas" className="rounded-lg h-9 font-semibold text-xs flex items-center justify-center gap-1.5">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-primary" />
                    Entradas / Compras ({selectedProduct.allEntradasCount})
                  </TabsTrigger>
                  <TabsTrigger value="saidas" className="rounded-lg h-9 font-semibold text-xs flex items-center justify-center gap-1.5">
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-destructive" />
                    Saídas / Consumos ({selectedProduct.allSaidasCount})
                  </TabsTrigger>
                </TabsList>

                {/* Tab Entradas no Modal */}
                <TabsContent value="entradas">
                  {loadingSelectedEntries ? (
                    <SkeletonList count={2} />
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted text-muted-foreground font-semibold uppercase">
                          <tr>
                            <th className="px-4 py-3">Data</th>
                            <th className="px-4 py-3">Fornecedor</th>
                            <th className="px-4 py-3 text-center">Quantidade</th>
                            <th className="px-4 py-3 text-right">Valor Unitário</th>
                            <th className="px-4 py-3 text-right">Valor Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedProductEntries.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                                Nenhum registro de entrada para este produto.
                              </td>
                            </tr>
                          ) : (
                            selectedProductEntries.map((ent: any) => {
                              const valorTotal = ent.valor_unitario ? Number(ent.quantidade) * Number(ent.valor_unitario) : 0;
                              return (
                                <tr key={ent.id} className="hover:bg-muted/10">
                                  <td className="px-4 py-3">
                                    {new Date(ent.data).toLocaleDateString('pt-BR')}
                                  </td>
                                  <td className="px-4 py-3 truncate max-w-[150px]">
                                    {ent.fornecedor || <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono font-medium">
                                    {ent.quantidade} <span className="text-[10px] text-muted-foreground font-normal">{selectedProduct.unidade}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono">
                                    {ent.valor_unitario ? formatCurrency(Number(ent.valor_unitario)) : <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-semibold">
                                    {valorTotal > 0 ? formatCurrency(valorTotal) : <span className="text-muted-foreground font-light">-</span>}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* Tab Saídas no Modal */}
                <TabsContent value="saidas">
                  {loadingSelectedSaidas ? (
                    <SkeletonList count={2} />
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted text-muted-foreground font-semibold uppercase">
                          {selectedProduct.nome.startsWith('[FERRAMENTA]') ? (
                            <tr>
                              <th className="px-4 py-3">Data</th>
                              <th className="px-4 py-3">Tipo / Evento</th>
                              <th className="px-4 py-3">Responsável</th>
                              <th className="px-4 py-3">Observação</th>
                            </tr>
                          ) : (
                            <tr>
                              <th className="px-4 py-3">Data</th>
                              <th className="px-4 py-3">Retirado por</th>
                              <th className="px-4 py-3 text-center">Quantidade</th>
                              <th className="px-4 py-3 text-right">Custo Médio Ponderado</th>
                              <th className="px-4 py-3 text-right">Custo Consumido</th>
                            </tr>
                          )}
                        </thead>
                        <tbody className="divide-y">
                          {selectedProduct.nome.startsWith('[FERRAMENTA]') ? (
                            selectedProductMovs.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                                  Nenhum registro de movimentação para esta ferramenta.
                                </td>
                              </tr>
                            ) : (
                              selectedProductMovs.map((mov: any) => {
                                const pessoasMap = new Map(pessoas.map((p: any) => [p.id, p.nome]));
                                const pessoaNome = mov.usuario_id ? pessoasMap.get(mov.usuario_id) : null;
                                return (
                                  <tr key={mov.id} className="hover:bg-muted/10">
                                    <td className="px-4 py-3">
                                      {new Date(mov.data_hora).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                                        mov.tipo === 'RETIRADA' ? 'bg-warning/10 text-warning' :
                                        mov.tipo === 'DEVOLUCAO' ? 'bg-success/10 text-success' :
                                        mov.tipo === 'MANUTENCAO' ? 'bg-destructive/10 text-destructive' :
                                        mov.tipo === 'BAIXA' ? 'bg-zinc-500/10 text-zinc-500' :
                                        'bg-red-500/10 text-red-500'
                                      }`}>
                                        {mov.tipo}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[150px]">
                                      {pessoaNome || <span className="text-muted-foreground font-light">-</span>}
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[200px]">
                                      {mov.observacao || <span className="text-muted-foreground font-light">-</span>}
                                    </td>
                                  </tr>
                                );
                              })
                            )
                          ) : (
                            selectedProductSaidas.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                                  Nenhum registro de saída para este produto.
                                </td>
                              </tr>
                            ) : (
                              selectedProductSaidas.map((sai: any) => {
                                const custoConsumido = Number(sai.quantidade) * selectedProduct.custoMedio;
                                return (
                                  <tr key={sai.id} className="hover:bg-muted/10">
                                    <td className="px-4 py-3">
                                      {new Date(sai.data).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[150px]">
                                      {sai.pessoas?.nome || <span className="text-muted-foreground font-light">-</span>}
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono font-medium">
                                      -{sai.quantidade} <span className="text-[10px] text-muted-foreground font-normal">{selectedProduct.unidade}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                      {selectedProduct.custoMedio > 0 ? formatCurrency(selectedProduct.custoMedio) : <span className="text-muted-foreground font-light">-</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold text-destructive">
                                      {custoConsumido > 0 ? formatCurrency(custoConsumido) : <span className="text-muted-foreground font-light">-</span>}
                                    </td>
                                  </tr>
                                );
                              })
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Mismatch Correction List Dialog */}
      <Dialog open={fixModalOpen} onOpenChange={setFixModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Corrigir Divergências de Ferramentas
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              As ferramentas abaixo foram renomeadas na aba Ferramentas, mas o lançamento financeiro correspondente no Financeiro ainda possui o nome antigo. 
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">
              Selecione uma ferramenta e vincule-a ao seu histórico financeiro correto para restaurar os saldos de estoque.
            </p>
          </DialogHeader>

          <div className="space-y-4 my-4 max-h-[300px] overflow-y-auto pr-1">
            {mismatchedToolNames.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Nenhuma divergência pendente encontrada!
              </div>
            ) : (
              mismatchedToolNames.map((toolName: string) => {
                const suggestion = mismatchedProducts.find((p: any) => {
                  const prodClean = p.nome.replace('[FERRAMENTA] ', '').toLowerCase();
                  const toolClean = toolName.toLowerCase();
                  return prodClean.includes(toolClean) || toolClean.includes(prodClean);
                });

                return (
                  <div key={toolName} className="p-4 border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-accent/15">
                    <div>
                      <span className="font-semibold text-sm text-foreground block">{toolName}</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        Unidades físicas sem lançamento financeiro correspondente.
                      </p>
                      {suggestion && (
                        <p className="text-[11px] text-amber-500 font-medium mt-1">
                          Sugestão: Vincular ao produto "{suggestion.nome.replace('[FERRAMENTA] ', '')}"
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedMismatchTool(toolName);
                        if (suggestion) {
                          setSelectedTargetProductId(suggestion.id);
                        } else if (mismatchedProducts.length > 0) {
                          setSelectedTargetProductId(mismatchedProducts[0].id);
                        } else {
                          setSelectedTargetProductId('');
                        }
                        setResolveStrategy('rename-product');
                        setLinkDialogOpen(true);
                      }}
                      className="shrink-0 h-9 px-4 rounded-lg text-xs"
                    >
                      Vincular
                    </Button>
                  </div>
                );
              })
            )}

            {mismatchedProducts.length > 0 && (
              <div className="mt-4 pt-4 border-t border-t-border">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  Produtos Financeiros sem Ferramentas (Órfãos):
                </span>
                <div className="space-y-2">
                  {mismatchedProducts.map((p: any) => (
                    <div key={p.id} className="p-3 border border-border/60 rounded-lg bg-muted/20 text-xs flex justify-between items-center">
                      <span className="font-medium text-muted-foreground">{p.nome.replace('[FERRAMENTA] ', '')}</span>
                      <span className="text-[10px] bg-muted-foreground/10 text-muted-foreground px-2 py-0.5 rounded-full">
                        {p.allEntradasCount || 0} compras registradas
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-2">
            <Button variant="outline" onClick={() => setFixModalOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Linking Mismatch Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-lg">Vincular Ferramenta ao Financeiro</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Vincule as ferramentas do tipo <strong className="text-foreground">"{selectedMismatchTool}"</strong> a um produto financeiro existente.
            </p>
          </DialogHeader>

          <div className="space-y-4 my-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground block">Selecione o Lançamento Financeiro:</label>
              <Select value={selectedTargetProductId} onValueChange={setSelectedTargetProductId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Selecione um produto..." />
                </SelectTrigger>
                <SelectContent>
                  {mismatchedProducts.length > 0 && (
                    <>
                      <SelectItem value="header-mismatched" disabled className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Produtos Sem Vínculo (Recomendado)
                      </SelectItem>
                      {mismatchedProducts.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome.replace('[FERRAMENTA] ', '')} ({p.allEntradasCount || 0} compras)
                        </SelectItem>
                      ))}
                      <SelectItem value="separator" disabled>────────────────────────</SelectItem>
                    </>
                  )}
                  <SelectItem value="header-all" disabled className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Todos os Produtos de Ferramentas
                  </SelectItem>
                  {produtosShort
                    .filter((p: any) => p.nome?.startsWith('[FERRAMENTA]') && !mismatchedProducts.some((mp: any) => mp.id === p.id))
                    .map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome.replace('[FERRAMENTA] ', '')}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground block">Estratégia de Resolução:</label>
              <Select value={resolveStrategy} onValueChange={setResolveStrategy}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rename-product">
                    Renomear no Financeiro para "{selectedMismatchTool}" (Recomendado)
                  </SelectItem>
                  <SelectItem value="rename-tools">
                    Renomear ferramentas físicas para o nome do Financeiro
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} className="h-10 px-4 rounded-lg">
              Cancelar
            </Button>
            <Button 
              onClick={handleExecuteLink}
              disabled={!selectedTargetProductId || selectedTargetProductId === 'separator' || selectedTargetProductId.startsWith('header-') || executingLink}
              className="h-10 px-5 rounded-lg font-semibold"
            >
              {executingLink ? 'Processando...' : 'Confirmar Vínculo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
