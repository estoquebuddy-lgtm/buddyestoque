-- 1. Adicionar colunas necessárias na tabela de entradas
ALTER TABLE public.entradas
  ADD COLUMN IF NOT EXISTS status_entrega TEXT NOT NULL DEFAULT 'REALIZADO', -- 'PENDENTE' ou 'REALIZADO'
  ADD COLUMN IF NOT EXISTS comprado_por_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comprado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ;

-- 2. Atualizar a função do trigger de inserção de entradas
CREATE OR REPLACE FUNCTION public.handle_entrada_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só incrementa o estoque atual do produto se o material já tiver chegado (status 'REALIZADO')
  IF NEW.status_entrega = 'REALIZADO' THEN
    UPDATE public.produtos
    SET estoque_atual = estoque_atual + NEW.quantidade
    WHERE id = NEW.produto_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Atualizar a função do trigger de atualização de entradas
CREATE OR REPLACE FUNCTION public.handle_entrada_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fluxo 1: De PENDENTE para REALIZADO (Item chegou na obra)
  IF OLD.status_entrega = 'PENDENTE' AND NEW.status_entrega = 'REALIZADO' THEN
    UPDATE public.produtos
    SET estoque_atual = estoque_atual + NEW.quantidade
    WHERE id = NEW.produto_id;

  -- Fluxo 2: De REALIZADO para PENDENTE (Retorno)
  ELSIF OLD.status_entrega = 'REALIZADO' AND NEW.status_entrega = 'PENDENTE' THEN
    UPDATE public.produtos
    SET estoque_atual = estoque_atual - OLD.quantidade
    WHERE id = NEW.produto_id;

  -- Fluxo 3: Permaneceu como REALIZADO (Ajuste de quantidade)
  ELSIF OLD.status_entrega = 'REALIZADO' AND NEW.status_entrega = 'REALIZADO' THEN
    UPDATE public.produtos
    SET estoque_atual = estoque_atual - OLD.quantidade + NEW.quantidade
    WHERE id = NEW.produto_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Atualizar a função do trigger de exclusão de entradas
CREATE OR REPLACE FUNCTION public.handle_entrada_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só remove do estoque se a entrada já estivesse com status REALIZADO
  IF OLD.status_entrega = 'REALIZADO' THEN
    UPDATE public.produtos
    SET estoque_atual = estoque_atual - OLD.quantidade
    WHERE id = OLD.produto_id;
  END IF;
  RETURN OLD;
END;
$$;
