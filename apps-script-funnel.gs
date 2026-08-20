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
 * CONSULT BOOKING
 *
 * When a person picks one of the consult windows on the funnel, the backend
 * puts a real 30 minute event on the matched therapist's own Google Calendar
 * and invites them. That is the whole point: the consult exists before anyone
 * on the practice side has lifted a finger.
 *
 * THIS REQUIRES ONE THING FROM EACH THERAPIST, ONCE.
 * They each share their Google Calendar with the account that owns this
 * script (seo@getproofpilot.com) at "Make changes to events":
 *   Google Calendar > hover their calendar > Options > Settings and sharing
 *   > Share with specific people > Add people > seo@getproofpilot.com
 *   > Permissions: Make changes to events > Send
 *
 * Until they do, getCalendarById returns null, bookConsult_ logs it, and the
 * lead notification tells Alicia in plain words that the calendar hold did NOT
 * happen and she needs to reach out herself. Nothing is silently lost.
 *
 * Arizona does not observe daylight saving, so every time here is
 * America/Phoenix year round and must never be computed from the server's
 * default zone.
 */
var TZ = 'America/Phoenix';
var CONSULT_MINUTES = 30;

// Whose calendar each match writes to. Keys match the funnel's "matched"
// value, lowercased.
var THERAPIST_CALENDARS = {
  alicia: 'thewildwithin.therapy@gmail.com',
  kyla: 'Thewildwithin.therapy.Kyla@gmail.com'
};

/**
 * The windows Alicia and Kyla confirmed on 2026-08-18. These MUST stay in sync
 * with CONSULT_WINDOWS in funnel-demo/index.html, which is what a person sees.
 * The funnel sends the label as text, so this map turns "Wed - 1:00p" back
 * into a weekday and an hour.
 *
 * Kyla holds four a week and Alicia two. Twelve consults a week total is the
 * hard ceiling on what any amount of Meta spend can convert.
 */
var SLOT_MAP = {
  'Mon 9:00a':  { dow: 1, hour: 9,  min: 0 },
  'Wed 9:00a':  { dow: 3, hour: 9,  min: 0 },
  'Wed 1:00p':  { dow: 3, hour: 13, min: 0 },
  'Wed 7:00p':  { dow: 3, hour: 19, min: 0 },
  'Fri 5:00p':  { dow: 5, hour: 17, min: 0 },
  'Sun 5:00p':  { dow: 0, hour: 17, min: 0 }
};

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
    slot: 'Mon \u00b7 9:00a',   // a real Kyla window, so booking is exercised
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
  var booking = bookConsult_(fake, new Date());
  sendNotification(fake, 'This is a TEST lead, not a real person.', booking);
  Logger.log('booking result: ' + booking);
  Logger.log('Test row written and email sent. Delete the row when done.');
}

