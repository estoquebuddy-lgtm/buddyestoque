import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown, Search, Filter, FileSpreadsheet, MessageSquarePlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import SkeletonList from '@/components/SkeletonList';

const formatUserDisplay = (userObj: any) => {
  if (!userObj) return 'Desconhecido';
  if (userObj.apelido) return userObj.apelido;
  const email = userObj.email;
  if (!email) return 'Desconhecido';
  const name = email.split('@')[0].split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
};

export default function RelatorioSolicitacoesTab({ obraId }: { obraId: string }) {
  const [search, setSearch] = useState('');
  
  // Filters State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterUrgencia, setFilterUrgencia] = useState('todos');
  const [filterSolicitanteId, setFilterSolicitanteId] = useState('todos');
  const [filterDestinatarioId, setFilterDestinatarioId] = useState('todos');

  // Query: Persons for filter dropdown
  const { data: filterPessoas = [] } = useQuery({
    queryKey: ['pessoas-relatorios-solic', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, email, apelido').eq('approved', true).order('email');
      return (data || []).map(p => ({ id: p.id, nome: formatUserDisplay(p) }));
    }
  });

  // Query: Solicitacoes
  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ['relatorio-solicitacoes', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitacoes_material' as any)
        .select(`
          *,
          solicitante:profiles!solicitacoes_material_solicitante_id_fkey(email, apelido),
          destinatario:profiles!solicitacoes_material_destinatario_id_fkey(email, apelido)
        `)
        .eq('obra_id', obraId)
        .order('data_solicitacao', { ascending: false });
      
      if (error) {
        console.error('Error fetching solicitacoes:', error);
        return [];
      }
      
      if (!data || data.length === 0) return [];
      
      return data.map((s: any) => ({
        ...s,
        solicitante_nome: formatUserDisplay(s.solicitante),
        destinatario_nome: formatUserDisplay(s.destinatario),
      }));
    },
  });

  // Filtering Solicitacoes
  const filtered = solicitacoes.filter((s: any) => {
    // 1. Period filter (using data_solicitacao)
    if (filterStartDate) {
      const start = new Date(filterStartDate + 'T00:00:00');
      const sDate = new Date(s.data_solicitacao);
      if (sDate < start) return false;
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate + 'T23:59:59');
      const sDate = new Date(s.data_solicitacao);
      if (sDate > end) return false;
    }
    
    // 2. Status filter
    if (filterStatus !== 'todos' && s.status !== filterStatus) {
      return false;
    }
    
    // 3. Urgencia filter
    if (filterUrgencia !== 'todos' && s.urgencia !== filterUrgencia) {
      return false;
    }
    
    // 4. Solicitante filter
    if (filterSolicitanteId !== 'todos' && s.solicitante_id !== filterSolicitanteId) {
      return false;
    }

    // 4.5. Destinatario filter
    if (filterDestinatarioId !== 'todos' && s.destinatario_id !== filterDestinatarioId) {
      return false;
    }
    
    // 5. Search bar filter
    if (search) {
      const searchLower = search.toLowerCase();
      const desc = s.descricao_materiais?.toLowerCase() || '';
      const solNome = s.solicitante_nome.toLowerCase();
      const destNome = s.destinatario_nome.toLowerCase();
      return desc.includes(searchLower) || solNome.includes(searchLower) || destNome.includes(searchLower);
    }
    
    return true;
  });

  // Metrics
  const totalSolicitados = filtered.filter((s: any) => s.status === 'SOLICITADO').length;
  const totalAprovados = filtered.filter((s: any) => s.status === 'APROVADO').length;
  const totalComprados = filtered.filter((s: any) => s.status === 'COMPRADO').length;
  const totalEntregues = filtered.filter((s: any) => s.status === 'ENTREGUE').length;

  // Export PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Solicitações de Materiais', 14, 22);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${filterStartDate ? new Date(filterStartDate).toLocaleDateString('pt-BR') : 'Início'} até ${filterEndDate ? new Date(filterEndDate).toLocaleDateString('pt-BR') : 'Hoje'}`, 14, 30);
    doc.text(`Emitido em: ${dataAtual}`, 14, 36);
    
    const tableData = filtered.map((s: any) => [
      new Date(s.data_solicitacao).toLocaleDateString('pt-BR'),
      s.descricao_materiais + (s.arquivado ? ' (Arquivado)' : ''),
      `De: ${s.solicitante_nome}\nPara: ${s.destinatario_nome}`,
      s.status,
      s.urgencia
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Data', 'Material Solicitado', 'Solicitante / Para', 'Status', 'Urgência']],
      body: tableData,
      theme: 'plain',
      headStyles: {
        fillColor: [241, 245, 249], // slate-100
        textColor: [51, 65, 85],    // slate-700
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 5
      },
      bodyStyles: {
        fontSize: 8.5,
        cellPadding: 5,
        textColor: [30, 41, 59],    // slate-800
      },
      columnStyles: {
        0: { cellWidth: 22 }, // Data
        1: { cellWidth: 110 }, // Material
        2: { cellWidth: 60 },  // Solicitante / Para
        3: { cellWidth: 45, halign: 'center' },  // Status
        4: { cellWidth: 32, halign: 'center' },  // Urgência
      },
      styles: {
        valign: 'middle',
        lineColor: [226, 232, 240], // slate-200
        lineWidth: 0.5,
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 3 || data.column.index === 4) {
            data.cell.text = [];
          }
        }
      },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          const doc = data.doc;
          const cell = data.cell;
          
          if (data.column.index === 3) {
            const status = cell.raw;
            if (!status) return;

            let bg = [241, 245, 249];
            let textCol = [100, 116, 139];
            let label = 'SOLICITADO';

            if (status === 'SOLICITADO') {
              bg = [241, 245, 249];
              textCol = [71, 85, 105];
              label = 'SOLICITADO';
            } else if (status === 'APROVADO' || status === 'EM COTAÇÃO') {
              bg = [239, 246, 255]; // blue-50
              textCol = [37, 99, 235]; // blue-600
              label = 'EM COTAÇÃO';
            } else if (status === 'COMPRADO') {
              bg = [243, 232, 255]; // purple-50
              textCol = [147, 51, 234]; // purple-600
              label = 'COMPRADO';
            } else if (status === 'ENTREGUE') {
              bg = [236, 253, 245]; // emerald-50
              textCol = [5, 150, 105]; // emerald-600
              label = 'ENTREGUE';
            }

            const paddingX = 4;
            const paddingY = 4;
            const bw = cell.width - paddingX * 2;
            const bh = cell.height - paddingY * 2;
            const bx = cell.x + paddingX;
            const by = cell.y + paddingY;

            doc.setFillColor(bg[0], bg[1], bg[2]);
            doc.roundedRect(bx, by, bw, bh, 3, 3, 'F');

            doc.setTextColor(textCol[0], textCol[1], textCol[2]);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.text(label, bx + bw / 2, by + bh / 2 + 0.5, { align: 'center', baseline: 'middle' });
          }

          if (data.column.index === 4) {
            const urgencia = cell.raw;
            if (!urgencia) return;

            let bg = [241, 245, 249];
            let textCol = [71, 85, 105];

            if (urgencia === 'Urgente') {
              bg = [254, 226, 226]; // rose-100
              textCol = [185, 28, 28]; // rose-700
            } else if (urgencia === 'Alta') {
              bg = [254, 243, 199]; // amber-100
              textCol = [180, 83, 9]; // amber-700
            } else if (urgencia === 'Normal') {
              bg = [219, 234, 254]; // blue-100
              textCol = [29, 78, 216]; // blue-700
            } else if (urgencia === 'Baixa') {
              bg = [241, 245, 249];
              textCol = [71, 85, 105];
            }

            const paddingX = 4;
            const paddingY = 4;
            const bw = cell.width - paddingX * 2;
            const bh = cell.height - paddingY * 2;
            const bx = cell.x + paddingX;
            const by = cell.y + paddingY;

            doc.setFillColor(bg[0], bg[1], bg[2]);
            doc.roundedRect(bx, by, bw, bh, 3, 3, 'F');

            doc.setTextColor(textCol[0], textCol[1], textCol[2]);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.text(urgencia.toUpperCase(), bx + bw / 2, by + bh / 2 + 0.5, { align: 'center', baseline: 'middle' });
          }
        }
      }
    });

    doc.save(`relatorio-solicitacoes-${dataAtual.replace(/\//g, '-')}.pdf`);
  };

  // Export Excel
  const handleExportExcel = () => {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    const worksheetData = filtered.map((s: any) => ({
      'Data da Solicitação': new Date(s.data_solicitacao).toLocaleString('pt-BR'),
      'Material Solicitado': s.descricao_materiais,
      'Solicitante': s.solicitante_nome,
      'Destinatário': s.destinatario_nome,
      'Urgência': s.urgencia,
      'Status': s.status === 'APROVADO' ? 'EM COTAÇÃO' : s.status,
      'Arquivado': s.arquivado ? 'Sim' : 'Não',
      'Data Aprovado': s.data_aprovado ? new Date(s.data_aprovado).toLocaleString('pt-BR') : '-',
      'Data Comprado': s.data_comprado ? new Date(s.data_comprado).toLocaleString('pt-BR') : '-',
      'Data Entregue': s.data_entregue ? new Date(s.data_entregue).toLocaleString('pt-BR') : '-',
      'Observações do Status': s.observacao_resposta || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitacoes');
    XLSX.writeFile(workbook, `relatorio-solicitacoes-${dataAtual.replace(/\//g, '-')}.xlsx`);
    toast.success('Relatório gerado em Excel!');
  };

  const clearFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterStatus('todos');
    setFilterUrgencia('todos');
    setFilterSolicitanteId('todos');
    setFilterDestinatarioId('todos');
    setSearch('');
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-display font-bold text-slate-700">{totalSolicitados}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Pendentes</span>
         </div>
         <div className="bg-blue-50/50 border border-blue-100/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-display font-bold text-blue-600">{totalAprovados}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mt-1">Em Cotação</span>
         </div>
         <div className="bg-purple-50/50 border border-purple-100/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-display font-bold text-purple-600">{totalComprados}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mt-1">Comprados</span>
         </div>
         <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-display font-bold text-emerald-600">{totalEntregues}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mt-1">Entregues</span>
         </div>
      </div>

      {/* Main Search & Actions Header Card */}
      <Card className="border-none shadow-sm bg-[#0e1629] text-white rounded-3xl p-5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input 
              placeholder="Buscar por descrição ou pessoa..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 w-full bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl"
            />
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleExportPDF} className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl" disabled={filtered.length === 0}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
            <Button variant="outline" onClick={handleExportExcel} className="h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl" disabled={filtered.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2 text-success" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Collapsible Filters */}
        <div className="mt-5 pt-4 border-t border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-blue-400" />
              Filtros de Relatório
            </span>
            {(filterStartDate || filterEndDate || filterStatus !== 'todos' || filterUrgencia !== 'todos' || filterSolicitanteId !== 'todos' || filterDestinatarioId !== 'todos' || search) && (
              <button onClick={clearFilters} className="text-xs text-blue-400 hover:underline">Limpar filtros</button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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

            {/* Status */}
            <div className="space-y-1">
              <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="SOLICITADO">Solicitado</SelectItem>
                  <SelectItem value="APROVADO">Em Cotação</SelectItem>
                  <SelectItem value="COMPRADO">Comprado</SelectItem>
                  <SelectItem value="ENTREGUE">Entregue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Urgencia */}
            <div className="space-y-1">
              <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Urgência</label>
              <Select value={filterUrgencia} onValueChange={setFilterUrgencia}>
                <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Solicitante */}
            <div className="space-y-1">
              <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Solicitante</label>
              <Select value={filterSolicitanteId} onValueChange={setFilterSolicitanteId}>
                <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {filterPessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Destinatário */}
            <div className="space-y-1">
              <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Destinatário</label>
              <Select value={filterDestinatarioId} onValueChange={setFilterDestinatarioId}>
                <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white rounded-lg text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {filterPessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {/* Report Table */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><SkeletonList /></div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
              <MessageSquarePlus className="h-10 w-10 opacity-10 mb-4" />
              <p className="text-sm">Nenhuma solicitação encontrada para os filtros aplicados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-bold text-foreground">Data</TableHead>
                    <TableHead className="font-bold text-foreground">Material Solicitado</TableHead>
                    <TableHead className="font-bold text-foreground">Solicitante / Para</TableHead>
                    <TableHead className="font-bold text-foreground">Status</TableHead>
                    <TableHead className="font-bold text-foreground text-right">Urgência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s: any) => (
                    <TableRow key={s.id} className={`hover:bg-muted/30 ${s.arquivado ? 'opacity-50' : ''}`}>
                      <TableCell className="text-xs font-semibold tabular-nums text-muted-foreground">
                        {new Date(s.data_solicitacao).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm max-w-md truncate" title={s.descricao_materiais}>
                          {s.descricao_materiais}
                        </div>
                        {s.arquivado && <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 rounded-sm">Arquivado</span>}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-slate-600"><span className="text-slate-400">De:</span> {s.solicitante_nome}</div>
                        <div className="text-xs text-slate-600"><span className="text-slate-400">Para:</span> {s.destinatario_nome}</div>
                      </TableCell>
                      <TableCell>
                         <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            s.status === 'SOLICITADO' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                            s.status === 'APROVADO' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                            s.status === 'COMPRADO' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                            'bg-emerald-50 text-emerald-600 border-emerald-200'
                         }`}>
                           {s.status === 'APROVADO' ? 'EM COTAÇÃO' : s.status}
                         </span>
                      </TableCell>
                      <TableCell className="text-right">
                         <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            s.urgencia === 'Urgente' ? 'bg-rose-100 text-rose-700' :
                            s.urgencia === 'Alta' ? 'bg-amber-100 text-amber-700' :
                            s.urgencia === 'Normal' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                         }`}>
                           {s.urgencia}
                         </span>
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
