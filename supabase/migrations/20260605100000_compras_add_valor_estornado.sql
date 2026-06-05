-- Migration: Adicionar campo valor_estornado na tabela compras
-- Data: 2026-06-05

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS valor_estornado NUMERIC(12, 2) DEFAULT 0;
