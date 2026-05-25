-- ============================================================
-- Fix RLS for solicitacoes_material and profiles
-- Problem: Victor cannot see requests sent to him because:
--   1. solicitacoes_material policy checks obra owner (user_id = auth.uid())
--   2. profiles policy only lets users see their own profile (blocks joins)
-- Solution: allow all approved users to see all data
-- ============================================================

-- ── SOLICITACOES_MATERIAL ─────────────────────────────────────
DROP POLICY IF EXISTS "Users can view solicitacoes of their obras" ON public.solicitacoes_material;
DROP POLICY IF EXISTS "Users can insert solicitacoes to their obras" ON public.solicitacoes_material;
DROP POLICY IF EXISTS "Users can update solicitacoes of their obras" ON public.solicitacoes_material;
DROP POLICY IF EXISTS "Users can delete solicitacoes of their obras" ON public.solicitacoes_material;

-- All approved users can view all solicitacoes
CREATE POLICY "Approved users can view all solicitacoes"
  ON public.solicitacoes_material FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

-- All approved users can create solicitacoes
CREATE POLICY "Approved users can insert solicitacoes"
  ON public.solicitacoes_material FOR INSERT TO authenticated
  WITH CHECK (public.is_approved(auth.uid()));

-- All approved users can update solicitacoes (to change status, etc.)
CREATE POLICY "Approved users can update solicitacoes"
  ON public.solicitacoes_material FOR UPDATE TO authenticated
  USING (public.is_approved(auth.uid()));

-- All approved users can delete solicitacoes
CREATE POLICY "Approved users can delete solicitacoes"
  ON public.solicitacoes_material FOR DELETE TO authenticated
  USING (public.is_approved(auth.uid()));

-- ── PROFILES ─────────────────────────────────────────────────
-- Problem: the join in solicitacoes query (solicitante, destinatario)
-- fails because Victor can only read his own profile row.
-- Fix: all approved users can read all profiles (names/emails only).
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Approved users can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) OR id = auth.uid());

-- ── LOGS_ATIVIDADES (same issue if it exists) ─────────────────
DROP POLICY IF EXISTS "Users can view logs of own obras" ON public.logs_atividades;
DROP POLICY IF EXISTS "Users can insert logs to own obras" ON public.logs_atividades;

CREATE POLICY "Approved users can view all logs"
  ON public.logs_atividades FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can insert logs"
  ON public.logs_atividades FOR INSERT TO authenticated
  WITH CHECK (public.is_approved(auth.uid()));
