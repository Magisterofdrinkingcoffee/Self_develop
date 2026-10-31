-- Jarvis: proactive notifications. Run once in Supabase → SQL Editor.
-- Calls your site every 5 minutes; the site decides whether anything is due (prayer reminders,
-- morning briefing, deadline nudges, evening review). Most ticks send nothing and cost nothing.
--
-- Replace the two values below (Settings → Jarvis in the app shows this script with them filled in):
--   https://YOUR-SITE.vercel.app   → your site's address
--   YOUR-TOKEN                     → the Siri / quick-add token from Settings

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older copy of the job if you run this again
select cron.unschedule('jarvis-tick') where exists (select 1 from cron.job where jobname = 'jarvis-tick');

select cron.schedule(
  'jarvis-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-SITE.vercel.app/api/jarvis/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer YOUR-TOKEN'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- To check it's running:   select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:              select cron.unschedule('jarvis-tick');
