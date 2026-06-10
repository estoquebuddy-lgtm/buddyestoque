-- Create public.fornecedores table
CREATE TABLE IF NOT EXISTS public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT,
  dados TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT unique_obra_fornecedor UNIQUE (obra_id, nome)
);

-- Enable RLS
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Allow all for authenticated users" 
  ON public.fornecedores 
  FOR ALL 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

-- Migrate existing unique suppliers from public.compras
INSERT INTO public.fornecedores (obra_id, nome, cnpj, dados)
SELECT DISTINCT ON (obra_id, TRIM(fornecedor_nome)) 
  obra_id, 
  TRIM(fornecedor_nome) AS nome, 
  MAX(fornecedor_cnpj) AS cnpj, 
  MAX(fornecedor_dados) AS dados
FROM public.compras
WHERE fornecedor_nome IS NOT NULL AND TRIM(fornecedor_nome) <> ''
ON CONFLICT (obra_id, nome) DO NOTHING;

-- Migrate existing unique suppliers from public.entradas
INSERT INTO public.fornecedores (obra_id, nome)
SELECT DISTINCT ON (obra_id, TRIM(fornecedor)) 
  obra_id, 
  TRIM(fornecedor) AS nome
FROM public.entradas
WHERE fornecedor IS NOT NULL AND TRIM(fornecedor) <> ''
ON CONFLICT (obra_id, nome) DO NOTHING;
