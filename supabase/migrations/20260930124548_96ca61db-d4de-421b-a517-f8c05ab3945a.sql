CREATE OR REPLACE FUNCTION public.log_plan_review_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; act text; descr text; label text; n int;
BEGIN
  IF TG_TABLE_NAME = 'qaqc_reviews' THEN
    pid := NEW.project_id;
    label := coalesce((SELECT CASE WHEN ps.version_number IS NULL OR ps.title ~* ('\mV' || ps.version_number || '\M') THEN ps.title
                                   ELSE ps.title || ' (V' || ps.version_number || ')' END
                       FROM public.plan_sets ps WHERE ps.id = NEW.plan_set_id), NEW.revision_label, 'plans');
    IF TG_OP = 'INSERT' THEN act := 'plan_review_started'; descr := 'Plan Review started: ' || label;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'complete' THEN
      SELECT count(*) INTO n FROM public.qaqc_findings WHERE review_id = NEW.id;
      act := 'plan_review_completed'; descr := 'Plan Review completed: ' || label || ' — ' || n || ' findings';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'error' THEN
      act := 'plan_review_failed'; descr := 'Plan Review failed: ' || label;
    ELSE RETURN NEW; END IF;
    IF pid IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.activity(project_id, user_id, description, action, object_type, object_id)
    VALUES (pid, coalesce(auth.uid(), NEW.user_id), descr, act, 'qaqc_reviews', NEW.id);
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    SELECT project_id INTO pid FROM public.qaqc_reviews WHERE id = NEW.review_id;
    IF pid IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.activity(project_id, user_id, description, action, object_type, object_id)
    VALUES (pid, coalesce(auth.uid(), NEW.user_id),
      'Finding #' || NEW.finding_no || ' → ' || replace(NEW.status, '_', ' ') || ': ' || left(NEW.summary, 80),
      'finding_status_changed', 'qaqc_findings', NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_plan_review_activity() FROM PUBLIC, anon, authenticated;