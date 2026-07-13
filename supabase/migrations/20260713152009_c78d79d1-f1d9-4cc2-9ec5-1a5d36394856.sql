ALTER TABLE public.permit_items REPLICA IDENTITY FULL;
ALTER TABLE public.deadlines REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.permit_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deadlines;