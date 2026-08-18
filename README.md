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
- ~~**Final logo**~~ — **Shipped 2026-08-15 in `dc231dc`.** Alicia's lockup is a single dark plum on transparency, which would be invisible on the plum nav, so it ships as recoloured variants: `logo-mark-ivory.png` in the nav, `logo-wild-within-ivory.png` in the footer, `logo-wild-within-plum.png` for light backgrounds, `logo-wild-within-onwhite.png` for the Organization schema logo, and `logo-mark-plum.png` on the funnel.
  - **The artwork is very fine line work — only about 4% of the frame is opaque pixels.** It reads well at footer size and turns to a faint smudge at nav and favicon size. That is why the favicon is a weighted phoenix on a solid plum tile rather than the lockup dropped straight in. **Anywhere this logo lands below roughly 80px tall, look at it rendered before calling it done**; at small sizes it is easy to mistake for the old `logo-phoenix-text.png`, because both read as the same pale scribble.
- ~~**Kyla's headshot**~~ — **Live 2026-08-15 in `7936075`.**
- ~~Alisha's full bio + photo~~ — **Removed 2026-07-30.** Alicia is parting ways with Alisha Anderson; she is off the home page, About page, FAQ, and the funnel. Teen work is now credited to Alicia and Kyla, confirmed by Marcos.
  - Second pass the same day caught what the removal left behind: the home H2 still said "three voices," the About subtitle still said "a small team of practitioners," the funnel badge still said "3 therapists," and the funnel still listed an **LAC** credential nobody on the team holds. Those are removed too.
  - **Rule for any future staff change: grep for the departing name, then also grep for the team COUNT and their CREDENTIALS.** Copy and credential badges outlive the person. `.team-grid` and `.team-bio-grid` are now `auto-fit` so the layout no longer has to be re-tuned when the team size changes — do not put a hard-coded column count back.
- **Orphaned image files** — no page references these. Full audit of `assets/img/` run 2026-07-31; the two entries below plus the Canva screenshots and the logo variants were the complete set.
  - ~~`assets/img/kap-flyer.png`~~, ~~`assets/img/workshop-women-manifest.png`~~ — **deleted 2026-07-31 on Marcos's approval.** Both were **screenshots of the Canva mobile app**, not exported artwork: iPhone status bar, battery indicator, editing toolbar, selection handles and the font-picker row were all baked into the image. They were live on the site from 2026-04-11 (`27ae594`) to 2026-05-19 (`a8b5fce`). The KAP one also carried a typo in the flyer artwork itself — "Counseling & **Holisiic** Therapy." **If a client sends a flyer, ask for the exported PNG/PDF from Canva; never ship a phone screenshot of the editor.**
  - Logo variants `logo-kickoff.png`, `logo-moon-text.png`, `logo-vertical-lotus.png`, `logo-phoenix.png`, `favicon-crop.png` and the pre-2026-08-15 `logo-phoenix-text.png`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` are now unreferenced. Kept rather than deleted so the old marks stay recoverable, and because deleting files needs Marcos's approval.
  - `assets/img/Wild Within logo v1.png` is byte-identical to `logo-phoenix-text.png` and referenced by nothing. Gitignored 2026-08-18 rather than deleted.
  - ~~`assets/img/alisha-headshot.jpg`~~ — orphaned 2026-07-30 with Alisha's departure. **Deleted 2026-07-31 on Marcos's approval.** It had been linked from 2026-04-11 to 2026-07-30, so assume Google image-indexed it; the 404 is what drops it out.
  - `assets/img/alicia-energy-work-crystal.jpg`, `assets/img/alicia-sound-healing-tuning-fork.jpg`, `assets/img/alicia-therapy-session-orange.jpg` — **still reachable, awaiting Marcos's call.**
    - **CORRECTION 2026-07-31: these are NOT stock files.** This entry previously called them "the three stock files whose alt text used to claim they were Alicia." That was wrong, and it inverted the actual risk. All three are real photographs of Alicia in her real treatment room — verified by comparing them against `alicia-headshot.jpg` (same face, same hair) and against each other (the crystal and tuning-fork frames share the same gold sequin top and the same shoot; the crystal and orange frames share the same room — same twin line-art hand prints, same lamp, same cart). They came in on 2026-04-29 in `fd43d63` "Drop in Alicia's 6 photos across the site," which is exactly what they are. They were displaced on 7/30 by *newer* real photos, not because they were stock.
    - **The third parties in frame are cleared for use.** Marcos, 2026-07-31: it was a planned photo shoot, everyone in it was there on purpose, and faces do not need hiding. Do not raise consent on these again, and do not blur or crop anyone out on that basis.
    - Do not re-file these as "stock" again. If a photo shows Alicia's actual room, it is real.
    - **`alicia-therapy-session-orange.jpg` was the sitewide `og:image` on 17 pages until 7/30**, when it was deliberately retired for being too dark for a cold Meta audience (replaced by `og-alicia-office.jpg`). It is fine for an in-page slot; do not put it back in a share or hero slot.
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
