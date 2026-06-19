-- Adiciona coluna itens_checklist para armazenar o estado dos itens da solicitação
ALTER TABLE public.solicitacoes_material
  ADD COLUMN IF NOT EXISTS itens_checklist JSONB DEFAULT '[]'::jsonb;
