
-- Triggers for handling entrada DELETE (reverse stock)
CREATE OR REPLACE FUNCTION public.handle_entrada_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.produtos
  SET estoque_atual = estoque_atual - OLD.quantidade
  WHERE id = OLD.produto_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_entrada_delete ON public.entradas;
CREATE TRIGGER on_entrada_delete
  AFTER DELETE ON public.entradas
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_entrada_delete();

-- Triggers for handling entrada UPDATE (adjust stock difference)
CREATE OR REPLACE FUNCTION public.handle_entrada_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.produtos
  SET estoque_atual = estoque_atual - OLD.quantidade + NEW.quantidade
  WHERE id = NEW.produto_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_entrada_update ON public.entradas;
CREATE TRIGGER on_entrada_update
  AFTER UPDATE ON public.entradas
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_entrada_update();

-- Triggers for handling saida DELETE (reverse stock - add back)
CREATE OR REPLACE FUNCTION public.handle_saida_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.produtos
  SET estoque_atual = estoque_atual + OLD.quantidade
  WHERE id = OLD.produto_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_saida_delete ON public.saidas;
CREATE TRIGGER on_saida_delete
  AFTER DELETE ON public.saidas
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_saida_delete();

-- Triggers for handling saida UPDATE (adjust stock difference)
CREATE OR REPLACE FUNCTION public.handle_saida_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_stock NUMERIC;
  diff NUMERIC;
BEGIN
  diff := NEW.quantidade - OLD.quantidade;
  IF diff > 0 THEN
    SELECT estoque_atual INTO current_stock FROM public.produtos WHERE id = NEW.produto_id;
    IF current_stock < diff THEN
      RAISE EXCEPTION 'Estoque insuficiente. Disponível: %, Adicional solicitado: %', current_stock, diff;
    END IF;
  END IF;
  UPDATE public.produtos
  SET estoque_atual = estoque_atual + OLD.quantidade - NEW.quantidade
  WHERE id = NEW.produto_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_saida_update ON public.saidas;
CREATE TRIGGER on_saida_update
  AFTER UPDATE ON public.saidas
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_saida_update();
