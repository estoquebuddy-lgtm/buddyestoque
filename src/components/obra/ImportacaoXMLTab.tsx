import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileUp, Download, FileText } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import SkeletonList from '@/components/SkeletonList';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import GerarLivroFiscalDialog from '@/components/obra/GerarLivroFiscalDialog';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2 } from 'lucide-react';

export default function ImportacaoXMLTab({ obraId }: { obraId: string }) {
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fiscalRows, setFiscalRows] = useState<any[]>([]);
  const queryClient = useQueryClient();

  const { data: importacoes = [], isLoading } = useQuery({
    queryKey: ['importacoes-xml', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('importacoes_xml' as any).select('*').eq('obra_id', obraId).order('data', { ascending: false });
      return data || [];
    },
  });

  const resumoMensal = (() => {
    const map = new Map<string, { label: string; totalItens: number; totalXmls: number; sortKey: string }>();
    (importacoes as any[]).forEach((imp: any) => {
      const date = new Date(imp.data);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = format(date, 'MMMM yyyy', { locale: ptBR });
      if (!map.has(key)) {
        map.set(key, { label, totalItens: 0, totalXmls: 0, sortKey: key });
      }
      const entry = map.get(key)!;
      entry.totalItens += Number(imp.total_itens) || 0;
      entry.totalXmls += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  })();

  const handleOpenFiscalFromSelection = () => {
    if (selectedIds.length === 0) {
      toast.error("Selecione ao menos uma nota no histórico.");
      return;
    }

    const selectedRows = (importacoes as any[])
      .filter(imp => selectedIds.includes(imp.id))
      .map(imp => {
        const dRec = new Date(imp.data);
        const dEmi = imp.data_emissao ? new Date(imp.data_emissao) : dRec;

        return {
          filename: `NF ${imp.nf_numero || imp.id}`,
          dataEntrada: format(dRec, 'dd/MM/yy'),
          especie: '',
          nNF: imp.nf_numero || '-',
          serie: (imp.serie || '1') + '/',
          dataDoc: format(dEmi, 'dd/MM/yy'),
          cnpjEmit: imp.cnpj_emitente || '-',
          uf: imp.uf_emitente || '-',
          vNF: Number(imp.valor_total) || 0,
          cfop: imp.cfop || '1556',
          imposto: 'ICMS',
          codigoA: '3',
          bCalculo: Number(imp.valor_total) || 0
        };
      });

    setFiscalRows(selectedRows);
    setFiscalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este registro de importação? Isso não removerá os produtos do estoque, apenas o registro desta nota aqui.")) return;
    
    const { error } = await supabase.from('importacoes_xml' as any).delete().eq('id', id);
    if (error) {
      toast.error("Erro ao excluir importação.");
    } else {
      toast.success("Importação removida.");
      queryClient.invalidateQueries({ queryKey: ['importacoes_xml', obraId] });
      setSelectedIds(prev => prev.filter(sid => sid !== id));
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === importacoes.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(importacoes.map((i: any) => i.id));
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    doc.setFontSize(18);
    doc.text('Relatório de Importações XML', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Data: ${dataAtual}`, 14, 30);
    
    const tableData = importacoes.map((imp: any) => [
      new Date(imp.data).toLocaleDateString('pt-BR'),
      imp.fornecedor_nome || '-',
      imp.nf_numero || '-',
      imp.total_itens?.toString() || '0'
    ]);

    autoTable(doc, {
      startY: 36,
      head: [['Data', 'Fornecedor', 'Nº Nota Fiscal', 'Itens']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`importacoes-xml-${dataAtual.replace(/\//g, '-')}.pdf`);
    toast.success('Relatório PDF gerado com sucesso!');
  };

  const exportTXT = () => {
    let content = 'RELATÓRIO DE IMPORTAÇÕES XML\n';
    content += `Data de geração: ${new Date().toLocaleDateString('pt-BR')}\n\n`;
    content += 'DATA       | FORNECEDOR                     | NF         | ITENS\n';
    content += ''.padEnd(70, '-') + '\n';
    
    importacoes.forEach((imp: any) => {
      const data = new Date(imp.data).toLocaleDateString('pt-BR').padEnd(10);
      const forn = (imp.fornecedor_nome || '-').substring(0, 30).padEnd(30);
      const nf = (imp.nf_numero || '-').substring(0, 10).padEnd(10);
      const itens = (imp.total_itens?.toString() || '0');
      content += `${data} | ${forn} | ${nf} | ${itens}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `importacoes-xml-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Arquivo TXT gerado com sucesso!');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <h1 className="text-xl lg:text-2xl font-display font-bold">Compras XML</h1>
        </div>
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <h1 className="text-xl lg:text-2xl font-display font-bold">Compras em XML</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleOpenFiscalFromSelection} className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground">
            <FileText className="h-4 w-4 mr-1.5" /> Gerar Livro de Selecionados
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setFiscalRows([]); setFiscalOpen(true); }} className="h-9">
             Upload Manual (PDF)
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <FileUp className="h-4 w-4 text-info" />
              Resumo Mensal
            </h3>
            {resumoMensal.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma importação registrada</p>
            ) : (
              <div className="divide-y divide-border">
                {resumoMensal.map((m) => (
                  <div key={m.sortKey} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium capitalize">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.totalXmls} XML(s) importado(s)</p>
                    </div>
                    <Badge variant="secondary" className="bg-info/10 text-info border-info/20">
                      {m.totalItens} itens
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm h-full">
          <CardContent className="p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Histórico de Notas (XML)
              </h3>
              {importacoes.length > 0 && (
                <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="h-7 text-[10px] font-bold uppercase tracking-wider">
                  {selectedIds.length === importacoes.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </Button>
              )}
            </div>
            {importacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma nota importada localmente</p>
            ) : (
              <div className="divide-y divide-border max-h-[400px] overflow-y-auto pr-2">
                {importacoes.map((imp: any) => (
                  <div key={imp.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox 
                        checked={selectedIds.includes(imp.id)} 
                        onCheckedChange={(checked) => {
                          setSelectedIds(prev => checked ? [...prev, imp.id] : prev.filter(id => id !== imp.id));
                        }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{imp.fornecedor_nome || 'Importação Antiga'}</p>
                        <p className="text-xs text-muted-foreground">NF: {imp.nf_numero || 'N/A'} • {new Date(imp.data).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0 text-[10px] font-mono">
                         {imp.valor_total ? `R$ ${Number(imp.valor_total).toLocaleString('pt-BR')}` : `${imp.total_itens} itens`}
                      </Badge>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(imp.id)} className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <GerarLivroFiscalDialog open={fiscalOpen} onOpenChange={setFiscalOpen} initialRows={fiscalRows} />
    </div>
  );
}
