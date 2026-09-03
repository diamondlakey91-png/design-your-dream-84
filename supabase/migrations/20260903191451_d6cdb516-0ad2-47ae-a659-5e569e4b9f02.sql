CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND (
        p.user_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.organization_members m
          WHERE m.organization_id = p.organization_id
            AND m.user_id = auth.uid()
            AND m.role <> 'client'
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_project(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activity','chat_threads','comment_responses','compliance_reports','deadlines',
    'inspections','intake_answers','jurisdiction_confirmations','jurisdiction_syncs',
    'permit_analyses','permit_filings','permit_items','permit_roadmaps','permit_sync_history',
    'professional_reviews','project_documents','qa_signoffs','qaqc_reviews',
    'qaqc_revision_diffs','report_shares','scope_of_work','service_entitlements',
    'service_orders','service_report_versions','service_upgrade_requests',
    'sir_assignments','sir_findings','site_investigations'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (project_id IS NOT NULL AND public.can_access_project(project_id))',
      t || '_org_member_read', t
    );
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activity','chat_threads','comment_responses','compliance_reports','deadlines',
    'inspections','intake_answers','jurisdiction_confirmations','jurisdiction_syncs',
    'permit_analyses','permit_items','permit_roadmaps','permit_sync_history',
    'project_documents','qaqc_reviews','qaqc_revision_diffs','scope_of_work',
    'site_investigations'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (project_id IS NOT NULL AND public.can_write_project(project_id))',
      t || '_org_member_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (project_id IS NOT NULL AND public.can_write_project(project_id))
         WITH CHECK (project_id IS NOT NULL AND public.can_write_project(project_id))',
      t || '_org_member_update', t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

CREATE POLICY "org staff update organization projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.can_write_project(id))
  WITH CHECK (organization_id IS NOT NULL AND public.can_write_project(id));