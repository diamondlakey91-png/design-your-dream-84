ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_credit_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_credit_type_check CHECK (credit_type = ANY (ARRAY['report_credits','plan_review_credits','correction_review_credits','ai_queries','ai_messages']));
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_transaction_type_check CHECK (transaction_type = ANY (ARRAY['subscription_grant','purchase','usage','refund','adjustment','expiration','promotional_grant']));
ALTER TABLE public.plan_entitlements DROP CONSTRAINT IF EXISTS plan_entitlements_entitlement_key_check;
ALTER TABLE public.plan_entitlements ADD CONSTRAINT plan_entitlements_entitlement_key_check CHECK (entitlement_key = ANY (ARRAY['active_projects','team_seats','ai_queries','ai_messages','report_credits','plan_review_credits','correction_review_credits','document_storage_mb','subscriber_discount_percent']));
ALTER TABLE public.service_products ADD COLUMN IF NOT EXISTS credit_config_status text NOT NULL DEFAULT 'beta_default';
ALTER TABLE public.service_products ADD COLUMN IF NOT EXISTS professional_review_available boolean NOT NULL DEFAULT false;
UPDATE public.service_products SET professional_review_available = (supports_professional_review OR professional_review_required);