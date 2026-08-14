-- 1. ADICIONAR COLUNAS EM movimentacoes_ferramentas
ALTER TABLE movimentacoes_ferramentas 
ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES pessoas(id),
ADD COLUMN IF NOT EXISTS executado_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS status_anterior TEXT,
ADD COLUMN IF NOT EXISTS status_novo TEXT;

-- 2. MIGRAR DADOS DE historico_ferramentas PARA movimentacoes_ferramentas
-- Evita duplicidade validando a data e o tipo
INSERT INTO movimentacoes_ferramentas (
  id, ferramenta_id, obra_id, pessoa_id, tipo, data_hora, observacao
)
SELECT 
  gen_random_uuid(),
  h.ferramenta_id, 
  h.obra_id, 
  h.pessoa_id, 
  h.tipo, 
  h.data::timestamp with time zone, 
  'Migrado do histórico legado'
FROM historico_ferramentas h
WHERE NOT EXISTS (
  SELECT 1 FROM movimentacoes_ferramentas m 
  WHERE m.ferramenta_id = h.ferramenta_id 
  AND m.tipo = h.tipo 
  AND m.data_hora = h.data::timestamp with time zone
);

-- 3. ADICIONAR PRODUTO_ID EM ferramentas
ALTER TABLE ferramentas 
ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES produtos(id);

-- Tentar mapear produtos existentes com base no nome
UPDATE ferramentas f
SET produto_id = p.id
FROM produtos p
WHERE p.obra_id = f.obra_id
AND (
  p.nome ILIKE f.nome 
  OR p.nome ILIKE '[FERRAMENTA] ' || f.nome
  OR f.nome ILIKE '[FERRAMENTA] ' || p.nome
)
AND f.produto_id IS NULL;

-- 4. PADRONIZAR STATUS EM ferramentas
UPDATE ferramentas
SET status = CASE 
  WHEN estado = 'disponivel' THEN 'DISPONIVEL'
  WHEN estado = 'em_uso' THEN 'EM_USO'
  WHEN estado = 'manutencao' THEN 'MANUTENCAO'
  WHEN estado = 'extraviada' THEN 'EXTRAVIADA'
  WHEN estado = 'baixada' THEN 'BAIXADA'
  ELSE 'DISPONIVEL'
END
WHERE status NOT IN ('DISPONIVEL', 'EM_USO', 'MANUTENCAO', 'EXTRAVIADA', 'BAIXADA')
OR status IS NULL;

-- Atualizar status com base no estado se divergirem
UPDATE ferramentas
SET status = 'DISPONIVEL' WHERE estado = 'disponivel' AND status != 'DISPONIVEL';
UPDATE ferramentas
SET status = 'EM_USO' WHERE estado = 'em_uso' AND status != 'EM_USO';
UPDATE ferramentas
SET status = 'MANUTENCAO' WHERE estado = 'manutencao' AND status != 'MANUTENCAO';

-- Adicionar restrição CHECK
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ferramentas_status') THEN
    ALTER TABLE ferramentas ADD CONSTRAINT chk_ferramentas_status CHECK (status IN ('DISPONIVEL', 'EM_USO', 'MANUTENCAO', 'EXTRAVIADA', 'BAIXADA'));
  END IF;
END $$;

-- 5. ADICIONAR UNIQUE CONSTRAINT PARA O CÓDIGO PATRIMONIAL
-- Substituir strings vazias por NULL para não conflitar
UPDATE ferramentas SET codigo = NULL WHERE trim(codigo) = '';

-- Identificar e desduplicar códigos existentes (marca a inconsistência com -DUP-id para revisão humana, mantendo o mais antigo intocado)
UPDATE ferramentas
SET codigo = codigo || '-DUP-' || substr(id::text, 1, 4)
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER(PARTITION BY obra_id, codigo ORDER BY created_at ASC) as rn
    FROM ferramentas
    WHERE codigo IS NOT NULL
  ) t
  WHERE t.rn > 1
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ferramentas_obra_id_codigo_key') THEN
    ALTER TABLE ferramentas ADD CONSTRAINT ferramentas_obra_id_codigo_key UNIQUE (obra_id, codigo);
  END IF;
END $$;

