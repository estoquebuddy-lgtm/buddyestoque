-- Drop old foreign keys
ALTER TABLE public.solicitacoes_material DROP CONSTRAINT IF EXISTS solicitacoes_material_solicitante_id_fkey;
ALTER TABLE public.solicitacoes_material DROP CONSTRAINT IF EXISTS solicitacoes_material_destinatario_id_fkey;

-- Clear old data to prevent constraint validation errors
TRUNCATE TABLE public.solicitacoes_material CASCADE;

-- Re-add foreign keys pointing to profiles instead of pessoas
ALTER TABLE public.solicitacoes_material
  ADD CONSTRAINT solicitacoes_material_solicitante_id_fkey
  FOREIGN KEY (solicitante_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.solicitacoes_material
  ADD CONSTRAINT solicitacoes_material_destinatario_id_fkey
  FOREIGN KEY (destinatario_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
