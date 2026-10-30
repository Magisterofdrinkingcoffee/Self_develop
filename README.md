# Life Tracker

One place for the whole day: minimums, to-dos, daily and weekly summaries, timetable, studies, projects, reading notes, sport, food and finance. It installs as an app on iPhone and desktop, pulls in Google Calendar, Gmail, Outlook and Moodle, and uses Gemini for calorie estimates and a personal coach.

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
**Do this once so login works inside the iPhone app:** Supabase → Authentication → Emails → **Magic Link** template, add the code to the email body, e.g.

```html
<p>Your code: <strong>{{ .Token }}</strong></p>
<p>Or <a href="{{ .ConfirmationURL }}">open this link</a> on the same device.</p>
```
An app added to the iPhone Home Screen keeps its own login, separate from Safari, so the link would sign in Safari instead of the app. Typing the code signs in the app itself.

The whole site is private. You sign in with your email and get a one-click login link from Supabase; the session lasts 90 days.
- Only the owner's email (stored as a hash in `lib/server.js`) and any emails in the optional `ALLOWED_EMAIL` env var can log in. Anyone else never even gets an email.
- In Supabase → Authentication → URL Configuration, set **Site URL** to your site (e.g. `https://self-develop-murex.vercel.app`) and add `https://self-develop-murex.vercel.app/**` to **Redirect URLs**, so the login link comes back to the site.
- "Log out" is in Settings.

## Install it as an app
- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. It opens full screen with its own icon. Sign in with the emailed code.
- **Mac / Windows:** open the site in Chrome or Edge → click the install icon at the right end of the address bar.

## Connections (Settings → Connections)
Tokens are stored server-side in Supabase (as extra rows in `life_data`, never sent to the browser or included in backups). Connect accounts from a device where you're signed in; after that they work on every device.

### Moodle (no setup needed)
Moodle → Calendar → **Import or export calendars** → **Export calendar** → Events: *All*, Time period: *Recent and next 60 days* → **Get calendar URL**. Paste it under "Add a calendar link". Then use **Studies → Sync Moodle** to turn assignments and quizzes into deadlines (matched to subjects by course code). Any other `.ics` link works the same way (e.g. Google's "Secret address in iCal format" or Outlook's "Publish calendar").

