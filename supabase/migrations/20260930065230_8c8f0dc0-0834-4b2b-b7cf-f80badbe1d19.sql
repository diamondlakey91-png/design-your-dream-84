-- H1: no direct client inserts into sir_requests (server creates via service role)
DROP POLICY IF EXISTS "Anyone can submit an SIR request" ON public.sir_requests;
REVOKE INSERT ON public.sir_requests FROM anon, authenticated;

-- Shared trusted-caller check: server (service role) or platform admin
CREATE OR REPLACE FUNCTION public.is_trusted_writer()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role))
$$;

-- M1: QA/QC sign-offs are written only by the trusted server workflow
DROP POLICY IF EXISTS "Users manage their own QA sign-offs" ON public.qa_signoffs;
CREATE POLICY "Users read own QA sign-offs" ON public.qa_signoffs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users withdraw own QA sign-offs" ON public.qa_signoffs FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE ON public.qa_signoffs FROM anon, authenticated;

-- M2: reviewer-controlled fields on professional_reviews
CREATE OR REPLACE FUNCTION public.guard_professional_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_trusted_writer() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'requested' OR NEW.reviewer_name IS NOT NULL OR NEW.reviewer_notes IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only Permivio reviewers can set review status, reviewer or reviewer notes' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.reviewer_name IS DISTINCT FROM OLD.reviewer_name
       OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Only Permivio reviewers can change review status, reviewer or reviewer notes' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_professional_review ON public.professional_reviews;
CREATE TRIGGER guard_professional_review BEFORE INSERT OR UPDATE ON public.professional_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_professional_review();

-- M3: authoritative filing status only via trusted server workflow
CREATE OR REPLACE FUNCTION public.guard_permit_filing()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_trusted_writer() THEN RETURN NEW; END IF;
  IF NEW.status::text IN ('submitted','monitoring','issued') AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Submission and permit status must be recorded through Permivio with a source' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_at IS NOT NULL OR NEW.confirmation_number IS NOT NULL OR NEW.status_source IS NOT NULL THEN
      RAISE EXCEPTION 'Submission details must be recorded through Permivio' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.confirmation_number IS DISTINCT FROM OLD.confirmation_number
     OR NEW.status_source IS DISTINCT FROM OLD.status_source THEN
    RAISE EXCEPTION 'Submission details must be recorded through Permivio' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_permit_filing ON public.permit_filings;
CREATE TRIGGER guard_permit_filing BEFORE INSERT OR UPDATE ON public.permit_filings
  FOR EACH ROW EXECUTE FUNCTION public.guard_permit_filing();

-- M4: only admin/server may set human_verified
CREATE OR REPLACE FUNCTION public.guard_jurisdiction_confirmation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_trusted_writer() THEN RETURN NEW; END IF;
  IF NEW.status = 'human_verified' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'human_verified') THEN
    RAISE EXCEPTION 'Only Permivio can mark a jurisdiction human-verified' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_jurisdiction_confirmation ON public.jurisdiction_confirmations;
CREATE TRIGGER guard_jurisdiction_confirmation BEFORE INSERT OR UPDATE ON public.jurisdiction_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.guard_jurisdiction_confirmation();

REVOKE EXECUTE ON FUNCTION public.guard_professional_review(), public.guard_permit_filing(), public.guard_jurisdiction_confirmation() FROM anon, authenticated, public;