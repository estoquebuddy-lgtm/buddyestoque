-- Add status column to pessoas table
ALTER TABLE public.pessoas 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVO';

-- Sync status based on name suffix
UPDATE public.pessoas 
SET status = 'DEMITIDO' 
WHERE nome LIKE '% (Saiu)';
