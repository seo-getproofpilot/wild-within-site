# reCAPTCHA setup — Wild Within contact form

Everything in the code is done. Two things are left, and both need a Google
login, so they're yours. Takes about 10 minutes.

## What we're using and why

**reCAPTCHA v3.** It scores every submission from 0.0 (bot) to 1.0 (human)
in the background. No puzzles, no "click all the traffic lights," nothing for
the visitor to do. That matters here — someone reaching out about therapy is
often having a hard day, and making them solve a picture puzzle first is a
good way to lose them.

Google now pushes new signups toward **reCAPTCHA Enterprise**, which needs a
Google Cloud project and a billing account attached. That's overhead nobody
wants to own for a solo practice's contact form. Classic v3 is still free and
still supported, so that's what this uses.

## Step 1 — create the keys

1. Go to https://www.google.com/recaptcha/admin/create
2. Label: `Wild Within Therapy`
3. reCAPTCHA type: **Score based (v3)**
4. Domains, add both:
   - `thewildwithintherapy.com`
   - `www.thewildwithintherapy.com`
5. Accept the terms, Submit.

You get two keys. The **site key** is public and goes in the website. The
**secret key** is private and only ever goes in the Apps Script. Never put
the secret key in the repo — it's a public GitHub repo.

**Decide whose Google account owns this.** Recommend `seo@getproofpilot.com`,
same as the rest of the stack, since this is under Site Care. If it lives on
Alicia's personal Gmail, we lose access the day that relationship changes.

## Step 2 — paste the keys in

**Site key** goes in `contact.html`, near the bottom:

```js
window.WW_RECAPTCHA_SITE_KEY = "PASTE_SITE_KEY_HERE";
```

**Secret key** goes in the Apps Script. Open the script project attached to
the leads sheet, replace the whole file with `apps-script-contact-form.gs`
from this repo, then set:

```js
var RECAPTCHA_SECRET = 'PASTE_SECRET_KEY_HERE';
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
