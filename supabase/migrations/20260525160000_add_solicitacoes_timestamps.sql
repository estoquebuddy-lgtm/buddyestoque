-- Add tracking columns for status changes in solicitacoes_material
ALTER TABLE public.solicitacoes_material
  ADD COLUMN IF NOT EXISTS data_aprovado TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_comprado TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_entregue TIMESTAMPTZ;
