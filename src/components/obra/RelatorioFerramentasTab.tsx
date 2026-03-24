import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown, Search, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import SkeletonList from '@/components/SkeletonList';
import { SidebarTrigger } from '@/components/ui/sidebar';

export default function RelatorioFerramentasTab({ obraId }: { obraId: string }) {
  const [search, setSearch] = useState('');

  const { data: ferramentasEmUso = [], isLoading } = useQuery({
    queryKey: ['relatorio-ferramentas', obraId],
    queryFn: async () => {
      const { data: ferramentasData, error } = await supabase
        .from('ferramentas')
        .select('*')
        .eq('obra_id', obraId)
        .eq('estado', 'em_uso');
      
      if (error) {
        console.error('Error fetching ferramentas:', error);
        return [];
      }
      
      if (!ferramentasData || ferramentasData.length === 0) return [];
      
      const { data: pessoasData } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId);
      const pessoasMap = new Map((pessoasData || []).map((p: any) => [p.id, p.nome]));
      
      return ferramentasData.map((f: any) => ({
        ...f,
        responsavel_nome: f.responsavel_id ? (pessoasMap.get(f.responsavel_id) || 'Desconhecido') : 'Sem Responsável',
      }));
    },
  });

  const filtered = ferramentasEmUso.filter((f: any) => 
    f.nome.toLowerCase().includes(search.toLowerCase()) || 
    (f.responsavel_nome && f.responsavel_nome.toLowerCase().includes(search.toLowerCase()))
  );

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.text('Relatório Diário de Ferramentas em Uso', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Data: ${dataAtual}`, 14, 30);
    
    const tableData = filtered.map((f: any) => [
      f.nome,
      f.codigo || '-',
      f.responsavel_nome,
      f.data_retirada ? new Date(f.data_retirada).toLocaleDateString('pt-BR') : '-'
    ]);

    autoTable(doc, {
      startY: 36,
      head: [['Ferramenta', 'Código', 'Responsável', 'Data de Retirada']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [65, 105, 225] },
    });

    doc.save(`relatorio-ferramentas-${dataAtual.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <div>
            <h1 className="text-xl lg:text-2xl font-display font-bold">Relatório de Ferramentas</h1>
            <p className="text-sm text-muted-foreground mt-1">Lista de ferramentas atualmente em uso</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar ferramenta ou responsável..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 w-full"
            />
          </div>
          <Button onClick={handleExportPDF} className="h-10 shrink-0" disabled={filtered.length === 0}>
            <FileDown className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><SkeletonList /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              {search ? 'Nenhuma ferramenta encontrada na busca.' : 'Nenhuma ferramenta em uso no momento.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold text-foreground">Ferramenta</TableHead>
                    <TableHead className="font-semibold text-foreground">Código</TableHead>
                    <TableHead className="font-semibold text-foreground">Responsável</TableHead>
                    <TableHead className="font-semibold text-foreground">Data de Retirada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((f: any) => (
                    <TableRow key={f.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{f.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{f.codigo || '-'}</TableCell>
                      <TableCell>{f.responsavel_nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.data_retirada ? new Date(f.data_retirada).toLocaleDateString('pt-BR') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
