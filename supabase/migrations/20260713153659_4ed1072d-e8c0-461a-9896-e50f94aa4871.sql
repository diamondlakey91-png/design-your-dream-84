
-- =========== chat_threads ===========
CREATE TABLE public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.chat_threads FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chat_threads_user_updated_idx ON public.chat_threads(user_id, last_message_at DESC);
CREATE TRIGGER chat_threads_touch BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========== chat_messages upgrade ===========
ALTER TABLE public.chat_messages
  ADD COLUMN thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  ADD COLUMN parts JSONB,
  ADD COLUMN client_message_id TEXT;

-- Backfill: create one "Legacy conversation" thread per user with messages, assign old rows to it
DO $$
DECLARE
  u RECORD;
  new_thread_id UUID;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.chat_messages WHERE thread_id IS NULL LOOP
    INSERT INTO public.chat_threads (user_id, title)
    VALUES (u.user_id, 'Legacy conversation')
    RETURNING id INTO new_thread_id;
    UPDATE public.chat_messages
    SET thread_id = new_thread_id,
        parts = jsonb_build_array(jsonb_build_object('type', 'text', 'text', content))
    WHERE user_id = u.user_id AND thread_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.chat_messages ALTER COLUMN thread_id SET NOT NULL;
CREATE INDEX chat_messages_thread_idx ON public.chat_messages(thread_id, created_at);

-- =========== jurisdiction_profiles ===========
CREATE TABLE public.jurisdiction_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  portal_url TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',
  permits JSONB NOT NULL DEFAULT '[]'::jsonb,
  fees JSONB NOT NULL DEFAULT '[]'::jsonb,
  timelines JSONB NOT NULL DEFAULT '[]'::jsonb,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.jurisdiction_profiles TO authenticated;
GRANT ALL ON public.jurisdiction_profiles TO service_role;
ALTER TABLE public.jurisdiction_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "any signed-in can read profiles" ON public.jurisdiction_profiles FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "signed-in can insert profiles" ON public.jurisdiction_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "creator can update profiles" ON public.jurisdiction_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE TRIGGER jurisdiction_profiles_touch BEFORE UPDATE ON public.jurisdiction_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========== inspections ===========
CREATE TABLE public.inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  permit_item_id UUID REFERENCES public.permit_items(id) ON DELETE CASCADE,
  inspection_type TEXT NOT NULL,
  scheduled_date DATE,
  result_date DATE,
  inspector TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inspections" ON public.inspections FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX inspections_project_idx ON public.inspections(project_id, scheduled_date);
CREATE TRIGGER inspections_touch BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========== projects & permit_items additions ===========
ALTER TABLE public.projects
  ADD COLUMN estimate JSONB,
  ADD COLUMN estimate_generated_at TIMESTAMPTZ;

ALTER TABLE public.permit_items
  ADD COLUMN application_fields JSONB,
  ADD COLUMN application_packet_doc_id UUID REFERENCES public.project_documents(id) ON DELETE SET NULL;

-- =========== Realtime ===========
ALTER TABLE public.chat_threads REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.inspections REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inspections;
