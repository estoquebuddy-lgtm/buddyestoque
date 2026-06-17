-- 1. Corrige o trigger de atualização de entradas para lidar com mudança de produto_id
CREATE OR REPLACE FUNCTION public.handle_entrada_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se o produto_id mudou, precisamos ajustar o estoque de ambos os produtos
  IF OLD.produto_id <> NEW.produto_id THEN
    -- Remove a quantidade antiga do produto antigo (se estava entregue/REALIZADO)
    IF OLD.status_entrega = 'REALIZADO' THEN
      UPDATE public.produtos
      SET estoque_atual = estoque_atual - OLD.quantidade
      WHERE id = OLD.produto_id;
    END IF;

    -- Adiciona a nova quantidade ao novo produto (se está entregue/REALIZADO)
    IF NEW.status_entrega = 'REALIZADO' THEN
      UPDATE public.produtos
      SET estoque_atual = estoque_atual + NEW.quantidade
      WHERE id = NEW.produto_id;
    END IF;

  -- Se o produto_id NÃO mudou, segue o fluxo normal de ajuste
  ELSE
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
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Corrige o trigger de atualização de saídas para lidar com mudança de produto_id
CREATE OR REPLACE FUNCTION public.handle_saida_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se o produto_id mudou, precisamos devolver o estoque ao produto antigo e retirar do novo
  IF OLD.produto_id <> NEW.produto_id THEN
    -- Devolve a quantidade antiga ao produto antigo
    UPDATE public.produtos
    SET estoque_atual = estoque_atual + OLD.quantidade
    WHERE id = OLD.produto_id;

    -- Retira a nova quantidade do novo produto
    UPDATE public.produtos
    SET estoque_atual = estoque_atual - NEW.quantidade
    WHERE id = NEW.produto_id;

  -- Se o produto_id NÃO mudou, ajusta a diferença no mesmo produto
  ELSE
    UPDATE public.produtos
    SET estoque_atual = estoque_atual + OLD.quantidade - NEW.quantidade
    WHERE id = NEW.produto_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Recalcula o estoque atual de todos os produtos para sincronizar dados legados
UPDATE public.produtos p
SET estoque_atual = COALESCE(
  (
    SELECT SUM(quantidade) 
    FROM public.entradas 
    WHERE produto_id = p.id AND status_entrega = 'REALIZADO'
  ), 0
) - COALESCE(
  (
    SELECT SUM(quantidade) 
    FROM public.saidas 
    WHERE produto_id = p.id
  ), 0
);
