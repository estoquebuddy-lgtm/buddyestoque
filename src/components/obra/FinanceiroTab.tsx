import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, DollarSign, TrendingUp, BarChart3, Clock, Eye, Download, ArrowUpFromLine, ArrowDownToLine } from 'lucide-react';
import SkeletonList from '@/components/SkeletonList';
import { SidebarTrigger } from '@/components/ui/sidebar';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface FinanceiroTabProps {
  obraId: string;
}

export default function FinanceiroTab({ obraId }: FinanceiroTabProps) {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel1 = supabase.channel('financeiro-produtos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      }).subscribe();
      
    const channel2 = supabase.channel('financeiro-entradas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entradas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      }).subscribe();
      
    const channel3 = supabase.channel('financeiro-saidas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['saidas', obraId] });
      }).subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
      supabase.removeChannel(channel3);
    };
  }, [obraId, queryClient]);

  // Queries
  const { data: produtos = [], isLoading: loadingProds } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('produtos')
        .select('*')
        .eq('obra_id', obraId)
        .order('nome');
      return data || [];
    }
  });

  const { data: entradas = [], isLoading: loadingEntradas } = useQuery({
    queryKey: ['entradas', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('entradas')
        .select('*')
        .eq('obra_id', obraId)
        .order('data', { ascending: false });
      return data || [];
    }
  });

  const { data: saidas = [], isLoading: loadingSaidas } = useQuery({
    queryKey: ['saidas', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('saidas')
        .select('*, pessoas(nome)')
        .eq('obra_id', obraId)
        .order('data', { ascending: false });
      return data || [];
    }
  });

  const isLoading = loadingProds || loadingEntradas || loadingSaidas;

  // Process data in-memory for instant, robust, and clean calculations
  const productsWithCosts = produtos.map((prod: any) => {
    const prodEntradas = entradas.filter((e: any) => e.produto_id === prod.id);
    const prodSaidas = saidas.filter((s: any) => s.produto_id === prod.id);

    // Only entries with a cost > 0
    const costEntradas = prodEntradas.filter((e: any) => e.valor_unitario !== null && Number(e.valor_unitario) > 0);

    // 1. Último Custo (most recent entry with valid cost)
    const latestCostEntry = costEntradas[0];
    const ultimoCusto = latestCostEntry ? Number(latestCostEntry.valor_unitario) : 0;

    // 2. Custo Médio Ponderado
    const totalQtd = costEntradas.reduce((acc, curr) => acc + Number(curr.quantidade), 0);
    const totalVal = costEntradas.reduce((acc, curr) => acc + (Number(curr.quantidade) * Number(curr.valor_unitario)), 0);
    const custoMedio = totalQtd > 0 ? totalVal / totalQtd : 0;

    // 3. Total Investido (Entradas)
    const totalInvestido = totalVal;

    // 4. Total Saídas (Consumo) - Quantidade total de saídas multiplicada pelo custo médio ponderado
    const totalSaidasQtd = prodSaidas.reduce((acc, curr) => acc + Number(curr.quantidade), 0);
    const totalSaidasValor = totalSaidasQtd * custoMedio;

    // 5. Valor Estimado do Estoque
    const valorEstoqueEstimado = Number(prod.estoque_atual) * custoMedio;

    return {
      ...prod,
      ultimoCusto,
      custoMedio,
      totalInvestido,
      totalSaidasQtd,
      totalSaidasValor,
      valorEstoqueEstimado,
      allEntradas: prodEntradas,
      allSaidas: prodSaidas
    };
  });

  // Base ativa: exclui produtos órfãos (sem entradas nem saídas) — igual ao que é exibido na lista
  const activeProducts = productsWithCosts.filter(
    (p: any) => p.allEntradas.length > 0 || p.allSaidas.length > 0
  );

  // Summary Metrics — calculadas sobre a base ativa (sem órfãos)
  const totalInvestidoObra = activeProducts.reduce((acc, p) => acc + p.totalInvestido, 0);
  const totalSaidasObra = activeProducts.reduce((acc, p) => acc + p.totalSaidasValor, 0);
  const totalEstoqueEstimadoObra = activeProducts.reduce((acc, p) => acc + p.valorEstoqueEstimado, 0);
  const totalProdutosComCusto = activeProducts.filter(p => p.custoMedio > 0).length;

  // Filtered List — aplica busca sobre a base ativa
  const filteredProducts = activeProducts.filter((p: any) =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    (p.categoria && p.categoria.toLowerCase().includes(search.toLowerCase()))
  );

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    doc.setFontSize(18);
    doc.text('Relatório Financeiro de Estoque', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Data de Geração: ${dataAtual}`, 14, 30);
    doc.text(`Total Investido (Entradas): ${formatCurrency(totalInvestidoObra)}`, 14, 36);
    doc.text(`Total Consumido (Saídas): ${formatCurrency(totalSaidasObra)}`, 14, 42);
    doc.text(`Valor Estimado de Estoque: ${formatCurrency(totalEstoqueEstimadoObra)}`, 14, 48);
    
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
      startY: 54,
      head: [['Produto', 'Estoque', 'Último Custo', 'Custo Médio', 'Total Investido', 'Total Saídas', 'Estoque Estimado']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [14, 22, 41] }, // Dark aesthetic headers
    });

    doc.save(`financeiro-estoque-${dataAtual.replace(/\//g, '-')}.pdf`);
    toast.success('Relatório PDF exportado com sucesso!');
  };

  if (isLoading) {
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

        <Card className="border-primary/10 border shadow-sm bg-[#161f30] text-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1.5 min-w-0">
              <p className="text-white/40 text-[9px] uppercase tracking-[0.2em] font-bold truncate">Métricas de Cobertura</p>
              <h3 className="text-xl font-display font-bold text-[#f59e0b] truncate">{totalProdutosComCusto} / {produtos.length}</h3>
              <p className="text-xs text-white/50 truncate">Produtos com histórico de custo</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#f59e0b]/15 flex items-center justify-center border border-[#f59e0b]/20 shrink-0 ml-2">
              <BarChart3 className="h-5 w-5 text-[#f59e0b]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Produtos */}
      <Card className="border-primary/10 border shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto por nome ou categoria..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 bg-background"
              />
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
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                        Nenhum produto encontrado com os filtros informados.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p: any) => (
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
        </CardContent>
      </Card>

      {/* Modal de Histórico de Custos e Consumos do Produto */}
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

              {/* Tabs para Entradas vs Saídas */}
              <Tabs defaultValue="entradas" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1 rounded-xl">
                  <TabsTrigger value="entradas" className="rounded-lg h-9 font-semibold text-xs flex items-center justify-center gap-1.5">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-primary" />
                    Entradas / Compras ({selectedProduct.allEntradas.length})
                  </TabsTrigger>
                  <TabsTrigger value="saidas" className="rounded-lg h-9 font-semibold text-xs flex items-center justify-center gap-1.5">
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-destructive" />
                    Saídas / Consumos ({selectedProduct.allSaidas.length})
                  </TabsTrigger>
                </TabsList>

                {/* Tab Entradas */}
                <TabsContent value="entradas">
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
                        {selectedProduct.allEntradas.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                              Nenhum registro de entrada para este produto.
                            </td>
                          </tr>
                        ) : (
                          selectedProduct.allEntradas.map((ent: any) => {
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
                                  {ent.valor_unitario ? formatCurrency(Number(ent.valor_unitario)) : <span className="text-muted-foreground font-light">Não registrado</span>}
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
                </TabsContent>

                {/* Tab Saídas */}
                <TabsContent value="saidas">
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted text-muted-foreground font-semibold uppercase">
                        <tr>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Retirado por</th>
                          <th className="px-4 py-3 text-center">Quantidade</th>
                          <th className="px-4 py-3 text-right">Custo Médio Ponderado</th>
                          <th className="px-4 py-3 text-right">Custo Consumido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedProduct.allSaidas.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                              Nenhum registro de saída para este produto.
                            </td>
                          </tr>
                        ) : (
                          selectedProduct.allSaidas.map((sai: any) => {
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
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
