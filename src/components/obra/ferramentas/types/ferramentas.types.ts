export type FerramentaStatus = 'DISPONIVEL' | 'EM_USO' | 'MANUTENCAO' | 'EXTRAVIADA' | 'BAIXADA';

export type TipoMovimentacaoFerramenta = 
  | 'RETIRADA' 
  | 'DEVOLUCAO' 
  | 'MANUTENCAO' 
  | 'RETORNO_MANUTENCAO' 
  | 'EXTRAVIO' 
  | 'BAIXA';

export interface Ferramenta {
  id: string;
  obra_id: string;
  produto_id: string | null;
  codigo: string;
  nome: string;
  status: FerramentaStatus;
  responsavel_id: string | null;
  observacoes: string | null;
  created_at?: string;
  updated_at?: string;
  data_retirada?: string | null;
  data_devolucao?: string | null;
  ultima_movimentacao?: string | null;

  // Relacionamentos
  produtos?: {
    id: string;
    nome: string;
    categoria: string | null;
  } | null;

  pessoas?: {
    id: string;
    nome: string;
  } | null;
}

export interface FerramentaMovimentacao {
  id: string;
  ferramenta_id: string;
  obra_id: string;
  funcionario_id: string | null; // Quem recebeu/utilizou a ferramenta
  usuario_id: string | null;     // Quem executou a operação no sistema
  tipo: TipoMovimentacaoFerramenta;
  data_hora: string;
  status_anterior: FerramentaStatus | null;
  status_novo: FerramentaStatus | null;
  observacao: string | null;

  // Relacionamentos
  ferramentas?: {
    id: string;
    codigo: string;
    nome: string;
  } | null;

  pessoas?: {
    id: string;
    nome: string;
  } | null;
}

export interface FiltrosFerramentas {
  busca?: string;
  produto_id?: string;
  funcionario_id?: string;
  status?: FerramentaStatus | 'TODOS';
}

export interface FerramentaGroup {
  produtoId?: string;
  name: string;
  categoria: string;
  totalComprado: number;
  toolsInDb: Ferramenta[];
  disponivelCount: number;
  emUsoList: Ferramenta[];
  manutencaoCount: number;
  extraviadaCount: number;
  baixadaCount: number;
}

