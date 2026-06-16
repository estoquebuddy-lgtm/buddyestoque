-- Migration: Tornar fornecedor obrigatório na tabela public.entradas e public.compras
-- Garante que nenhum item entre no estoque sem fornecedor e nenhuma compra sem fornecedor

-- 1. Migrar dados nulos em entradas
UPDATE public.entradas
SET fornecedor = 'Sem Fornecedor'
WHERE fornecedor IS NULL OR fornecedor = '';

-- 2. Migrar dados nulos em compras
UPDATE public.compras
SET fornecedor_nome = 'Sem Fornecedor'
WHERE fornecedor_nome IS NULL OR fornecedor_nome = '';

-- 3. Aplicar restrições NOT NULL
ALTER TABLE public.entradas
  ALTER COLUMN fornecedor SET NOT NULL;

ALTER TABLE public.compras
  ALTER COLUMN fornecedor_nome SET NOT NULL;
