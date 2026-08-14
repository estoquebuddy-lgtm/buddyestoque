import { useState } from 'react';
import { useMovimentacoesFerramentas, FiltrosMovimentacao } from '../hooks/useMovimentacoesFerramentas';
import { TipoMovimentacaoFerramenta } from '../types/ferramentas.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileSpreadsheet, FileText, Filter, History, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  obraId: string;
  funcionarios: { id: string; nome: string }[];
  ferramentas: { id: string; codigo: string; nome: string }[];
}

export function FerramentasRelatorio({ obraId, funcionarios, ferramentas }: Props) {
  const [filtros, setFiltros] = useState<FiltrosMovimentacao>({
    tipo: 'TODOS'
  });
  const [displayPage, setDisplayPage] = useState(0);
  const pageSize = 15;

  const { movimentacoes, totalCount, isLoading } = useMovimentacoesFerramentas(obraId, filtros);

  const paginatedMovs = movimentacoes.slice(displayPage * pageSize, (displayPage + 1) * pageSize);
  const totalPages = Math.ceil(movimentacoes.length / pageSize) || 1;

  const handleExportExcel = () => {
    if (movimentacoes.length === 0) return;
    const dataToExport = movimentacoes.map(m => ({
      Data: new Date(m.data_hora).toLocaleString('pt-BR'),
      Código: m.ferramentas?.codigo || '—',
      Ferramenta: m.ferramentas?.nome || '—',
      Operação: m.tipo,
      Funcionário: m.pessoas?.nome || '—',
      Observação: m.observacao || '—'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Ferramentas');
    XLSX.writeFile(workbook, `Relatorio_Ferramentas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    if (movimentacoes.length === 0) return;
    const doc = new jsPDF();
    doc.text('Relatório de Movimentação de Ferramentas', 14, 15);

    const tableData = movimentacoes.map(m => [
      new Date(m.data_hora).toLocaleDateString('pt-BR'),
      m.ferramentas?.codigo || '—',
      m.ferramentas?.nome || '—',
      m.tipo,
      m.pessoas?.nome || '—',
      m.observacao || '—'
    ]);

    autoTable(doc, {
      startY: 20,
      head: [['Data', 'Código', 'Ferramenta', 'Operação', 'Funcionário', 'Observação']],
      body: tableData,
    });

    doc.save(`Relatorio_Ferramentas_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Filtros Server-Side */}
      <div className="p-4 bg-[#0f172a] border border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Filter className="h-4 w-4 text-amber-400" />
          Filtros de Movimentações
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          {/* Data Inicial */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold">Data Inicial</label>
            <Input
              type="date"
              value={filtros.dataInicio || ''}
              onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
              className="bg-slate-900 border-slate-800 text-white text-xs h-9"
            />
          </div>

          {/* Data Final */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold">Data Final</label>
            <Input
              type="date"
              value={filtros.dataFim || ''}
              onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
              className="bg-slate-900 border-slate-800 text-white text-xs h-9"
            />
          </div>

          {/* Funcionário */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold">Funcionário</label>
            <Select
              value={filtros.funcionarioId || 'TODOS'}
              onValueChange={(val) => setFiltros({ ...filtros, funcionarioId: val === 'TODOS' ? undefined : val })}
            >
              <SelectTrigger className="bg-slate-900 border-slate-800 text-white h-9">
                <SelectValue placeholder="Todos os funcionários" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-56">
                <SelectItem value="TODOS">Todos os funcionários</SelectItem>
                {funcionarios.map((func) => (
                  <SelectItem key={func.id} value={func.id}>
                    {func.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Operação */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold">Tipo de Operação</label>
            <Select
              value={filtros.tipo || 'TODOS'}
              onValueChange={(val) => setFiltros({ ...filtros, tipo: val as TipoMovimentacaoFerramenta | 'TODOS' })}
            >
              <SelectTrigger className="bg-slate-900 border-slate-800 text-white h-9">
                <SelectValue placeholder="Todas as operações" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                <SelectItem value="TODOS">Todas as operações</SelectItem>
                <SelectItem value="RETIRADA">RETIRADA</SelectItem>
                <SelectItem value="DEVOLUCAO">DEVOLUÇÃO</SelectItem>
                <SelectItem value="MANUTENCAO">MANUTENÇÃO</SelectItem>
                <SelectItem value="RETORNO_MANUTENCAO">RETORNO DA MANUTENÇÃO</SelectItem>
                <SelectItem value="EXTRAVIO">EXTRAVIO</SelectItem>
                <SelectItem value="BAIXA">BAIXA DEFINITIVA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Botões de Exportação */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/80">
          <Button
            size="sm"
            onClick={handleExportExcel}
            disabled={movimentacoes.length === 0}
            className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1.5"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel
          </Button>
          <Button
            size="sm"
            onClick={handleExportPDF}
            disabled={movimentacoes.length === 0}
            className="h-8 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* Tabela de Relatório */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0f172a] shadow-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 font-bold">
            <tr>
              <th scope="col" className="px-4 py-3">Data/Hora</th>
              <th scope="col" className="px-4 py-3">Código</th>
              <th scope="col" className="px-4 py-3">Ferramenta</th>
              <th scope="col" className="px-4 py-3">Operação</th>
              <th scope="col" className="px-4 py-3">Funcionário</th>
              <th scope="col" className="px-4 py-3">Observação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-500">Carregando histórico de movimentações...</td>
              </tr>
            ) : paginatedMovs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-500">Nenhuma movimentação localizada para os filtros selecionados.</td>
              </tr>
            ) : (
              paginatedMovs.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-slate-400 whitespace-nowrap">
                    {new Date(m.data_hora).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-bold text-amber-400 whitespace-nowrap">
                    {m.ferramentas?.codigo || '—'}
                  </td>
                  <td className="px-4 py-2.5 font-bold text-white">
                    {m.ferramentas?.nome || '—'}
                  </td>
                  <td className="px-4 py-2.5 font-bold">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      m.tipo === 'RETIRADA' ? 'bg-amber-500/20 text-amber-400' :
                      m.tipo === 'DEVOLUCAO' ? 'bg-emerald-500/20 text-emerald-400' :
                      m.tipo === 'MANUTENCAO' ? 'bg-blue-500/20 text-blue-400' :
                      m.tipo === 'EXTRAVIO' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {m.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-bold text-slate-200">
                    {m.pessoas?.nome || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 italic max-w-xs truncate">
                    {m.observacao || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 px-1 text-xs text-slate-400">
          <p>Exibindo <span className="font-bold text-white">{paginatedMovs.length}</span> de <span className="font-bold text-white">{movimentacoes.length}</span> movimentações</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={displayPage === 0}
              onClick={() => setDisplayPage(prev => Math.max(0, prev - 1))}
              className="h-8 bg-slate-900 border-slate-800 text-slate-300 hover:text-white font-bold text-xs"
            >
              ⬅ Anterior
            </Button>
            <span className="font-bold text-amber-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              Página {displayPage + 1} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={displayPage >= totalPages - 1}
              onClick={() => setDisplayPage(prev => Math.min(totalPages - 1, prev + 1))}
              className="h-8 bg-slate-900 border-slate-800 text-slate-300 hover:text-white font-bold text-xs"
            >
              Próxima ➡️
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