### Google Calendar + Gmail
1. [console.cloud.google.com](https://console.cloud.google.com) → create a project.
2. **APIs & Services → Library** → enable **Google Calendar API** and **Gmail API**.
3. **OAuth consent screen** → External → add your Gmail as a test user. Then set **Publishing status → In production** (otherwise Google expires the connection every 7 days). You'll see an "unverified app" warning when connecting — that's expected for a personal app; click Advanced → continue.
4. **Credentials → Create credentials → OAuth client ID** → Web application. Authorized redirect URI: `https://<your-site>/api/connect/google/callback`
5. Paste the Client ID and Client secret in the app: **Settings → Connections → Google → Set up**, then press **Connect**. (Alternatively set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel.)

### Outlook (mail + calendar)
1. [entra.microsoft.com](https://entra.microsoft.com) → **App registrations → New registration**. Supported accounts: *Any organizational directory and personal Microsoft accounts*. Redirect URI (Web): `https://<your-site>/api/connect/microsoft/callback`
2. **Certificates & secrets → New client secret** (copy the *Value*).
3. **API permissions** → Microsoft Graph → Delegated: `Calendars.Read`, `Mail.Read`, `User.Read`, `offline_access`.
4. Paste the Application ID and secret value in **Settings → Connections → Outlook → Set up**, then press **Connect**. (Or set `MS_CLIENT_ID` / `MS_CLIENT_SECRET` in Vercel.)

University accounts sometimes require admin approval for third-party apps. If Microsoft says "Need admin approval", use Outlook on the web → Settings → Calendar → **Shared calendars → Publish a calendar** → copy the ICS link and add it as a calendar link instead (calendar only, no mail).

## AI (Gemini)
Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Either add it in Vercel as `GEMINI_API_KEY` (recommended) or paste it in **Settings → AI**. It's only used on the server.
- **Food → Estimate with AI**: describe a meal or take a photo → items with kcal, protein, carbs and fat → "Add to log".
- **Coach**: asks Gemini about your own numbers (minimums, meals, workouts, spending, deadlines, calendar).
The app picks the newest Flash model automatically; set `GEMINI_MODEL` to force one. On the free tier Google may use prompts to improve its products, so don't log anything you wouldn't want seen.

## Notifications
Settings → Notifications → **Turn on for this device** (on iPhone: open the app from the Home Screen first; needs iOS 16.4+). Vercel Cron (`vercel.json`) sends a morning plan around 07:30 and an evening check-in around 21:30 Malaysia time (Vercel's free plan may run a cron any time within that hour). Each is sent at most once a day. Optional: set `CRON_SECRET` in Vercel to lock the cron URL.

## Siri quick add
Settings → Siri and quick add → **Show setup** gives the URL, a private token and the 4-step iOS Shortcut. Phrases: `Quran 10`, `book 20`, `spent 12.50 food lunch`, `ate nasi lemak` (Gemini estimates calories), `todo call landlord`, `weight 82.5`. Changes made while the app is open elsewhere are picked up within a minute; a device that tries to save over newer data gets the newer data instead.

## More
- **Prayer times** (Settings): calculated on the device, JAKIM-style by default for Kota Warisan; shown in today's agenda and the evening check-in. Expect ±2 minutes vs the official JAKIM table.
- **Focus timer** (Studies): 25/50/90-minute sessions logged per subject; hours per subject this week; study time on Planner.
- **Weight trend** (Sport): daily weigh-ins plus the 7-day average, and the change in that average week to week.
- **Weekly review draft** (Planner → Draft with AI).
- **House** (Finance → Дом Б): monthly contributions, shared-fund spending, expenses one person paid, who owes whom, and a copyable monthly report.

## Environment variables
| Name | Needed for |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Data sync, login (added by the Supabase integration) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (or paste in Settings) | Google Calendar + Gmail |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, optional `MS_TENANT` (or paste in Settings) | Outlook |
| `GEMINI_API_KEY` (or paste in Settings), optional `GEMINI_MODEL` | Calorie estimates, Coach, weekly review, Siri meal estimates |
| `SESSION_SECRET` (optional) | Signs login cookies (defaults to the Supabase key) |
| `CRON_SECRET` (optional) | Locks the daily notification cron URL |

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000. Without the env variables, data is kept in the browser.

## How things fit together
- **Today** – a week band showing how far through the week's minimums you are each day, agenda (timetable + calendars + Moodle), unread mail, weekly minimums (log each day, it adds up to the week target) with +/− counters, to-dos (unfinished ones from earlier days carry over), daily summary, today's timetable, upcoming deadlines, current book. Use the date arrows to fill in past days.
- **Planner** – week view: minimums grid, weekly summary, all daily summaries of the week, and the weekly timetable editor.
- **Reading** – upload a PDF and read it on the site; it remembers your page. Each book has "where I stopped", notes with page numbers, and a summary. Updating the page automatically adds the pages read to your Book minimum for today (change or turn off in Settings).
- **Studies** – subjects with notes, deadlines with countdowns.
- **Projects** – status + the next concrete step for each.
- **Coach** – ask Gemini for a day plan, catch-up plan for minimums, meal ideas, weekly review, spending check.
- **Sport / Food / Finance** – quick logging with weekly/monthly totals; Food can estimate calories and macros from text or a photo.
- **Settings** – edit minimums (name, target, unit, order), calorie target, workout goal, currency, expense categories, backup/restore.

Data is stored as one JSON document in the Supabase table `life_data`; book PDFs are in the private `books` storage bucket. Download a backup from Settings now and then.
