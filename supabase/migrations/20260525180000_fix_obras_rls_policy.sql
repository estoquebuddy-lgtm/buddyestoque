-- ============================================================
-- Fix: Allow all APPROVED users to view all obras and access
-- all data within them (produtos, ferramentas, pessoas, etc.)
-- Before: only the obra owner could see/edit everything
-- After:  approved users can see everything; only owner/admin
--         can insert/update/delete the obras themselves
-- ============================================================

-- ── OBRAS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own obras" ON public.obras;
DROP POLICY IF EXISTS "Users can insert own obras" ON public.obras;
DROP POLICY IF EXISTS "Users can update own obras" ON public.obras;
DROP POLICY IF EXISTS "Users can delete own obras" ON public.obras;

CREATE POLICY "Approved users can view all obras"
  ON public.obras FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Users can insert own obras"
  ON public.obras FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_approved(auth.uid()));

CREATE POLICY "Users can update own obras"
  ON public.obras FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete own obras"
  ON public.obras FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ── PRODUTOS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage produtos of own obras" ON public.produtos;

CREATE POLICY "Approved users can manage produtos of all obras"
  ON public.produtos FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()))
  WITH CHECK (public.is_approved(auth.uid()));

-- ── FERRAMENTAS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage ferramentas of own obras" ON public.ferramentas;

CREATE POLICY "Approved users can manage ferramentas of all obras"
  ON public.ferramentas FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()))
  WITH CHECK (public.is_approved(auth.uid()));

-- ── PESSOAS ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage pessoas of own obras" ON public.pessoas;

CREATE POLICY "Approved users can manage pessoas of all obras"
  ON public.pessoas FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()))
  WITH CHECK (public.is_approved(auth.uid()));

-- ── ENTRADAS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage entradas of own obras" ON public.entradas;

CREATE POLICY "Approved users can manage entradas of all obras"
  ON public.entradas FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()))
  WITH CHECK (public.is_approved(auth.uid()));

-- ── SAIDAS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage saidas of own obras" ON public.saidas;

CREATE POLICY "Approved users can manage saidas of all obras"
  ON public.saidas FOR ALL TO authenticated
  USING (public.is_approved(auth.uid()))
  WITH CHECK (public.is_approved(auth.uid()));
