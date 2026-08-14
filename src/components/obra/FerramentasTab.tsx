import { useState, useMemo } from 'react';
import { useFerramentas } from './ferramentas/hooks/useFerramentas';
import { useFerramentaMutations } from './ferramentas/hooks/useFerramentaMutations';
import { Ferramenta, FerramentaStatus, FerramentaGroup, FiltrosFerramentas } from './ferramentas/types/ferramentas.types';

// Componentes
import { FerramentasCards } from './ferramentas/components/FerramentasCards';
import { FerramentasTabela } from './ferramentas/components/FerramentasTabela';
import { FerramentasPorFuncionario } from './ferramentas/components/FerramentasPorFuncionario';
import { MovimentacaoModal, TipoAcaoModal } from './ferramentas/components/MovimentacaoModal';
import { IndividualizarModal } from './ferramentas/components/IndividualizarModal';
import { FerramentaDetalhesModal } from './ferramentas/components/FerramentaDetalhesModal';
import { FerramentasRelatorio } from './ferramentas/components/FerramentasRelatorio';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { 
  Wrench, Layers, UserCheck, FileText, Search, Plus, LayoutGrid, Table, RotateCcw, Hand
} from 'lucide-react';

interface Props {
  obraId: string;
}

export default function FerramentasTab({ obraId }: Props) {
  // Estado de Navegação / Abas Internas
  const [activeTab, setActiveTab] = useState<'tabela' | 'funcionario' | 'relatorio'>('tabela');

  // Estado de Filtros & Paginação
  const [filtros, setFiltros] = useState<FiltrosFerramentas>({
    status: 'TODOS'
  });
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Hooks do Módulo
  const { 
    ferramentas, 
    totalCount, 
    toolGroups,
    funcionarios, 
    produtosEstoque, 
    isLoading 
  } = useFerramentas(obraId, filtros, page, pageSize);

  const {
    retirarMutation,
    devolverMutation,
    manutencaoMutation,
    retornarManutencaoMutation,
    extravioMutation,
    baixaMutation,
    individualizarMutation,
    limparEtiquetasGrupoMutation,
    recriarTudoOrganizadoMutation,
    alterarPrefixoMutation,
  } = useFerramentaMutations(obraId);

  // Estados dos Modais
  const [movimentacaoModalOpen, setMovimentacaoModalOpen] = useState(false);
  const [tipoAcao, setTipoAcao] = useState<TipoAcaoModal>(null);
  const [ferramentaSelecionada, setFerramentaSelecionada] = useState<Ferramenta | null>(null);

  const [individualizarOpen, setIndividualizarOpen] = useState(false);
  const [targetIndividualizarGroup, setTargetIndividualizarGroup] = useState<FerramentaGroup | null>(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<FerramentaGroup | null>(null);

  // Handlers para abrir modais de ação
  const handleOpenMovimentacao = (f: Ferramenta, acao: TipoAcaoModal) => {
    setFerramentaSelecionada(f);
    setTipoAcao(acao);
    setMovimentacaoModalOpen(true);
  };

  const handleOpenDetalhes = (f: Ferramenta) => {
    setFerramentaSelecionada(f);
    setDetalhesOpen(true);
  };

  const handleQuickRetirarGroup = (group: FerramentaGroup) => {
    const firstAvail = group.toolsInDb.find(t => t.status === 'DISPONIVEL');
    if (firstAvail) {
      handleOpenMovimentacao(firstAvail, 'RETIRADA');
    }
  };

  const handleAlterarPrefixo = async (group: FerramentaGroup) => {
    const currentPrefix = group.toolsInDb[0]?.codigo?.split('-')[0] || '';
    const newPrefix = prompt(
      `Alterar prefixo dos códigos do equipamento "${group.name}":\n(Exemplo atual: ${currentPrefix}-01, ${currentPrefix}-02...)\n\nDigite o NOVO prefixo desejado (ex: PA, FUR, BOSCH):`,
      currentPrefix
    );

    if (newPrefix && newPrefix.trim() && newPrefix.trim().toUpperCase() !== currentPrefix) {
      await alterarPrefixoMutation.mutateAsync({
        groupName: group.name,
        newPrefix: newPrefix.trim().toUpperCase()
      });
    }
  };

  // Confirmar Ação no Modal Unificado
  const handleConfirmMovimentacao = async (payload: { ferramentaId: string; funcionarioId?: string; observacao?: string }) => {
    if (!tipoAcao) return;

    switch (tipoAcao) {
      case 'RETIRADA':
        if (!payload.funcionarioId) return;
        await retirarMutation.mutateAsync({
          ferramentaId: payload.ferramentaId,
          funcionarioId: payload.funcionarioId,
          observacao: payload.observacao
        });
        break;

      case 'DEVOLUCAO':
        await devolverMutation.mutateAsync({
          ferramentaId: payload.ferramentaId,
          observacao: payload.observacao
        });
        break;

      case 'MANUTENCAO':
        await manutencaoMutation.mutateAsync({
          ferramentaId: payload.ferramentaId,
          observacao: payload.observacao
        });
        break;

      case 'RETORNO_MANUTENCAO':
        await retornarManutencaoMutation.mutateAsync({
          ferramentaId: payload.ferramentaId,
          observacao: payload.observacao
        });
        break;

      case 'EXTRAVIO':
        await extravioMutation.mutateAsync({
          ferramentaId: payload.ferramentaId,
          observacao: payload.observacao
        });
        break;

      case 'BAIXA':
        await baixaMutation.mutateAsync({
          ferramentaId: payload.ferramentaId,
          observacao: payload.observacao
        });
        break;
    }
  };

  // Confirmar Individualização de Produto
  const handleConfirmIndividualizacao = async (payload: { produtoId: string; prefixo: string; quantidade: number; nomeOverride?: string }) => {
    await individualizarMutation.mutateAsync({
      produtoId: payload.produtoId,
      prefixo: payload.prefixo,
      quantidade: payload.quantidade,
      nomeOverride: payload.nomeOverride
    });
  };

  // Garante que a gaveta (Sheet) exiba o grupo atualizado em tempo real ao retirar/devolver
  const currentGroup = useMemo(() => {
    if (!selectedGroup) return null;
    return toolGroups.find(g => g.name.toLowerCase() === selectedGroup.name.toLowerCase()) || selectedGroup;
  }, [selectedGroup, toolGroups]);

  // Indicadores de Resumo (Total de Tipos de Ferramentas, Unidades, Disponíveis e Em Uso)
  const summaryMetrics = useMemo(() => {
    const totalTipos = toolGroups.length;
    let totalUnidades = 0;
    let disponiveis = 0;
    let emUso = 0;

    toolGroups.forEach((g) => {
      totalUnidades += g.totalComprado;
      disponiveis += g.disponivelCount;
      emUso += g.emUsoList.length;
    });

    return { totalTipos, totalUnidades, disponiveis, emUso };
  }, [toolGroups]);

  return (
    <div className="space-y-4 animate-fade-in text-white pb-12">
      {/* Page Header */}
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-6 mb-4 rounded-b-[2rem] shadow-2xl border-b border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-400" />
              Gestão Operacional de Ferramentas
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Controle de acautelamento por equipamentos agrupados ou por unidade individual.
            </p>
          </div>

          {/* Indicadores do Módulo */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs shadow-sm">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Tipos de Ferramentas:</span>
              <span className="font-bold text-amber-400 text-sm">{summaryMetrics.totalTipos} tipos</span>
            </div>

            <div className="bg-purple-500/10 border border-purple-500/30 px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs shadow-sm">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Total de Unidades:</span>
              <span className="font-bold text-purple-400 text-sm">{summaryMetrics.totalUnidades} un</span>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs shadow-sm">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Disponíveis:</span>
              <span className="font-bold text-emerald-400 text-sm">{summaryMetrics.disponiveis} un</span>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs shadow-sm">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Em Uso:</span>
              <span className="font-bold text-blue-400 text-sm">{summaryMetrics.emUso} un</span>
            </div>
          </div>
        </div>

        {/* NAVEGAÇÃO ENTRE ABAS DO MÓDULO */}
        <div className="flex flex-wrap gap-2 p-1 bg-slate-900/80 border border-slate-800 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('tabela')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'tabela' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wrench className="h-3.5 w-3.5" /> Controle Diário (Equipamentos)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('funcionario')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'funcionario' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" /> Por Funcionário
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('relatorio')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'relatorio' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> Relatórios & Histórico
          </button>
        </div>

        {/* BARRA DE FILTROS RÁPIDOS */}
        {activeTab === 'tabela' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
            {/* Pesquisa Código / Nome */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                value={filtros.busca || ''}
                onChange={(e) => { setFiltros({ ...filtros, busca: e.target.value }); setPage(0); }}
                placeholder="Buscar equipamento ou código..."
                className="pl-9 bg-slate-900 border-slate-800 text-white text-xs h-9"
              />
            </div>

            {/* Filtro por Funcionário */}
            <Select
              value={filtros.funcionario_id || 'TODOS'}
              onValueChange={(val) => { setFiltros({ ...filtros, funcionario_id: val === 'TODOS' ? undefined : val }); setPage(0); }}
            >
              <SelectTrigger className="bg-slate-900 border-slate-800 text-white h-9 text-xs">
                <SelectValue placeholder="Funcionário: Todos" />
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

            {/* Filtro por Status */}
            <Select
              value={filtros.status || 'TODOS'}
              onValueChange={(val) => { setFiltros({ ...filtros, status: val as FerramentaStatus | 'TODOS' }); setPage(0); }}
            >
              <SelectTrigger className="bg-slate-900 border-slate-800 text-white h-9 text-xs">
                <SelectValue placeholder="Status: Todos" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                <SelectItem value="TODOS">Todos os status</SelectItem>
                <SelectItem value="DISPONIVEL">🔵 DISPONÍVEL</SelectItem>
                <SelectItem value="EM_USO">🟢 EM USO</SelectItem>
                <SelectItem value="MANUTENCAO">🔧 MANUTENÇÃO</SelectItem>
                <SelectItem value="EXTRAVIADA">⚠️ EXTRAVIADA</SelectItem>
                <SelectItem value="BAIXADA">⛔ BAIXADA</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro por Produto */}
            <Select
              value={filtros.produto_id || 'TODOS'}
              onValueChange={(val) => { setFiltros({ ...filtros, produto_id: val === 'TODOS' ? undefined : val }); setPage(0); }}
            >
              <SelectTrigger className="bg-slate-900 border-slate-800 text-white h-9 text-xs">
                <SelectValue placeholder="Produto do Estoque: Todos" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-56">
                <SelectItem value="TODOS">Todos os produtos</SelectItem>
                {produtosEstoque.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* CONTEÚDO DA ABA SELECIONADA */}
      {activeTab === 'tabela' && (
        <FerramentasTabela
          toolGroups={toolGroups}
          onOpenGroup={setSelectedGroup}
          onQuickRetirar={handleQuickRetirarGroup}
          onAlterarPrefixo={handleAlterarPrefixo}
          onIndividualizar={(g) => { setTargetIndividualizarGroup(g); setIndividualizarOpen(true); }}
          isLoading={isLoading}
        />
      )}

      {activeTab === 'funcionario' && (
        <FerramentasPorFuncionario
          ferramentas={ferramentas}
          onDevolver={(f) => handleOpenMovimentacao(f, 'DEVOLUCAO')}
          isLoading={isLoading}
        />
      )}

      {activeTab === 'relatorio' && (
        <FerramentasRelatorio
          obraId={obraId}
          funcionarios={funcionarios}
          ferramentas={ferramentas.map(f => ({ id: f.id, codigo: f.codigo, nome: f.nome }))}
        />
      )}

      {/* SHEET / MODAL DE UNIDADES ETIQUETADAS DE UM GRUPO ESPECÍFICO */}
      <Sheet open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl bg-[#0f172a] border-slate-800 text-white p-6 overflow-y-auto">
          {currentGroup && (
            <div className="space-y-5">
              {/* Header do Grupo */}
              <SheetHeader className="text-left border-b border-slate-800 pb-4">
                <SheetTitle className="text-xl font-bold text-white flex items-center justify-between">
                  <span>{currentGroup.name}</span>
                  <Badge className="bg-slate-800 text-slate-200 border-slate-700 text-xs font-bold">
                    {currentGroup.categoria}
                  </Badge>
                </SheetTitle>
                <p className="text-xs text-slate-300 mt-1">
                  Lista de unidades etiquetadas cadastradas no almoxarifado.
                </p>
              </SheetHeader>

              {/* Resumo de Saldos */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-900 rounded-xl border border-slate-800 text-center text-xs">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Total Físico</p>
                  <p className="text-lg font-bold text-white mt-0.5">{currentGroup.totalComprado} un</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Disponíveis</p>
                  <p className="text-lg font-bold text-emerald-400 mt-0.5">{currentGroup.disponivelCount} un</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Em Uso</p>
                  <p className="text-lg font-bold text-amber-400 mt-0.5">{currentGroup.emUsoList.length} un</p>
                </div>
              </div>

              {/* Lista de Unidades Etiquetadas */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Unidades Etiquetadas ({currentGroup.toolsInDb.length})
                </h4>

                {currentGroup.toolsInDb.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">Nenhum código individual atribuído ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {currentGroup.toolsInDb
                      .slice()
                      .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, { numeric: true, sensitivity: 'base' }))
                      .map((t) => (
                      <div key={t.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                              {t.codigo}
                            </span>
                            <Badge 
                              className={`text-[10px] font-bold border px-2 py-0.5 ${
                                t.status === 'DISPONIVEL' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                t.status === 'EM_USO' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                t.status === 'MANUTENCAO' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                'bg-rose-500/20 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {t.status === 'DISPONIVEL' ? 'DISPONÍVEL' : t.status === 'EM_USO' ? 'EM USO' : t.status}
                            </Badge>
                          </div>
                          {t.status === 'EM_USO' && (
                            <p className="text-[11px] text-slate-300 mt-1">
                              Com: <span className="font-bold text-white">{t.pessoas?.nome || 'Não identificado'}</span>
                            </p>
                          )}
                        </div>

                        <div className="flex gap-1.5">
                          {t.status === 'DISPONIVEL' && (
                            <Button
                              size="sm"
                              onClick={() => { setSelectedGroup(null); handleOpenMovimentacao(t, 'RETIRADA'); }}
                              className="h-7 bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold text-[11px] gap-1"
                            >
                              <Hand className="h-3 w-3" /> Retirar
                            </Button>
                          )}

                          {t.status === 'EM_USO' && (
                            <Button
                              size="sm"
                              onClick={() => { setSelectedGroup(null); handleOpenMovimentacao(t, 'DEVOLUCAO'); }}
                              className="h-7 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 font-bold text-[11px] gap-1"
                            >
                              <RotateCcw className="h-3 w-3" /> Devolver
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedGroup(null); handleOpenDetalhes(t); }}
                            className="h-7 px-2 text-slate-400 hover:text-white text-[11px]"
                          >
                            Detalhes
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* MODAIS DO MÓDULO */}
      <MovimentacaoModal
        open={movimentacaoModalOpen}
        onOpenChange={setMovimentacaoModalOpen}
        tipoAcao={tipoAcao}
        ferramenta={ferramentaSelecionada}
        availableUnits={
          ferramentaSelecionada
            ? ferramentas.filter(f =>
                f.status === 'DISPONIVEL' &&
                (f.nome.toLowerCase() === ferramentaSelecionada.nome.toLowerCase() || (f.produto_id && f.produto_id === ferramentaSelecionada.produto_id))
              )
            : []
        }
        funcionarios={funcionarios}
        onConfirm={handleConfirmMovimentacao}
      />

      <IndividualizarModal
        open={individualizarOpen}
        onOpenChange={setIndividualizarOpen}
        targetGroup={targetIndividualizarGroup}
        produtosEstoque={produtosEstoque}
        onConfirm={handleConfirmIndividualizacao}
      />

      <FerramentaDetalhesModal
        open={detalhesOpen}
        onOpenChange={setDetalhesOpen}
        ferramenta={ferramentaSelecionada}
      />
    </div>
  );
}
