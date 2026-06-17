-- Migration: Tornar compra_id opcional na tabela public.entradas
-- Permite que lançamentos manuais no estoque sejam feitos sem estarem vinculados a uma compra

ALTER TABLE public.entradas 
  ALTER COLUMN compra_id DROP NOT NULL;
