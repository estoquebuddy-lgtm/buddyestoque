-- Add foto_url column to solicitacoes_material table
ALTER TABLE public.solicitacoes_material
ADD COLUMN IF NOT EXISTS foto_url TEXT;
