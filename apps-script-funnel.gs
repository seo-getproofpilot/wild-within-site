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
    slot: 'Thu 2:00 pm',
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
      'reCAPTCHA could not be reached, so this one is unverified.');
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
  writeLead(ss, ts, lead, score, 'OK');
  sendNotification(lead, '');
  return ok();
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
    subject: 'New funnel lead: ' + who + ' matched with ' + matched,
    body: body
  });
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
