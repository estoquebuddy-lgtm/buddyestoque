-- Alter public.ferramentas table to add qr_code, status and ultima_movimentacao fields
ALTER TABLE public.ferramentas 
ADD COLUMN IF NOT EXISTS qr_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'DISPONIVEL',
ADD COLUMN IF NOT EXISTS ultima_movimentacao TIMESTAMPTZ DEFAULT now();

-- Sync existing data status column from estado
UPDATE public.ferramentas
SET status = 
  CASE 
    WHEN estado = 'disponivel' THEN 'DISPONIVEL'
    WHEN estado = 'em_uso' THEN 'EM_USO'
    WHEN estado = 'manutencao' THEN 'MANUTENCAO'
    ELSE 'DISPONIVEL'
  END
WHERE status IS NULL OR status = 'DISPONIVEL';

-- Create table movimentacoes_ferramentas
CREATE TABLE IF NOT EXISTS public.movimentacoes_ferramentas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ferramenta_id UUID NOT NULL REFERENCES public.ferramentas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL, -- RETIRADA, DEVOLUCAO, MANUTENCAO, EXTRAVIO
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao TEXT,
  obra_id UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE
);

-- Enable RLS for movimentacoes_ferramentas
ALTER TABLE public.movimentacoes_ferramentas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for movimentacoes_ferramentas
CREATE POLICY "Users can manage movimentacoes_ferramentas of own obras"
ON public.movimentacoes_ferramentas FOR ALL
USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()))
WITH CHECK (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

-- Enable Realtime for movimentacoes_ferramentas
ALTER PUBLICATION supabase_realtime ADD TABLE public.movimentacoes_ferramentas;
