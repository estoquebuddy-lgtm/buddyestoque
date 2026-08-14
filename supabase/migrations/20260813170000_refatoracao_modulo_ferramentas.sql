-- ==============================================================================
-- MIGRAÇÃO PARA O MÓDULO DE FERRAMENTAS LEVE & OPERACIONAL (BUDDY ESTOQUE)
-- ==============================================================================

-- 1. ESTRUTURA DE MOVIMENTAÇÕES UNIFICADA
CREATE TABLE IF NOT EXISTS movimentacoes_ferramentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta_id UUID NOT NULL REFERENCES ferramentas(id) ON DELETE CASCADE,
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  funcionario_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  data_hora TIMESTAMPTZ DEFAULT now(),
  status_anterior TEXT,
  status_novo TEXT,
  observacao TEXT
);

-- Garantir colunas necessárias se a tabela já existia
ALTER TABLE movimentacoes_ferramentas 
ADD COLUMN IF NOT EXISTS funcionario_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status_anterior TEXT,
ADD COLUMN IF NOT EXISTS status_novo TEXT,
ADD COLUMN IF NOT EXISTS observacao TEXT;

-- 2. GARANTIR PRODUTO_ID EM FERRAMENTAS
ALTER TABLE ferramentas 
ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL;

-- Index para otimização de performance
CREATE INDEX IF NOT EXISTS idx_ferramentas_obra_id ON ferramentas(obra_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_produto_id ON ferramentas(produto_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_responsavel_id ON ferramentas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_status ON ferramentas(status);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_ferramentas_ferramenta_id ON movimentacoes_ferramentas(ferramenta_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_ferramentas_obra_id ON movimentacoes_ferramentas(obra_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_ferramentas_funcionario_id ON movimentacoes_ferramentas(funcionario_id);

-- 3. RPCS TRANSACIONAIS ATÔMICAS

-- 3.1 RETIRAR FERRAMENTA
CREATE OR REPLACE FUNCTION rpc_retirar_ferramenta(
  p_ferramenta_id UUID,
  p_funcionario_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
  v_usuario_id UUID;
  v_status_anterior TEXT;
BEGIN
  v_usuario_id := auth.uid();
  
  -- Seleciona e trava a linha da ferramenta para concorrência
  SELECT * INTO v_ferramenta 
  FROM ferramentas 
  WHERE id = p_ferramenta_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não localizada no banco de dados.';
  END IF;

  v_status_anterior := v_ferramenta.status;

  -- Validações de regra de negócio
  IF v_ferramenta.status = 'EM_USO' THEN
    RAISE EXCEPTION 'Esta ferramenta já está em uso por outro funcionário.';
  ELSIF v_ferramenta.status = 'MANUTENCAO' THEN
    RAISE EXCEPTION 'Ferramenta em manutenção não pode ser retirada.';
  ELSIF v_ferramenta.status = 'EXTRAVIADA' THEN
    RAISE EXCEPTION 'Ferramenta extraviada não pode ser retirada.';
  ELSIF v_ferramenta.status = 'BAIXADA' THEN
    RAISE EXCEPTION 'Ferramenta baixada definitivamente não pode ser retirada.';
  END IF;

  -- Atualiza o registro da ferramenta
  UPDATE ferramentas
  SET 
    status = 'EM_USO',
    estado = 'em_uso',
    responsavel_id = p_funcionario_id,
    data_retirada = now()::text,
    data_devolucao = NULL,
    ultima_movimentacao = now()::text,
    observacoes = COALESCE(p_observacao, observacoes)
  WHERE id = p_ferramenta_id;

  -- Registra na tabela única de movimentações
  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, funcionario_id, usuario_id, 
    tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, v_ferramenta.obra_id, p_funcionario_id, v_usuario_id,
    'RETIRADA', now(), v_status_anterior, 'EM_USO', p_observacao
  );

  RETURN jsonb_build_object('success', true, 'status', 'EM_USO');
END;
$$;

-- 3.2 DEVOLVER FERRAMENTA
CREATE OR REPLACE FUNCTION rpc_devolver_ferramenta(
  p_ferramenta_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
  v_usuario_id UUID;
  v_funcionario_antigo UUID;
  v_status_anterior TEXT;
BEGIN
  v_usuario_id := auth.uid();
  
  SELECT * INTO v_ferramenta 
  FROM ferramentas 
  WHERE id = p_ferramenta_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não localizada no banco de dados.';
  END IF;

  v_status_anterior := v_ferramenta.status;
  v_funcionario_antigo := v_ferramenta.responsavel_id;

  UPDATE ferramentas
  SET 
    status = 'DISPONIVEL',
    estado = 'disponivel',
    responsavel_id = NULL,
    data_devolucao = now()::text,
    ultima_movimentacao = now()::text,
    observacoes = COALESCE(p_observacao, observacoes)
  WHERE id = p_ferramenta_id;

  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, funcionario_id, usuario_id, 
    tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, v_ferramenta.obra_id, v_funcionario_antigo, v_usuario_id,
    'DEVOLUCAO', now(), v_status_anterior, 'DISPONIVEL', p_observacao
  );

  RETURN jsonb_build_object('success', true, 'status', 'DISPONIVEL');
END;
$$;

-- 3.3 ENVIAR MANUTENÇÃO
CREATE OR REPLACE FUNCTION rpc_enviar_manutencao(
  p_ferramenta_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
  v_usuario_id UUID;
  v_funcionario_antigo UUID;
  v_status_anterior TEXT;
BEGIN
  v_usuario_id := auth.uid();
  
  SELECT * INTO v_ferramenta 
  FROM ferramentas 
  WHERE id = p_ferramenta_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não localizada.';
  END IF;

  v_status_anterior := v_ferramenta.status;
  v_funcionario_antigo := v_ferramenta.responsavel_id;

  UPDATE ferramentas
  SET 
    status = 'MANUTENCAO',
    estado = 'manutencao',
    responsavel_id = NULL,
    ultima_movimentacao = now()::text,
    observacoes = COALESCE(p_observacao, observacoes)
  WHERE id = p_ferramenta_id;

  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, funcionario_id, usuario_id, 
    tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, v_ferramenta.obra_id, v_funcionario_antigo, v_usuario_id,
    'MANUTENCAO', now(), v_status_anterior, 'MANUTENCAO', p_observacao
  );

  RETURN jsonb_build_object('success', true, 'status', 'MANUTENCAO');
END;
$$;

-- 3.4 RETORNAR MANUTENÇÃO
CREATE OR REPLACE FUNCTION rpc_retornar_manutencao(
  p_ferramenta_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
  v_usuario_id UUID;
  v_status_anterior TEXT;
BEGIN
  v_usuario_id := auth.uid();
  
  SELECT * INTO v_ferramenta 
  FROM ferramentas 
  WHERE id = p_ferramenta_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não localizada.';
  END IF;

  v_status_anterior := v_ferramenta.status;

  UPDATE ferramentas
  SET 
    status = 'DISPONIVEL',
    estado = 'disponivel',
    responsavel_id = NULL,
    ultima_movimentacao = now()::text,
    observacoes = COALESCE(p_observacao, observacoes)
  WHERE id = p_ferramenta_id;

  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, funcionario_id, usuario_id, 
    tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, v_ferramenta.obra_id, NULL, v_usuario_id,
    'RETORNO_MANUTENCAO', now(), v_status_anterior, 'DISPONIVEL', p_observacao
  );

  RETURN jsonb_build_object('success', true, 'status', 'DISPONIVEL');
END;
$$;

-- 3.5 REGISTRAR EXTRAVIO
CREATE OR REPLACE FUNCTION rpc_registrar_extravio(
  p_ferramenta_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
  v_usuario_id UUID;
  v_funcionario_antigo UUID;
  v_status_anterior TEXT;
BEGIN
  v_usuario_id := auth.uid();
  
  SELECT * INTO v_ferramenta 
  FROM ferramentas 
  WHERE id = p_ferramenta_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não localizada.';
  END IF;

  v_status_anterior := v_ferramenta.status;
  v_funcionario_antigo := v_ferramenta.responsavel_id;

  UPDATE ferramentas
  SET 
    status = 'EXTRAVIADA',
    estado = 'extraviada',
    responsavel_id = NULL,
    ultima_movimentacao = now()::text,
    observacoes = COALESCE(p_observacao, observacoes)
  WHERE id = p_ferramenta_id;

  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, funcionario_id, usuario_id, 
    tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, v_ferramenta.obra_id, v_funcionario_antigo, v_usuario_id,
    'EXTRAVIO', now(), v_status_anterior, 'EXTRAVIADA', p_observacao
  );

  RETURN jsonb_build_object('success', true, 'status', 'EXTRAVIADA');
END;
$$;

-- 3.6 REGISTRAR BAIXA
CREATE OR REPLACE FUNCTION rpc_registrar_baixa(
  p_ferramenta_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ferramenta RECORD;
  v_usuario_id UUID;
  v_funcionario_antigo UUID;
  v_status_anterior TEXT;
BEGIN
  v_usuario_id := auth.uid();
  
  SELECT * INTO v_ferramenta 
  FROM ferramentas 
  WHERE id = p_ferramenta_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não localizada.';
  END IF;

  v_status_anterior := v_ferramenta.status;
  v_funcionario_antigo := v_ferramenta.responsavel_id;

  UPDATE ferramentas
  SET 
    status = 'BAIXADA',
    estado = 'baixada',
    responsavel_id = NULL,
    ultima_movimentacao = now()::text,
    observacoes = COALESCE(p_observacao, observacoes)
  WHERE id = p_ferramenta_id;

  INSERT INTO movimentacoes_ferramentas (
    ferramenta_id, obra_id, funcionario_id, usuario_id, 
    tipo, data_hora, status_anterior, status_novo, observacao
  ) VALUES (
    p_ferramenta_id, v_ferramenta.obra_id, v_funcionario_antigo, v_usuario_id,
    'BAIXA', now(), v_status_anterior, 'BAIXADA', p_observacao
  );

  RETURN jsonb_build_object('success', true, 'status', 'BAIXADA');
END;
$$;
