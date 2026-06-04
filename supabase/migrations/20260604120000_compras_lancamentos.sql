-- Migration: Criar tabelas de Compras (Lançamentos de Pagamento)
-- Data: 2026-06-04

-- ============================================================
-- Tabela: compras
-- Representa um lançamento de pagamento vinculado a uma obra
-- ============================================================
CREATE TABLE IF NOT EXISTS public.compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Campos principais
  status TEXT NOT NULL DEFAULT 'NÃO INICIADO',
  data_envio DATE,
  valor_solicitado NUMERIC(12, 2),
  email_titulo TEXT,
  email_link TEXT,
  fornecedor_nome TEXT,
  fornecedor_cnpj TEXT,
  fornecedor_dados TEXT,
  valor_pago NUMERIC(12, 2),
  data_pagamento DATE,
  centro_custo INTEGER,
  tipo_material TEXT,
  tipo_solicitacao TEXT,
  obs TEXT,
  criado_por UUID REFERENCES auth.users(id)
);

-- Índices para compras
CREATE INDEX IF NOT EXISTS idx_compras_obra_id ON public.compras(obra_id);
CREATE INDEX IF NOT EXISTS idx_compras_status ON public.compras(status);
CREATE INDEX IF NOT EXISTS idx_compras_data_envio ON public.compras(data_envio);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_compras_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compras_updated_at
  BEFORE UPDATE ON public.compras
  FOR EACH ROW
  EXECUTE FUNCTION update_compras_updated_at();

-- ============================================================
-- Tabela: compras_nfs
-- Cada lançamento (compra) pode ter múltiplas Notas Fiscais
-- ============================================================
CREATE TABLE IF NOT EXISTS public.compras_nfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id UUID NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Dados da NF
  numero_nf TEXT,
  data_emissao DATE,
  valor_nf NUMERIC(12, 2),
  link_nf TEXT,

  -- Dados do Livro de Entradas
  cfop TEXT,
  ncm TEXT,
  descricao_produto TEXT,
  quantidade NUMERIC(12, 3),
  unidade TEXT,
  valor_unitario NUMERIC(12, 4),
  base_calculo_icms NUMERIC(12, 2),
  aliquota_icms NUMERIC(5, 2),
  valor_icms NUMERIC(12, 2),
  valor_ipi NUMERIC(12, 2),
  obs TEXT
);

-- Índice para compras_nfs
CREATE INDEX IF NOT EXISTS idx_compras_nfs_compra_id ON public.compras_nfs(compra_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Ativar RLS nas tabelas
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_nfs ENABLE ROW LEVEL SECURITY;

-- Políticas para compras: usuários aprovados podem fazer tudo
CREATE POLICY "Usuários aprovados podem ver compras"
  ON public.compras FOR SELECT
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Usuários aprovados podem inserir compras"
  ON public.compras FOR INSERT
  WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Usuários aprovados podem atualizar compras"
  ON public.compras FOR UPDATE
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Usuários aprovados podem deletar compras"
  ON public.compras FOR DELETE
  USING (public.is_approved(auth.uid()));

-- Políticas para compras_nfs: usuários aprovados podem fazer tudo
CREATE POLICY "Usuários aprovados podem ver compras_nfs"
  ON public.compras_nfs FOR SELECT
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Usuários aprovados podem inserir compras_nfs"
  ON public.compras_nfs FOR INSERT
  WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Usuários aprovados podem atualizar compras_nfs"
  ON public.compras_nfs FOR UPDATE
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Usuários aprovados podem deletar compras_nfs"
  ON public.compras_nfs FOR DELETE
  USING (public.is_approved(auth.uid()));

-- ============================================================
-- Permissões para roles autenticados
-- ============================================================
GRANT ALL ON public.compras TO authenticated;
GRANT ALL ON public.compras_nfs TO authenticated;
