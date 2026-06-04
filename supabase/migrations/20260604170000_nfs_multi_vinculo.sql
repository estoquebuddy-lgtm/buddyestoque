-- 1. Torna compra_id nullable em compras_nfs
ALTER TABLE public.compras_nfs ALTER COLUMN compra_id DROP NOT NULL;

-- 2. Cria a tabela de vínculos N:N
CREATE TABLE IF NOT EXISTS public.compras_nfs_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id UUID NOT NULL REFERENCES public.compras_nfs(id) ON DELETE CASCADE,
  compra_id UUID NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(nf_id, compra_id)
);

-- 3. Migrar vínculos existentes para a nova tabela
INSERT INTO public.compras_nfs_vinculos (nf_id, compra_id)
SELECT id, compra_id FROM public.compras_nfs WHERE compra_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. RLS
ALTER TABLE public.compras_nfs_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aprovados podem tudo em compras_nfs_vinculos"
  ON public.compras_nfs_vinculos FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON public.compras_nfs_vinculos TO authenticated;
