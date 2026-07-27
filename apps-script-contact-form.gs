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

// The reCAPTCHA SECRET key is NOT in this file and never should be. This repo
// is public on GitHub, so a secret committed here is published to the world.
// It lives in the script's own Script Properties instead:
//   Apps Script editor > Project Settings (gear) > Script Properties
//   Property: RECAPTCHA_SECRET    Value: the secret key
// That means this file is identical to what runs live, so updating the backend
// is now a plain copy-paste of the whole file with nothing to re-substitute.
// If the secret ever does get committed, treat it as burned and roll it in the
// reCAPTCHA admin console.
function getSecret() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('RECAPTCHA_SECRET') || '';
}

// Scores run 0.0 (almost certainly a bot) to 1.0 (almost certainly human).
// At or above this, the lead emails Alicia normally.
// Below it, the lead still lands in the sheet but is flagged and not emailed.
// Start at 0.5. Watch the Score column for a week, then tune.
var SCORE_THRESHOLD = 0.5;

var VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// The leads sheet already had columns A-G in use before reCAPTCHA existed:
// A-E are the submission itself, F is Alicia's manual Status dropdown and
// G is her Notes. Do NOT write into F or G - a score landing in her Status
// column breaks the data validation and her triage workflow. The two new
// columns go after hers. If the sheet layout ever changes, fix these two
// numbers and nothing else.
var SCORE_COL = 8;   // H
var STATUS_COL = 9;  // I
var LAST_LEAD_COL = 9;

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
    // The reason rides along in the status cell. If EVERY row says this,
    // it is not a Google outage, it is this script - check authorization.
    writeLead(ss, ts, name, email, phone, message, '',
      'UNVERIFIED: ' + (verdict.why || 'unknown'));
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
    // UrlFetchApp before. Open the editor, Run any function once, accept the
    // prompt, then redeploy. The message is carried into the sheet rather
    // than swallowed so a silent failure like that is visible, not guessed at.
    return { errored: true, why: String(err).slice(0, 120) };
  }
}

/**
 * Appends to the leads sheet.
 * A-E are the submission. F and G are deliberately left blank because they
 * belong to Alicia (Status dropdown and Notes). The score and verdict go
 * in H and I. Headers are written once if they are not already there.
 */
function writeLead(ss, ts, name, email, phone, message, score, status) {
  var sheet = ss.getSheetByName(SHEET_TAB);

  if (!sheet.getRange(1, SCORE_COL).getValue()) {
    sheet.getRange(1, SCORE_COL).setValue('reCAPTCHA Score');
  }
  if (!sheet.getRange(1, STATUS_COL).getValue()) {
    sheet.getRange(1, STATUS_COL).setValue('Spam Check');
  }

  var row = new Array(LAST_LEAD_COL);
  for (var i = 0; i < LAST_LEAD_COL; i++) {
    row[i] = '';
  }
  row[0] = ts;
  row[1] = name;
  row[2] = email;
  row[3] = phone;
  row[4] = message;
  row[SCORE_COL - 1] = score;
  row[STATUS_COL - 1] = status;

  sheet.appendRow(row);
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

/**
 * Health check. Run this from the editor any time the form seems off, then
 * read the Execution log. It proves the three things that can silently break
 * this backend, without needing a real form submission:
 *   1. the secret is present (length only - never log the value itself)
 *   2. UrlFetchApp can actually reach Google, which is what fails when the
 *      script has not been authorized for external requests
 *   3. the leads sheet still has the column layout this code writes into
 * A deliberately invalid token is expected to come back success=false with
 * invalid-input-response. That is the PASS case - it means the round trip
 * worked. errored=true is the FAIL case.
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

  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
  var headers = sheet.getRange(1, 1, 1, LAST_LEAD_COL).getValues()[0];
  Logger.log('headers: ' + headers.join(' | '));
  Logger.log('score goes in col ' + SCORE_COL
    + ', verdict in col ' + STATUS_COL
    + ' (must not disturb Status and Notes)');
}
