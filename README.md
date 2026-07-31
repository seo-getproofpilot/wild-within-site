# The Wild Within — Spec Site Build

Local HTML preview build for Wild Within Therapy & Coaching (Alicia Wright, LCSW · Mesa, AZ).
This is the **content + design preview**, not the final WordPress production site.

## Run locally

```bash
cd ~/wild-within-site
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploy to Railway (when ready)

Marcos: Railway can serve this static site directly. Push this folder to a new GitHub repo,
connect to Railway, set the start command to a static-server image, deploy.

## Structure

- `index.html` — Homepage
- `about.html` — Alicia, team (Kyla bio included), credentials
- `services.html` — Services hub
- 8 service pages: `individual-therapy.html`, `couples-counseling.html`,
  `ketamine-assisted-therapy.html`, `parenting-therapy.html`, `coaching.html`,
  `workshops.html`, `tantra-coaching.html`, `chakra-healing.html`
- `areas-we-serve.html` — Mesa / Gilbert / Queen Creek
- `contact.html` — Form (preview only — no real submission)
- `faq.html`
- `privacy.html`
- `blog/` — index + 3 launch posts
- `assets/css/styles.css` — Brand stylesheet (single source of truth)
- `assets/js/main.js` — Mobile nav + form preview
- `sitemap.xml`, `robots.txt`
- `_partials.html` — Header/footer reference (not a live page)

## What still needs swapping in

- **Real testimonials** — Alicia sent these via email. Currently using voice-matched placeholders. Search `TODO` in `index.html`.
- **Real photos** — The five service-card images and the decorative band images are still stock. Alicia's own shoot photos landed 2026-07-30 and are now in the three slots that matter most (see below).
  - **Alicia's real photos, installed 2026-07-30:** `alicia-office-hero.jpg` (home hero), `alicia-hand-on-heart.jpg` (About story), `funnel-hero-conversation.jpg` (funnel landing), `og-alicia-office.jpg` (the social-share image on all 17 pages, replacing the dark `alicia-therapy-session-orange.jpg`). The og file is a true 1200×630, so the `og:image:width`/`height` tags are now honest — they were declaring 1200×630 against a 1600×1066 file.
  - **Resolution is the constraint on this set.** The originals top out around 1100px wide. At 2× DPR that rules out the home welcome image, the tuning-fork slot, and the service cards — those slots need 1000–1120px of *rendered* width, so a 1100px source has nothing left. Don't force these files into a bigger slot; ask Alicia for the full-res originals first.
  - **`alicia-headshot.jpg` was deliberately kept.** It is 1200×1600, tight, warm, direct eye contact. Nothing in the new set beats it for the team card or the funnel avatar. Swapping for the sake of swapping would have been a downgrade.
  - `couples-counseling.html` still uses the old `alicia-therapy-session-orange.jpg` inline — left on purpose, it is a session photo on a session page. Blog pages still have no `og:image` at all.
- **Final logo** — Taylor is building it. Currently using text logo "The Wild Within."
- **Kyla's headshot** — Kyla bio is in place on About page; needs photo.
- ~~Alisha's full bio + photo~~ — **Removed 2026-07-30.** Alicia is parting ways with Alisha Anderson; she is off the home page, About page, FAQ, and the funnel. Teen work is now credited to Alicia and Kyla, confirmed by Marcos.
  - Second pass the same day caught what the removal left behind: the home H2 still said "three voices," the About subtitle still said "a small team of practitioners," the funnel badge still said "3 therapists," and the funnel still listed an **LAC** credential nobody on the team holds. Those are removed too.
  - **Rule for any future staff change: grep for the departing name, then also grep for the team COUNT and their CREDENTIALS.** Copy and credential badges outlive the person. `.team-grid` and `.team-bio-grid` are now `auto-fit` so the layout no longer has to be re-tuned when the team size changes — do not put a hard-coded column count back.
- **`assets/img/alisha-headshot.jpg`** — orphaned since 2026-07-30. No page references it, but it is still publicly reachable at that URL. Pending Marcos's call on deleting it.
- **KAP and coaching pricing** — Currently "contact for pricing." Update when finalized.

## SEO baked in

- Unique title tag, meta description, canonical, H1 on every page
- Schema.org JSON-LD: MedicalBusiness, Person, Service, MedicalProcedure (KAP), FAQPage, BlogPosting
- Internal linking between related services
- Mobile-first responsive
- Address, phone, NAP consistent across all pages

## Brand

- Cream/pink base + dark green + plum + gold accents (Alicia approved 3/30/2026)
- DM Serif Display + DM Sans
- Light/dark section alternation
- Photo-heavy layout (per Alicia's preference)

## Notes for the WordPress build

When this gets rebuilt in WordPress + Elementor:
- All copy is final and lifts directly
- Schema markup needs to be added via SEOPress or Rank Math (or as raw JSON-LD)
- Color palette: cream `#FAF6EE`, dark green `#2C3B2D`, plum `#4A2840`, gold `#C9A961`
- Forms: connect to Alicia's email + (eventually) SimplePractice intake
