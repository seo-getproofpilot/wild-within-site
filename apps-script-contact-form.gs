/**
 * Wild Within - contact form backend
 * Receives the website contact form, writes the lead to the
 * "Wild Within Leads" sheet (columns A-E), emails a notification.
 * Deploy as a Web app, Execute as Me, Who has access: Anyone.
 * Short lines on purpose so editor paste never wrap-breaks a string.
 */

var SHEET_ID = '1I3uNqimh1qv_aZRR3Zyp_WIjR--2A0rodtmvBWHGnnM';
var SHEET_TAB = 'Wild Within Leads';
var NOTIFY_TO = 'thewildwithin.therapy@gmail.com';
var NOTIFY_CC = 'seo@getproofpilot.com';

function doPost(e) {
  var p = (e && e.parameter) || {};
  var name = p.name || '';
  var email = p.email || '';
  var phone = p.phone || '';
  var message = p.message || '';
  var ts = new Date();

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TAB);
  sheet.appendRow([ts, name, email, phone, message]);

  var body = 'Name: ' + name
    + '\nEmail: ' + email
    + '\nPhone: ' + phone
    + '\nMessage: ' + message;

  MailApp.sendEmail({
    to: NOTIFY_TO,
    cc: NOTIFY_CC,
    subject: 'New Wild Within inquiry',
    body: body
  });

  var out = JSON.stringify({ ok: true });
  var mime = ContentService.MimeType.JSON;
  return ContentService.createTextOutput(out)
    .setMimeType(mime);
}

function doGet() {
  return ContentService.createTextOutput('OK');
}
