REVOKE ALL ON FUNCTION public.roadmap_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.roadmap_visible(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.roadmap_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.roadmap_visible(uuid) TO service_role;