/**
 * Wild Within - "Find Your Therapist" funnel backend
 * Receives the funnel quiz, verifies reCAPTCHA v3, writes the lead to the
 * "Funnel Leads" tab, emails Alicia.
 * Deploy as a Web app, Execute as Me, Who has access: Anyone.
 * Short lines on purpose so editor paste never wrap-breaks a string.
 *
 * THIS IS A SEPARATE APPS SCRIPT PROJECT FROM apps-script-contact-form.gs.
 * Do NOT paste this over the contact form script. They are deliberately
 * isolated so a bug in the funnel can never take down the website contact
 * form, which is the practice's main inquiry path. Each has its own
 * deployment URL and its own RECAPTCHA_SECRET script property. Reusing one
 * project for both would save a five-minute setup once and cost a live form
 * outage the first time this file changes.
 *
 * WHY THE FUNNEL GETS ITS OWN TAB:
 * The contact form writes 5 fields. The funnel writes 20, because every quiz
 * answer and every ad-source field has to survive to the sheet. Cramming that
 * into the existing "Wild Within Leads" tab would push Alicia's Status and
 * Notes columns out of position and break the triage workflow she already
 * uses. So funnel leads land on their own tab in the SAME spreadsheet, with
 * her Status and Notes columns reproduced in the same relative spot, so
 * triage feels identical on both tabs.
 *
 * LEAD SOURCE TAGGING IS NOT OPTIONAL.
 * Columns O-V exist so that when Alicia reports how many funnel leads turned
 * into paying clients, we can trace those back to the ad that produced them.
 * Without them we are paying for Meta ads with no way to prove return. If a
 * future edit is tempted to drop these columns to tidy the sheet, do not.
 */

var SHEET_ID = '1I3uNqimh1qv_aZRR3Zyp_WIjR--2A0rodtmvBWHGnnM';
var SHEET_TAB = 'Funnel Leads';
var BLOCKED_TAB = 'Funnel Blocked';
var NOTIFY_TO = 'thewildwithin.therapy@gmail.com';
var NOTIFY_CC = 'seo@getproofpilot.com';

// The guide the funnel's last screen promises. Live, noindex, and unlinked
// from the site on purpose so it reads as something handed to them.
var GUIDE_URL = 'https://thewildwithintherapy.com/grounding-guide';

/**
 * CONSULT BOOKING LIVES IN GOHIGHLEVEL NOW, NOT IN THIS FILE.
 *
 * Until 2026-09-02 this script booked consults itself: it read a slot label
 * off the funnel, resolved it against a hardcoded SLOT_MAP, and wrote an event
 * onto the matched therapist's own Google Calendar. All of that is gone, and
 * none of it should come back. Three reasons, each of them load-bearing:
 *
 *   - The therapists never shared their calendars with the account that owns
 *     this script, so getCalendarById returned null on every real lead and no
 *     booking ever happened. The funnel meanwhile printed "Your consult is
 *     set. The calendar invite is on its way to your inbox."
 *   - The conflict check read each therapist's entire personal calendar.
 *     Alicia does not keep hers blocked out, so an open window could read as
 *     taken and a perfectly good slot was refused.
 *   - SLOT_MAP was a hand-synced second copy of a list that also lived in the
 *     funnel HTML. It had already drifted to six bookable slots a week against
 *     the twelve that were agreed.
 *
 * The person now books in the matched therapist's GoHighLevel calendar, which
 * is embedded on the funnel's last screen. GoHighLevel holds availability,
 * writes the appointment, and sends its own confirmation. That is what makes
 * the confirmation they read on screen true.
 *
 * What is left for this file: the sheet row, Alicia's notification, the
 * grounding guide, the Conversions API event, and pushing the contact into
 * GoHighLevel so the booking widget and the follow-up automation land on a
 * record that already exists.
 */

// The GoHighLevel sub-account this practice's contacts belong to.
var GHL_LOCATION_ID = 'BauEG1SWoNvEIat6cR96';
var GHL_API = 'https://services.leadconnectorhq.com';
var GHL_VERSION = '2021-07-28';

