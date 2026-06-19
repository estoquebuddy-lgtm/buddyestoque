-- Renomeia o produto virtual correspondente ao Martelete para corrigir a discrepância de estoque histórica
UPDATE public.produtos
SET nome = '[FERRAMENTA] MARTELETE DEMOLIDOR MEDIO Bosch'
WHERE nome = '[FERRAMENTA] MARTELETE DEMOLIDOR Bosch';
