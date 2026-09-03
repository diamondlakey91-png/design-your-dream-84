CREATE TABLE public.qa_signoffs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'pre_submittal',
  signed_by_name TEXT NOT NULL,
  signed_by_role TEXT,
  notes TEXT,
  gate_passed BOOLEAN NOT NULL DEFAULT false,
  overridden BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX qa_signoffs_project_idx ON public.qa_signoffs (project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_signoffs TO authenticated;
GRANT ALL ON public.qa_signoffs TO service_role;

ALTER TABLE public.qa_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own QA sign-offs"
ON public.qa_signoffs FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all QA sign-offs"
ON public.qa_signoffs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER qa_signoffs_updated_at
BEFORE UPDATE ON public.qa_signoffs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();