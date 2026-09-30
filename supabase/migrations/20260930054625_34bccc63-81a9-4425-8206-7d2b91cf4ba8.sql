CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  organization_id uuid,
  project_id uuid,
  operation text NOT NULL,
  provider text NOT NULL DEFAULT 'lovable_ai_gateway',
  model text,
  success boolean NOT NULL DEFAULT true,
  error text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost numeric NOT NULL DEFAULT 0,
  credit_type text,
  credits_charged integer NOT NULL DEFAULT 0,
  credit_transaction_id uuid,
  refunded boolean NOT NULL DEFAULT false,
  internal_use boolean NOT NULL DEFAULT false,
  request_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own AI usage; admins read all" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX ai_usage_log_user_idx ON public.ai_usage_log(user_id, created_at DESC);
CREATE INDEX ai_usage_log_created_idx ON public.ai_usage_log(created_at DESC);
CREATE INDEX ai_usage_log_operation_idx ON public.ai_usage_log(operation);