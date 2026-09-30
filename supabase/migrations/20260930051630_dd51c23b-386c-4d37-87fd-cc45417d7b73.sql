CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  monthly_price_cents integer,
  currency text NOT NULL DEFAULT 'usd',
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read" ON public.subscription_plans FOR SELECT TO authenticated
  USING (active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "plans_admin" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER subscription_plans_touch BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.plan_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  limit_value integer,
  period text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, entitlement_key),
  CONSTRAINT plan_entitlements_key_chk CHECK (entitlement_key IN
    ('active_projects','team_seats','ai_queries','report_credits','plan_review_credits','correction_review_credits','document_storage_mb','subscriber_discount_percent')),
  CONSTRAINT plan_entitlements_period_chk CHECK (period IN ('none','monthly'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_entitlements TO authenticated;
GRANT ALL ON public.plan_entitlements TO service_role;
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_ent_read" ON public.plan_entitlements FOR SELECT TO authenticated USING (true);
CREATE POLICY "plan_ent_admin" ON public.plan_entitlements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER plan_entitlements_touch BEFORE UPDATE ON public.plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.service_products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  related_transaction_id uuid REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  credit_type text NOT NULL,
  quantity integer NOT NULL,
  transaction_type text NOT NULL,
  reason text,
  idempotency_key text UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_tx_type_chk CHECK (transaction_type IN ('subscription_grant','purchase','usage','refund','adjustment','expiration')),
  CONSTRAINT credit_tx_credit_chk CHECK (credit_type IN ('report_credits','plan_review_credits','correction_review_credits','ai_queries')),
  CONSTRAINT credit_tx_nonzero CHECK (quantity <> 0)
);
CREATE INDEX credit_tx_user_type_idx ON public.credit_transactions(user_id, credit_type, created_at DESC);
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_tx_read_own" ON public.credit_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.payment_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  environment text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payment_webhook_events TO service_role;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_products
  ADD COLUMN IF NOT EXISTS subscriber_price_cents integer,
  ADD COLUMN IF NOT EXISTS subscriber_discount_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_type text,
  ADD COLUMN IF NOT EXISTS credits_consumed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_assisted_available boolean NOT NULL DEFAULT true;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS credit_transaction_id uuid REFERENCES public.credit_transactions(id) ON DELETE SET NULL;

-- Ledger balance (source of truth). Callers may only read their own balance.
CREATE OR REPLACE FUNCTION public.credit_balance(_user_id uuid, _credit_type text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.role() = 'service_role' OR _user_id = auth.uid() OR public.has_role(auth.uid(),'admin')
    THEN COALESCE((SELECT SUM(quantity)::int FROM public.credit_transactions WHERE user_id = _user_id AND credit_type = _credit_type), 0)
    ELSE 0 END
$$;

-- Atomic consume: locks the user's ledger, checks balance, writes a usage row.
CREATE OR REPLACE FUNCTION public.consume_credit(
  _user_id uuid, _credit_type text, _quantity integer, _idempotency_key text,
  _product_id uuid DEFAULT NULL, _project_id uuid DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _existing uuid; _bal integer; _id uuid;
BEGIN
  IF _quantity <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;
  SELECT id INTO _existing FROM public.credit_transactions WHERE idempotency_key = _idempotency_key;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_user_id::text || ':' || _credit_type));
  SELECT COALESCE(SUM(quantity),0) INTO _bal FROM public.credit_transactions WHERE user_id = _user_id AND credit_type = _credit_type;
  IF _bal < _quantity THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  INSERT INTO public.credit_transactions(user_id, credit_type, quantity, transaction_type, reason, idempotency_key, product_id, project_id, created_by)
  VALUES (_user_id, _credit_type, -_quantity, 'usage', _reason, _idempotency_key, _product_id, _project_id, _user_id)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Restore a usage transaction after a permanent system failure (idempotent).
CREATE OR REPLACE FUNCTION public.refund_credit(_usage_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u public.credit_transactions; _id uuid;
BEGIN
  SELECT * INTO _u FROM public.credit_transactions WHERE id = _usage_id AND transaction_type = 'usage';
  IF NOT FOUND THEN RAISE EXCEPTION 'usage transaction not found'; END IF;
  INSERT INTO public.credit_transactions(user_id, organization_id, subscription_id, product_id, order_id, project_id, related_transaction_id, credit_type, quantity, transaction_type, reason, idempotency_key)
  VALUES (_u.user_id, _u.organization_id, _u.subscription_id, _u.product_id, _u.order_id, _u.project_id, _u.id, _u.credit_type, -_u.quantity, 'refund', _reason, 'refund:' || _u.id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.consume_credit(uuid,text,integer,text,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credit(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credit(uuid,text,integer,text,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.credit_balance(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid,text) TO authenticated, service_role;

INSERT INTO public.subscription_plans (plan_key, name, display_order) VALUES
  ('starter_monthly','Starter',1),('founding_monthly','Founding Member',2),
  ('professional_monthly','Professional',3),('business_monthly','Business',4)
ON CONFLICT (plan_key) DO NOTHING;
INSERT INTO public.plan_entitlements (plan_id, entitlement_key, limit_value, period)
SELECT id, 'active_projects', v, 'none' FROM public.subscription_plans p
JOIN (VALUES ('starter_monthly',3),('founding_monthly',10),('professional_monthly',25),('business_monthly',NULL::int)) AS x(k,v) ON x.k = p.plan_key
ON CONFLICT DO NOTHING;