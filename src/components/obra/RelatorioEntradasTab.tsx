import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Download, FileSpreadsheet, ArrowDownToLine, Filter } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SkeletonList from '@/components/SkeletonList';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { getBuddyLogo } from '@/lib/pdf';

export default function RelatorioEntradasTab({ obraId }: { obraId: string }) {
  const [search, setSearch] = useState('');
  
  // By default, use current month (YYYY-MM)
  const [filterMonth, setFilterMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data: entradas = [], isLoading } = useQuery({
    queryKey: ['relatorio-entradas', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('entradas')
        .select('*, produtos(nome, unidade, categoria)')
        .eq('obra_id', obraId)
        .order('data', { ascending: false });
      return data || [];
    }
  });

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const filteredData = entradas.filter((ent: any) => {
    // Filter by month
    if (filterMonth) {
      const entMonth = ent.data.substring(0, 7); // "YYYY-MM"
      if (entMonth !== filterMonth) return false;
    }
    
    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      const prodName = ent.produtos?.nome?.toLowerCase() || '';
      const forn = ent.fornecedor?.toLowerCase() || '';
      if (!prodName.includes(searchLower) && !forn.includes(searchLower)) {
        return false;
      }
    }
    
    // Filter by month
    return true;
  });

  const totalGasto = filteredData.reduce((acc, curr) => {
    const valorTotal = curr.valor_unitario ? Number(curr.quantidade) * Number(curr.valor_unitario) : 0;
    return acc + valorTotal;
  }, 0);

  const exportPDF = async () => {
    const logo = await getBuddyLogo();
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.text('Relatório Mensal de Entradas', 14, 22);
    
    if (logo) {
      const logoSize = 18;
      const x = doc.internal.pageSize.getWidth() - 14 - logoSize;
      doc.addImage(logo, 'PNG', x, 10, logoSize, logoSize);
    }
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Mês Referência: ${filterMonth || 'Todos'}`, 14, 30);
    doc.text(`Total Gasto no Período: ${formatCurrency(totalGasto)}`, 14, 36);
    
    const tableData = filteredData.map((e: any) => {
      const valorTotal = e.valor_unitario ? Number(e.quantidade) * Number(e.valor_unitario) : 0;
      return [
        new Date(e.data).toLocaleDateString('pt-BR'),
        e.produtos?.nome || '-',
        e.fornecedor || '-',
        `${e.quantidade} ${e.produtos?.unidade || ''}`,
        e.valor_unitario ? formatCurrency(Number(e.valor_unitario)) : '-',
        valorTotal > 0 ? formatCurrency(valorTotal) : '-'
      ];
    });

    autoTable(doc, {
      startY: 44,
      head: [['Data', 'Produto', 'Fornecedor', 'Quantidade', 'Valor Unitário', 'Valor Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [14, 22, 41] },
    });

    doc.save(`relatorio-entradas-${filterMonth || dataAtual.replace(/\//g, '-')}.pdf`);
    toast.success('Relatório PDF exportado!');
  };

  const exportExcel = () => {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    const worksheetData = filteredData.map((e: any) => {
      const valorTotal = e.valor_unitario ? Number(e.quantidade) * Number(e.valor_unitario) : 0;
      return {
        'Data': new Date(e.data).toLocaleDateString('pt-BR'),
        'Produto': e.produtos?.nome || '-',
        'Categoria': e.produtos?.categoria || '-',
        'Fornecedor': e.fornecedor || '-',
        'Quantidade': Number(e.quantidade),
        'Unidade': e.produtos?.unidade || '',
        'Valor Unitário': e.valor_unitario ? Number(e.valor_unitario) : 0,
        'Valor Total': valorTotal
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Entradas');
    XLSX.writeFile(workbook, `relatorio-entradas-${filterMonth || dataAtual.replace(/\//g, '-')}.xlsx`);
    toast.success('Relatório Excel exportado!');
  };

  if (isLoading) return <div className="p-6"><SkeletonList count={3} /></div>;

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm bg-[#0e1629] text-white rounded-3xl p-5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input 
              placeholder="Buscar por produto ou fornecedor..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 w-full bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl"
            />
          </div>
          
          <div className="flex gap-2">
            <Button onClick={exportPDF} className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl" disabled={filteredData.length === 0}>
              <Download className="h-4 w-4 mr-2" /> PDF
            </Button>
            <Button variant="outline" onClick={exportExcel} className="h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl" disabled={filteredData.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2 text-success" /> Excel
            </Button>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-warning" />
              Filtro Mensal
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-auto">
              <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">Mês/Ano</label>
              <Input 
                type="month" 
                value={filterMonth} 
                onChange={(e) => setFilterMonth(e.target.value)} 
                className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs w-full sm:w-48"
              />
            </div>
            {filterMonth && (
              <div className="flex-1 mt-2 sm:mt-5 text-center sm:text-right">
                <p className="text-xs text-white/50 uppercase tracking-wider font-bold">Total no Mês</p>
                <p className="text-xl font-display font-bold text-success">{formatCurrency(totalGasto)}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          {filteredData.length === 0 ? (
            <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
              <ArrowDownToLine className="h-10 w-10 opacity-10 mb-4" />
              <p className="text-sm">Nenhuma entrada encontrada para este período.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-bold text-foreground">Data</TableHead>
                    <TableHead className="font-bold text-foreground">Produto</TableHead>
                    <TableHead className="font-bold text-foreground">Fornecedor</TableHead>
                    <TableHead className="font-bold text-foreground text-center">Quantidade</TableHead>
                    <TableHead className="font-bold text-foreground text-right">Valor Unitário</TableHead>
                    <TableHead className="font-bold text-foreground text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((e: any) => {
                    const valorTotal = e.valor_unitario ? Number(e.quantidade) * Number(e.valor_unitario) : 0;
                    return (
                      <TableRow key={e.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm text-muted-foreground font-medium">
                          {new Date(e.data).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell className="font-semibold text-sm">
                          {e.produtos?.nome || <span className="text-destructive">Produto Excluído</span>}
                        </TableCell>
                        <TableCell className="text-sm">{e.fornecedor || '-'}</TableCell>
                        <TableCell className="text-center font-mono font-medium">
                          {e.quantidade} <span className="text-[10px] text-muted-foreground font-normal">{e.produtos?.unidade || ''}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {e.valor_unitario ? formatCurrency(Number(e.valor_unitario)) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                          {valorTotal > 0 ? formatCurrency(valorTotal) : <span className="text-muted-foreground">-</span>}
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
    </div>
  );
}
