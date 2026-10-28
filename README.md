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

### 3. Connect Supabase (data sync + book storage)
1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor (creates the `life_data` table and a private `books` bucket).
2. Supabase → Project Settings → Integrations → **Vercel** → connect the project to this Vercel project. This adds `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically.

### 4. Login (only you)
The whole site is private. You sign in with your email and get a one-click login link from Supabase; the session lasts 90 days.
- Only the owner's email (stored as a hash in `lib/server.js`) and any emails in the optional `ALLOWED_EMAIL` env var can log in. Anyone else never even gets an email.
- In Supabase → Authentication → URL Configuration, set **Site URL** to your site (e.g. `https://self-develop-murex.vercel.app`) and add `https://self-develop-murex.vercel.app/**` to **Redirect URLs**, so the login link comes back to the site.
- "Log out" is in Settings.

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000. Without the env variables, data is kept in the browser.

## How things fit together
- **Today** – weekly minimums (log each day, it adds up to the week target) with +/− counters, to-dos (unfinished ones from earlier days carry over), daily summary, today's timetable, upcoming deadlines, current book. Use the date arrows to fill in past days.
- **Planner** – week view: minimums grid, weekly summary, all daily summaries of the week, and the weekly timetable editor.
- **Reading** – upload a PDF and read it on the site; it remembers your page. Each book has "where I stopped", notes with page numbers, and a summary. Updating the page automatically adds the pages read to your Book minimum for today (change or turn off in Settings).
- **Studies** – subjects with notes, deadlines with countdowns.
- **Projects** – status + the next concrete step for each.
- **Sport / Food / Finance** – quick logging with weekly/monthly totals.
- **Settings** – edit minimums (name, target, unit, order), calorie target, workout goal, currency, expense categories, backup/restore.

Data is stored as one JSON document in the Supabase table `life_data`; book PDFs are in the private `books` storage bucket. Download a backup from Settings now and then.
