import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FerramentaMovimentacao, TipoMovimentacaoFerramenta } from '../types/ferramentas.types';

export interface FiltrosMovimentacao {
  dataInicio?: string;
  dataFim?: string;
  funcionarioId?: string;
  ferramentaId?: string;
  tipo?: TipoMovimentacaoFerramenta | 'TODOS';
}

export function useMovimentacoesFerramentas(obraId: string, filtros?: FiltrosMovimentacao, page: number = 0, pageSize: number = 50) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['movimentacoes-ferramentas', obraId, filtros, page, pageSize],
    queryFn: async () => {
      // 1. Fetch todas as movimentacoes do Supabase
      const { data: rawItems } = await supabase
        .from('movimentacoes_ferramentas')
        .select('*')
        .order('data_hora', { ascending: false });

      // 2. Fetch pessoas e ferramentas para relacionamentos seguros
      const { data: pessoasData } = await supabase.from('pessoas').select('id, nome');
      const { data: ferramentasData } = await supabase.from('ferramentas').select('*');

      const pessoasMap = new Map((pessoasData || []).map(p => [p.id, p]));
      const ferramentasMap = new Map((ferramentasData || []).map(f => [f.id, f]));

      let itemsList: FerramentaMovimentacao[] = [];
      const toolIdsInMovs = new Set<string>();

      (rawItems || []).forEach((m: any) => {
        if (m.ferramenta_id) toolIdsInMovs.add(m.ferramenta_id);
        const p = m.funcionario_id ? pessoasMap.get(m.funcionario_id) : null;
        const f = m.ferramenta_id ? ferramentasMap.get(m.ferramenta_id) : null;
        itemsList.push({
          ...m,
          pessoas: p ? { id: p.id, nome: p.nome } : null,
          ferramentas: f ? { id: f.id, codigo: f.codigo, nome: f.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim() } : null
        });
      });

      // 3. Garante que qualquer ferramenta com responsável apareça no relatório mesmo sem log antigo
      (ferramentasData || []).forEach((f: any) => {
        const rawStat = String(f.status || f.estado || '').toUpperCase();
        const hasResp = !!f.responsavel_id;
        const isEmUso = hasResp || rawStat.includes('USO') || rawStat === 'EM_USO';
        const isManut = rawStat.includes('MANUT');

        if (isEmUso || isManut) {
          const p = f.responsavel_id ? pessoasMap.get(f.responsavel_id) : null;
          itemsList.push({
            id: `syn-${f.id}`,
            obra_id: f.obra_id || obraId,
            ferramenta_id: f.id,
            funcionario_id: f.responsavel_id || null,
            tipo: isEmUso ? 'RETIRADA' : 'MANUTENCAO',
            data_hora: f.data_retirada || f.updated_at || f.created_at || new Date().toISOString(),
            observacao: isEmUso ? 'Acautelamento Ativo' : 'Em Manutenção',
            pessoas: p ? { id: p.id, nome: p.nome } : null,
            ferramentas: { id: f.id, codigo: f.codigo, nome: f.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim() }
          } as any);
        }
      });

      // Remove duplicados de ID caso existam
      const uniqueMap = new Map<string, FerramentaMovimentacao>();
      itemsList.forEach(item => {
        const key = item.ferramenta_id + '-' + item.tipo + '-' + item.data_hora;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      let resultItems = Array.from(uniqueMap.values());

      // Filtros em memória (Data, Funcionário, Tipo)
      if (filtros?.tipo && filtros.tipo !== 'TODOS') {
        resultItems = resultItems.filter(i => i.tipo === filtros.tipo);
      }
      if (filtros?.funcionarioId) {
        resultItems = resultItems.filter(i => i.funcionario_id === filtros.funcionarioId);
      }
      if (filtros?.dataInicio) {
        resultItems = resultItems.filter(i => new Date(i.data_hora) >= new Date(`${filtros.dataInicio}T00:00:00`));
      }
      if (filtros?.dataFim) {
        resultItems = resultItems.filter(i => new Date(i.data_hora) <= new Date(`${filtros.dataFim}T23:59:59`));
      }

      resultItems.sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());

      return {
        items: resultItems,
        totalCount: resultItems.length
      };
    },
    enabled: true,
    staleTime: 1000 * 5,
  });

  return {
    movimentacoes: data?.items || [],
    totalCount: data?.totalCount || 0,
    isLoading,
    refetch
  };
}