-- 6. CRIAR RPC PARA RETIRADA TRANSACIONAL
CREATE OR REPLACE FUNCTION rpc_retirar_ferramenta(
  p_ferramenta_id UUID,
  p_obra_id UUID,
  p_pessoa_id UUID,
  p_usuario_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
BEGIN
  -- Bloqueia a linha para evitar concorrência (SELECT FOR UPDATE)
  SELECT * INTO v_ferramenta FROM ferramentas WHERE id = p_ferramenta_id AND obra_id = p_obra_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não encontrada';
  END IF;

  IF v_ferramenta.status != 'DISPONIVEL' THEN
    RAISE EXCEPTION 'A ferramenta não está disponível para retirada (Status: %)', v_ferramenta.status;
  END IF;

  -- Atualiza a ferramenta
  UPDATE ferramentas
  SET 
    status = 'EM_USO',
    responsavel_id = p_pessoa_id,
    data_retirada = now()::text,
    ultima_movimentacao = now()::text
  WHERE id = p_ferramenta_id;

  -- Insere a movimentação
  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, pessoa_id, executado_por, tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, p_obra_id, p_pessoa_id, p_usuario_id, 'RETIRADA', now()::text, 'DISPONIVEL', 'EM_USO', p_observacao
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. CRIAR RPC PARA DEVOLUÇÃO TRANSACIONAL
CREATE OR REPLACE FUNCTION rpc_devolver_ferramenta(
  p_ferramenta_id UUID,
  p_obra_id UUID,
  p_usuario_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
  v_pessoa_id UUID;
BEGIN
  SELECT * INTO v_ferramenta FROM ferramentas WHERE id = p_ferramenta_id AND obra_id = p_obra_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não encontrada';
  END IF;

  IF v_ferramenta.status != 'EM_USO' THEN
    RAISE EXCEPTION 'A ferramenta não está em uso (Status: %)', v_ferramenta.status;
  END IF;

  v_pessoa_id := v_ferramenta.responsavel_id;

  -- Atualiza a ferramenta
  UPDATE ferramentas
  SET 
    status = 'DISPONIVEL',
    responsavel_id = NULL,
    data_devolucao = now()::text,
    ultima_movimentacao = now()::text
  WHERE id = p_ferramenta_id;

  -- Insere a movimentação
  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, pessoa_id, executado_por, tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, p_obra_id, v_pessoa_id, p_usuario_id, 'DEVOLUCAO', now()::text, 'EM_USO', 'DISPONIVEL', p_observacao
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. CRIAR RPC PARA ALTERAR STATUS (Manutenção, Extravio, Baixa)
CREATE OR REPLACE FUNCTION rpc_alterar_status_ferramenta(
  p_ferramenta_id UUID,
  p_obra_id UUID,
  p_novo_status TEXT,
  p_tipo_movimentacao TEXT,
  p_usuario_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
  v_pessoa_id UUID;
BEGIN
  IF p_novo_status NOT IN ('DISPONIVEL', 'EM_USO', 'MANUTENCAO', 'EXTRAVIADA', 'BAIXADA') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  SELECT * INTO v_ferramenta FROM ferramentas WHERE id = p_ferramenta_id AND obra_id = p_obra_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não encontrada';
  END IF;

  v_pessoa_id := v_ferramenta.responsavel_id;

  -- Regras de negócio básicas
  IF p_novo_status IN ('MANUTENCAO', 'EXTRAVIADA', 'BAIXADA', 'DISPONIVEL') THEN
    -- Remove o responsável atual, pois não está mais em posse
    v_pessoa_id := NULL;
  END IF;

  -- Atualiza a ferramenta
  UPDATE ferramentas
  SET 
    status = p_novo_status,
    responsavel_id = v_pessoa_id,
    ultima_movimentacao = now()::text
  WHERE id = p_ferramenta_id;

  -- Insere a movimentação
  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, pessoa_id, executado_por, tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, p_obra_id, v_ferramenta.responsavel_id, p_usuario_id, p_tipo_movimentacao, now()::text, v_ferramenta.status, p_novo_status, p_observacao
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. CRIAR RPC PARA GERAR LOTE DE ETIQUETAS (COM AUTO-INCREMENTO)
CREATE OR REPLACE FUNCTION rpc_gerar_lote_ferramentas(
  p_obra_id UUID,
  p_produto_id UUID,
  p_nome TEXT,
  p_prefixo TEXT,
  p_quantidade INT,
  p_categoria TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_seq INT := 0;
  v_codigo TEXT;
  v_codigo_part TEXT;
  v_num INT;
  i INT;
  v_timestamp BIGINT;
  v_inserted_count INT := 0;
BEGIN
  -- Encontra a maior sequência existente para o prefixo
  FOR v_codigo IN 
    SELECT codigo FROM ferramentas 
    WHERE obra_id = p_obra_id 
    AND codigo ILIKE p_prefixo || '-%'
  LOOP
    v_codigo_part := split_part(v_codigo, '-', 2);
    BEGIN
      v_num := v_codigo_part::int;
      IF v_num > v_max_seq THEN
        v_max_seq := v_num;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      -- ignora se não for número
    END;
  END LOOP;

  v_timestamp := (EXTRACT(EPOCH FROM now()) * 1000)::bigint;

  -- Gera os N registros
  FOR i IN 1..p_quantidade LOOP
    INSERT INTO ferramentas (
      obra_id,
      produto_id,
      nome,
      codigo,
      status,
      qr_code,
      observacoes
    ) VALUES (
      p_obra_id,
      p_produto_id,
      p_nome,
      p_prefixo || '-' || LPAD((v_max_seq + i)::text, 2, '0'),
      'DISPONIVEL',
      'F-' || p_prefixo || '-' || LPAD((v_max_seq + i)::text, 2, '0') || '-' || v_timestamp::text || '-' || i::text,
      '[CAT:' || p_categoria || ']'
    );
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  -- Atualiza o estoque no produto, se produto_id for fornecido
  IF p_produto_id IS NOT NULL THEN
    UPDATE produtos 
    SET estoque_atual = estoque_atual + p_quantidade
    WHERE id = p_produto_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'count', v_inserted_count, 'start_seq', v_max_seq + 1);
END;
$$;