// The address the guide email must appear to come from. This is the practice,
// never ProofPilot. A stranger who just answered five questions about their
// inner life should not get mail from an agency they have never heard of.
//
// This project is owned by a ProofPilot Google account, and Google will not
// let a script send as an arbitrary address. It works ONLY after this address
// is added as a verified send-as alias on the owning account:
//   Gmail (owning account) > Settings > Accounts and Import
//   > Send mail as > Add another email address
//   > enter thewildwithin.therapy@gmail.com, uncheck "Treat as an alias"
//   > Google mails a confirmation link to Alicia, she clicks it, done.
// Until that link is clicked, sendGuideEmail_ falls back to sending from the
// owning account with Reply-To set to her, so no lead is ever lost waiting on
// a setup step. Check the execution log to see which path ran.
var SEND_AS = 'thewildwithin.therapy@gmail.com';

// The action name the funnel mints its reCAPTCHA token with. The website
// contact form uses 'contact'. Keeping them different is what stops a token
// lifted from one form being replayed against the other.
var EXPECTED_ACTION = 'funnel';

// Scores run 0.0 (almost certainly a bot) to 1.0 (almost certainly human).
// At or above this, the lead emails Alicia normally. Below it, the lead still
// lands in the sheet but is flagged and not emailed. Same 0.5 starting point
// as the contact form. Watch the Score column for a week, then tune.
var SCORE_THRESHOLD = 0.5;

var VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// ---- Meta Conversions API ----
// Browser-only pixel under-reports a therapy audience badly: iOS blocks it,
// privacy extensions block it, and this is exactly the audience that runs
// both. CAPI fires the same Lead server side so Meta's optimizer actually
// learns. Both values live in Script Properties, never in this file and never
// in the repo - the repo is public.
//   META_PIXEL_ID    same public ID as WW_META_PIXEL_ID in funnel-demo/index.html
//   META_CAPI_TOKEN  SECRET. Events Manager > Settings > Conversions API
// Leave either blank and CAPI simply does not fire. Nothing else breaks.
var CAPI_VERSION = 'v21.0';

// Domains a token is allowed to have been solved on. Add localhost here only
// while testing, and take it back out afterward.
var ALLOWED_HOSTS = [
  'thewildwithintherapy.com',
  'www.thewildwithintherapy.com'
];

/**
 * Column layout for the Funnel Leads tab.
 *
 * Ordered for Alicia's eyes, not for the code's convenience. Who they are and
 * who they matched with come first, then HER two columns, then the quiz
 * answers, then the ad-source fields she will never need to look at.
 *
 * STATUS_COL and NOTES_COL belong to Alicia. This script writes the header
 * once and then never touches those two cells again. If a future edit writes
 * into them it will wipe her triage as leads come in.
 */
var COLS = [
  'Timestamp',        // A
  'Name',             // B
  'Email',            // C
  'Phone',            // D
  'Matched With',     // E
  'Status',           // F  <- Alicia's dropdown, script never writes here
  'Notes',            // G  <- Alicia's notes, script never writes here
  'What They Said',   // H
  'Hoping For',       // I  Q1
  'Wants To Work On', // J  Q2
  'In Person / Tele', // K  Q3
  'Timing',           // L  Q4
  'Priority',         // M  Q5
  'Requested Time',   // N
  'Source',           // O
  'Medium',           // P
  'Campaign',         // Q
  'Ad Content',       // R
  'Term',             // S
  'Click ID',         // T
  'Referrer',         // U
  'Landing Page',     // V
  'reCAPTCHA Score',  // W
  'Spam Check'        // X
];

var STATUS_COL = 6;  // F
var NOTES_COL = 7;   // G

/**
 * Health check. Run this from the editor any time the funnel seems off, then
 * read the Execution log. It proves the things that can silently break this
 * backend without needing a real submission:
 *   1. the secret is present (length only - never log the value itself)
 *   2. UrlFetchApp can actually reach Google, which is what fails when the
 *      script has not been authorized for external requests
 *   3. the Funnel Leads tab exists and has the column layout below
 * A deliberately invalid token is expected to come back success=false with
 * invalid-input-response. That is the PASS case - the round trip worked.
 * errored=true is the FAIL case.
 *
 * Deliberately the FIRST function in the file. The editor's Run button
 * defaults to whichever function is declared first, and its function picker
 * is unreliable - it will show a new name in the toolbar while still running
 * the previously selected function. Keeping the health check first means Run
 * does the right thing without touching the picker.
 */
