
-- Obras table
CREATE TABLE public.obras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  endereco TEXT,
  responsavel TEXT,
  status TEXT NOT NULL DEFAULT 'ativa',
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for obras
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own obras" ON public.obras FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own obras" ON public.obras FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own obras" ON public.obras FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own obras" ON public.obras FOR DELETE USING (auth.uid() = user_id);

-- Produtos table
CREATE TABLE public.produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID REFERENCES public.obras(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT,
  unidade TEXT NOT NULL DEFAULT 'un',
  estoque_atual NUMERIC NOT NULL DEFAULT 0,
  estoque_minimo NUMERIC NOT NULL DEFAULT 0,
  custo_unitario NUMERIC DEFAULT 0,
  fornecedor TEXT,
  localizacao TEXT,
  foto_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage produtos of own obras" ON public.produtos FOR ALL
  USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

-- Ferramentas table
CREATE TABLE public.ferramentas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID REFERENCES public.obras(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  codigo TEXT,
  estado TEXT NOT NULL DEFAULT 'disponivel',
  responsavel_id UUID,
  data_retirada TIMESTAMPTZ,
  data_devolucao TIMESTAMPTZ,
  foto_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ferramentas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage ferramentas of own obras" ON public.ferramentas FOR ALL
  USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

-- Pessoas table
CREATE TABLE public.pessoas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID REFERENCES public.obras(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  funcao TEXT,
  telefone TEXT,
  foto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage pessoas of own obras" ON public.pessoas FOR ALL
  USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

-- Entradas table
CREATE TABLE public.entradas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
  obra_id UUID REFERENCES public.obras(id) ON DELETE CASCADE NOT NULL,
  quantidade NUMERIC NOT NULL,
  valor_unitario NUMERIC DEFAULT 0,
  fornecedor TEXT,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  nota_fiscal_url TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.entradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage entradas of own obras" ON public.entradas FOR ALL
  USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

-- Saidas table
CREATE TABLE public.saidas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
  obra_id UUID REFERENCES public.obras(id) ON DELETE CASCADE NOT NULL,
  quantidade NUMERIC NOT NULL,
  pessoa_id UUID REFERENCES public.pessoas(id),
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage saidas of own obras" ON public.saidas FOR ALL
  USING (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras WHERE user_id = auth.uid()));

-- TRIGGER: After insert on entradas -> add to estoque
CREATE OR REPLACE FUNCTION public.handle_entrada_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.produtos
  SET estoque_atual = estoque_atual + NEW.quantidade
  WHERE id = NEW.produto_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_entrada_insert
  AFTER INSERT ON public.entradas
  FOR EACH ROW EXECUTE FUNCTION public.handle_entrada_insert();

-- TRIGGER: Before insert on saidas -> validate estoque
CREATE OR REPLACE FUNCTION public.handle_saida_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_stock NUMERIC;
BEGIN
  SELECT estoque_atual INTO current_stock FROM public.produtos WHERE id = NEW.produto_id;
  IF current_stock < NEW.quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente. Disponível: %, Solicitado: %', current_stock, NEW.quantidade;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_saida_before_insert
  BEFORE INSERT ON public.saidas
  FOR EACH ROW EXECUTE FUNCTION public.handle_saida_before_insert();

-- TRIGGER: After insert on saidas -> subtract from estoque
CREATE OR REPLACE FUNCTION public.handle_saida_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.produtos
  SET estoque_atual = estoque_atual - NEW.quantidade
  WHERE id = NEW.produto_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_saida_after_insert
  AFTER INSERT ON public.saidas
  FOR EACH ROW EXECUTE FUNCTION public.handle_saida_after_insert();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('produtos', 'produtos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('ferramentas', 'ferramentas', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('pessoas', 'pessoas', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('notas_fiscais', 'notas_fiscais', true);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('produtos', 'ferramentas', 'pessoas', 'notas_fiscais'));
CREATE POLICY "Anyone can view public files" ON storage.objects FOR SELECT USING (bucket_id IN ('produtos', 'ferramentas', 'pessoas', 'notas_fiscais'));
CREATE POLICY "Authenticated users can update files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('produtos', 'ferramentas', 'pessoas', 'notas_fiscais'));
CREATE POLICY "Authenticated users can delete files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('produtos', 'ferramentas', 'pessoas', 'notas_fiscais'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.produtos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ferramentas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.entradas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.saidas;
