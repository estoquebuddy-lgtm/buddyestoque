-- Habilita a extensão pg_cron na base de dados (se ainda não estiver ativa)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agenda a tarefa automática para rodar toda sexta-feira às 16:00 (19:00 UTC, considerando fuso -03:00)
SELECT cron.schedule(
  'arquivar-solicitacoes-entregues-sexta',
  '0 19 * * 5',
  $$
  UPDATE public.solicitacoes_material
  SET arquivado = true
  WHERE status = 'ENTREGUE' AND arquivado = false;
  $$
);