function checkSetup() {
  var secret = getSecret();
  Logger.log('secret present: ' + (secret ? 'yes, length ' + secret.length
    : 'NO - set the RECAPTCHA_SECRET script property'));

  var verdict = verifyRecaptcha('deliberately-invalid-token');
  if (verdict.errored) {
    Logger.log('FAIL - could not reach Google: ' + verdict.why);
  } else {
    Logger.log('PASS - reached Google. success=' + verdict.success
      + ' errorCodes=' + verdict.errorCodes);
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ensureSheet(ss);
  var headers = sheet.getRange(1, 1, 1, COLS.length).getValues()[0];
  Logger.log('tab: ' + SHEET_TAB);
  Logger.log('headers: ' + headers.join(' | '));
  Logger.log('Alicia owns col ' + STATUS_COL + ' (Status) and '
    + NOTES_COL + ' (Notes). This script must never write to them.');

  // The three properties this script reads. Any of them missing is silent at
  // runtime by design, so the health check is the only place it shows up.
  var props = PropertiesService.getScriptProperties();
  ['RECAPTCHA_SECRET', 'META_PIXEL_ID', 'META_CAPI_TOKEN', 'GHL_PIT']
    .forEach(function (key) {
      var v = (props.getProperty(key) || '').trim();
      Logger.log(key + ': ' + (v ? 'set, length ' + v.length : 'NOT SET'));
    });
  Logger.log('Booking is in GoHighLevel, location ' + GHL_LOCATION_ID
    + '. This script does not write to any calendar.');
}

/**
 * Writes one fake lead so you can see the whole path end to end without
 * touching the live site. Run it, then look at the Funnel Leads tab and
 * Alicia's inbox. Delete the row afterward.
 */
function sendTestLead() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var fake = {
    name: 'Test Lead (delete me)',
    email: 'seo@getproofpilot.com',
    phone: '(480) 555-0100',
    note: 'This is a test row written by sendTestLead().',
    matched: 'Kyla',
    goal: 'Calm, grounded, regulated',
    area: 'Postpartum and new parenthood',
    mode: 'Telehealth',
    timing: 'This week',
    fit: 'A balance',
    slot: '',   // booking happens in GoHighLevel now, not through this script
    utm_source: 'test',
    utm_medium: 'test',
    utm_campaign: 'test',
    utm_content: '',
    utm_term: '',
    click_id: '',
    referrer: 'manual run',
    landing_page: 'sendTestLead()'
  };
  writeLead(ss, new Date(), fake, '', 'TEST');
  sendNotification(fake, 'This is a TEST lead, not a real person.');
  pushToGhl_(fake);
  Logger.log('Test row written and email sent. Delete the sheet row when done, '
    + 'and delete the test contact in GoHighLevel.');
}

// The reCAPTCHA SECRET key is NOT in this file and never should be. This repo
// is public on GitHub, so a secret committed here is published to the world.
// It lives in the script's own Script Properties instead:
//   Apps Script editor > Project Settings (gear) > Script Properties
//   Property: RECAPTCHA_SECRET    Value: the secret key
// It is the SAME secret value as the contact form script, because both forms
// live on the same domain and therefore the same reCAPTCHA site. Two projects,
// one shared secret, entered separately in each.
/**
 * The private integration token is a SECRET and is not in this file. This repo
 * is public on GitHub, so a token committed here is published to the world. It
 * lives in Script Properties beside the others:
 *   Apps Script editor > Project Settings (gear) > Script Properties
 *   Property: GHL_PIT    Value: the location private integration token
 *
 * Leave it unset and the contact push simply does not run. Nothing else
 * breaks: the sheet row, Alicia's email, the grounding guide and the booking
 * widget are all independent of it.
 */
function getGhlToken() {
  var props = PropertiesService.getScriptProperties();
  return (props.getProperty('GHL_PIT') || '').trim();
}

