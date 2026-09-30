CREATE POLICY "server_only_no_client_access" ON public.payment_webhook_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO service_role;