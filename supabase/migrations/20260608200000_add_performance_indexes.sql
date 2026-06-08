-- Índices para otimização de performance no Supabase Postgres
-- Criado para evitar CPU em 100% durante buscas filtradas por Obra e Chaves Estrangeiras

-- Índices para buscas por Obra (filtros comuns)
CREATE INDEX IF NOT EXISTS idx_produtos_obra_id ON public.produtos(obra_id);
CREATE INDEX IF NOT EXISTS idx_entradas_obra_id ON public.entradas(obra_id);
CREATE INDEX IF NOT EXISTS idx_saidas_obra_id ON public.saidas(obra_id);
CREATE INDEX IF NOT EXISTS idx_compras_obra_id ON public.compras(obra_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_obra_id ON public.ferramentas(obra_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_material_obra_id ON public.solicitacoes_material(obra_id);

-- Índices para chaves estrangeiras de relacionamento (evita lentidão em joins)
CREATE INDEX IF NOT EXISTS idx_entradas_produto_id ON public.entradas(produto_id);
CREATE INDEX IF NOT EXISTS idx_saidas_produto_id ON public.saidas(produto_id);
CREATE INDEX IF NOT EXISTS idx_saidas_pessoa_id ON public.saidas(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_compras_nfs_vinculos_compra_id ON public.compras_nfs_vinculos(compra_id);
CREATE INDEX IF NOT EXISTS idx_compras_nfs_vinculos_nf_id ON public.compras_nfs_vinculos(nf_id);
