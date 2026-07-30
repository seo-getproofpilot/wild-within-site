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
- **Real photos** — Currently Unsplash placeholders. Alicia is doing a photo shoot.
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