function getSecret() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('RECAPTCHA_SECRET') || '';
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  var token = p.recaptchaToken || '';
  var honeypot = p.website || '';
  var ts = new Date();

  // Everything the funnel sends, gathered once so every branch below writes
  // the identical shape and no field can go missing on one path only.
  var lead = {
    name: p.name || '',
    email: p.email || '',
    phone: p.phone || '',
    note: p.note || '',
    matched: p.matched || '',
    goal: p.goal || '',
    area: p.area || '',
    mode: p.mode || '',
    timing: p.timing || '',
    fit: p.fit || '',
    slot: p.slot || '',
    utm_source: p.utm_source || '',
    utm_medium: p.utm_medium || '',
    utm_campaign: p.utm_campaign || '',
    utm_content: p.utm_content || '',
    utm_term: p.utm_term || '',
    click_id: p.click_id || '',
    referrer: p.referrer || '',
    landing_page: p.landing_page || ''
  };

  var ss = SpreadsheetApp.openById(SHEET_ID);

  // 1. Honeypot. The "website" field is hidden from real people by CSS, so
  // anything in it means a bot filled every field it could find.
  if (honeypot) {
    logBlocked(ss, ts, 'honeypot', lead);
    return ok();
  }

  // 2. No token at all means this did not come from the funnel. Real
  // submissions always carry one, even when reCAPTCHA fails to load. This is
  // the rule that kills scripted POSTs sent straight to this URL.
  if (!token) {
    logBlocked(ss, ts, 'no token', lead);
    return ok();
  }

  // 2.5 No way to reach them is not a lead. This must sit ABOVE every branch
  // that writes to Funnel Leads, including the two fail-open reCAPTCHA paths
  // below. Otherwise an unreachable Google turns each contactless submission
  // into an inbox notification Alicia cannot act on. Placed after the honeypot
  // and no-token checks on purpose, so Funnel Blocked stays honest: bots still
  // log as 'honeypot' and 'no token', and only genuine-looking submissions
  // missing contact info get this reason.
  //
  // This is a backstop. The real fix is the client-side guard in
  // funnel-demo/index.html, which stops the POST before it happens. If rows
  // start appearing here, that guard has regressed.
  if (!lead.email && !lead.phone) {
    logBlocked(ss, ts, 'no contact info', lead);
    return ok();
  }

  // 3. The funnel sends this when reCAPTCHA could not run at all - usually a
  // privacy extension blocking Google, which is a real slice of a therapy
  // practice's audience. Let it through, flagged, rather than lose a real
  // person who just finished a five-step quiz.
  if (token === 'UNAVAILABLE') {
    writeLead(ss, ts, lead, '', 'UNVERIFIED');
    sendNotification(lead,
      'reCAPTCHA did not run for this visitor, so this one is unverified.');
    return ok();
  }

  // 4. Ask Google how human this looks.
  var verdict = verifyRecaptcha(token);

  if (verdict.errored) {
    // Google's verification service did not answer. Fail OPEN on purpose, so
    // an outage on their end never costs Alicia a real inquiry. The reason
    // rides along in the status cell. If EVERY row says this, it is not a
    // Google outage, it is this script - check authorization.
    writeLead(ss, ts, lead, '',
      'UNVERIFIED: ' + (verdict.why || 'unknown'));
    sendNotification(lead,
      'reCAPTCHA could not be reached (' + (verdict.why || 'unknown')
      + '), so this one is unverified.');
    return ok();
  }

  if (!verdict.success) {
    // Token was forged, replayed, or expired.
    logBlocked(ss, ts, 'failed: ' + verdict.errorCodes, lead);
    return ok();
  }

  // Google returns the action the token was minted for. Checking it stops
  // someone lifting a valid token from the website contact form and replaying
  // it here.
  if (verdict.action !== EXPECTED_ACTION) {
    logBlocked(ss, ts, 'wrong action: ' + verdict.action, lead);
    return ok();
  }

  // Same idea for the domain the token was solved on.
  if (verdict.hostname && ALLOWED_HOSTS.indexOf(verdict.hostname) === -1) {
    logBlocked(ss, ts, 'wrong host: ' + verdict.hostname, lead);
    return ok();
  }

  var score = verdict.score;

  if (score < SCORE_THRESHOLD) {
    // Looks automated. Keep it in the sheet so nothing is lost, but keep it
    // out of Alicia's inbox.
    writeLead(ss, ts, lead, score, 'SPAM?');
    return ok();
  }

  // 5. Looks like a real person.
  //
  // Order matters. The sheet row and Alicia's email come first, because they
  // are the two things that must survive any outage anywhere else. The
  // GoHighLevel push and the Conversions API call are both wrapped and both
  // swallow their own failures, so neither can cost a lead.
  //
  // Only this branch pushes to GoHighLevel. A submission that failed reCAPTCHA
  // or scored as spam never reaches the CRM, which is the whole reason the
  // score check sits above this line.
  writeLead(ss, ts, lead, score, 'OK');
  sendNotification(lead, '');
  pushToGhl_(lead);
  sendCapiLead(lead, p, ts);
  return ok();
}

/**
 * Mirrors the browser pixel's Lead event server side.
 *
 * Wrapped so a Meta outage can never cost a lead: the sheet row and Alicia's
 * email are already written by the time this runs, and any failure here is
 * logged and swallowed.
 *
 * Deduplication: the funnel sends the same event_id to both the browser pixel
 * and here. Meta collapses the pair into one Lead. Without it every converted
 * visitor with a working pixel counts twice and cost per lead reads half what
 * it really is.
 */
