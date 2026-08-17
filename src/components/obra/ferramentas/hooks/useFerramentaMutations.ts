import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ferramentasService } from '../services/ferramentas.service';
import { toast } from 'sonner';

export function useFerramentaMutations(obraId: string) {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['ferramentas-operacional', obraId] });
    queryClient.invalidateQueries({ queryKey: ['movimentacoes-ferramentas', obraId] });
    queryClient.invalidateQueries({ queryKey: ['produtos-para-individualizar', obraId] });
    queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
  };

  // Retirar
  const retirarMutation = useMutation({
    mutationFn: async ({ ferramentaId, funcionarioId, observacao, tagData }: { ferramentaId: string; funcionarioId: string; observacao?: string; tagData?: any }) => {
      return ferramentasService.retirarFerramenta(ferramentaId, funcionarioId, observacao, tagData);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Retirada registrada com sucesso!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao registrar retirada'),
  });

  // Devolver
  const devolverMutation = useMutation({
    mutationFn: async ({ ferramentaId, observacao }: { ferramentaId: string; observacao?: string }) => {
      return ferramentasService.devolverFerramenta(ferramentaId, observacao);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Devolução registrada com sucesso!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao registrar devolução'),
  });

  // Manutenção
  const manutencaoMutation = useMutation({
    mutationFn: async ({ ferramentaId, observacao }: { ferramentaId: string; observacao?: string }) => {
      return ferramentasService.enviarManutencao(ferramentaId, observacao);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Ferramenta enviada para manutenção!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao enviar para manutenção'),
  });

  // Retornar da manutenção
  const retornarManutencaoMutation = useMutation({
    mutationFn: async ({ ferramentaId, observacao }: { ferramentaId: string; observacao?: string }) => {
      return ferramentasService.retornarManutencao(ferramentaId, observacao);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Ferramenta retornada ao galpão!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao retornar da manutenção'),
  });

  // Extravio
  const extravioMutation = useMutation({
    mutationFn: async ({ ferramentaId, observacao }: { ferramentaId: string; observacao?: string }) => {
      return ferramentasService.registrarExtravio(ferramentaId, observacao);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Extravio registrado!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao registrar extravio'),
  });

  // Baixa
  const baixaMutation = useMutation({
    mutationFn: async ({ ferramentaId, observacao }: { ferramentaId: string; observacao?: string }) => {
      return ferramentasService.registrarBaixa(ferramentaId, observacao);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Baixa definitiva registrada!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao registrar baixa'),
  });

  // Individualizar Produto
  const individualizarMutation = useMutation({
    mutationFn: async (payload: { produtoId: string; prefixo: string; quantidade: number; nomeOverride?: string }) => {
      return ferramentasService.individualizarProduto(payload.produtoId, obraId, payload.prefixo, payload.quantidade, payload.nomeOverride);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Unidades individualizadas com sucesso!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao individualizar produto'),
  });

  // Criar Avulsa
  const criarAvulsaMutation = useMutation({
    mutationFn: async (data: { obra_id: string; produto_id?: string | null; nome: string; codigo: string; observacoes?: string }) => {
      return ferramentasService.criarFerramenta(data);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Ferramenta cadastrada com sucesso!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao cadastrar ferramenta'),
  });

  // Limpar etiquetas de teste de um grupo
  const limparEtiquetasGrupoMutation = useMutation({
    mutationFn: async (groupName: string) => {
      return ferramentasService.limparEtiquetasGrupo(obraId, groupName);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Etiquetas do equipamento resetadas com sucesso!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao limpar etiquetas'),
  });

  // Apagar todos os códigos fantasmas e recriar tudo organizado (PA-01, PA-02...)
  const recriarTudoOrganizadoMutation = useMutation({
    mutationFn: async () => {
      return ferramentasService.recriarFerramentasOrganizadas(obraId);
    },
    onSuccess: (count) => {
      invalidateAll();
      toast.success(`${count} etiquetas organizadas com sucesso!`);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao recriar ferramentas'),
  });

  // Alterar o prefixo dos códigos de um equipamento
  const alterarPrefixoMutation = useMutation({
    mutationFn: async (payload: { groupName: string; newPrefix: string }) => {
      return ferramentasService.alterarPrefixoEquipamento(obraId, payload.groupName, payload.newPrefix);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Prefixo dos códigos atualizado com sucesso!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao alterar prefixo'),
  });

  return {
    retirarMutation,
    devolverMutation,
    manutencaoMutation,
    retornarManutencaoMutation,
    extravioMutation,
    baixaMutation,
    individualizarMutation,
    criarAvulsaMutation,
    limparEtiquetasGrupoMutation,
    recriarTudoOrganizadoMutation,
    alterarPrefixoMutation
  };
}