// The reCAPTCHA SECRET key is NOT in this file and never should be. This repo
// is public on GitHub, so a secret committed here is published to the world.
// It lives in the script's own Script Properties instead:
//   Apps Script editor > Project Settings (gear) > Script Properties
//   Property: RECAPTCHA_SECRET    Value: the secret key
// It is the SAME secret value as the contact form script, because both forms
// live on the same domain and therefore the same reCAPTCHA site. Two projects,
// one shared secret, entered separately in each.
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
  // Book BEFORE notifying, so the outcome of the calendar write is in the
  // email Alicia reads. If it is done afterwards she gets told about a lead,
  // then separately has to work out whether the hold actually happened.
  //
  // Only this branch books. A submission that failed reCAPTCHA or scored as
  // spam never reaches a therapist's calendar, which is the whole reason the
  // score check sits above this line.
  var booking = bookConsult_(lead, ts);
  writeLead(ss, ts, lead, score, 'OK');
  sendNotification(lead, '', booking);
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
        custom_data: {
          content_name: 'Find Your Therapist funnel',
          content_category: lead.area || '',
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
function sendNotification(lead, prefix, booking) {
  var who = lead.name || 'Someone';
  var matched = lead.matched || 'the team';

  var body = '';
  if (prefix) {
    body += prefix + '\n\n';
  }

  body += who + ' came through the Find Your Therapist funnel'
    + ' and matched with ' + matched + '.\n\n';

  // The booking outcome goes at the very top, above everything else, because
  // it is the only line that might need her to do something today. Anything
  // other than a clean booking is written in plain words, not a code, so it
  // reads correctly on a phone between sessions.
  if (booking) {
    body += booking + '\n\n';
  }

  body += 'Wants to start: ' + (lead.timing || 'not said') + '\n';
  body += 'Email: ' + lead.email + '\n';
  body += 'Phone: ' + lead.phone + '\n';
  if (lead.slot) {
    body += 'Asked for: ' + lead.slot + '\n';
  }

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
    // A failed hold is shouted in the subject. Alicia reads these on a phone
    // between sessions, and a booking that did not happen is the one case
    // where she has to act the same day.
    subject: (booking && /NOT|ALREADY|COULD NOT|ERROR/.test(booking)
        ? 'ACTION NEEDED, funnel lead: '
        : 'New funnel lead: ')
      + who + ' matched with ' + matched,
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
 * Puts the consult on the matched therapist's calendar and invites the person.
 *
 * Returns a plain-language string describing what happened, which goes into
 * Alicia's notification. She must never have to guess whether the hold is real.
 *
 * Deliberately conservative in three places:
 *
 *  1. If the therapist's calendar is not shared with this account yet,
 *     getCalendarById returns null. Say so loudly rather than throwing.
 *  2. If something already sits in that window, do NOT double book. Two
 *     strangers arriving for the same 30 minutes is worse than a slot going
 *     unbooked, so the event is skipped and Alicia is told to reach out.
 *  3. Nothing about why they are coming goes in the event. Their answers are
 *     mental health inquiry information and a calendar entry is visible to
 *     anyone they share a screen with. Name and contact only.
 */
function bookConsult_(lead, ts) {
  if (!lead.slot) {
    return 'No time picked, so nothing was scheduled.';
  }

  var key = String(lead.matched || '').toLowerCase().trim();
  var calId = THERAPIST_CALENDARS[key];
  if (!calId) {
    return 'CALENDAR NOT SET: no calendar mapped for "' + lead.matched + '".';
  }

  // The funnel sends the label with a middot between day and time. Normalize
  // to the plain "Wed 1:00p" shape SLOT_MAP is keyed on.
  var label = String(lead.slot).replace(/·|&middot;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  var slot = SLOT_MAP[label];
  if (!slot) {
    return 'COULD NOT READ THE TIME "' + lead.slot + '". Please reach out directly.';
  }

  var cal;
  try {
    cal = CalendarApp.getCalendarById(calId);
  } catch (err) {
    return 'CALENDAR ERROR: ' + String(err).slice(0, 120);
  }
  if (!cal) {
    return 'CALENDAR NOT SHARED YET: ' + calId + ' has not given this script '
      + 'edit access, so NOTHING was scheduled. Please reach out to book this '
      + 'one yourself.';
  }

  var start = nextOccurrence_(slot, ts);
  var end = new Date(start.getTime() + CONSULT_MINUTES * 60 * 1000);
  var pretty = Utilities.formatDate(start, TZ, "EEEE, MMMM d 'at' h:mm a");

  // Never double book. A slot already taken means a human decides, not us.
  var clash = cal.getEvents(start, end);
  if (clash && clash.length) {
    return 'ALREADY TAKEN: ' + pretty + ' was picked but something is already '
      + 'on the calendar then, so NOTHING was scheduled. Please offer another '
      + 'time.';
  }

  var first = (lead.name || 'Consult').split(' ')[0];
  var options = {
    description: 'Free 30 minute consult booked through the Find Your '
      + 'Therapist funnel.\n\n'
      + 'Name: ' + (lead.name || '') + '\n'
      + 'Email: ' + (lead.email || '') + '\n'
      + 'Phone: ' + (lead.phone || '') + '\n\n'
      + 'What they are seeking is on the Funnel Leads tab. It is kept off this '
      + 'invite on purpose.',
    location: 'Telehealth or Mesa office'
  };
  if (lead.email) {
    options.guests = lead.email;
    options.sendInvites = true;
  }

  try {
    cal.createEvent('Consult: ' + first + ' (The Wild Within)', start, end, options);
  } catch (err) {
    return 'COULD NOT CREATE THE EVENT for ' + pretty + ': '
      + String(err).slice(0, 120) + '. Please reach out directly.';
  }

  return 'Booked ' + pretty + ' on ' + (lead.matched || '') + "'s calendar"
    + (lead.email ? ', and the invite went to ' + lead.email + '.' : '.');
}

/**
 * The next time this weekday and hour comes around in Arizona, always in the
 * future. A window whose moment has already passed this week rolls to next
 * week rather than booking something in the past.
 *
 * Built by formatting into America/Phoenix rather than by using the server's
 * clock, because Apps Script runs wherever Google feels like and Arizona never
 * shifts for daylight saving.
 */
function nextOccurrence_(slot, from) {
  var cursor = new Date(from.getTime());
  for (var i = 0; i < 15; i++) {
    var dow = Number(Utilities.formatDate(cursor, TZ, 'u')) % 7; // 1=Mon..7=Sun -> 0=Sun
    if (dow === slot.dow) {
      var ymd = Utilities.formatDate(cursor, TZ, 'yyyy-MM-dd');
      var hh = ('0' + slot.hour).slice(-2);
      var mm = ('0' + slot.min).slice(-2);
      // Arizona is UTC-7 all year. No DST, so the offset is safe to pin.
      var candidate = new Date(ymd + 'T' + hh + ':' + mm + ':00-07:00');
      if (candidate.getTime() > from.getTime() + 60 * 60 * 1000) {
        return candidate;
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  // Unreachable in practice. Falls back to a week out rather than throwing.
  return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * The first thing this backend has ever sent to the person who filled the
 * funnel out. Until this existed, the final screen told them "your free
 * grounding guide is on its way, check your inbox in a few minutes" and
 * nothing was ever sent to anybody. That promise was broken for every lead.
 *
 * Deliberately does NOT say the consult is booked. The funnel's booking step
 * is still cosmetic: it tells them they are booked while creating no calendar
 * event and notifying no one. Repeating that claim in writing would put the
 * same false confirmation in two places and make it harder to walk back. When
 * real booking ships, this copy changes with it.
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
    + 'you shared, ' + matched + ' is the better fit to start with, and she '
    + 'will reach out within one business day to find a time.\n\n'
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