function sendCapiLead(lead, p, ts) {
  try {
    var props = PropertiesService.getScriptProperties();
    var pixelId = props.getProperty('META_PIXEL_ID') || '';
    var token = props.getProperty('META_CAPI_TOKEN') || '';
    if (!pixelId || !token) return;  // not configured yet

    var user = {};
    if (lead.email) user.em = [sha256(lead.email.toLowerCase())];
    if (lead.phone) {
      // Meta wants digits only, country code included. US numbers from this
      // funnel arrive as (480) 555-0134, so prepend 1 when it is a bare 10.
      var digits = lead.phone.replace(/\D/g, '');
      if (digits.length === 10) digits = '1' + digits;
      if (digits) user.ph = [sha256(digits)];
    }
    if (lead.name) {
      var parts = lead.name.trim().split(/\s+/);
      user.fn = [sha256(parts[0].toLowerCase())];
      if (parts.length > 1) {
        user.ln = [sha256(parts[parts.length - 1].toLowerCase())];
      }
    }
    // fbc is what ties this Lead back to the specific ad click. Meta's format
    // is fb.1.<click timestamp ms>.<fbclid>.
    if (lead.click_id) {
      user.fbc = 'fb.1.' + ts.getTime() + '.' + lead.click_id;
    }
    if (p.fbp) user.fbp = p.fbp;
    if (p.client_user_agent) user.client_user_agent = p.client_user_agent;

    var payload = {
      data: [{
        event_name: 'Lead',
        event_time: Math.floor(ts.getTime() / 1000),
        event_id: p.event_id || '',
        event_source_url: lead.landing_page || '',
        action_source: 'website',
        user_data: user,
        // content_category used to carry lead.area, the person's presenting
        // concern, beside a hashed email, phone and name. That is health
        // information about an identified person, named directly in Meta's
        // prohibited-information rules, which apply to the Conversions API
        // exactly as they do to the browser pixel. Enforcement is at the
        // domain level and ends with Lead blocked from optimization outright.
        // The matching strip is in funnel-demo/index.html. Do not add it back
        // in either place.
        custom_data: {
          content_name: 'Find Your Therapist funnel',
          matched_therapist: lead.matched || ''
        }
      }]
    };

    var url = 'https://graph.facebook.com/' + CAPI_VERSION + '/'
      + pixelId + '/events?access_token=' + encodeURIComponent(token);

    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      Logger.log('CAPI ' + res.getResponseCode() + ': '
        + res.getContentText().slice(0, 300));
    }
  } catch (err) {
    // Never let ad measurement break lead capture.
    Logger.log('CAPI threw: ' + String(err).slice(0, 200));
  }
}

/** Lowercase hex SHA-256, the only hash Meta accepts for user_data. */
function sha256(str) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/**
 * Calls Google's siteverify endpoint.
 * Returns { success, score, action, hostname, errorCodes, errored }.
 */
function verifyRecaptcha(token) {
  try {
    // Missing secret must fail OPEN, not closed. If this returned a plain
    // failure instead, Google would answer invalid-input-secret for every
    // submission and the script would silently block every real inquiry.
    var secret = getSecret();
    if (!secret) {
      return { errored: true, why: 'no RECAPTCHA_SECRET script property' };
    }

    var res = UrlFetchApp.fetch(VERIFY_URL, {
      method: 'post',
      payload: { secret: secret, response: token },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      return { errored: true, why: 'HTTP ' + res.getResponseCode() };
    }

    var body = JSON.parse(res.getContentText());
    return {
      success: body.success === true,
      score: typeof body.score === 'number' ? body.score : 0,
      action: body.action || '',
      hostname: body.hostname || '',
      errorCodes: (body['error-codes'] || []).join(', '),
      errored: false
    };
  } catch (err) {
    // Most likely cause the first time this runs: the script's saved OAuth
    // grant has no external-request scope, because the project never called
    // UrlFetchApp before. Open the editor, Run checkSetup once, accept the
    // prompt, then redeploy. The message is carried into the sheet rather
    // than swallowed so a silent failure like that is visible, not guessed at.
    return { errored: true, why: String(err).slice(0, 120) };
  }
}

/**
 * Returns the Funnel Leads tab, creating it with headers the first time.
 * Safe to call on every request - it only writes headers when row 1 is empty,
 * so it never stomps a header Alicia has renamed.
 */
function ensureSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TAB);
  }
  if (!sheet.getRange(1, 1).getValue()) {
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLS.length).setFontWeight('bold');
  }
  return sheet;
}

