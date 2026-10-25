/**
 * TdevKuantum - E-posta Servisi
 * Destek: tdevkuantum.official@gmail.com
 *
 * Script Properties:
 * APPS_SCRIPT_TOKEN = aynı gizli token, Back4App Config içindeki APPS_SCRIPT_TOKEN ile birebir eşleşmeli.
 *
 * Dağıtım: Deploy > Manage deployments > Edit > New version > Deploy.
 * Web app erişimi, Back4App Cloud Code'un URL'ye istek atabileceği şekilde ayarlanmalıdır.
 */

const APP_NAME = 'TdevKuantum';
const SUPPORT_EMAIL = 'tdevkuantum.official@gmail.com';
const TOKEN_PROPERTY = 'APPS_SCRIPT_TOKEN';

function doGet() {
  return jsonResponse({
    success: true,
    service: APP_NAME + ' Email Service',
    configured: Boolean(getMailToken()),
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const configuredToken = getMailToken();
    if (!configuredToken) {
      throw new Error('Mail service token is not configured.');
    }

    const payload = parsePayload(e);
    const suppliedToken = String(payload.token || '');

    if (!constantTimeEqual(configuredToken, suppliedToken)) {
      return jsonResponse({
        success: false,
        tokenValid: false,
        error: 'Unauthorized request.'
      });
    }

    // Health check validates the exact token without sending an email.
    if (String(payload.action || '') === 'healthcheck') {
      return jsonResponse({
        success: true,
        configured: true,
        tokenValid: true,
        service: APP_NAME + ' Email Service',
        timestamp: new Date().toISOString()
      });
    }

    const recipient = String(payload.to || payload.email || '').trim();
    const subject = String(payload.subject || '').trim();
    const plainText = String(payload.text || '').trim();
    const htmlBody = String(payload.html || '').trim();
    const replyTo = String(payload.replyTo || '').trim();

    if (!isValidEmail(recipient)) {
      throw new Error('A valid recipient email is required.');
    }
    if (!subject) {
      throw new Error('Email subject is required.');
    }
    if (!plainText && !htmlBody) {
      throw new Error('Email body is required.');
    }

    const message = {
      to: recipient,
      subject: subject,
      body: plainText || stripHtml(htmlBody),
      name: APP_NAME
    };

    if (htmlBody) message.htmlBody = htmlBody;
    if (replyTo && isValidEmail(replyTo)) message.replyTo = replyTo;

    MailApp.sendEmail(message);

    return jsonResponse({
      success: true,
      message: 'Email accepted by the mail service.'
    });
  } catch (error) {
    console.error('[TdevKuantum Email]', error.message);
    return jsonResponse({
      success: false,
      error: String(error.message || 'Email sending failed.')
    });
  }
}

function getMailToken() {
  return String(
    PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY) || ''
  ).trim();
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('POST body is missing.');
  }

  const raw = e.postData.contents;
  try {
    return JSON.parse(raw);
  } catch (_) {
    if (e.parameter) return e.parameter;
    throw new Error('Invalid JSON payload.');
  }
}

function constantTimeEqual(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

function stripHtml(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}