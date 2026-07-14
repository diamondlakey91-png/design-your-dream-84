CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any previous schedule with the same name so re-running is safe.
DO $$
BEGIN
  PERFORM cron.unschedule('permivio-nightly-refresh-linked-permits');
EXCEPTION WHEN OTHERS THEN
  -- schedule didn't exist yet; ignore
  NULL;
END $$;

SELECT cron.schedule(
  'permivio-nightly-refresh-linked-permits',
  '15 7 * * *',  -- 07:15 UTC daily (~ overnight in the Americas)
  $$
  SELECT net.http_post(
    url := 'https://project--dd391092-5bd3-4af0-954d-9a2c9cb05d06.lovable.app/api/public/hooks/refresh-linked-permits',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_xd4jDbok0vTsPFwr6F8OJg_-sehnSxv"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);