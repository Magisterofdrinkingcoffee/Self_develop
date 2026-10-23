# Life Tracker

One place for the whole day: minimums, to-dos, daily and weekly summaries, timetable, studies, projects, reading notes, sport, food and finance.

Everything is editable on the site, including the minimums and their targets (Settings).

## Deploy to Vercel (about 10 minutes)

### 1. Put the code on GitHub
1. Create a new **private** repository on GitHub, e.g. `life-tracker`.
2. Upload this folder's contents to it (GitHub → "uploading an existing file", drag everything in except `node_modules` and `.next`), or use git:
   ```bash
   cd life-tracker
   git init && git add . && git commit -m "Life tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/life-tracker.git
   git push -u origin main
   ```

### 2. Import into Vercel
1. Go to vercel.com → **Add New… → Project** → pick the `life-tracker` repo.
2. Framework is detected as Next.js. Click **Deploy**.

The site works right away, but at this point data is saved only in the browser you use.

### 3. Connect storage (so data syncs between phone and laptop)
1. In your Vercel project → **Storage** tab → add **Upstash for Redis** from the Marketplace (free plan is plenty) and connect it to this project.
2. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables automatically. (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work.)

### 4. Add a password (strongly recommended — this is your personal data)
1. Vercel project → **Settings → Environment Variables** → add `APP_PASSWORD` with a password of your choice.
2. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables take effect.

You'll be asked for the password once per device; it's remembered for a year. "Lock" in Settings logs out.

> If you used the site before connecting storage, go to Settings → **Download backup** first, then after connecting storage use **Restore from backup** to move that data into the database.

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000. Without the env variables, data is kept in the browser.

## How things fit together
- **Today** – minimums with +/− counters, to-dos (unfinished ones from earlier days carry over), daily summary, today's timetable, upcoming deadlines, current book. Use the date arrows to fill in past days.
- **Planner** – week view: minimums grid, weekly summary, all daily summaries of the week, and the weekly timetable editor.
- **Reading** – each book has "where I stopped", notes with page numbers, and a summary. Updating the page automatically adds the pages read to your Book minimum for today (change or turn off in Settings).
- **Studies** – subjects with notes, deadlines with countdowns.
- **Projects** – status + the next concrete step for each.
- **Sport / Food / Finance** – quick logging with weekly/monthly totals.
- **Settings** – edit minimums (name, target, unit, order), calorie target, workout goal, currency, expense categories, backup/restore.

Data is stored as one JSON document (`life-tracker:data`) in Redis. Download a backup from Settings now and then.
