-- Create comentarios_solicitacoes table
CREATE TABLE IF NOT EXISTS public.comentarios_solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES public.solicitacoes_material(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usuario_nome TEXT NOT NULL,
  texto TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE public.comentarios_solicitacoes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Usuários aprovados podem ver comentarios"
  ON public.comentarios_solicitacoes FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Usuários aprovados podem inserir comentarios"
  ON public.comentarios_solicitacoes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = usuario_id AND public.is_approved(auth.uid()));

CREATE POLICY "Usuários aprovados podem atualizar proprios comentarios"
  ON public.comentarios_solicitacoes FOR UPDATE TO authenticated
  USING (auth.uid() = usuario_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuários aprovados podem deletar proprios comentarios"
  ON public.comentarios_solicitacoes FOR DELETE TO authenticated
  USING (auth.uid() = usuario_id OR public.has_role(auth.uid(), 'admin'));

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.comentarios_solicitacoes;

-- Grant permissions
GRANT ALL ON public.comentarios_solicitacoes TO authenticated;
