-- Create solicitacoes_material table
CREATE TABLE IF NOT EXISTS public.solicitacoes_material (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  solicitante_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  descricao_materiais TEXT NOT NULL,
  urgencia TEXT NOT NULL DEFAULT 'Normal', -- 'Baixa', 'Normal', 'Alta', 'Urgente'
  status TEXT NOT NULL DEFAULT 'PENDENTE', -- 'PENDENTE', 'EM_ANDAMENTO', 'ATENDIDA', 'CANCELADA'
  data_solicitacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao_resposta TEXT
);

-- Enable RLS
ALTER TABLE public.solicitacoes_material ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view solicitacoes of their obras"
ON public.solicitacoes_material FOR SELECT
USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert solicitacoes to their obras"
ON public.solicitacoes_material FOR INSERT
WITH CHECK (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

CREATE POLICY "Users can update solicitacoes of their obras"
ON public.solicitacoes_material FOR UPDATE
USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete solicitacoes of their obras"
ON public.solicitacoes_material FOR DELETE
USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_material;
