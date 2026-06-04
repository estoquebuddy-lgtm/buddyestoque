-- Migration: Adicionar campos faltantes à tabela compras
-- Data: 2026-06-04

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS parcela TEXT DEFAULT '1/1',
  ADD COLUMN IF NOT EXISTS conta TEXT,
  ADD COLUMN IF NOT EXISTS estornado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_estorno DATE,
  ADD COLUMN IF NOT EXISTS cc_desc TEXT DEFAULT 'Não previsto em orçamento';

ALTER TABLE public.compras_nfs
  ADD COLUMN IF NOT EXISTS vinculo TEXT DEFAULT '1nf_1pag',
  ADD COLUMN IF NOT EXISTS especie TEXT DEFAULT 'NF-e';
