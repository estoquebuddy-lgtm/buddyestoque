-- Add new columns to public.solicitacoes_material
ALTER TABLE public.solicitacoes_material
  ADD COLUMN IF NOT EXISTS numero SERIAL,
  ADD COLUMN IF NOT EXISTS titulo TEXT,
  ADD COLUMN IF NOT EXISTS classificacao TEXT;
