-- Add arquivado column to solicitacoes_material table
ALTER TABLE public.solicitacoes_material
  ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT false;
