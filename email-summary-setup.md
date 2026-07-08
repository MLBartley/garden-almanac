# Email summary — setup

A GitHub Action sends you a daily or weekly garden digest by email, with
zero infrastructure beyond a free Resend account and a private GitHub Gist.

**Schedule:** daily 7am MDT during the active season (Apr–Sep), weekly
Sundays 6pm MST during the off-season (Oct–Mar). Set automatically.

## One-time setup (~10 minutes)

### 1. Create a Resend account + grab an API key

- Sign up at <https://resend.com> (free, 3,000 emails/month, no card).
- In the dashboard → **API Keys** → **Create API Key** → choose **Sending
  access** → copy the `re_…` token.
- For sender address: the testing default `onboarding@resend.dev` works
  immediately. To send from your own domain, follow Resend's "Add Domain"
  flow (DNS records on a domain you own).

### 2. Create a secret Gist for the snapshot

- Go to <https://gist.github.com>.
- Filename: `garden-snapshot.json`
- Content: `{}` (just empty braces).
- Click **Create secret gist** (not "public").
- From the URL `https://gist.github.com/<you>/<gistId>` — copy the `<gistId>` (32 hex chars).

### 3. Create a fine-grained GitHub PAT

- <https://github.com/settings/tokens?type=beta> → **Generate new token**.
- Token name: `garden-almanac-gist`
- Expiration: 1 year (set a reminder to renew).
- Repository access: **Public Repositories (read-only)** is fine — Gists are
  account-scoped, not repo-scoped.
- Permissions → **Account permissions** → **Gists** → **Read and write**.
- Click **Generate token**, copy the `github_pat_…` value.

### 4. Add 5 secrets to this repo

In the **garden-almanac** repo: **Settings → Secrets and variables → Actions → New repository secret**:

| Name              | Value                                            |
|-------------------|--------------------------------------------------|
| `RESEND_API_KEY`  | The `re_…` token from step 1                     |
| `RECIPIENT_EMAIL` | Where the email goes (e.g. `you@gmail.com`)      |
| `SENDER_EMAIL`    | `onboarding@resend.dev` (or your verified domain)|
| `GIST_ID`         | Gist ID from step 2                              |
| `GIST_PAT`        | The `github_pat_…` token from step 3             |

### 5. Configure the PWA

- Open the Garden Almanac app → header **⚙ Settings**.
- Paste the **Gist ID** and the **GitHub PAT** into the new fields.
- Click **Save →** — an immediate sync runs and the "Last synced" line
  should turn green within a few seconds.
- From now on, every time you open the app it'll sync (throttled to once
  per 6h). Tap **📤 Sync snapshot now** to force an update.

### 6. Test it once

- Repo → **Actions** tab → **Garden email summary** → **Run workflow** →
  choose `daily` or `weekly` → **Run**.
- Watch the run finish; the email should arrive within a minute.

## Troubleshooting

- **No email**: open the latest workflow run logs. Most failures are a missing/wrong secret or a Resend API key that lacks sending access.
- **Empty digest sections**: if you haven't opened the PWA recently, the Gist might be empty or stale — sync from the PWA, then re-run the workflow.
- **Gist not updating from PWA**: the GitHub PAT must have **Gists: Read and write** scope (account permissions, not repo).
- **Wrong cadence**: cron times are UTC; the workflow auto-skips daily emails outside Apr–Sep and weekly emails inside Apr–Sep. Force a mode via **Run workflow → mode**.

## What's in the email

**Daily** (active season): today's weather, frost alert if any, ready-to-harvest with cues, open transplant nudges, sow opportunities count, this month's pests (flagged if targeting your beds), low soil-health beds.

**Weekly** (off-season): same weather/frost, plus the past week's harvest totals by crop, sows/transplants logged, garden events, and current scouting reminders.

All signals are computed by the PWA at sync time and stored in the Gist, so adding new digest sections is just a PWA change.
