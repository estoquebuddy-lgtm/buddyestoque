-- Fix: adicionar coluna updated_at na tabela compras
-- O trigger trg_compras_updated_at já existe mas a coluna não foi criada
-- porque o CREATE TABLE IF NOT EXISTS foi ignorado (tabela já existia)

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
