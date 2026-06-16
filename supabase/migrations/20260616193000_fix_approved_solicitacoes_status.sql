-- Migration: Corrigir status de solicitações aprovadas que ficaram como SOLICITADO
-- Garante que todas as solicitações já aprovadas no banco tenham o status correspondente APROVADO (Em Cotação)

UPDATE public.solicitacoes_material
SET status = 'APROVADO'
WHERE status = 'SOLICITADO' AND aprovador_id IS NOT NULL;
