# Life Tracker

One place for the whole day: minimums, to-dos, daily and weekly summaries, timetable, studies, projects, reading notes, sport, food, finance and Islamic practice. It installs as an app on iPhone and desktop, pulls in Google Calendar, Gmail, Outlook and Moodle, and has **Jarvis**: a personal assistant (Gemini) that logs, plans, quizzes, remembers and reaches out on its own.

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
Sign in with your username and password. The session lasts 90 days on each device (including the iPhone Home Screen app). After 5 wrong passwords, login locks for 15 minutes.
- The repo holds only a salted scrypt hash of the password, never the password itself.
- To change the password: generate a new hash with
  `node -e "const c=require('crypto'),s=c.randomBytes(16);console.log('scrypt$65536$'+s.toString('base64url')+'$'+c.scryptSync(process.argv[1],s,32,{N:65536,r:8,p:1,maxmem:268435456}).toString('base64url'))" 'NEW-PASSWORD'`
  and put it in Vercel as `LOGIN_PASSWORD_HASH` (optional `LOGIN_USER` for a different username).
- "Log out" is in Settings.

## Install it as an app
- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. It opens full screen with its own icon. Sign in once with your username and password.
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
- **Jarvis**: see below.
The app picks the newest Flash model automatically; set `GEMINI_MODEL` to force one. On the free tier Google may use prompts to improve its products, so don't log anything you wouldn't want seen.

## Jarvis

Jarvis is one brain (`/api/jarvis`) with several ways in: the **Jarvis** tab (typing, voice, photos), the round **mic button** on every screen, and **notifications** it sends by itself.

```
 Mic button ─┐
 Web chat  ──┼──►  /api/jarvis  ──► 1. fast path: "quran 10", "asr late", "spent 12 food"… (no AI call)
 5-min tick ─┘                      2. agent loop: Gemini + tools, up to 6 steps
                                    3. memory: facts/goals + nightly summaries, in every prompt
                                    4. action log: every change has an exact undo
```

**What it can do** (tools in `lib/jarvis/tools.js`): read your day (classes, calendar, prayer times, free windows), add/complete to-dos, deadlines and timed reminders, log minimums, meals (it estimates kcal), workouts with sets × reps × kg, weight, money, study time, prayers (on time / late / qada / missed), fasts, the Quran khatm plan and hifz reviews, search your own lecture PDFs, make and quiz flashcards, look up real Quran verses (api.alquran.cloud), give stats and progressive-overload advice, remember/forget things, and undo.

**Rules it follows**: acts instead of just talking; uses your numbers; plans around prayers and classes; quotes the Quran only from the API with references; never invents hadith or gives fatwas; replies in English, Russian or Kazakh; asks before anything irreversible.

### Set up (Settings → Jarvis)
1. **Gemini key** (Settings → AI or `GEMINI_API_KEY`). The free tier is enough for one person: fast-path commands use no quota, a normal message uses 2–3 calls. The Jarvis tab shows today's count.
2. **Siri**: Settings → Jarvis → *Siri* gives you a private link. Shortcuts app → new shortcut named **Jarvis** → *Dictate Text* → *Get Contents of URL* (the link + Dictated Text at the end) → *Speak Text*. Then "Hey Siri, Jarvis". (Endpoint: `/api/jarvis/siri?token=…&q=…`.)
3. **Talk in the app**: tap the mic button on any screen (it opens Jarvis and starts listening), or turn on "Open the app straight on Jarvis". On Android/desktop, long-press the app icon → *Talk to Jarvis*.
3. **Proactive notifications**: turn on Notifications, then run the SQL shown in Settings → Jarvis (or `supabase/jarvis.sql`) in Supabase. It uses Supabase's free `pg_cron` to call `/api/jarvis/tick` every 5 minutes, and the code decides what's due:
   - morning briefing ~20 min after Subuh (AI-written; also saved in the chat)
   - reminder before each prayer, and "Did you pray …?" with **On time / Late** buttons if it isn't logged
   - evening adhkar after Asar, sunnah fasting reminder the evening before (Mon/Thu, white days, Arafah, Ashura, Ramadan)
   - deadline watchdog (18:00), weekly minimums check (Fri/Sat 20:00)
   - evening review after Isyak; reminders you asked for at their time
   - nightly: the day's chat is condensed into memory
   Nudges never come during classes or quiet hours and are capped per day; prayer reminders and your own reminders always come.
4. **Apple Health** (optional): a nightly Shortcuts automation POSTs steps, sleep, resting heart rate and weight to `/api/jarvis/health`. Shown on Sport and used by Jarvis.
5. **Notes**: in Reading, open a PDF and press **Let Jarvis read it**. Text is extracted in the browser, split into chunks and embedded (Gemini embeddings, 256-d, stored as int8). Search is hybrid (meaning + keywords) and still works by keywords without a key.

### Islam tab
Prayer log per day with streak, on-time %, qada counter; Quran khatm plan (page, finish date → pages per day; pages also count toward the Quran minimum); hifz with spaced review; fasting days ahead and the Hijri date (Umm al-Qura; can differ by a day from local sighting).

### Studies → Flashcards
Spaced repetition (SM-2 style). Make cards by hand or ask Jarvis: "make 10 flashcards from my AIT201 notes on overfitting", then "quiz me".

### Tests and evals
```bash
npm test                      # unit tests for tools, undo, agent loop, scheduler, Islamic helpers, notes search
GEMINI_API_KEY=... npm run eval   # does Gemini pick the right tools for real phrases? (evals/cases.json)
```
Add your own phrases (in your three languages) to `evals/cases.json` and run the eval after changing tools or the prompt.

### Where things live
| | |
|---|---|
| Main data (tracker, prayers, quran, cards, memories, reminders) | `life_data` row `main` (synced to the app, included in backups) |
| Chat history, action log (undo), AI usage, tick state | `life_data` rows `secret:jarvis-chat`, `secret:jarvis-log`, `secret:jarvis-usage`, `secret:tick-state` |
| Indexed notes | `life_data` rows `notes:<book id>` |

## Notifications
Settings → Notifications → **Turn on for this device** (on iPhone: open the app from the Home Screen first; needs iOS 16.4+). With the Jarvis tick set up, Jarvis sends the briefing and review itself. As a fallback, Vercel Cron (`vercel.json`) sends a morning plan around 07:30 and an evening check-in around 21:30 Malaysia time, skipped when Jarvis already sent one (Vercel's free plan may run a cron any time within that hour). Each is sent at most once a day. Optional: set `CRON_SECRET` in Vercel to lock the cron URL.

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
| `GEMINI_API_KEY` (or paste in Settings), optional `GEMINI_MODEL`, `GEMINI_EMBED_MODEL` | Jarvis, calorie estimates, weekly review, notes search |
| `SESSION_SECRET` (optional) | Signs login cookies (defaults to the Supabase key) |
| `LOGIN_USER`, `LOGIN_PASSWORD_HASH` (optional) | Change the username/password |
| `CRON_SECRET` (optional) | Locks the daily notification cron URL (the Jarvis tick also accepts it) |

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
- **Jarvis** – talk or type; it logs, plans your day, quizzes you, answers from your notes and remembers you.
- **Islam** – prayers, qada, Quran khatm, hifz review, fasting days.
- **Sport / Food / Finance** – quick logging with weekly/monthly totals; Food can estimate calories and macros from text or a photo.
- **Settings** – edit minimums (name, target, unit, order), calorie target, workout goal, currency, expense categories, backup/restore.

Data is stored as one JSON document in the Supabase table `life_data`; book PDFs are in the private `books` storage bucket. Download a backup from Settings now and then.