/**
 * Appends one lead.
 *
 * Status (F) and Notes (G) are written as empty strings on a NEW row only,
 * which is correct - a brand new lead has no triage yet. Because this only
 * ever appends, it can never reach back and clear a row Alicia has already
 * worked. Do not change this to an update-in-place without re-reading that
 * sentence.
 */
function writeLead(ss, ts, lead, score, status) {
  var sheet = ensureSheet(ss);

  var row = [
    ts,
    lead.name,
    lead.email,
    lead.phone,
    lead.matched,
    '',                  // F Status - Alicia's
    '',                  // G Notes  - Alicia's
    lead.note,
    lead.goal,
    lead.area,
    lead.mode,
    lead.timing,
    lead.fit,
    lead.slot,
    lead.utm_source,
    lead.utm_medium,
    lead.utm_campaign,
    lead.utm_content,
    lead.utm_term,
    lead.click_id,
    lead.referrer,
    lead.landing_page,
    score,
    status
  ];

  sheet.appendRow(row);
}

/**
 * Blocked attempts go to their own tab, not the leads tab, so the leads sheet
 * stays clean. Check this tab to see how much is being stopped and to confirm
 * nothing real is getting caught.
 */
function logBlocked(ss, ts, reason, lead) {
  var sheet = ss.getSheetByName(BLOCKED_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(BLOCKED_TAB);
    sheet.appendRow(['Timestamp', 'Reason', 'Name', 'Email', 'Phone',
      'What They Said', 'Source']);
  }
  sheet.appendRow([ts, reason, lead.name, lead.email, lead.phone,
    lead.note, lead.utm_source]);
}

/**
 * The notification Alicia actually reads. Written as a briefing, not a field
 * dump, because she is reading it on a phone between sessions and the only
 * things that matter in the first three lines are who this is, who they
 * matched with, and how soon they want to start.
 */
function sendNotification(lead, prefix) {
  var who = lead.name || 'Someone';
  var matched = lead.matched || 'the team';

  var body = '';
  if (prefix) {
    body += prefix + '\n\n';
  }

  body += who + ' came through the Find Your Therapist funnel'
    + ' and matched with ' + matched + '.\n\n';

  body += 'Wants to start: ' + (lead.timing || 'not said') + '\n';
  body += 'Email: ' + lead.email + '\n';
  body += 'Phone: ' + lead.phone + '\n';
  // Whether they went on to book is not knowable here: this email is sent the
  // moment the lead lands, one screen before the booking widget. If they book,
  // GoHighLevel emails the appointment separately. If no appointment email
  // arrives, nobody picked a time and she reaches out.
  body += 'Booking: check GoHighLevel. This email is sent before they pick a'
    + ' time, so it can never tell you.\n';

  body += '\nWhat they told the quiz\n';
  body += '  Hoping for more: ' + (lead.goal || '-') + '\n';
  body += '  Wants to work on: ' + (lead.area || '-') + '\n';
  body += '  In person or telehealth: ' + (lead.mode || '-') + '\n';
  body += '  What matters most: ' + (lead.fit || '-') + '\n';

  if (lead.note) {
    body += '\nIn their words\n  ' + lead.note + '\n';
  }

  // Kept at the bottom on purpose. Alicia does not need it, but it is the
  // line that tells us which ad paid for this lead when we report on spend.
  if (lead.utm_source || lead.utm_campaign) {
    body += '\nCame from: ' + (lead.utm_source || 'unknown')
      + (lead.utm_campaign ? ' / ' + lead.utm_campaign : '') + '\n';
  }

  body += '\nFull details are on the Funnel Leads tab of your leads sheet.';

  MailApp.sendEmail({
    to: NOTIFY_TO,
    cc: NOTIFY_CC,
    // One subject line now. The old one shouted ACTION NEEDED when a calendar
    // hold failed; there is no calendar hold here any more, and guessing at a
    // booking outcome this function cannot see is exactly the mistake the rest
    // of this rebuild is undoing.
    subject: 'New funnel lead: ' + who + ' matched with ' + matched,
    body: body
  });

  // Hooked in here rather than at the three places a lead is accepted, so a
  // future edit to any one of those branches cannot silently stop the guide
  // going out. Every path that tells Alicia about a person now also tells the
  // person something.
  //
  // Wrapped because Alicia's notification has already left and the row is
  // already on the sheet. A bad address or a quota ceiling must never take
  // down the message that tells her someone is waiting.
  try {
    sendGuideEmail_(lead);
  } catch (err) {
    Logger.log('guide email failed: ' + String(err).slice(0, 200));
  }
}

