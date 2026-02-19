# Cult / CultFit Auto-Booking (GitHub Actions)

This repository contains a small Node.js script + GitHub Actions workflow to automatically attempt booking a **07:00 AM** Cult class every day at **00:01 IST**, **except Thursdays**.

> Note: This project calls private/undocumented APIs used by the Cult/CureFit app. These can change at any time and may stop working. Use at your own risk.

---

## What it does

- Runs on **GitHub Actions** on a schedule
- At **00:01 IST** daily (Asia/Kolkata)
- Skips **Thursday** (IST)
- Fetches available classes and tries to book a class matching:
  - your preferred **center**
  - preferred **07:00** time slot
  - preferred **workout IDs** in priority order
- Retries a few times to handle race conditions / timing issues

---

## Files

- `scripts/bookCultClass.js` — booking script
- `.github/workflows/book-cult.yml` — scheduled GitHub Actions workflow
- `package.json` — minimal Node setup

---

## Setup (GitHub Actions)

### 1) Fork / clone

Fork this repo to your own GitHub account (recommended), then enable Actions on your fork.

### 2) Configure GitHub Secrets

Go to:

**Settings → Secrets and variables → Actions → New repository secret**

Add these **required** secrets:

- `CUREFIT_ST` = `<<<FILL_ME>>>`
- `CUREFIT_AT` = `<<<FILL_ME>>>`
- `CUREFIT_CENTER_ID` = `<<<FILL_ME>>>` (number, e.g. `45`)
- `CUREFIT_WORKOUT_IDS` = `<<<FILL_ME>>>` (comma-separated workout IDs, e.g. `37,9,8`)

Optional secrets (defaults shown):

- `CUREFIT_SLOT` = `07:00:00`
- `CUREFIT_OSNAME` = `ios`
- `CUREFIT_HOST` = `www.cure.fit`
- `RETRY_ATTEMPTS` = `6`
- `RETRY_DELAY_SECONDS` = `20`

#### Where do `st` / `at` come from?
These values are sent as headers by the official app. You can usually obtain them by inspecting network calls made by the app (for example, by using a proxy/sniffer on your own device).

---

## Schedule (00:01 IST)

The workflow uses this cron:

- `31 18 * * *`

Because GitHub cron is in **UTC** and:

- **00:01 IST = 18:31 UTC** (previous day)

---

## Test it

### Option A — Run on GitHub Actions (recommended)

1. Push your changes / ensure workflow exists
2. Go to **Actions**
3. Select: **Book Cult 7AM (IST) - except Thursday**
4. Click **Run workflow**
5. Check logs

### Option B — Run locally

```bash
npm ci

export CUREFIT_ST="<<<YOUR_ST>>>"
export CUREFIT_AT="<<<YOUR_AT>>>"
export CUREFIT_CENTER_ID="<<<YOUR_CENTER_ID>>>"
export CUREFIT_WORKOUT_IDS="37,9,8"
export CUREFIT_SLOT="07:00:00"  # optional

node scripts/bookCult7am.js
```

---

## Troubleshooting

### “No AVAILABLE classes found…”
Likely causes:
- wrong `CUREFIT_CENTER_ID`
- wrong/old `CUREFIT_WORKOUT_IDS`
- class is not available / sold out for that date/time

### HTTP 401 / 403
- `CUREFIT_ST` / `CUREFIT_AT` are invalid or expired.

### Schedule didn’t run exactly at 00:01
GitHub scheduled workflows are best-effort and can be delayed. Increase retries if needed.

---

## Disclaimer

This is an unofficial automation script. You are responsible for complying with Cult/CureFit terms and conditions and any applicable rules/policies.
