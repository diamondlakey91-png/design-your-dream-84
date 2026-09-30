CREATE OR REPLACE FUNCTION public.credit_balance(_user_id uuid, _credit_type text)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(SUM(quantity)::int, 0) FROM public.credit_transactions
  WHERE user_id = _user_id AND credit_type = _credit_type
$$;