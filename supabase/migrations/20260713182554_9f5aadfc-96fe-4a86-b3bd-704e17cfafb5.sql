CREATE POLICY "Users can update their own project-docs objects"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1]);