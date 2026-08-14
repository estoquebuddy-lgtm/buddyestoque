import React, { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Ferramenta, FerramentaGroup, FiltrosFerramentas } from '../types/ferramentas.types';

export function useFerramentas(obraId: string, filtros?: FiltrosFerramentas, page: number = 0, pageSize: number = 50) {
  // 1. Fetch Ferramentas com filtros e paginação real no banco
  const { data: result, isLoading, refetch } = useQuery({
    queryKey: ['ferramentas-operacional', obraId, filtros, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('ferramentas')
        .select('*', { count: 'exact' })
        .eq('obra_id', obraId);

      // Filtros server-side
      if (filtros?.status && filtros.status !== 'TODOS') {
        query = query.or(`status.eq.${filtros.status},estado.eq.${filtros.status.toLowerCase()}`);
      }

      if (filtros?.funcionario_id) {
        query = query.eq('responsavel_id', filtros.funcionario_id);
      }

      if (filtros?.produto_id) {
        query = query.eq('produto_id', filtros.produto_id);
      }

      // Ordenacao global sem cortar itens por pagina no backend para nao sumir etiquetas
      query = query.order('created_at', { ascending: false });

      const { data, count, error } = await query;
      if (error) throw error;

      // Busca dados auxiliares para montar o relacional com seguranca sem falhas de join
      const { data: pessoasData } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId);
      const { data: produtosData } = await supabase.from('produtos').select('id, nome, categoria').eq('obra_id', obraId);

      const pessoasMap = new Map((pessoasData || []).map(p => [p.id, p]));
      const produtosMap = new Map((produtosData || []).map(p => [p.id, p]));

      const items: Ferramenta[] = (data || []).map((f: any) => {
        const rawStatus = f.status || f.estado || 'DISPONIVEL';
        const normStatus = rawStatus.toUpperCase() as any;
        const cleanName = f.nome ? f.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim() : 'Ferramenta';
        const code = f.codigo || `F-${f.id.slice(0, 4).toUpperCase()}`;

        const pessoa = f.responsavel_id ? pessoasMap.get(f.responsavel_id) : null;
        let produto = f.produto_id ? produtosMap.get(f.produto_id) : null;

        // Se nao tem produto_id direto, tenta localizar pelo nome do produto no estoque
        if (!produto && cleanName) {
          const match = Array.from(produtosMap.values()).find(p => p.nome.toLowerCase() === cleanName.toLowerCase());
          if (match) produto = match;
        }

        return {
          ...f,
          codigo: code,
          nome: cleanName,
          status: normStatus,
          pessoas: pessoa ? { id: pessoa.id, nome: pessoa.nome } : null,
          produtos: produto ? { id: produto.id, nome: produto.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim(), categoria: produto.categoria } : null
        };
      });

      return {
        items,
        totalCount: count || 0
      };
    },
    enabled: !!obraId,
    staleTime: 1000 * 5,
  });

  // 2. Fetch Pessoas (Funcionários) para selects de responsável
  const { data: funcionarios = [] } = useQuery({
    queryKey: ['pessoas-ferramentas', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pessoas')
        .select('id, nome, status')
        .eq('obra_id', obraId)
        .neq('status', 'DEMITIDO')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!obraId,
    staleTime: 1000 * 60 * 5,
  });

  // 3. Fetch Produtos do Estoque (para individualização por produto_id)
  const { data: produtosEstoque = [] } = useQuery({
    queryKey: ['produtos-para-individualizar', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, categoria, estoque_atual, unidade')
        .eq('obra_id', obraId)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!obraId,
    staleTime: 1000 * 30,
  });

  // 4. Fetch Entradas para calcular o total comprado de ferramentas lançadas nas notas
  const { data: entradas = [] } = useQuery({
    queryKey: ['entradas-ferramentas', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('entradas')
        .select('id, quantidade, observacao, status_entrega, produtos(id, nome, categoria)')
        .eq('obra_id', obraId);
      return data || [];
    },
    enabled: !!obraId,
    staleTime: 1000 * 10,
  });

  // Agrupamento em Cards por Equipamento AUTOMÁTICO a partir dos Produtos e Entradas do Estoque
  const toolGroups = useMemo(() => {
    const map = new Map<string, FerramentaGroup>();

    const normKey = (str: string) =>
      str.normalize("NFD")
         .replace(/[\u0300-\u036f]/g, "")
         .toLowerCase()
         .replace(/\bde\b/g, '')
         .replace(/[^a-z0-9]/g, "");

    // 1. Processa Produtos do Estoque (produtosEstoque) - Fonte da Verdade do Estoque
    (produtosEstoque || []).forEach((prod) => {
      const cat = (prod.categoria || '').toUpperCase();
      const name = (prod.nome || '').toUpperCase();
      const isToolProd = name.startsWith('[FERRAMENTA]') || cat.includes('FERRAMENTA');
      if (!isToolProd) return;

      const cleanName = prod.nome ? prod.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim() : 'Ferramenta';
      const key = normKey(cleanName);

      if (!map.has(key)) {
        map.set(key, {
          produtoId: prod.id,
          name: cleanName,
          categoria: prod.categoria || 'FERRAMENTAS',
          totalComprado: Number(prod.estoque_atual) || 0,
          toolsInDb: [],
          disponivelCount: Number(prod.estoque_atual) || 0,
          emUsoList: [],
          manutencaoCount: 0,
          extraviadaCount: 0,
          baixadaCount: 0
        });
      }
    });

    // 2. Mapeia as ferramentas físicas (etiquetas já geradas no banco) vinculando ao produto do Estoque
    (result?.items || []).forEach((f) => {
      let existing: FerramentaGroup | undefined = undefined;

      // Match 1: Por produto_id exato
      if (f.produto_id) {
        existing = Array.from(map.values()).find(g => g.produtoId === f.produto_id);
      }

      // Match 2: Por chave exata do nome caso produto_id esteja nulo
      if (!existing && f.nome) {
        const cleanName = f.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim();
        const key = normKey(cleanName);
        existing = map.get(key);
      }

      // Se não corresponde a nenhum produto oficial do estoque, ignora
      if (!existing) return;

      existing.toolsInDb.push(f);

      if (f.status === 'EM_USO') {
        existing.emUsoList.push(f);
      } else if (f.status === 'MANUTENCAO') {
        existing.manutencaoCount++;
      } else if (f.status === 'EXTRAVIADA') {
        existing.extraviadaCount++;
      } else if (f.status === 'BAIXADA') {
        existing.baixadaCount++;
      }
    });

    // Calcula saldo disponível final e ordena as etiquetas do grupo de forma numerica/alfabetica (01, 02, 03... 10)
    map.forEach((group) => {
      group.toolsInDb.sort((a, b) =>
        (a.codigo || '').localeCompare(b.codigo || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      const indisponiveis = group.emUsoList.length + group.manutencaoCount + group.extraviadaCount + group.baixadaCount;
      group.disponivelCount = Math.max(0, group.totalComprado - indisponiveis);
    });

    let groupsList = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (filtros?.busca?.trim()) {
      const term = filtros.busca.trim().toLowerCase();
      groupsList = groupsList.filter((g) => {
        const matchName = g.name.toLowerCase().includes(term);
        const matchCat = g.categoria.toLowerCase().includes(term);
        const matchCode = g.toolsInDb.some(t => t.codigo?.toLowerCase().includes(term));
        const matchPerson = g.toolsInDb.some(t => t.pessoas?.nome?.toLowerCase().includes(term));
        const matchStatus = g.toolsInDb.some(t => t.status?.toLowerCase().includes(term));
        return matchName || matchCat || matchCode || matchPerson || matchStatus;
      });
    }

    return groupsList;
  }, [entradas, produtosEstoque, result?.items, filtros?.busca]);

  return {
    ferramentas: result?.items || [],
    totalCount: result?.totalCount || 0,
    toolGroups,
    funcionarios,
    produtosEstoque,
    isLoading,
    refetch
  };
}
