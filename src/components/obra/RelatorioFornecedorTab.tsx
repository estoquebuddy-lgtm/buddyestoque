import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, FileSpreadsheet, Store, DollarSign, ArrowDownToLine, ReceiptText, Calendar } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import SkeletonList from '@/components/SkeletonList';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface RelatorioFornecedorTabProps {
  obraId: string;
}

export default function RelatorioFornecedorTab({ obraId }: RelatorioFornecedorTabProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  useEffect(() => {
    setSelectedMonth('all');
  }, [selectedSupplier]);

  const mesKey = (d?: string | null) => {
    if (!d) return '';
    const m = d.match(/(\d{4})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}` : '';
  };
  
  const mesLabel = (k: string) => {
    if (!k) return 'Sem data';
    const [a, m] = k.split('-');
    const n = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${n[parseInt(m)] || m}/${a}`;
  };

  const fmt = (n?: number | null) =>
    (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const fmtDate = (d?: string | null) => {
    if (!d) return '—';
    try {
      const datePart = d.split('T')[0];
      const parts = datePart.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return d;
    } catch {
      return d;
    }
  };

  // 1. Get unique supplier list across both compras and entradas (grouped case-insensitively)
  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ['report-suppliers', obraId],
    queryFn: async () => {
      const [comprasRes, entradasRes] = await Promise.all([
        supabase.from('compras').select('fornecedor_nome').eq('obra_id', obraId).not('fornecedor_nome', 'is', null).neq('fornecedor_nome', ''),
        supabase.from('entradas').select('fornecedor').eq('obra_id', obraId).not('fornecedor', 'is', null).neq('fornecedor', '')
      ]);

      const map = new Map<string, string>();
      (comprasRes.data || []).forEach((c: any) => {
        const name = (c.fornecedor_nome || '').trim();
        if (name) {
          const key = name.toLowerCase();
          if (!map.has(key) || name === name.toUpperCase()) {
            map.set(key, name);
          }
        }
      });
      (entradasRes.data || []).forEach((e: any) => {
        const name = (e.fornecedor || '').trim();
        if (name) {
          const key = name.toLowerCase();
          if (!map.has(key) || name === name.toUpperCase()) {
            map.set(key, name);
          }
        }
      });

      return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    }
  });

  // 2. Query compras & entradas data for the selected supplier (using case-insensitive matching)
  const { data: supplierData = { compras: [], entradas: [] }, isLoading: loadingData } = useQuery({
    queryKey: ['report-supplier-data', obraId, selectedSupplier],
    enabled: !!selectedSupplier,
    queryFn: async () => {
      const [comprasRes, entradasRes] = await Promise.all([
        supabase
          .from('compras')
          .select('*, compras_nfs_vinculos(compras_nfs(*))')
          .eq('obra_id', obraId)
          .ilike('fornecedor_nome', selectedSupplier),
        supabase
          .from('entradas')
          .select('*, produtos(nome, unidade, categoria)')
          .eq('obra_id', obraId)
          .ilike('fornecedor', selectedSupplier)
      ]);

      // Mapeamento idêntico de NFs da aba Compras
      const mappedCompras = (comprasRes.data || []).map((c: any) => {
        const nfs = (c.compras_nfs_vinculos || [])
          .map((v: any) => v.compras_nfs)
          .filter(Boolean);
        return {
          ...c,
          compras_nfs: nfs
        };
      });

      return {
        compras: mappedCompras.sort((a: any, b: any) => (b.data_envio || '').localeCompare(a.data_envio || '')),
        entradas: (entradasRes.data || []).sort((a: any, b: any) => (b.data || '').localeCompare(a.data || ''))
      };
    }
  });

  // 3. Extract months and build filtered data
  const months = useMemo(() => {
    const s = new Set<string>();
    supplierData.compras.forEach((c: any) => {
      const k1 = mesKey(c.data_envio);
      const k2 = mesKey(c.data_pagamento);
      if (k1) s.add(k1);
      if (k2) s.add(k2);
    });
    supplierData.entradas.forEach((e: any) => {
      const k = mesKey(e.data);
      if (k) s.add(k);
    });
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [supplierData]);

  const filteredData = useMemo(() => {
    let compras = [...supplierData.compras];
    let entradas = [...supplierData.entradas];

    if (selectedMonth !== 'all') {
      compras = compras.filter(
        (c: any) => mesKey(c.data_envio) === selectedMonth || mesKey(c.data_pagamento) === selectedMonth
      );
      entradas = entradas.filter(
        (e: any) => mesKey(e.data) === selectedMonth
      );
    }

    return { compras, entradas };
  }, [supplierData, selectedMonth]);

  // 4. Stats calculations
  const stats = useMemo(() => {
    let sol = 0, pago = 0, estornado = 0;
    filteredData.compras.forEach((c: any) => {
      if (!c.estornado) {
        sol += c.valor_solicitado || 0;
        pago += c.valor_pago || 0;
        estornado += c.valor_estornado || 0;
      }
    });

    const totalEntradasVal = filteredData.entradas.reduce((acc: number, curr: any) => {
      const valorTotal = curr.valor_unitario ? Number(curr.quantidade) * Number(curr.valor_unitario) : 0;
      return acc + valorTotal;
    }, 0);

    return {
      comprasCount: filteredData.compras.length,
      sol,
      pago,
      estornado,
      liquido: pago - estornado,
      entradasCount: filteredData.entradas.length,
      entradasVal: totalEntradasVal
    };
  }, [filteredData]);

  const exportPDF = () => {
    if (!selectedSupplier) return;
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');

    // Title Section
    doc.setFontSize(18);
    const title = selectedMonth !== 'all' 
      ? `Relatório: ${selectedSupplier} (${mesLabel(selectedMonth)})`
      : `Relatório de Fornecedor: ${selectedSupplier}`;
    doc.text(title, 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Obra ID: ${obraId}`, 14, 28);
    doc.text(`Data de Emissão: ${dataAtual}`, 14, 34);

    // Summary Card
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Resumo Financeiro & Entradas', 14, 44);

    autoTable(doc, {
      startY: 48,
      head: [['Métrica', 'Valor']],
      body: [
        ['Quantidade de Lançamentos em Compras', stats.comprasCount.toString()],
        ['Total Solicitado em Compras', fmt(stats.sol)],
        ['Total Pago em Compras (Líquido)', fmt(stats.liquido)],
        ['Quantidade de Entradas no Estoque', stats.entradasCount.toString()],
        ['Valor Total Recebido em Estoque', fmt(stats.entradasVal)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
    });

    // compras table
    if (filteredData.compras.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Histórico de Compras / Pagamentos', 14, 22);

      const comprasTable = filteredData.compras.map((c: any) => [
        c.parcela || '1/1',
        fmtDate(c.data_envio),
        fmt(c.valor_solicitado),
        c.status,
        fmt(c.valor_pago),
        c.valor_estornado > 0 ? fmt(c.valor_estornado) : '—',
        fmt((c.valor_pago || 0) - (c.valor_estornado || 0)),
        fmtDate(c.data_pagamento)
      ]);

      autoTable(doc, {
        startY: 28,
        head: [['Parcela', 'Envio', 'Solicitado', 'Status', 'Pago', 'Estornado', 'Líquido', 'Dt. Pgto']],
        body: comprasTable,
        theme: 'grid',
        headStyles: { fillColor: [14, 22, 41] },
        styles: { fontSize: 8 }
      });
    }

    // entradas table
    if (filteredData.entradas.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Histórico de Entradas no Estoque', 14, 22);

      const entradasTable = filteredData.entradas.map((e: any) => {
        const total = e.valor_unitario ? Number(e.quantidade) * Number(e.valor_unitario) : 0;
        return [
          fmtDate(e.data),
          e.produtos?.nome || '—',
          `${e.quantidade} ${e.produtos?.unidade || ''}`,
          e.valor_unitario ? fmt(Number(e.valor_unitario)) : '—',
          total > 0 ? fmt(total) : '—',
          e.status_entrega || 'PENDENTE'
        ];
      });

      autoTable(doc, {
        startY: 28,
        head: [['Data', 'Produto', 'Qtd', 'Val. Unitário', 'Val. Total', 'Entrega']],
        body: entradasTable,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8 }
      });
    }

    const fileMonthSuffix = selectedMonth !== 'all' ? `-${selectedMonth}` : '-geral';
    doc.save(`relatorio-fornecedor-${selectedSupplier.toLowerCase().replace(/\s+/g, '-')}${fileMonthSuffix}.pdf`);
    toast.success('Relatório PDF exportado!');
  };

  const exportExcel = () => {
    if (!selectedSupplier) return;

    // Sheet 1: Compras
    const comprasWSData = filteredData.compras.map((c: any) => ({
      'Status': c.status,
      'Parcela': c.parcela || '1/1',
      'Data Envio': fmtDate(c.data_envio),
      'Valor Solicitado': c.valor_solicitado || 0,
      'Valor Pago': c.valor_pago || 0,
      'Valor Estornado': c.valor_estornado || 0,
      'Líquido (Pago-Est.)': (c.valor_pago || 0) - (c.valor_estornado || 0),
      'Data Pagamento': fmtDate(c.data_pagamento),
      'Título / E-mail': c.email_titulo || '',
      'CNPJ': c.fornecedor_cnpj || '',
      'Obs': c.obs || ''
    }));

    // Sheet 2: Entradas
    const entradasWSData = filteredData.entradas.map((e: any) => {
      const total = e.valor_unitario ? Number(e.quantidade) * Number(e.valor_unitario) : 0;
      return {
        'Data': fmtDate(e.data),
        'Produto': e.produtos?.nome || '—',
        'Quantidade': Number(e.quantidade),
        'Unidade': e.produtos?.unidade || '',
        'Valor Unitário': e.valor_unitario ? Number(e.valor_unitario) : 0,
        'Valor Total': total,
        'Status Entrega': e.status_entrega || 'PENDENTE',
        'Observação': e.observacao || ''
      };
    });

    const wb = XLSX.utils.book_new();

    const comprasWS = XLSX.utils.json_to_sheet(comprasWSData);
    XLSX.utils.book_append_sheet(wb, comprasWS, 'Compras');

    const entradasWS = XLSX.utils.json_to_sheet(entradasWSData);
    XLSX.utils.book_append_sheet(wb, entradasWS, 'Entradas de Estoque');

    const fileMonthSuffix = selectedMonth !== 'all' ? `-${selectedMonth}` : '-geral';
    XLSX.writeFile(wb, `relatorio-fornecedor-${selectedSupplier.toLowerCase().replace(/\s+/g, '-')}${fileMonthSuffix}.xlsx`);
    toast.success('Relatório Excel exportado com sucesso!');
  };

  if (loadingSuppliers) return <div className="p-6"><SkeletonList count={2} /></div>;

  return (
    <div className="space-y-6">
      {/* Selector & Actions Card */}
      <Card className="border-none shadow-sm bg-[#0e1629] text-white rounded-3xl p-5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between">
          <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="w-full sm:w-72">
              <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">
                Selecionar Fornecedor
              </label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-12">
                  <SelectValue placeholder="Selecione o fornecedor..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0e1629] border-white/10 text-white max-h-60 overflow-y-auto">
                  {suppliers.map((s: string) => (
                    <SelectItem key={s} value={s} className="text-white focus:bg-white/10 focus:text-white cursor-pointer">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSupplier && (
              <div className="w-full sm:w-48 animate-in fade-in duration-200">
                <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">
                  Filtrar por Mês
                </label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-12">
                    <SelectValue placeholder="Todos os meses" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0e1629] border-white/10 text-white max-h-48 overflow-y-auto">
                    <SelectItem value="all">Todos os meses</SelectItem>
                    {months.map((m: string) => (
                      <SelectItem key={m} value={m} className="text-white focus:bg-white/10 focus:text-white cursor-pointer">
                        {mesLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {selectedSupplier && (
            <div className="flex gap-2 self-end sm:self-auto mt-2 sm:mt-0">
              <Button onClick={exportPDF} className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl">
                <Download className="h-4 w-4 mr-2" /> PDF
              </Button>
              <Button variant="outline" onClick={exportExcel} className="h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl">
                <FileSpreadsheet className="h-4 w-4 mr-2 text-success" /> Excel
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Main Content */}
      {!selectedSupplier ? (
        <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center bg-muted/20 rounded-3xl border border-dashed border-border">
          <Store className="h-12 w-12 opacity-20 mb-4 text-primary" />
          <p className="text-sm font-semibold">Selecione um fornecedor acima para gerar o relatório</p>
          <p className="text-xs text-muted-foreground mt-1">
            Isso buscará todos os pagamentos da aba compras e todas as entradas de material associadas.
          </p>
        </div>
      ) : loadingData ? (
        <div className="p-6"><SkeletonList count={3} /></div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border border-border/40 shadow-sm bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <ReceiptText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Compras Realizadas</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{stats.comprasCount}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/40 shadow-sm bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Pago (Líq.)</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(stats.liquido)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/40 shadow-sm bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                  <ArrowDownToLine className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Entradas no Estoque</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{stats.entradasCount}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/40 shadow-sm bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Recebido (Estoque)</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(stats.entradasVal)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Details Tables Section */}
          <Tabs defaultValue="compras" className="w-full">
            <div className="flex justify-between items-center border-b border-border mb-4">
              <TabsList className="bg-transparent h-11 p-0 gap-4">
                <TabsTrigger 
                  value="compras" 
                  className="rounded-none h-11 border-b-2 border-transparent px-4 font-semibold text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
                >
                  Compras & Pagamentos ({stats.comprasCount})
                </TabsTrigger>
                <TabsTrigger 
                  value="entradas" 
                  className="rounded-none h-11 border-b-2 border-transparent px-4 font-semibold text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
                >
                  Entradas no Estoque ({stats.entradasCount})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="compras" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <Card className="border border-border/40 shadow-sm">
                <CardContent className="p-0">
                  {filteredData.compras.length === 0 ? (
                    <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
                      <ReceiptText className="h-10 w-10 opacity-10 mb-2" />
                      <p className="text-sm">Nenhum lançamento de compra encontrado para este fornecedor no período.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-bold text-foreground">Parcela</TableHead>
                            <TableHead className="font-bold text-foreground">Envio</TableHead>
                            <TableHead className="font-bold text-foreground">Solicitado</TableHead>
                            <TableHead className="font-bold text-foreground">Status</TableHead>
                            <TableHead className="font-bold text-foreground text-right">Pago</TableHead>
                            <TableHead className="font-bold text-foreground text-right">Estornado</TableHead>
                            <TableHead className="font-bold text-foreground text-right">Líquido</TableHead>
                            <TableHead className="font-bold text-foreground">Dt. Pagamento</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredData.compras.map((c: any) => {
                            const netPago = (c.valor_pago || 0) - (c.valor_estornado || 0);
                            return (
                               <TableRow key={c.id} className="hover:bg-muted/30">
                                 <TableCell className="font-semibold text-sm">{c.parcela || '1/1'}</TableCell>
                                 <TableCell className="text-sm text-muted-foreground">{fmtDate(c.data_envio)}</TableCell>
                                 <TableCell className="text-sm font-mono">{fmt(c.valor_solicitado)}</TableCell>
                                 <TableCell>
                                   <Badge className="text-[8px] font-bold uppercase tracking-wider">{c.status}</Badge>
                                 </TableCell>
                                 <TableCell className="text-right font-mono text-sm">{fmt(c.valor_pago)}</TableCell>
                                 <TableCell className="text-right font-mono text-sm text-blue-500">
                                   {c.valor_estornado > 0 ? fmt(c.valor_estornado) : '—'}
                                 </TableCell>
                                 <TableCell className="text-right font-mono text-sm font-bold text-emerald-600">
                                   {fmt(netPago)}
                                 </TableCell>
                                 <TableCell className="text-sm text-muted-foreground">{fmtDate(c.data_pagamento)}</TableCell>
                               </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="entradas" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <Card className="border border-border/40 shadow-sm">
                <CardContent className="p-0">
                  {filteredData.entradas.length === 0 ? (
                    <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
                      <ArrowDownToLine className="h-10 w-10 opacity-10 mb-2" />
                      <p className="text-sm">Nenhuma entrada de material encontrada para este fornecedor no período.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-bold text-foreground">Data</TableHead>
                            <TableHead className="font-bold text-foreground">Produto</TableHead>
                            <TableHead className="font-bold text-foreground text-center">Quantidade</TableHead>
                            <TableHead className="font-bold text-foreground text-right">Valor Unitário</TableHead>
                            <TableHead className="font-bold text-foreground text-right">Valor Total</TableHead>
                            <TableHead className="font-bold text-foreground">Entrega</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredData.entradas.map((e: any) => {
                            const valorTotal = e.valor_unitario ? Number(e.quantidade) * Number(e.valor_unitario) : 0;
                            return (
                               <TableRow key={e.id} className="hover:bg-muted/30">
                                 <TableCell className="text-sm text-muted-foreground">
                                   {fmtDate(e.data)}
                                 </TableCell>
                                 <TableCell className="font-semibold text-sm">
                                   {e.produtos?.nome || <span className="text-destructive">Produto Excluído</span>}
                                 </TableCell>
                                 <TableCell className="text-center font-mono">
                                   {e.quantidade} <span className="text-[10px] text-muted-foreground">{e.produtos?.unidade || ''}</span>
                                 </TableCell>
                                 <TableCell className="text-right font-mono">
                                   {e.valor_unitario ? fmt(Number(e.valor_unitario)) : '—'}
                                 </TableCell>
                                 <TableCell className="text-right font-mono font-bold text-primary">
                                   {valorTotal > 0 ? fmt(valorTotal) : '—'}
                                 </TableCell>
                                 <TableCell>
                                   <Badge variant="outline" className="text-[8px] uppercase font-bold">
                                     {e.status_entrega || 'PENDENTE'}
                                   </Badge>
                                 </TableCell>
                               </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
