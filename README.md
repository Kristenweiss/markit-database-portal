# MarkIt Database — Phase 1 Portal

Private, Drive-backed document portal for MarkIt Legal. This is Phase 1, Step 1 of the build spec (`../markit-database-spec.md`, section 10): the portal itself, with the ability to read Drive, create folders, and upload files. Intake forms, matter conversion, and engagement agreement generation are steps 2 through 4 and are not built yet.

## What's here

- `public/` — the front end. `public/index.html` is the sign-in screen, `public/app/` is the dashboard (folder browser, new folder, upload).
- `netlify/functions/` — serverless functions handling the Google OAuth flow and proxying Drive API calls. The browser never talks to Google's Drive API directly, only to the Picker widget for the one-time folder-connect step.
- No npm dependencies. Everything runs on native `fetch` and Node's `crypto`, so there's nothing to `npm install` — this keeps the functions small and fast to cold-start.

## How sign-in and Drive access work

You sign in with your Google account. The app requests the `drive.file` scope, the narrow scope the spec calls for that needs no Google app review — it only grants access to files and folders the app creates itself, or that you explicitly select through Google's file picker.

Because `MarkIt Database` already exists in your Drive, the app can't see it automatically on first login. You'll get a banner prompting you to connect it: click "Connect Drive folder," and in the picker that opens, select `MarkIt Database`. That one click grants the app access to that folder and everything under it going forward — a one-time step, not something you repeat.

Your session is a token in an encrypted, HTTP-only browser cookie (not a database), refreshed automatically off Google's refresh token, so you stay signed in for weeks without re-authenticating. Only the address in `ALLOWED_EMAIL` can sign in — anyone else gets turned away at the callback step.

## Setup, in order

### 1. Google Cloud project

1. Go to console.cloud.google.com and create a new project (or reuse one you already have for the firm).
2. APIs & Services > Library — enable the **Google Drive API** and the **Google Picker API**.
3. APIs & Services > OAuth consent screen — External is fine (Internal works too if your Workspace allows it; either way `drive.file` needs no verification review). App name "MarkIt Database," your email as support/developer contact.
4. APIs & Services > Credentials > Create Credentials > OAuth client ID:
   - Application type: Web application
   - Authorized redirect URI: `https://YOUR-NETLIFY-SITE.netlify.app/.netlify/functions/auth-callback` — you'll need to come back and add the real one once the site is deployed (step 2).
   - Save the Client ID and Client Secret.
5. APIs & Services > Credentials > Create Credentials > API key:
   - This is for the Picker widget only — a separate credential from the OAuth client, needed even though everything else here avoids one.
   - Restrict it: API restrictions > Picker API; Application restrictions > HTTP referrers > your Netlify domain.

**Heads up:** this API key is an addition beyond what the spec's section 11 setup list mentions — it's a necessary piece for the one-time folder-picker step, not something I could avoid while keeping to `drive.file`.

### 2. Deploy to Netlify

Functions need either a Git-connected site or the Netlify CLI — a plain drag-and-drop zip (like the markitlegal.com landing page) only deploys static files, not the serverless functions this app depends on for OAuth and Drive calls. Two options:

- **Git-connected (recommended):** push this `portal/` folder to a new GitHub repo, then in Netlify choose "Import from Git" and point it at the repo (base directory `portal/` if it's nested in a larger repo). Future changes just need a `git push`.
- **Netlify CLI:** `npm install -g netlify-cli`, then from inside `portal/` run `netlify deploy` (and `netlify deploy --prod` when ready to go live).

Once it's live, grab the site's URL and go back to step 1.4 to add the real redirect URI.

### 3. Environment variables

Netlify: Site configuration > Environment variables. Add everything in `.env.example`:

| Variable | Where it comes from |
|---|---|
| `GOOGLE_CLIENT_ID` | Step 1.4 |
| `GOOGLE_CLIENT_SECRET` | Step 1.4 |
| `GOOGLE_PICKER_API_KEY` | Step 1.5 |
| `DRIVE_ROOT_FOLDER_ID` | Open the `MarkIt Database` folder in Drive, copy the ID at the end of the URL |
| `ALLOWED_EMAIL` | The Google account you'll sign in with — probably `hello@kwlegal.co` |
| `SESSION_SECRET` | A long random string — `openssl rand -hex 32` in Terminal |

Redeploy after adding these; already-running functions don't pick up new env vars until the next deploy.

### 4. First sign-in

Visit the site, sign in with Google, and click "Connect Drive folder" when the banner shows — pick `MarkIt Database` in the picker. From there: browse, create folders, upload.

## Known limits, on purpose, for Phase 1

- **Uploads cap around 4.5MB.** Netlify's synchronous functions have a body size limit, and the file passes through as base64. Bigger files need to go into Drive directly for now. Worth watching — signed estate planning binders and scanned probate filings can blow past that. If it turns out to bite often, the fix is a resumable upload straight from the browser to Drive, which is a real change worth doing deliberately rather than squeezing in here.
- **No Supabase yet.** This step doesn't need it — it's pure Drive I/O. Steps 2 through 4 (intake forms, matter records, conversion, engagement generation) bring in the Supabase schema from spec section 7.
- **No matter data model yet.** The dashboard is a plain folder browser rooted at `MarkIt Database`, not the Prospective-queue/Active-matters dashboard from spec section 8. That view depends on the Supabase matters table built in step 3.
- **Single-user by design.** The session model assumes one signer-in (you). Fine for a solo practice; would need rework before an associate or paralegal gets their own login.
