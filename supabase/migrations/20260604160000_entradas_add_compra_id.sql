-- Migration: Adicionar compra_id à tabela public.entradas
-- Permite que lançamentos de estoque sejam vinculados a uma compra específica

ALTER TABLE public.entradas
  ADD COLUMN IF NOT EXISTS compra_id UUID REFERENCES public.compras(id) ON DELETE SET NULL;

-- Criar índice para melhorar a performance das consultas de junção
CREATE INDEX IF NOT EXISTS idx_entradas_compra_id ON public.entradas(compra_id);
