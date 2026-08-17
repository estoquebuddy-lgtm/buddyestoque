import { supabase } from '@/integrations/supabase/client';
import { Ferramenta, FerramentaMovimentacao, FiltrosFerramentas } from '../types/ferramentas.types';

export const ferramentasService = {
  // Garante que a ferramenta exista no banco de dados com um UUID válido antes de qualquer ação
  async garantirFerramentaNoBanco(ferramentaId: string): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ferramentaId);
    let targetId = isUuid ? ferramentaId : crypto.randomUUID();

    const { data: existing } = await supabase.from('ferramentas').select('id').eq('id', targetId).maybeSingle();
    if (existing) {
      return existing.id;
    }

    // Se a etiqueta ainda não estava salva no banco, cria o registro físico no Supabase
    const { data: inserted, error } = await supabase
      .from('ferramentas')
      .insert({
        id: targetId,
        codigo: `FERR-${Math.floor(1000 + Math.random() * 9000)}`,
        nome: 'Ferramenta',
        status: 'DISPONIVEL',
        estado: 'disponivel',
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.warn("Aviso ao garantir etiqueta no banco:", error);
      return targetId;
    }

    return inserted.id;
  },

  // Retirar ferramenta (Atômico via RPC com Fallback ultra-resiliente)
  async retirarFerramenta(ferramentaId: string, funcionarioId: string, observacao?: string) {
    const realId = await this.garantirFerramentaNoBanco(ferramentaId);

    try {
      const { data, error } = await supabase.rpc('rpc_retirar_ferramenta', {
        p_ferramenta_id: realId,
        p_funcionario_id: funcionarioId,
        p_observacao: observacao || null
      });
      if (!error) return data;
    } catch (rpcErr) {
      console.warn("RPC retirar_ferramenta falhou, usando fallback direto:", rpcErr);
    }

    // FALLBACK DIRETO NA TABELA FERRAMENTAS & MOVIMENTACOES
    const { data: tool } = await supabase.from('ferramentas').select('obra_id').eq('id', realId).single();
    const obraId = tool?.obra_id;

    const { error: updErr } = await supabase
      .from('ferramentas')
      .update({
        status: 'EM_USO',
        estado: 'em_uso',
        responsavel_id: funcionarioId,
        data_retirada: new Date().toISOString()
      })
      .eq('id', realId);

    if (updErr) throw updErr;

    if (obraId) {
      await supabase.from('movimentacoes_ferramentas').insert({
        obra_id: obraId,
        ferramenta_id: realId,
        funcionario_id: funcionarioId,
        tipo: 'RETIRADA',
        observacao: observacao || null
      });
    }

    return true;
  },

  // Devolver ferramenta (Atômico via RPC com Fallback ultra-resiliente)
  async devolverFerramenta(ferramentaId: string, observacao?: string) {
    try {
      const { data, error } = await supabase.rpc('rpc_devolver_ferramenta', {
        p_ferramenta_id: ferramentaId,
        p_observacao: observacao || null
      });
      if (!error) return data;
    } catch (rpcErr) {
      console.warn("RPC devolver_ferramenta falhou, usando fallback direto:", rpcErr);
    }

    const { data: tool } = await supabase.from('ferramentas').select('obra_id, responsavel_id').eq('id', ferramentaId).single();
    const obraId = tool?.obra_id;
    const oldResp = tool?.responsavel_id;

    const { error: updErr } = await supabase
      .from('ferramentas')
      .update({
        status: 'DISPONIVEL',
        estado: 'disponivel',
        responsavel_id: null,
        data_devolucao: new Date().toISOString()
      })
      .eq('id', ferramentaId);

    if (updErr) throw updErr;

    if (obraId) {
      await supabase.from('movimentacoes_ferramentas').insert({
        obra_id: obraId,
        ferramenta_id: ferramentaId,
        funcionario_id: oldResp || null,
        tipo: 'DEVOLUCAO',
        observacao: observacao || null
      });
    }

    return true;
  },

  // Enviar para manutenção (Atômico via RPC)
  async enviarManutencao(ferramentaId: string, observacao?: string) {
    const { data, error } = await supabase.rpc('rpc_enviar_manutencao', {
      p_ferramenta_id: ferramentaId,
      p_observacao: observacao || null
    });
    if (error) throw error;
    return data;
  },

  // Retornar da manutenção (Atômico via RPC)
  async retornarManutencao(ferramentaId: string, observacao?: string) {
    const { data, error } = await supabase.rpc('rpc_retornar_manutencao', {
      p_ferramenta_id: ferramentaId,
      p_observacao: observacao || null
    });
    if (error) throw error;
    return data;
  },

  // Registrar extravio (Atômico via RPC)
  async registrarExtravio(ferramentaId: string, observacao?: string) {
    const { data, error } = await supabase.rpc('rpc_registrar_extravio', {
      p_ferramenta_id: ferramentaId,
      p_observacao: observacao || null
    });
    if (error) throw error;
    return data;
  },

  // Registrar baixa definitiva (Atômico via RPC)
  async registrarBaixa(ferramentaId: string, observacao?: string) {
    const { data, error } = await supabase.rpc('rpc_registrar_baixa', {
      p_ferramenta_id: ferramentaId,
      p_observacao: observacao || null
    });
    if (error) throw error;
    return data;
  },

  // Individualizar unidades de um produto no estoque (Com fallback ultra resiliente)
  async individualizarProduto(produtoId: string, obraId: string, prefixo: string, quantidade: number, nomeOverride?: string) {
    const validProdId = (produtoId && produtoId.length === 36) ? produtoId : null;
    const cleanPref = prefixo.trim().toUpperCase();
    const qty = Math.max(1, quantidade);

    try {
      const { data, error } = await supabase.rpc('rpc_individualizar_ferramentas_v2', {
        p_produto_id: validProdId,
        p_obra_id: obraId,
        p_prefixo: cleanPref,
        p_quantidade: qty,
        p_nome_override: nomeOverride || null
      });
      if (!error && data) return data;
    } catch (rpcErr) {
      console.warn("RPC individualizar falhou, usando fallback direto:", rpcErr);
    }

    // FALLBACK DIRETO NA TABELA FERRAMENTAS:
    let toolName = nomeOverride || 'Ferramenta';
    if (validProdId && !nomeOverride) {
      const { data: prod } = await supabase.from('produtos').select('nome').eq('id', validProdId).single();
      if (prod?.nome) toolName = prod.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim();
    }

    // Busca maiores codigos com o prefixo para determinar a sequencia inicial
    const { data: existing } = await supabase
      .from('ferramentas')
      .select('codigo')
      .eq('obra_id', obraId)
      .ilike('codigo', `${cleanPref}-%`);

    const usedNumbers = new Set<number>();
    (existing || []).forEach((f: any) => {
      if (f.codigo) {
        const parts = f.codigo.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) usedNumbers.add(num);
      }
    });

    const toInsert = [];
    let currentNum = 1;
    for (let i = 0; i < qty; i++) {
      while (usedNumbers.has(currentNum)) {
        currentNum++;
      }
      usedNumbers.add(currentNum);
      const code = `${cleanPref}-${String(currentNum).padStart(2, '0')}`;
      toInsert.push({
        obra_id: obraId,
        produto_id: validProdId,
        nome: toolName,
        codigo: code,
        status: 'DISPONIVEL',
        estado: 'disponivel'
      });
    }

    const { error: insErr } = await supabase.from('ferramentas').insert(toInsert);
    if (insErr) throw insErr;
    return toInsert;
  },

  // Alterar o prefixo de todos os códigos de um equipamento (ex: alterar de PADE-01 para PA-01)
  async alterarPrefixoEquipamento(obraId: string, groupName: string, newPrefix: string) {
    const cleanPref = newPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanPref) throw new Error("Prefixo inválido");

    const cleanName = groupName.replace(/\[FERRAMENTA\]\s*/g, '').trim();
    const term = `%${cleanName}%`;

    const { data: tools, error: fetchErr } = await supabase
      .from('ferramentas')
      .select('id, codigo')
      .eq('obra_id', obraId)
      .ilike('nome', term)
      .order('codigo');

    if (fetchErr) throw fetchErr;

    for (let i = 0; i < (tools || []).length; i++) {
      const tool = tools[i];
      const newCode = `${cleanPref}-${String(i + 1).padStart(2, '0')}`;
      const { error: updErr } = await supabase
        .from('ferramentas')
        .update({ codigo: newCode })
        .eq('id', tool.id);
      if (updErr) throw updErr;
    }

    return true;
  },

  // Cadastrar nova ferramenta avulsa
  async criarFerramenta(data: { obra_id: string; produto_id?: string | null; nome: string; codigo: string; observacoes?: string }) {
    const { data: created, error } = await supabase
      .from('ferramentas')
      .insert({
        obra_id: data.obra_id,
        produto_id: data.produto_id || null,
        nome: data.nome.trim(),
        codigo: data.codigo.trim().toUpperCase(),
        status: 'DISPONIVEL',
        estado: 'disponivel',
        observacoes: data.observacoes || null
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  },

  // Limpar etiquetas de um grupo especifico (para limpar testes)
  async limparEtiquetasGrupo(obraId: string, groupName: string) {
    const term = `%${groupName.replace(/\[FERRAMENTA\]\s*/g, '').trim()}%`;
    const { error: histErr } = await supabase
      .from('movimentacoes_ferramentas')
      .delete()
      .eq('obra_id', obraId);

    const { error } = await supabase
      .from('ferramentas')
      .delete()
      .eq('obra_id', obraId)
      .ilike('nome', term);

    if (error) throw error;
    return true;
  },

  // Apaga todos os códigos fantasmas e recria tudo de forma 100% limpa, bonita e organizada (PA-01, FUR-01...)
  async recriarFerramentasOrganizadas(obraId: string) {
    // 1. Deleta movimentações e ferramentas antigas/fantasmas da obra
    await supabase.from('movimentacoes_ferramentas').delete().eq('obra_id', obraId);
    await supabase.from('ferramentas').delete().eq('obra_id', obraId);

    // 2. Busca produtos do estoque
    const { data: produtos } = await supabase
      .from('produtos')
      .select('*')
      .eq('obra_id', obraId);

    // 3. Busca entradas registradas
    const { data: entradas } = await supabase
      .from('entradas')
      .select('*, produtos(id, nome, categoria)')
      .eq('obra_id', obraId);

    const toolMap = new Map<string, { produto_id: string | null; nome: string; quantidade: number; categoria: string }>();

    (produtos || []).forEach(p => {
      const cat = p.categoria?.toUpperCase() || '';
      const isTool = p.nome?.startsWith('[FERRAMENTA]') || 
                     cat.includes('FERRAMENTA') || 
                     cat.includes('EQUIPAMENTO') || 
                     cat.includes('DISCO') || 
                     cat.includes('EPI');
      if (isTool) {
        const cleanName = p.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim();
        const key = cleanName.toLowerCase();
        toolMap.set(key, {
          produto_id: p.id,
          nome: cleanName,
          quantidade: Math.max(1, Number(p.estoque_atual) || 1),
          categoria: p.categoria || 'FERRAMENTAS'
        });
      }
    });

    (entradas || []).forEach(e => {
      const isTool = e.observacao?.includes('[FERRAMENTA]') || e.produtos?.nome?.startsWith('[FERRAMENTA]');
      if (isTool && e.produtos?.nome) {
        const cleanName = e.produtos.nome.replace(/\[FERRAMENTA\]\s*/g, '').trim();
        const key = cleanName.toLowerCase();
        if (!toolMap.has(key)) {
          toolMap.set(key, {
            produto_id: e.produtos.id,
            nome: cleanName,
            quantidade: Math.max(1, Number(e.quantidade) || 1),
            categoria: e.produtos.categoria || 'FERRAMENTAS'
          });
        }
      }
    });

    function generatePrefix(nome: string) {
      const clean = nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9\s]/g, "");
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        return (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase();
      }
      return clean.substring(0, 3).toUpperCase() || 'FERR';
    }

    let totalInserted = 0;
    for (const tool of Array.from(toolMap.values())) {
      const prefix = generatePrefix(tool.nome);
      const toInsert: any[] = [];

      for (let i = 1; i <= tool.quantidade; i++) {
        const code = `${prefix}-${String(i).padStart(2, '0')}`;
        toInsert.push({
          obra_id: obraId,
          produto_id: tool.produto_id || null,
          nome: tool.nome,
          codigo: code,
          status: 'DISPONIVEL',
          estado: 'disponivel',
          observacoes: `[CAT:${tool.categoria}]`
        });
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from('ferramentas').insert(toInsert);
        if (!error) totalInserted += toInsert.length;
      }
    }

    return totalInserted;
  },

  // Buscar histórico de uma ferramenta específica
  async fetchHistoricoFerramenta(ferramentaId: string) {
    const { data, error } = await supabase
      .from('movimentacoes_ferramentas')
      .select('*, pessoas!movimentacoes_ferramentas_funcionario_id_fkey(nome), ferramentas(codigo, nome)')
      .eq('ferramenta_id', ferramentaId)
      .order('data_hora', { ascending: false });
    if (error) throw error;
    return data as FerramentaMovimentacao[];
  }
};
