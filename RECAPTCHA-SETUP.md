# reCAPTCHA setup — Wild Within contact form

Everything in the code is done. Two things are left, and both need a Google
login, so they're yours. Takes about 10 minutes.

## What we're using and why

**reCAPTCHA v3.** It scores every submission from 0.0 (bot) to 1.0 (human)
in the background. No puzzles, no "click all the traffic lights," nothing for
the visitor to do. That matters here — someone reaching out about therapy is
often having a hard day, and making them solve a picture puzzle first is a
good way to lose them.

Google has folded reCAPTCHA into Google Cloud, so creating a key now asks
you to pick a Cloud project. That is expected and it is still free: **10,000
assessments a month at no cost, no credit card.** This form will not come
close to that ceiling. Keys created this way are still classic keys, so they
work with the standard `siteverify` check the Apps Script uses. Verified end
to end on 2026-07-27 against a live token.

## Step 1 — keys (DONE 2026-07-27)

Created under the `ProofPilot Tools` Cloud project, label `Wild Within
Therapy`, type Score based (v3), domain `thewildwithintherapy.com`.
Registering the apex domain covers `www` and every other subdomain
automatically, so one entry is enough.

The **site key** is public and lives in `contact.html`. Already wired in.

The **secret key** is private. It lives ONLY in the Apps Script project.
It is deliberately NOT in this repo, because this repo is public on GitHub.
Marcos has it. If it ever lands in a commit, roll it in the reCAPTCHA admin
console and treat the old one as burned.

If keys ever need recreating, the console is at
https://www.google.com/recaptcha/admin

**Ownership:** keep these on `seo@getproofpilot.com` with the rest of the
stack, since this sits under Site Care. On Alicia's personal Gmail we lose
access the day that relationship changes.

## Step 2 — the Apps Script

Open the script project attached to the leads sheet, replace the whole file
with `apps-script-contact-form.gs` from this repo, then set the secret:

```js
var RECAPTCHA_SECRET = 'the secret key, pasted here in the editor only';
```

Then **Deploy → Manage deployments → edit the existing deployment → Version:
New version → Deploy.**

Important: edit the *existing* deployment rather than creating a new one. A
new deployment gets a new URL, and the website is pointed at the old one.

## Step 3 — test it

Submit the form on the live site with real-looking info. You should get:

- the email to Alicia (cc you), and
- a new row in the leads sheet with a **score** in column F and **OK** in
  column G.

If column G says `UNVERIFIED`, the keys aren't wired up right. If nothing
arrives at all, check the deployment URL matches the one in `main.js`.

## What the sheet looks like now

The leads tab keeps columns A–E exactly as before, so old rows still line up.
Two new columns:

- **F — Score.** The reCAPTCHA score, 0.0 to 1.0.
- **G — Status.** `OK` (emailed), `SPAM?` (logged, not emailed), or
  `UNVERIFIED` (reCAPTCHA couldn't run, emailed anyway with a note).

A new **Blocked** tab gets created automatically the first time something is
turned away. That's where you check whether the filter is being too
aggressive.

## Tuning

The cutoff is `SCORE_THRESHOLD = 0.5` in the Apps Script. Leave it alone for
a week, then look at the Score column. If real inquiries are scoring 0.7+ and
the junk is at 0.1, tighten it to 0.7. If anything real ever shows up under
0.5, loosen it.

One caveat on early numbers: a brand new key has no traffic history, so
Google scores generously at first. A headless test browser scored 0.9 on
setup day, which a seasoned key would likely have marked down. Give it a few
weeks of real traffic before reading much into the distribution.

The whole thing is built so nothing is ever silently lost. Low scores still
land in the sheet, they just don't email. The only things dropped outright
are submissions with no reCAPTCHA token at all, which is what scripted spam
hitting the URL directly looks like.

## When the funnel goes live

The Find Your Therapist funnel collects name, email, and phone and has no
backend wired up yet. When it's built out for the August ads launch, it needs
the same treatment — same site key, same verification in whatever backend it
posts to. Ad traffic brings noticeably more bot form-fills than organic does,
so don't launch it bare.
