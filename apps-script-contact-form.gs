/**
 * Wild Within - contact form backend
 * Receives the website contact form, verifies reCAPTCHA v3,
 * writes the lead to the "Wild Within Leads" sheet, emails a notification.
 * Deploy as a Web app, Execute as Me, Who has access: Anyone.
 * Short lines on purpose so editor paste never wrap-breaks a string.
 *
 * SPAM HANDLING - read this before changing thresholds:
 * Nothing is silently thrown away except requests with no reCAPTCHA token
 * at all (those are bots hitting this URL directly, never a real person).
 * Everything else lands in a sheet with its score so you can see the real
 * distribution. Low scores just skip the email. A missed therapy inquiry
 * costs far more than a spam email, so this errs toward letting through
 * and flagging rather than blocking.
 */

var SHEET_ID = '1I3uNqimh1qv_aZRR3Zyp_WIjR--2A0rodtmvBWHGnnM';
var SHEET_TAB = 'Wild Within Leads';
var BLOCKED_TAB = 'Blocked';
var NOTIFY_TO = 'thewildwithin.therapy@gmail.com';
var NOTIFY_CC = 'seo@getproofpilot.com';

// The reCAPTCHA v3 SECRET key goes here, but ONLY in the live Apps Script
// editor - never in this file. This repo is public on GitHub, so a secret
// committed here is a secret published to the world. Leave the placeholder
// in the repo copy and paste the real value straight into the script project.
// If it ever does get committed, treat it as burned and roll it in the
// reCAPTCHA admin console.
var RECAPTCHA_SECRET = 'PASTE_SECRET_KEY_HERE';

// Scores run 0.0 (almost certainly a bot) to 1.0 (almost certainly human).
// At or above this, the lead emails Alicia normally.
// Below it, the lead still lands in the sheet but is flagged and not emailed.
// Start at 0.5. Watch the Score column for a week, then tune.
var SCORE_THRESHOLD = 0.5;

var VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// Domains a token is allowed to have been solved on. Add localhost here
// only while testing, and take it back out afterward.
var ALLOWED_HOSTS = [
  'thewildwithintherapy.com',
  'www.thewildwithintherapy.com'
];

function doPost(e) {
  var p = (e && e.parameter) || {};
  var name = p.name || '';
  var email = p.email || '';
  var phone = p.phone || '';
  var message = p.message || '';
  var token = p.recaptchaToken || '';
  var honeypot = p.website || '';
  var ts = new Date();

  var ss = SpreadsheetApp.openById(SHEET_ID);

  // 1. Honeypot. The "website" field is hidden from real people by CSS,
  // so anything in it means a bot filled every field it could find.
  if (honeypot) {
    logBlocked(ss, ts, 'honeypot', name, email, phone, message);
    return ok();
  }

  // 2. No token at all means this did not come from the website form.
  // Real submissions always carry one, even when reCAPTCHA fails to load.
  // This is the rule that kills scripted POSTs sent straight to this URL.
  if (!token) {
    logBlocked(ss, ts, 'no token', name, email, phone, message);
    return ok();
  }

  // 3. The form sends this when reCAPTCHA could not run at all - usually a
  // privacy extension blocking Google, which is a real slice of a therapy
  // practice's audience. Let it through, flagged, rather than lose a real
  // person. If this ever gets abused, change this block to logBlocked and
  // those visitors will need to phone or email instead.
  if (token === 'UNAVAILABLE') {
    writeLead(ss, ts, name, email, phone, message, '', 'UNVERIFIED');
    sendNotification(name, email, phone, message,
      'reCAPTCHA did not run for this visitor, so this one is unverified.');
    return ok();
  }

  // 4. Ask Google how human this looks.
  var verdict = verifyRecaptcha(token);

  if (verdict.errored) {
    // Google's verification service did not answer. Fail OPEN on purpose,
    // so an outage on their end never costs Alicia a real inquiry.
    writeLead(ss, ts, name, email, phone, message, '', 'UNVERIFIED');
    sendNotification(name, email, phone, message,
      'reCAPTCHA could not be reached, so this one is unverified.');
    return ok();
  }

  if (!verdict.success) {
    // Token was forged, replayed, or expired.
    logBlocked(ss, ts, 'failed: ' + verdict.errorCodes,
      name, email, phone, message);
    return ok();
  }

  // Google returns the action the token was minted for. Checking it stops
  // someone lifting a valid token from elsewhere and replaying it here.
  if (verdict.action !== 'contact') {
    logBlocked(ss, ts, 'wrong action: ' + verdict.action,
      name, email, phone, message);
    return ok();
  }

  // Same idea for the domain the token was solved on.
  if (verdict.hostname && ALLOWED_HOSTS.indexOf(verdict.hostname) === -1) {
    logBlocked(ss, ts, 'wrong host: ' + verdict.hostname,
      name, email, phone, message);
    return ok();
  }

  var score = verdict.score;

  if (score < SCORE_THRESHOLD) {
    // Looks automated. Keep it in the sheet so nothing is lost,
    // but keep it out of Alicia's inbox.
    writeLead(ss, ts, name, email, phone, message, score, 'SPAM?');
    return ok();
  }

  // 5. Looks like a real person.
  writeLead(ss, ts, name, email, phone, message, score, 'OK');
  sendNotification(name, email, phone, message, '');
  return ok();
}

/**
 * Calls Google's siteverify endpoint.
 * Returns { success, score, errorCodes, errored }.
 */
function verifyRecaptcha(token) {
  try {
    var res = UrlFetchApp.fetch(VERIFY_URL, {
      method: 'post',
      payload: { secret: RECAPTCHA_SECRET, response: token },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      return { errored: true };
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
    return { errored: true };
  }
}

/**
 * Appends to the leads sheet.
 * Columns A-E match the original layout so old rows still line up.
 * F and G are new: the reCAPTCHA score and the verdict.
 */
function writeLead(ss, ts, name, email, phone, message, score, status) {
  var sheet = ss.getSheetByName(SHEET_TAB);
  sheet.appendRow([ts, name, email, phone, message, score, status]);
}

/**
 * Blocked attempts go to their own tab, not the leads tab, so the leads
 * sheet stays clean. Check this tab to see how much is being stopped and
 * to confirm nothing real is getting caught.
 */
function logBlocked(ss, ts, reason, name, email, phone, message) {
  var sheet = ss.getSheetByName(BLOCKED_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(BLOCKED_TAB);
    sheet.appendRow(['Timestamp', 'Reason', 'Name', 'Email',
      'Phone', 'Message']);
  }
  sheet.appendRow([ts, reason, name, email, phone, message]);
}

function sendNotification(name, email, phone, message, prefix) {
  var body = '';
  if (prefix) {
    body += prefix + '\n\n';
  }
  body += 'Name: ' + name
    + '\nEmail: ' + email
    + '\nPhone: ' + phone
    + '\nMessage: ' + message;

  MailApp.sendEmail({
    to: NOTIFY_TO,
    cc: NOTIFY_CC,
    subject: 'New Wild Within inquiry',
    body: body
  });
}

/**
 * Always returns the same response, whether the submission was accepted
 * or dropped. Spammers get no signal to tune against, and the website
 * shows its thank-you message either way.
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
