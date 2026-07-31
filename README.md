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
- **Real photos** — Alicia's own shoot landed 2026-07-30. **Every content image that shows a person, a service, or her space is now a real photo of her practice.** What is still stock is decoration and full-bleed bands only.
  - **The defect this fixed was not "the photos are stock."** It was that nine `alt` attributes named *"Alicia Wright, LCSW"* on stock photos of other people — a licensed therapist's site describing strangers as her delivering care. Google reads alt text; so do screen readers. Every one of those is gone: either the slot got a real photo, or the alt was rewritten to describe what the picture actually shows.
  - **Do not trust an `alicia-*` filename to mean it is Alicia.** Six stock files were named that way and that is precisely why the problem stayed hidden. The two that survive are now `stock-kap-room.jpg` and `stock-journaling-desk.jpg`. Keep the `stock-` prefix convention for anything that is not her.
  - **What is still stock, and why:** the full-bleed bands (`home-band-lower`, `hero-forest`, `faq-band`, `testimonial-band-1`, `contact-hero`, `dark-floral-*`, `desert-sunset`, `mala-hand-grass-grounding`) render **1440px wide**, and the real set tops out at 1107px — they cannot be filled without upscaling. Plus generic decoration (`pink-lotus`, `crystals`, `singing-bowl`, `couple-sunset`, `women-laughing`) and `service-kap.jpg`, because no real KAP photo exists. None of these claim to be Alicia.
  - **Resolution is the ceiling on this set: ~1100px.** Every slot was measured with Playwright before a photo was assigned. Service cards render 528×240, the 4:3 slots 568×426, the portraits 496×620 — all comfortably inside 1100px. The 1440px bands are not. **Measure the rendered slot before placing one of these**; do not upscale, and if a band ever needs a real photo, ask Alicia for the full-res original first.
  - **`alicia-headshot.jpg` was deliberately kept.** It is 1200×1600, tight, warm, direct eye contact. Nothing in the new set beats it for the team card or the funnel avatar. It is now also the home page's "Meet Alicia" image (`alicia-welcome-portrait.jpg`, a 4:5 recrop), so **her headshot appears twice on the home page** — large up top, small in the team grid. That was a deliberate trade, not an oversight; see below.
  - **IMG_3898 is rejected by Marcos and must not be reused.** It is the frame where her eyes are closed mid-gesture. It briefly held the home "Meet Alicia" slot, the individual-therapy portrait, and the funnel landing hero; all three are replaced and both derivative files are deleted. **When a photo of the client goes next to another photo of the client, check that they are not the same setup.** IMG_3897 looks like a reasonable alternative for the "Meet Alicia" slot and is not one — it is the same chair, window, and outfit as the home hero directly above it, so it reads as a duplicate. That is why the headshot got the slot even at the cost of appearing twice on the page.
  - **Overwriting an image in place silently invalidates its `width`/`height`.** Replacing the seven `service-*.jpg` files left 36 `<img>` tags declaring the old intrinsic size, which is a CLS bug. They were corrected site-wide. If you ever swap a file's contents without renaming it, re-check the declared dimensions on every page that uses it.
  - **Never put a raw `"` inside an `alt`.** It silently truncates the attribute and swallows the rest of the tag. Use `&quot;`.
- **Final logo** — Taylor is building it. Currently using text logo "The Wild Within."
- **Kyla's headshot** — Kyla bio is in place on About page; needs photo.
- ~~Alisha's full bio + photo~~ — **Removed 2026-07-30.** Alicia is parting ways with Alisha Anderson; she is off the home page, About page, FAQ, and the funnel. Teen work is now credited to Alicia and Kyla, confirmed by Marcos.
  - Second pass the same day caught what the removal left behind: the home H2 still said "three voices," the About subtitle still said "a small team of practitioners," the funnel badge still said "3 therapists," and the funnel still listed an **LAC** credential nobody on the team holds. Those are removed too.
  - **Rule for any future staff change: grep for the departing name, then also grep for the team COUNT and their CREDENTIALS.** Copy and credential badges outlive the person. `.team-grid` and `.team-bio-grid` are now `auto-fit` so the layout no longer has to be re-tuned when the team size changes — do not put a hard-coded column count back.
- **Orphaned image files** — no page references these, but they are all still publicly reachable at their URLs. Pending Marcos's call on deleting them:
  - `assets/img/alisha-headshot.jpg` — orphaned 2026-07-30 with Alisha's departure.
  - `assets/img/alicia-energy-work-crystal.jpg`, `assets/img/alicia-sound-healing-tuning-fork.jpg`, `assets/img/alicia-therapy-session-orange.jpg` — the three stock files replaced by real photos on 2026-07-30. These are the ones whose alt text used to claim they were Alicia, so leaving them reachable is the least good option of the three.
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