/**
 * Puts the lead into GoHighLevel as a contact, one screen before they reach
 * the booking widget's own form.
 *
 * Upsert, not create: it dedupes on email and phone, so someone who comes back
 * through the funnel a second time is the same contact rather than a duplicate
 * that splits their history in two. The booking widget dedupes onto this same
 * record when they book, which is what ties an appointment back to the ad that
 * paid for it.
 *
 * WHAT IS DELIBERATELY NOT SENT: the quiz answers. goal, area, mode, fit and
 * their note are why this person is reaching out, which is health information
 * about a named individual. That stays in Alicia's sheet and Alicia's inbox,
 * which are her systems. GoHighLevel gets what routing and follow-up need and
 * nothing more. Do not widen this payload without asking.
 *
 * Wrapped so a GoHighLevel outage can never cost a lead: the sheet row and the
 * email are already written by the time this runs, and any failure here is
 * logged and swallowed.
 */
function pushToGhl_(lead) {
  try {
    var token = getGhlToken();
    if (!token) {
      Logger.log('GHL: no GHL_PIT script property set, skipping contact push.');
      return;
    }

    var parts = String(lead.name || '').trim().split(/\s+/);
    var first = parts.shift() || '';
    var last = parts.join(' ');

    var body = {
      locationId: GHL_LOCATION_ID,
      firstName: first,
      lastName: last,
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.utm_source
        ? ('Find Your Therapist funnel / ' + lead.utm_source)
        : 'Find Your Therapist funnel',
      tags: ['funnel-lead', 'matched-' + String(lead.matched || 'unknown').toLowerCase()]
    };

    // Ad metadata, not health data. It rides on the contact so a booking can
    // be costed back to a campaign without anyone reopening the sheet.
    var attribution = {};
    if (lead.utm_source)   attribution.utmSource = lead.utm_source;
    if (lead.utm_medium)   attribution.utmMedium = lead.utm_medium;
    if (lead.utm_campaign) attribution.campaign = lead.utm_campaign;
    if (lead.utm_content)  attribution.utmContent = lead.utm_content;
    if (lead.utm_term)     attribution.utmTerm = lead.utm_term;
    if (lead.click_id)     attribution.fbclid = lead.click_id;
    if (lead.referrer)     attribution.referrer = lead.referrer;
    if (lead.landing_page) attribution.url = lead.landing_page;
    if (Object.keys(attribution).length) {
      body.attributionSource = attribution;
    }

    var res = UrlFetchApp.fetch(GHL_API + '/contacts/upsert', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        Version: GHL_VERSION
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    // The status only. The response body echoes the contact back with name,
    // email and phone in it, and that does not belong in an execution log.
    Logger.log('GHL upsert: HTTP ' + code);
    if (code >= 300) {
      Logger.log('GHL upsert did not succeed. Check the PIT scopes and the '
        + 'location id. The lead is safe: it is on the sheet and Alicia has '
        + 'been emailed.');
    }
  } catch (err) {
    Logger.log('GHL upsert threw: ' + String(err).slice(0, 200));
  }
}

/**
 * The first thing this backend has ever sent to the person who filled the
 * funnel out. Until this existed, the final screen told them "your free
 * grounding guide is on its way, check your inbox in a few minutes" and
 * nothing was ever sent to anybody. That promise was broken for every lead.
 *
 * This email goes out the moment the lead lands, which is one screen BEFORE
 * the booking widget. So it cannot know whether they picked a time, and its
 * copy has to read correctly either way. It never says booked and it never
 * says she will call, because one of those is wrong for half the people who
 * receive it. GoHighLevel sends the appointment confirmation separately.
 *
 * Their quiz answers are NOT in this email. That is mental health inquiry
 * information, and it does not belong in an inbox that might be shared or in
 * a thread that gets forwarded. Alicia's notification carries the detail.
 */
function sendGuideEmail_(lead) {
  // Email is optional on the funnel. Someone can leave a phone number
  // instead, and that is a real lead, not an error. Nothing to send.
  if (!lead.email) {
    return;
  }

  var first = (lead.name || '').split(' ')[0] || 'there';
  var matched = lead.matched || 'one of us';

  var subject = 'Your grounding guide, and what happens next';

  var body = 'Hi ' + first + ',\n\n'
    + 'Thank you for taking the time with those questions. Based on what '
    + 'you shared, ' + matched + ' is the better fit to start with.\n\n'
    + 'If you picked a time for your consult, it is confirmed and the details '
    + 'are in a separate email. If you did not, ' + matched + ' will reach out '
    + 'within one business day to find one that works.\n\n'
    + 'While you wait, here is your grounding guide. Five things you can do '
    + 'tonight with nothing but your own body and the room you are sitting '
    + 'in. Take the one that sounds least annoying and leave the rest.\n\n'
    + GUIDE_URL + '\n\n'
    + 'If anything comes up before you hear from us, you can reach us at '
    + '(480) 771-2181.\n\n'
    + 'Warmly,\n'
    + 'The Wild Within\n'
    + 'Alicia Wright, MA, MSW, LCSW, Mesa, Arizona';

  var html = ''
    + '<div style="font-family:Georgia,serif;font-size:16px;line-height:1.7;'
    + 'color:#2B2430;max-width:520px">'
    + '<p>Hi ' + escapeHtml_(first) + ',</p>'
    + '<p>Thank you for taking the time with those questions. Based on what '
    + 'you shared, <strong>' + escapeHtml_(matched) + '</strong> is the '
    + 'better fit to start with, and she will reach out within one business '
    + 'day to find a time.</p>'
    + '<p>While you wait, here is your grounding guide. Five things you can '
    + 'do tonight with nothing but your own body and the room you are '
    + 'sitting in. Take the one that sounds least annoying and leave the '
    + 'rest.</p>'
    + '<p style="margin:26px 0">'
    + '<a href="' + GUIDE_URL + '" style="background:#4A2848;color:#FAF7F2;'
    + 'font-family:Helvetica,Arial,sans-serif;font-size:13px;'
    + 'letter-spacing:.12em;text-transform:uppercase;text-decoration:none;'
    + 'padding:15px 30px;border-radius:999px;display:inline-block">'
    + 'A place to land</a></p>'
    + '<p>If anything comes up before you hear from us, you can reach us at '
    + '<a href="tel:+14807712181" style="color:#6B3560">(480) 771-2181</a>.'
    + '</p>'
    + '<p style="margin-top:26px">Warmly,<br>The Wild Within<br>'
    + '<span style="color:#6E6472;font-size:14px">Alicia Wright, MA, MSW, '
    + 'LCSW, Mesa, Arizona</span></p>'
    + '</div>';

  // GmailApp, not MailApp, because only GmailApp accepts a from address, and
  // this has to look like it came from the practice. Google rejects the from
  // unless SEND_AS is a verified alias on the account that owns this project,
  // so the failure is caught and the mail goes anyway from the owning account
  // with Reply-To pointed at her. A lead never waits on a settings screen.
  try {
    GmailApp.sendEmail(lead.email, subject, body, {
      from: SEND_AS,
      name: 'The Wild Within',
      replyTo: SEND_AS,
      htmlBody: html
    });
  } catch (err) {
    Logger.log('send-as alias not active yet, falling back. ' + err);
    MailApp.sendEmail({
      to: lead.email,
      replyTo: SEND_AS,
      name: 'The Wild Within',
      subject: subject,
      body: body,
      htmlBody: html
    });
  }
}

/**
 * Their name goes into an HTML email, so it gets escaped. A name carrying an
 * apostrophe or a stray angle bracket must never break the markup, and pasted
 * input must never be able to inject a tag.
 */
function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Proves the from address is actually working. Run it, then look at the
 * inbox it names. If the mail arrives showing The Wild Within, the alias is
 * live. If it shows the ProofPilot account, the alias link has not been
 * clicked yet and the fallback ran. The execution log says which.
 */
function testGuideEmail() {
  sendGuideEmail_({
    name: 'Test Person',
    email: NOTIFY_CC,
    matched: 'Kyla'
  });
  Logger.log('Guide email sent to ' + NOTIFY_CC
    + '. Check who it says it is from.');
}

/**
 * Always returns the same response, whether the submission was accepted or
 * dropped. Spammers get no signal to tune against, and the funnel shows its
 * thank-you screen either way.
 */
function ok() {
  var out = JSON.stringify({ ok: true });
  var mime = ContentService.MimeType.JSON;
  return ContentService.createTextOutput(out)
    .setMimeType(mime);
}

function doGet() {
  return ContentService.createTextOutput('OK');
}
