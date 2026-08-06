CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.comment_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.project_documents(id) ON DELETE SET NULL,
  comment_no INTEGER NOT NULL DEFAULT 1,
  discipline TEXT NOT NULL DEFAULT 'General',
  sheet_reference TEXT,
  comment_text TEXT NOT NULL,
  code_reference TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  verification TEXT NOT NULL DEFAULT 'needs_human_review',
  response_text TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  assignee TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comment_responses TO authenticated;
GRANT ALL ON public.comment_responses TO service_role;

ALTER TABLE public.comment_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own comment responses"
  ON public.comment_responses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX comment_responses_project_idx ON public.comment_responses(project_id, comment_no);

CREATE TRIGGER update_comment_responses_updated_at
  BEFORE UPDATE ON public.comment_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();