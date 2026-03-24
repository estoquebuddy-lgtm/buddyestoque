CREATE TABLE public.importacoes_xml (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  data timestamp with time zone NOT NULL DEFAULT now(),
  total_itens integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes_xml ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage importacoes_xml of own obras"
ON public.importacoes_xml
FOR ALL
USING (obra_id IN (SELECT id FROM obras WHERE user_id = auth.uid()))
WITH CHECK (obra_id IN (SELECT id FROM obras WHERE user_id = auth.uid()));