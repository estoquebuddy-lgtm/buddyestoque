import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown, Search, History, Wrench, Calendar, User, Filter, FileSpreadsheet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import SkeletonList from '@/components/SkeletonList';
import { SidebarTrigger } from '@/components/ui/sidebar';

export default function RelatorioFerramentasTab({ obraId }: { obraId: string }) {
  const [search, setSearch] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'em-uso' | 'historico'>('em-uso');

  // Filters State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterPessoaId, setFilterPessoaId] = useState('todos');
  const [filterFerramentaId, setFilterFerramentaId] = useState('todos');
  const [filterTipo, setFilterTipo] = useState('todos');

  // Query: Persons for filter dropdown
  const { data: filterPessoas = [] } = useQuery({
    queryKey: ['pessoas-relatorios', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId).order('nome');
      return data || [];
    }
  });

  // Query: Tools for filter dropdown
  const { data: filterFerramentas = [] } = useQuery({
    queryKey: ['ferramentas-relatorios', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('ferramentas').select('id, nome, codigo').eq('obra_id', obraId).order('nome');
      return data || [];
    }
  });

  // Query: Tools currently in use
  const { data: ferramentasEmUso = [], isLoading: isEmUsoLoading } = useQuery({
    queryKey: ['relatorio-ferramentas-em-uso', obraId],
    queryFn: async () => {
      const { data: ferramentasData, error } = await supabase
        .from('ferramentas')
        .select('*')
        .eq('obra_id', obraId)
        .eq('estado', 'em_uso');
      
      if (error) {
        console.error('Error fetching tools in use:', error);
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

  // Query: Movements log from DB
  const { data: movimentacoes = [], isLoading: isMovLoading } = useQuery({
    queryKey: ['movimentacoes-ferramentas-relatorio', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimentacoes_ferramentas' as any)
        .select('*, ferramentas(nome, codigo), pessoas(nome)')
        .eq('obra_id', obraId)
        .order('data_hora', { ascending: false });
      
      if (error) {
        console.error('Error fetching movements:', error);
        return [];
      }
      return data || [];
    },
  });

  // Filtering Tools currently in use
  const filteredEmUso = ferramentasEmUso.filter((f: any) => 
    f.nome.toLowerCase().includes(search.toLowerCase()) || 
    (f.responsavel_nome && f.responsavel_nome.toLowerCase().includes(search.toLowerCase())) ||
    (f.codigo && f.codigo.toLowerCase().includes(search.toLowerCase()))
  );

  // Filtering Movements
  const filteredMovimentacoes = movimentacoes.filter((m: any) => {
    // 1. Period filter
    if (filterStartDate) {
      const start = new Date(filterStartDate + 'T00:00:00');
      const mDate = new Date(m.data_hora);
      if (mDate < start) return false;
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate + 'T23:59:59');
      const mDate = new Date(m.data_hora);
      if (mDate > end) return false;
    }
    
    // 2. Pessoa filter
    if (filterPessoaId !== 'todos' && m.usuario_id !== filterPessoaId) {
      return false;
    }
    
    // 3. Ferramenta filter
    if (filterFerramentaId !== 'todos' && m.ferramenta_id !== filterFerramentaId) {
      return false;
    }
    
    // 4. Tipo filter
    if (filterTipo !== 'todos' && m.tipo !== filterTipo) {
      return false;
    }
    
    // 5. Search bar filter
    if (search) {
      const searchLower = search.toLowerCase();
      const toolName = m.ferramentas?.nome?.toLowerCase() || '';
      const toolCode = m.ferramentas?.codigo?.toLowerCase() || '';
      const personName = m.pessoas?.nome?.toLowerCase() || '';
      const obs = m.observacao?.toLowerCase() || '';
      return toolName.includes(searchLower) || toolCode.includes(searchLower) || personName.includes(searchLower) || obs.includes(searchLower);
    }
    
    return true;
  });

  // Export PDF: Tools currently in use
  const handleExportPDFEmUso = () => {
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.text('Relatório Diário de Ferramentas em Uso', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Data: ${dataAtual}`, 14, 30);
    
    const tableData = filteredEmUso.map((f: any) => [
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

    doc.save(`relatorio-ferramentas-em-uso-${dataAtual.replace(/\//g, '-')}.pdf`);
  };

  // Export PDF: Complete transaction logs
  const handleExportPDFHistory = () => {
    const doc = new jsPDF();
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.text('Histórico de Movimentações de Ferramentas', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Emitido em: ${dataAtual}`, 14, 30);
    
    const tableData = filteredMovimentacoes.map((m: any) => [
      new Date(m.data_hora).toLocaleDateString('pt-BR') + ' ' + new Date(m.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      m.ferramentas?.nome || 'Deletada',
      m.ferramentas?.codigo || '-',
      m.tipo,
      m.pessoas?.nome || 'Sistema',
      m.observacao || '-'
    ]);

    autoTable(doc, {
      startY: 36,
      head: [['Data/Hora', 'Ferramenta', 'Código', 'Tipo', 'Responsável', 'Observações']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [217, 119, 6] },
    });

    doc.save(`historico-ferramentas-${dataAtual.replace(/\//g, '-')}.pdf`);
  };

  // Export Excel: Complete transaction logs
  const handleExportExcelHistory = () => {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    const worksheetData = filteredMovimentacoes.map((m: any) => ({
      'Data/Hora': new Date(m.data_hora).toLocaleString('pt-BR'),
      'Ferramenta': m.ferramentas?.nome || 'Deletada',
      'Código': m.ferramentas?.codigo || '-',
      'Tipo de Movimentação': m.tipo,
      'Responsável': m.pessoas?.nome || 'Sistema',
      'Observação': m.observacao || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimentacoes');
    XLSX.writeFile(workbook, `historico-ferramentas-${dataAtual.replace(/\//g, '-')}.xlsx`);
    toast.success('Relatório gerado em Excel!');
  };

  const clearFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterPessoaId('todos');
    setFilterFerramentaId('todos');
    setFilterTipo('todos');
    setSearch('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <div>
            <h1 className="text-xl lg:text-2xl font-display font-bold">Relatório de Ferramentas</h1>
            <p className="text-sm text-muted-foreground mt-1">Consulte utilização, histórico e baixe relatórios</p>
          </div>
        </div>
        
        {/* Navigation Tabs (Subtabs) */}
        <div className="bg-muted p-1 rounded-xl flex gap-1 self-stretch sm:self-auto">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => { setActiveSubTab('em-uso'); setSearch(''); }}
            className={`rounded-lg h-9 font-semibold text-xs px-4 ${activeSubTab === 'em-uso' ? 'bg-[#0e1629] text-white shadow-sm' : 'text-muted-foreground'}`}
          >
            <Wrench className="h-3.5 w-3.5 mr-1.5" />
            Em Uso
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => { setActiveSubTab('historico'); setSearch(''); }}
            className={`rounded-lg h-9 font-semibold text-xs px-4 ${activeSubTab === 'historico' ? 'bg-[#0e1629] text-white shadow-sm' : 'text-muted-foreground'}`}
          >
            <History className="h-3.5 w-3.5 mr-1.5" />
            Movimentações (QR)
          </Button>
        </div>
      </div>

      {/* Main Search & Actions Header Card */}
      <Card className="border-none shadow-sm bg-[#0e1629] text-white rounded-3xl p-5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input 
              placeholder={activeSubTab === 'em-uso' ? "Buscar ferramenta ou responsável..." : "Buscar em histórico (nome, código, obs)..."} 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 w-full bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl"
            />
          </div>
          
          <div className="flex gap-2">
            {activeSubTab === 'em-uso' ? (
              <Button onClick={handleExportPDFEmUso} className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl" disabled={filteredEmUso.length === 0}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportar PDF
              </Button>
            ) : (
              <>
                <Button onClick={handleExportPDFHistory} className="h-12 bg-warning text-warning-foreground hover:bg-warning/90 rounded-xl" disabled={filteredMovimentacoes.length === 0}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Exportar PDF
                </Button>
                <Button variant="outline" onClick={handleExportExcelHistory} className="h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl" disabled={filteredMovimentacoes.length === 0}>
                  <FileSpreadsheet className="h-4 w-4 mr-2 text-success" />
                  Exportar Excel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Extended Collapsible Filters for History Tab */}
        {activeSubTab === 'historico' && (
          <div className="mt-5 pt-4 border-t border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-warning" />
                Filtros Avançados
              </span>
              {(filterStartDate || filterEndDate || filterPessoaId !== 'todos' || filterFerramentaId !== 'todos' || filterTipo !== 'todos' || search) && (
                <button onClick={clearFilters} className="text-xs text-warning hover:underline">Limpar filtros</button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Date Start */}
              <div className="space-y-1">
                <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Início</label>
                <div className="relative">
                  <Input 
                    type="date" 
                    value={filterStartDate} 
                    onChange={(e) => setFilterStartDate(e.target.value)} 
                    className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs" 
                  />
                </div>
              </div>

              {/* Date End */}
              <div className="space-y-1">
                <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Fim</label>
                <div className="relative">
                  <Input 
                    type="date" 
                    value={filterEndDate} 
                    onChange={(e) => setFilterEndDate(e.target.value)} 
                    className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs" 
                  />
                </div>
              </div>

              {/* Responsible Worker */}
              <div className="space-y-1">
                <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Responsável</label>
                <Select value={filterPessoaId} onValueChange={setFilterPessoaId}>
                  <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {filterPessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Tool Selector */}
              <div className="space-y-1">
                <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Ferramenta</label>
                <Select value={filterFerramentaId} onValueChange={setFilterFerramentaId}>
                  <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {filterFerramentas.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome} {f.codigo ? `(${f.codigo})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Transaction Type */}
              <div className="space-y-1">
                <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Operação</label>
                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="RETIRADA">Retirada</SelectItem>
                    <SelectItem value="DEVOLUCAO">Devolução</SelectItem>
                    <SelectItem value="MANUTENCAO">Manutenção</SelectItem>
                    <SelectItem value="EXTRAVIO">Extravio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Report Tables */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          {activeSubTab === 'em-uso' ? (
            isEmUsoLoading ? (
              <div className="p-6"><SkeletonList /></div>
            ) : filteredEmUso.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
                <Wrench className="h-10 w-10 opacity-10 mb-4" />
                <p className="text-sm">{search ? 'Nenhuma ferramenta em uso atende a sua busca.' : 'Todas as ferramentas estão disponíveis no estoque!'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-bold text-foreground">Ferramenta</TableHead>
                      <TableHead className="font-bold text-foreground">Código</TableHead>
                      <TableHead className="font-bold text-foreground">Responsável</TableHead>
                      <TableHead className="font-bold text-foreground">Data de Retirada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmUso.map((f: any) => (
                      <TableRow key={f.id} className="hover:bg-muted/30">
                        <TableCell className="font-semibold text-sm">{f.nome}</TableCell>
                        <TableCell className="text-muted-foreground text-xs uppercase font-mono">{f.codigo || '-'}</TableCell>
                        <TableCell className="text-sm font-medium">{f.responsavel_nome}</TableCell>
                        <TableCell className="text-muted-foreground text-xs font-medium">
                          {f.data_retirada ? new Date(f.data_retirada).toLocaleDateString('pt-BR') + ' às ' + new Date(f.data_retirada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            // Historico de Movimentações Tab
            isMovLoading ? (
              <div className="p-6"><SkeletonList /></div>
            ) : filteredMovimentacoes.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
                <History className="h-10 w-10 opacity-10 mb-4" />
                <p className="text-sm">Nenhuma movimentação de QR Code encontrada.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-bold text-foreground">Data/Hora</TableHead>
                      <TableHead className="font-bold text-foreground">Ferramenta</TableHead>
                      <TableHead className="font-bold text-foreground">Código</TableHead>
                      <TableHead className="font-bold text-foreground">Operação</TableHead>
                      <TableHead className="font-bold text-foreground">Responsável</TableHead>
                      <TableHead className="font-bold text-foreground">Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovimentacoes.map((m: any) => (
                      <TableRow key={m.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-semibold tabular-nums text-muted-foreground">
                          {new Date(m.data_hora).toLocaleDateString('pt-BR')} às {new Date(m.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="font-semibold text-sm">{m.ferramentas?.nome || <span className="text-destructive">Deletada</span>}</TableCell>
                        <TableCell className="text-muted-foreground text-xs uppercase font-mono">{m.ferramentas?.codigo || '-'}</TableCell>
                        <TableCell>
                          {m.tipo === 'RETIRADA' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning uppercase border border-warning/10">Retirada</span>
                          )}
                          {m.tipo === 'DEVOLUCAO' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success uppercase border border-success/10">Devolução</span>
                          )}
                          {m.tipo === 'MANUTENCAO' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/10 text-destructive uppercase border border-destructive/10">Manutenção</span>
                          )}
                          {m.tipo === 'EXTRAVIO' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/10 text-red-500 uppercase border border-red-500/10">Extravio</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-semibold">{m.pessoas?.nome || 'Sistema'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-xs truncate">{m.observacao || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
