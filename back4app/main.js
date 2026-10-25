'use strict';

/**
 * TdevKuantum — Back4App Cloud Code
 * Upload as Cloud Code main.js.
 *
 * REQUIRED Back4App Config keys:
 *   FOUNDER_EMAIL        default: admin.tr.reis@gmail.com (confirm spelling in Config)
 *   FOUNDER_PASSWORD     strong secret; never place in HTML/GitHub
 *   ADMIN_EMAIL          admin account email
 *   ADMIN_PASSWORD       strong secret; never place in HTML/GitHub
 *   BETA_EMAIL           beta account email
 *   BETA_PASSWORD        strong secret; never place in HTML/GitHub
 *   GOOGLE_SCRIPT_URL (or GOOGLE_APPS_SCRIPT_URL) deployed Web App URL for sending verification emails
 *   APPS_SCRIPT_TOKEN    secret token matching Script Properties in apps-script/Code.gs
 *   RESEND_API_KEY       optional fallback provider API key
 *   EMAIL_FROM           verified sender, e.g. TdevKuantum <noreply@your-domain>
 *   PASSWORD_RESET_PEPPER optional separate secret for password-reset code hashing
 *   AI_API_KEY           optional server-only key for the TDEV-AI tutor
 *   AI_MODEL             optional model name (default gpt-4o-mini)
 *   AI_BASE_URL          optional HTTPS OpenAI-compatible chat-completions URL
 *
 * Optional:
 *   ALLOWED_ORIGINS      comma-separated site origins
 *   REGISTRATION_ENABLED "true" (default true)
 *   REQUIRE_EMAIL_VERIFY "true" (default true)
 *
 * Notes:
 * - Never trust a role supplied by the browser.
 * - Administrative functions require an authenticated Parse user whose
 *   email matches a configured staff account.
 * - Public user registration uses Parse User accounts. Verification mail
 *   uses Google Apps Script when configured, then falls back to Resend.
 */

const crypto = require('crypto');

const CONFIG_DEFAULTS = {
  FOUNDER_EMAIL: 'admin.tr.reis@gmail.com',
  REGISTRATION_ENABLED: 'true',
  REQUIRE_EMAIL_VERIFY: 'true'
};

let parseConfigPromise = null;
async function loadParseConfig() {
  if (!parseConfigPromise) {
    parseConfigPromise = (async () => {
      try {
        if (Parse && Parse.Config && typeof Parse.Config.get === 'function') {
          return await Parse.Config.get({ useMasterKey: true });
        }
      } catch (error) {
        console.error('[TdevKuantum] Parse Config read failed:', String(error && error.message || error).slice(0, 240));
      }
      return null;
    })();
  }
  return parseConfigPromise;
}

function configValue(key, fallback) {
  // Synchronous lookups intentionally use environment variables only.
  // Parse.Config.get() is asynchronous; use configValueAsync() for dashboard Config values.
  const env = (typeof process !== 'undefined' && process.env) ? process.env[key] : undefined;
  if (env !== undefined && env !== null && String(env).trim() !== '') return String(env).trim();
  return fallback !== undefined ? String(fallback) : '';
}

async function configValueAsync(key, fallback) {
  try {
    const cfg = await loadParseConfig();
    const value = cfg && typeof cfg.get === 'function' ? cfg.get(key) : undefined;
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  } catch (_) {}
  return configValue(key, fallback);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function safeText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 160);
}
function escapeHtmlText(value) {
  return String(value == null ? '' : value).replace(/[&<>\"']/g, function (ch) {
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' })[ch];
  });
}
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function secureEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
async function roleForEmail(email) {
  const e = normalizeEmail(email);
  if (e && e === normalizeEmail(await configValueAsync('FOUNDER_EMAIL', CONFIG_DEFAULTS.FOUNDER_EMAIL))) return 'founder';
  if (e && e === normalizeEmail(await configValueAsync('ADMIN_EMAIL'))) return 'admin';
  if (e && e === normalizeEmail(await configValueAsync('BETA_EMAIL'))) return 'beta';
  return 'member';
}
function staffEmailForRole(role) {
  if (role === 'founder') return normalizeEmail(configValue('FOUNDER_EMAIL', CONFIG_DEFAULTS.FOUNDER_EMAIL));
  if (role === 'admin') return normalizeEmail(configValue('ADMIN_EMAIL'));
  if (role === 'beta') return normalizeEmail(configValue('BETA_EMAIL'));
  return '';
}
async function isConfiguredSpecialLogin(email, password) {
  const role = await roleForEmail(email);
  if (role === 'founder') {
    const expected = await configValueAsync('FOUNDER_PASSWORD');
    return !!expected && secureEqual(password, expected) ? role : null;
  }
  if (role === 'admin') {
    const expected = await configValueAsync('ADMIN_PASSWORD');
    return !!expected && secureEqual(password, expected) ? role : null;
  }
  if (role === 'beta') {
    const expected = await configValueAsync('BETA_PASSWORD');
    return !!expected && secureEqual(password, expected) ? role : null;
  }
  return null;
}
function resultError(message, code) {
  return { success: false, error: message, code: code || 'REQUEST_FAILED' };
}
function requireUser(request) {
  if (!request || !request.user) throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Bu işlem için giriş yapmalısın.');
  return request.user;
}
async function requireStaff(request, allowedRoles) {
  const user = requireUser(request);
  const email = normalizeEmail(user.get('email') || user.get('username'));
  const role = await roleForEmail(email);
  if (!allowedRoles.includes(role)) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Bu işlem için yetkin yok.');
  return { user, email, role };
}
async function writeAuditLog(request, action, targetId, details) {
  try {
    const actor = request && request.user;
    const row = new Parse.Object('AuditLog');
    row.set('actorId', actor ? actor.id : 'system');
    row.set('actorEmail', normalizeEmail((actor && (actor.get('email') || actor.get('username'))) || (details && details.email)));
    row.set('action', safeText(action, 100));
    row.set('targetId', safeText(targetId, 100));
    row.set('details', details && typeof details === 'object' && !Array.isArray(details) ? details : {});
    row.set('createdAtISO', new Date().toISOString());
    await row.save(null, { useMasterKey: true });
  } catch (error) {
    console.error('[TdevKuantum] Audit log write failed:', String(error && error.message || error).slice(0, 200));
  }
}
async function publicUser(user) {
  return {
    id: user.id,
    name: safeText(user.get('displayName') || user.get('name') || user.get('username'), 100),
    email: normalizeEmail(user.get('email') || user.get('username')),
    role: await roleForEmail(user.get('email') || user.get('username')),
    banned: user.get('banned') === true,
    emailVerified: user.get('emailVerified') === true,
    date: user.createdAt ? user.createdAt.toISOString().slice(0, 10) : ''
  };
}
function verificationKey(email) {
  return 'emailVerification:' + sha256(normalizeEmail(email));
}
async function probeAppsScript(scriptUrl, expectedToken) {
  if (!expectedToken) throw new Error('Back4App Config APPS_SCRIPT_TOKEN ayarlanmamış.');
  const response = await fetch(scriptUrl, { method: 'GET' });
  const body = await response.text();
  if (!response.ok) throw new Error('Apps Script sağlık kontrolü HTTP ' + response.status);
  let data;
  try { data = JSON.parse(body); } catch (_) { throw new Error('Apps Script GET yanıtı JSON değil; doğru Web App dağıtım URL’sini kontrol et.'); }
  if (!data || data.success !== true || data.configured !== true) {
    throw new Error('Apps Script Script Properties içinde APPS_SCRIPT_TOKEN bulunamadı. Doğru projeye eklediğini kontrol et.');
  }
  const tokenCheck = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'healthcheck', token: expectedToken })
  });
  const tokenBody = await tokenCheck.text();
  if (!tokenCheck.ok) throw new Error('Apps Script token kontrolü HTTP ' + tokenCheck.status);
  let tokenData;
  try { tokenData = JSON.parse(tokenBody); } catch (_) { throw new Error('Apps Script token kontrolü JSON döndürmedi; güncel Code.gs dağıtımını kontrol et.'); }
  if (tokenData && tokenData.success === true && tokenData.tokenValid === true) {
    return tokenData;
  }
  // Backward compatibility: older deployed Code.gs versions validate the token first,
  // then fall through to recipient validation because they do not implement "healthcheck".
  // This exact error is only reached after the token comparison has succeeded.
  if (tokenData && tokenData.success === false &&
      /A valid recipient email is required/i.test(String(tokenData.error || ''))) {
    console.warn('[TdevKuantum] Apps Script token accepted; deployed Code.gs uses legacy health-check behavior.');
    return { success: true, tokenValid: true, legacyHealthcheck: true };
  }
  throw new Error('Apps Script token doğrulaması başarısız. Back4App APPS_SCRIPT_TOKEN ile Script Properties değeri aynı mı kontrol et ve Code.gs güncellemesini dağıt.');
}

async function sendVerificationEmail(email, code, name) {
  const scriptUrl = (await configValueAsync('GOOGLE_SCRIPT_URL')) || (await configValueAsync('GOOGLE_APPS_SCRIPT_URL'));
  const apiKey = await configValueAsync('RESEND_API_KEY');
  const from = await configValueAsync('EMAIL_FROM');
  const subject = 'TdevKuantum e-posta doğrulama kodu';
  const html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172b4d">' +
    '<h1 style="color:#2457c5">TdevKuantum</h1><p>Merhaba ' + escapeHtmlText(safeText(name || 'öğrenci', 100)) + ', hesabını doğrulamak için aşağıdaki kodu kullan:</p>' +
    '<div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:18px;background:#f3f6fb;border-radius:12px;text-align:center">' + code + '</div>' +
    '<p>Bu kod 10 dakika geçerlidir. Bu isteği sen yapmadıysan e-postayı yok sayabilirsin.</p></div>';
  const errors = [];

  // Google Apps Script Web App: deploy with access set so the server can call it.
  if (scriptUrl) {
    try {
      const scriptToken = await configValueAsync('APPS_SCRIPT_TOKEN');
      if (!scriptToken) throw new Error('Back4App Config APPS_SCRIPT_TOKEN ayarlanmamış.');
      await probeAppsScript(scriptUrl, scriptToken);
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email, email: email, name: safeText(name || 'öğrenci', 100),
          code: code, subject: subject, html: html, app: 'TdevKuantum',
          token: scriptToken,
          text: 'TdevKuantum doğrulama kodun: ' + code + ' (10 dakika geçerlidir)'
        })
      });
      const body = await response.text();
      if (!response.ok) throw new Error('Apps Script HTTP ' + response.status);
      let data;
      try { data = JSON.parse(body); } catch (_) {
        throw new Error('Apps Script geçerli JSON döndürmedi; dağıtım URL’si ve erişim ayarları kontrol edilmeli.');
      }
      if (!(data && (data.success === true || data.ok === true))) {
        throw new Error(String((data && (data.error || data.message)) || 'Apps Script e-posta gönderimini doğrulamadı.'));
      }
      return { provider: 'google-apps-script' };
    } catch (error) {
      console.error('[TdevKuantum] Google Apps Script email error:', error && error.message);
      errors.push('Google Apps Script: ' + String(error && error.message || error));
    }
  }

  // Resend fallback.
  if (apiKey && from) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from, to: [email], subject: subject, html: html })
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.text()).slice(0, 300); } catch (_) {}
        throw new Error('Resend HTTP ' + response.status + (detail ? ': ' + detail : ''));
      }
      return { provider: 'resend' };
    } catch (error) {
      console.error('[TdevKuantum] Resend email error:', error && error.message);
      errors.push('Resend: ' + String(error && error.message || error));
    }
  }

  const setupMessage = (!scriptUrl && !(apiKey && from))
    ? 'Back4App Config içine GOOGLE_SCRIPT_URL (veya GOOGLE_APPS_SCRIPT_URL) ekle veya RESEND_API_KEY ve EMAIL_FROM ayarla.'
    : 'Google Apps Script URL dağıtımını ve e-posta sağlayıcısı ayarlarını kontrol et.';
  console.error('[TdevKuantum] All verification email providers failed:', errors.join(' | ') || 'No provider configured');
  const providerDetail = errors.length ? (' Ayrıntı: ' + errors.join(' | ').slice(0, 700)) : '';
  throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Doğrulama e-postası gönderilemedi. ' + setupMessage + providerDetail);
}
async function sendPasswordResetEmail(email, code) {
  const scriptUrl = (await configValueAsync('GOOGLE_SCRIPT_URL')) || (await configValueAsync('GOOGLE_APPS_SCRIPT_URL'));
  const apiKey = await configValueAsync('RESEND_API_KEY');
  const from = await configValueAsync('EMAIL_FROM');
  const subject = 'TdevKuantum şifre yenileme kodu';
  const html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172b4d">' +
    '<h1 style="color:#2457c5">TdevKuantum</h1><p>Şifreni yenilemek için aşağıdaki kodu kullan:</p>' +
    '<div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:18px;background:#f3f6fb;border-radius:12px;text-align:center">' + code + '</div>' +
    '<p>Bu kod 10 dakika geçerlidir ve tek kullanımlıktır. Bu isteği sen yapmadıysan bu e-postayı yok say; şifren değişmez.</p></div>';
  const errors = [];
  if (scriptUrl) {
    try {
      const scriptToken = await configValueAsync('APPS_SCRIPT_TOKEN');
      if (!scriptToken) throw new Error('Back4App Config APPS_SCRIPT_TOKEN ayarlanmamış.');
      await probeAppsScript(scriptUrl, scriptToken);
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email, email: email, subject: subject, html: html,
          text: 'TdevKuantum şifre yenileme kodun: ' + code + ' (10 dakika geçerlidir)',
          app: 'TdevKuantum', token: scriptToken
        })
      });
      const body = await response.text();
      if (!response.ok) throw new Error('Apps Script HTTP ' + response.status);
      let data;
      try { data = JSON.parse(body); } catch (_) { throw new Error('Apps Script geçerli JSON döndürmedi.'); }
      if (!(data && (data.success === true || data.ok === true))) throw new Error(String((data && (data.error || data.message)) || 'Apps Script e-posta gönderimini doğrulamadı.'));
      return { provider: 'google-apps-script' };
    } catch (error) {
      console.error('[TdevKuantum] Password reset Apps Script error:', error && error.message);
      errors.push('Google Apps Script: ' + String(error && error.message || error));
    }
  }
  if (apiKey && from) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from, to: [email], subject: subject, html: html })
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.text()).slice(0, 250); } catch (_) {}
        throw new Error('Resend HTTP ' + response.status + (detail ? ': ' + detail : ''));
      }
      return { provider: 'resend' };
    } catch (error) {
      console.error('[TdevKuantum] Password reset Resend error:', error && error.message);
      errors.push('Resend: ' + String(error && error.message || error));
    }
  }
  throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Şifre yenileme e-postası gönderilemedi. E-posta servisi ayarlarını kontrol et. ' + errors.join(' | ').slice(0, 500));
}
async function passwordResetCodeHash(email, code) {
  // Pepper the six-digit code with a server-only secret so a leaked hash cannot be brute-forced offline.
  const secret = (await configValueAsync('PASSWORD_RESET_PEPPER')) || (await configValueAsync('APPS_SCRIPT_TOKEN'));
  if (!secret || secret.length < 32) throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Şifre sıfırlama için sunucu gizli anahtarı yapılandırılmamış.');
  return sha256(normalizeEmail(email) + ':' + String(code) + ':' + secret);
}
async function savePasswordReset(email, code) {
  const row = new Parse.Object('PasswordReset');
  row.set('emailHash', sha256(normalizeEmail(email)));
  row.set('codeHash', await passwordResetCodeHash(email, code));
  row.set('expiresAt', new Date(Date.now() + 10 * 60 * 1000));
  row.set('attempts', 0);
  row.set('used', false);
  await row.save(null, { useMasterKey: true });
}
async function findPasswordReset(email) {
  const query = new Parse.Query('PasswordReset');
  query.equalTo('emailHash', sha256(normalizeEmail(email)));
  query.equalTo('used', false);
  query.greaterThan('expiresAt', new Date());
  query.descending('createdAt');
  query.limit(1);
  return query.first({ useMasterKey: true });
}

async function saveVerification(email, code) {
  const row = new Parse.Object('EmailVerification');
  row.set('emailHash', sha256(normalizeEmail(email)));
  row.set('codeHash', sha256(code));
  row.set('expiresAt', new Date(Date.now() + 10 * 60 * 1000));
  row.set('attempts', 0);
  row.set('used', false);
  await row.save(null, { useMasterKey: true });
  return row;
}
async function findVerification(email) {
  const q = new Parse.Query('EmailVerification');
  q.equalTo('emailHash', sha256(normalizeEmail(email)));
  q.equalTo('used', false);
  q.greaterThan('expiresAt', new Date());
  q.descending('createdAt');
  q.limit(1);
  return q.first({ useMasterKey: true });
}
async function setVerified(user) {
  user.set('emailVerified', true);
  await user.save(null, { useMasterKey: true });
}

// Password reset uses a short-lived, single-use code. Never reveal whether an account exists.
Parse.Cloud.define('requestTdevPasswordReset', async (request) => {
  const email = normalizeEmail(request.params && request.params.email);
  const genericMessage = 'Bu e-posta için bir hesap varsa sıfırlama kodu gönderildi. Gelen kutunu ve spam klasörünü kontrol et.';
  if (!validEmail(email)) return resultError('Geçerli bir e-posta adresi gir.', 'INVALID_EMAIL');
  const query = new Parse.Query(Parse.User);
  query.equalTo('username', email);
  const user = await query.first({ useMasterKey: true });
  if (!user || await roleForEmail(email) !== 'member') return { success: true, message: genericMessage };
  const emailHash = sha256(email);
  const recentQuery = new Parse.Query('PasswordReset');
  recentQuery.equalTo('emailHash', emailHash);
  recentQuery.greaterThan('createdAt', new Date(Date.now() - 60 * 1000));
  recentQuery.descending('createdAt');
  recentQuery.limit(1);
  const recent = await recentQuery.first({ useMasterKey: true });
  if (recent) return { success: true, message: genericMessage };
  const code = String(crypto.randomInt(100000, 1000000));
  await sendPasswordResetEmail(email, code);
  await savePasswordReset(email, code);
  await writeAuditLog(request, 'user.password_reset_requested', user.id, { emailHash: emailHash });
  return { success: true, message: genericMessage };
});

Parse.Cloud.define('completeTdevPasswordReset', async (request) => {
  const email = normalizeEmail(request.params && request.params.email);
  const code = safeText(request.params && request.params.code, 10);
  const newPassword = String((request.params && request.params.newPassword) || '');
  if (!validEmail(email) || !/^\d{6}$/.test(code) || newPassword.length < 8 || newPassword.length > 128) {
    return resultError('E-posta, 6 haneli kod veya yeni şifre geçersiz.', 'INVALID_INPUT');
  }
  const reset = await findPasswordReset(email);
  if (!reset) return resultError('Kod geçersiz veya süresi dolmuş. Yeni kod iste.', 'RESET_CODE_EXPIRED');
  const attempts = Number(reset.get('attempts') || 0);
  if (attempts >= 5) return resultError('Çok fazla yanlış deneme. Yeni kod iste.', 'RESET_TOO_MANY_ATTEMPTS');
  if (!secureEqual(reset.get('codeHash'), await passwordResetCodeHash(email, code))) {
    reset.set('attempts', attempts + 1);
    await reset.save(null, { useMasterKey: true });
    return resultError('Kod geçersiz veya süresi dolmuş. Yeni kod iste.', 'RESET_CODE_INVALID');
  }
  const query = new Parse.Query(Parse.User);
  query.equalTo('username', email);
  const user = await query.first({ useMasterKey: true });
  if (!user || await roleForEmail(email) !== 'member') {
    reset.set('used', true);
    await reset.save(null, { useMasterKey: true });
    return resultError('Bu hesap için şifre bu ekrandan değiştirilemiyor. Destek ekibiyle iletişime geç.', 'RESET_NOT_ALLOWED');
  }
  user.set('password', newPassword);
  await user.save(null, { useMasterKey: true });
  reset.set('used', true);
  await reset.save(null, { useMasterKey: true });
  await writeAuditLog(request, 'user.password_reset_completed', user.id, { emailHash: sha256(email) });
  return { success: true, message: 'Şifren başarıyla güncellendi.' };
});

// ---- AKADEMİK PROFİL, EĞİTİM YILI VE SINIF YÖNETİMİ ----
function academicYearForCountry(countryCode, now) {
  const code = safeText(countryCode, 2).toUpperCase();
  const starts = { JP:4, KR:3, IN:6, BD:1, PK:4, AU:2, NZ:2, BR:2, ZA:1, AR:3, CL:3, UY:3, TH:5, PH:6, SG:1, MY:1, ID:7, EG:9, SA:8, AE:8, TR:9, US:8, CA:9, GB:9, DE:8, FR:9, ES:9, IT:9 };
  const month = starts[code] || 9;
  const date = now || new Date();
  const year = date.getFullYear() - ((date.getMonth() + 1) < month ? 1 : 0);
  return String(year) + '-' + String(year + 1);
}
function normalizedSchoolKey(countryCode, schoolName, schoolAddress) {
  const name = safeText(schoolName, 160).toLocaleLowerCase('tr').replace(/\\s+/g, ' ').trim();
  const address = safeText(schoolAddress, 240).toLocaleLowerCase('tr').replace(/\\s+/g, ' ').trim();
  return name && address ? sha256(safeText(countryCode, 2).toUpperCase() + '|' + name + '|' + address) : '';
}
async function applyAnnualGradePromotion(user) {
  if (!user) return;
  const countryCode = safeText(user.get('countryCode') || 'TR', 2).toUpperCase();
  const currentYear = academicYearForCountry(countryCode);
  const previousYear = safeText(user.get('educationYear'), 20);
  if (!previousYear) {
    user.set('educationYear', currentYear);
    await user.save(null, { useMasterKey: true });
    return;
  }
  if (previousYear === currentYear) return;
  if ((user.get('profileType') || 'student') === 'student') {
    const grade = Number(user.get('grade'));
    if (Number.isInteger(grade) && grade >= 1 && grade < 12) user.set('grade', grade + 1);
  }
  user.set('educationYear', currentYear);
  await user.save(null, { useMasterKey: true });
}
function academicProfile(user) {
  const countryCode = safeText(user.get('countryCode') || 'TR', 2).toUpperCase();
  const rawGrade = user.get('grade');
  const profileType = ['student','teacher','principal'].includes(user.get('profileType')) ? user.get('profileType') : 'student';
  const grade = Number.isFinite(Number(rawGrade)) && Number(rawGrade) >= 0 ? Number(rawGrade) : 8;
  const educationStage = safeText(user.get('educationStage'), 20) || (grade <= 4 ? 'primary' : (grade <= 8 ? 'middle' : 'high'));
  return {
    profileType: profileType,
    countryCode: countryCode,
    grade: grade === 0 && countryCode === 'US' ? 'K' : String(grade || 8),
    educationStage: educationStage,
    schoolName: safeText(user.get('schoolName'), 160),
    schoolAddress: safeText(user.get('schoolAddress'), 240),
    schoolKey: safeText(user.get('schoolKey'), 64),
    educationYear: safeText(user.get('educationYear'), 20),
    pendingInviteCode: safeText(user.get('inviteCodePending'), 80)
  };
}
async function getClassroomForId(classroomId) {
  const query = new Parse.Query('Classroom');
  query.equalTo('objectId', safeText(classroomId, 100));
  query.equalTo('active', true);
  return query.first({ useMasterKey: true });
}
async function classroomAccess(user, classroom, allowStudent) {
  if (!user || !classroom) return { allowed: false, role: '' };
  const userId = user.id;
  if (classroom.get('ownerId') === userId) return { allowed: true, role: 'owner' };
  const profileType = user.get('profileType') || 'student';
  if (profileType === 'principal' && user.get('schoolKey') && user.get('schoolKey') === classroom.get('schoolKey')) return { allowed: true, role: 'principal' };
  const q = new Parse.Query('ClassroomMembership');
  q.equalTo('classroomId', classroom.id);
  q.equalTo('userId', userId);
  q.equalTo('status', 'active');
  const membership = await q.first({ useMasterKey: true });
  if (membership && (membership.get('role') === 'manager' || (allowStudent && membership.get('role') === 'student'))) return { allowed: true, role: membership.get('role'), membership: membership };
  return { allowed: false, role: '' };
}
function classroomSummary(row) {
  return {
    id: row.id, name: safeText(row.get('name'), 120),
    schoolName: safeText(row.get('schoolName'), 160),
    schoolAddress: safeText(row.get('schoolAddress'), 240),
    countryCode: safeText(row.get('countryCode'), 2),
    educationStage: safeText(row.get('educationStage'), 20),
    grade: safeText(row.get('grade'), 10),
    invitationCode: safeText(row.get('invitationCode'), 80),
    academicYear: safeText(row.get('academicYear'), 20),
    ownerId: safeText(row.get('ownerId'), 100)
  };
}
Parse.Cloud.define('getMyProfile', async (request) => {
  const user = requireUser(request);
  await applyAnnualGradePromotion(user);
  return { success: true, profile: academicProfile(user), user: await publicUser(user) };
});

Parse.Cloud.define('createClassroom', async (request) => {
  const user = requireUser(request);
  if (!['teacher','principal'].includes(user.get('profileType'))) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Yalnızca öğretmen veya müdür sınıf oluşturabilir.');
  const params = request.params || {};
  const name = safeText(params.name, 120);
  const schoolName = safeText(params.schoolName, 160);
  const schoolAddress = safeText(params.schoolAddress, 240);
  const countryCode = safeText(user.get('countryCode') || params.countryCode || 'TR', 2).toUpperCase();
  const educationStage = safeText(params.educationStage, 20).toLowerCase();
  const grade = safeText(params.grade, 10).toUpperCase();
  if (!name || !schoolName || !schoolAddress || !['primary','middle','high'].includes(educationStage) || !/^(K|[1-9]|1[0-3])$/.test(grade)) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Grup adı, okul adı/adresi, kademe ve sınıf zorunludur.');
  }
  const key = normalizedSchoolKey(countryCode, schoolName, schoolAddress);
  const ownKey = safeText(user.get('schoolKey'), 64);
  if (ownKey && ownKey !== key) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Sınıfı kayıtlı olduğun okulun adı ve adresiyle oluşturmalısın.');
  if (!ownKey) {
    user.set('schoolName', schoolName); user.set('schoolAddress', schoolAddress); user.set('schoolKey', key);
    await user.save(null, { useMasterKey: true });
  }
  const row = new Parse.Object('Classroom');
  row.set('ownerId', user.id); row.set('name', name); row.set('schoolKey', key);
  row.set('schoolName', schoolName); row.set('schoolAddress', schoolAddress);
  row.set('countryCode', countryCode); row.set('educationStage', educationStage);
  row.set('grade', grade); row.set('invitationCode', crypto.randomBytes(18).toString('hex'));
  row.set('active', true); row.set('academicYear', academicYearForCountry(countryCode));
  row.set('managerIds', []); row.set('createdAtISO', new Date().toISOString());
  await row.save(null, { useMasterKey: true });
  const membership = new Parse.Object('ClassroomMembership');
  membership.set('classroomId', row.id); membership.set('userId', user.id);
  membership.set('role', 'owner'); membership.set('status', 'active');
  membership.set('createdAtISO', new Date().toISOString());
  await membership.save(null, { useMasterKey: true });
  await writeAuditLog(request, 'classroom.created', row.id, { schoolKey: key, grade: grade });
  return { success: true, classroom: classroomSummary(row) };
});

Parse.Cloud.define('getMyClassrooms', async (request) => {
  const user = requireUser(request);
  const type = user.get('profileType') || 'student';
  const rowsById = new Map();
  if (type === 'principal') {
    const key = safeText(user.get('schoolKey'), 64);
    if (key) {
      const q = new Parse.Query('Classroom'); q.equalTo('schoolKey', key); q.equalTo('active', true); q.descending('createdAt'); q.limit(200);
      (await q.find({ useMasterKey: true })).forEach(row => rowsById.set(row.id, row));
    }
  } else if (type === 'teacher') {
    const owned = new Parse.Query('Classroom'); owned.equalTo('ownerId', user.id); owned.equalTo('active', true); owned.descending('createdAt'); owned.limit(200);
    (await owned.find({ useMasterKey: true })).forEach(row => rowsById.set(row.id, row));
    const memberships = new Parse.Query('ClassroomMembership'); memberships.equalTo('userId', user.id); memberships.equalTo('role', 'manager'); memberships.equalTo('status', 'active'); memberships.limit(200);
    const managed = await memberships.find({ useMasterKey: true });
    for (const membership of managed) { const row = await getClassroomForId(membership.get('classroomId')); if (row) rowsById.set(row.id, row); }
  } else {
    const memberships = new Parse.Query('ClassroomMembership'); memberships.equalTo('userId', user.id); memberships.equalTo('status', 'active'); memberships.limit(100);
    for (const membership of await memberships.find({ useMasterKey: true })) { const row = await getClassroomForId(membership.get('classroomId')); if (row) rowsById.set(row.id, row); }
  }
  const items = [];
  for (const row of rowsById.values()) {
    const countQuery = new Parse.Query('ClassroomMembership'); countQuery.equalTo('classroomId', row.id); countQuery.equalTo('status', 'active'); countQuery.limit(1000);
    const members = await countQuery.find({ useMasterKey: true });
    items.push(Object.assign(classroomSummary(row), { memberCount: members.filter(m => m.get('role') === 'student').length }));
  }
  return { success: true, items: items };
});

Parse.Cloud.define('joinClassroomByInvite', async (request) => {
  const user = requireUser(request);
  if ((user.get('profileType') || 'student') !== 'student') throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Sınıf davetine yalnızca öğrenci hesabıyla katılabilirsin.');
  const code = safeText(request.params && request.params.inviteCode, 80);
  if (!/^[a-f0-9]{36}$/i.test(code)) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Davet bağlantısı geçersiz.');
  const q = new Parse.Query('Classroom'); q.equalTo('invitationCode', code); q.equalTo('active', true);
  const classroom = await q.first({ useMasterKey: true });
  if (!classroom) throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Bu davet bağlantısı geçersiz veya kapatılmış.');
  const grade = String(user.get('grade') || '');
  if (grade && classroom.get('grade') && grade !== String(classroom.get('grade'))) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Bu sınıf daveti senin kayıtlı sınıf düzeyinle eşleşmiyor.');
  const existingQuery = new Parse.Query('ClassroomMembership'); existingQuery.equalTo('classroomId', classroom.id); existingQuery.equalTo('userId', user.id);
  let membership = await existingQuery.first({ useMasterKey: true });
  if (!membership) { membership = new Parse.Object('ClassroomMembership'); membership.set('classroomId', classroom.id); membership.set('userId', user.id); membership.set('role', 'student'); membership.set('status', 'active'); membership.set('createdAtISO', new Date().toISOString()); await membership.save(null, { useMasterKey: true }); }
  user.set('inviteCodePending', '');
  await user.save(null, { useMasterKey: true });
  await writeAuditLog(request, 'classroom.student_joined', classroom.id, { studentId: user.id });
  return { success: true, classroom: { id: classroom.id, name: safeText(classroom.get('name'), 120), grade: safeText(classroom.get('grade'), 10) } };
});

Parse.Cloud.define('assignClassroomManager', async (request) => {
  const user = requireUser(request);
  const classroom = await getClassroomForId(request.params && request.params.classroomId);
  if (!classroom || classroom.get('ownerId') !== user.id) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Yalnızca sınıfı oluşturan öğretmen yönetici atayabilir.');
  const targetId = safeText(request.params && request.params.userId, 100);
  const q = new Parse.Query('ClassroomMembership'); q.equalTo('classroomId', classroom.id); q.equalTo('userId', targetId); q.equalTo('status', 'active');
  const membership = await q.first({ useMasterKey: true });
  if (!membership || membership.get('role') === 'owner') throw new Parse.Error(Parse.Error.INVALID_JSON, 'Bu öğrenci sınıf üyesi değil veya yönetici yapılamaz.');
  membership.set('role', request.params && request.params.makeManager === false ? 'student' : 'manager');
  await membership.save(null, { useMasterKey: true });
  await writeAuditLog(request, 'classroom.manager_updated', classroom.id, { targetId: targetId, manager: membership.get('role') === 'manager' });
  return { success: true };
});

Parse.Cloud.define('getClassroomRoster', async (request) => {
  const user = requireUser(request);
  const classroom = await getClassroomForId(request.params && request.params.classroomId);
  const access = await classroomAccess(user, classroom, true);
  if (!access.allowed) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Bu sınıfın kayıtlarını görme yetkin yok.');
  const membershipsQuery = new Parse.Query('ClassroomMembership'); membershipsQuery.equalTo('classroomId', classroom.id); membershipsQuery.equalTo('status', 'active'); membershipsQuery.limit(500);
  let memberships = await membershipsQuery.find({ useMasterKey: true });
  if (access.role === 'student') memberships = memberships.filter(m => m.get('userId') === user.id);
  const eventsQuery = new Parse.Query('LearningActivity'); eventsQuery.equalTo('classroomId', classroom.id); eventsQuery.limit(1000);
  const events = await eventsQuery.find({ useMasterKey: true });
  const roster = [];
  for (const member of memberships) {
    const uid = member.get('userId');
    const memberEvents = events.filter(e => e.get('userId') === uid);
    const quizzes = memberEvents.filter(e => e.get('eventType') === 'quiz_answer' && e.get('hasAnswer') === true);
    const correct = quizzes.filter(e => e.get('isCorrect') === true).length;
    let publicInfo = { id: uid, name: uid === user.id ? safeText(user.get('displayName') || user.get('name'), 100) : 'Öğrenci', role: member.get('role') };
    if (access.role !== 'student') {
      const userQuery = new Parse.Query(Parse.User); userQuery.equalTo('objectId', uid);
      const memberUser = await userQuery.first({ useMasterKey: true });
      if (memberUser) publicInfo = { id: uid, name: safeText(memberUser.get('displayName') || memberUser.get('name') || memberUser.get('username'), 100), email: safeText(memberUser.get('email') || memberUser.get('username'), 160), role: member.get('role') };
    }
    roster.push(Object.assign(publicInfo, {
      activityCount: memberEvents.length,
      lessonOpens: memberEvents.filter(e => e.get('eventType') === 'lesson_open').length,
      aiQuestions: memberEvents.filter(e => e.get('eventType') === 'ai_question').length,
      resourceClicks: memberEvents.filter(e => e.get('eventType') === 'external_resource').length,
      quizTotal: quizzes.length, quizCorrect: correct,
      quizSuccessRate: quizzes.length ? Math.round(correct / quizzes.length * 100) : null
    }));
  }
  return { success: true, classroom: classroomSummary(classroom), items: roster };
});

Parse.Cloud.define('getSchoolOverview', async (request) => {
  const user = requireUser(request);
  if (user.get('profileType') !== 'principal') throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Okul analizlerini yalnızca müdür hesabı görüntüleyebilir.');
  const key = safeText(user.get('schoolKey'), 64);
  if (!key) return { success: true, items: [] };
  const q = new Parse.Query('Classroom'); q.equalTo('schoolKey', key); q.equalTo('active', true); q.limit(200);
  const classrooms = await q.find({ useMasterKey: true });
  const items = [];
  for (const classroom of classrooms) {
    const membersQuery = new Parse.Query('ClassroomMembership'); membersQuery.equalTo('classroomId', classroom.id); membersQuery.equalTo('status', 'active'); membersQuery.limit(1000);
    const members = await membersQuery.find({ useMasterKey: true });
    const students = members.filter(m => m.get('role') === 'student');
    const activityQuery = new Parse.Query('LearningActivity'); activityQuery.equalTo('classroomId', classroom.id); activityQuery.limit(1000);
    const events = await activityQuery.find({ useMasterKey: true });
    const quizzes = events.filter(e => e.get('eventType') === 'quiz_answer' && e.get('hasAnswer') === true);
    const correct = quizzes.filter(e => e.get('isCorrect') === true).length;
    const ownerQuery = new Parse.Query(Parse.User); ownerQuery.equalTo('objectId', classroom.get('ownerId'));
    const owner = await ownerQuery.first({ useMasterKey: true });
    items.push(Object.assign(classroomSummary(classroom), {
      teacherName: owner ? safeText(owner.get('displayName') || owner.get('name'), 100) : 'Öğretmen',
      studentCount: students.length,
      activityCount: events.length,
      lessonOpens: events.filter(e => e.get('eventType') === 'lesson_open').length,
      aiQuestions: events.filter(e => e.get('eventType') === 'ai_question').length,
      resourceClicks: events.filter(e => e.get('eventType') === 'external_resource').length,
      quizTotal: quizzes.length,
      quizSuccessRate: quizzes.length ? Math.round(correct / quizzes.length * 100) : null
    }));
  }
  return { success: true, items: items };
});

Parse.Cloud.define('addClassroomFile', async (request) => {
  const user = requireUser(request);
  const classroom = await getClassroomForId(request.params && request.params.classroomId);
  const access = await classroomAccess(user, classroom, true);
  if (!access.allowed) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Dosya paylaşmak için bu sınıfın üyesi olmalısın.');
  const name = safeText(request.params && request.params.name, 180);
  const url = String(request.params && request.params.url || '').trim();
  const fileType = safeText(request.params && request.params.fileType, 120);
  const size = Number(request.params && request.params.size);
  if (!name || !/^https:\/\//i.test(url) || !Number.isFinite(size) || size < 1 || size > 25 * 1024 * 1024) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Dosya adı, HTTPS bağlantısı ve 25 MB altı dosya gerekli.');
  const row = new Parse.Object('ClassroomFile'); row.set('classroomId', classroom.id); row.set('uploaderId', user.id);
  row.set('name', name); row.set('url', url); row.set('fileType', fileType); row.set('size', size); row.set('createdAtISO', new Date().toISOString());
  await row.save(null, { useMasterKey: true });
  await writeAuditLog(request, 'classroom.file_added', row.id, { classroomId: classroom.id, name: name });
  return { success: true, file: { id: row.id, name: name, url: url, fileType: fileType, size: size, createdAtISO: row.get('createdAtISO') } };
});

Parse.Cloud.define('getClassroomFiles', async (request) => {
  const user = requireUser(request);
  const classroom = await getClassroomForId(request.params && request.params.classroomId);
  const access = await classroomAccess(user, classroom, true);
  if (!access.allowed) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Bu sınıfın dosyalarını görme yetkin yok.');
  const q = new Parse.Query('ClassroomFile'); q.equalTo('classroomId', classroom.id); q.descending('createdAtISO'); q.limit(200);
  const rows = await q.find({ useMasterKey: true });
  return { success: true, items: rows.map(row => ({ id: row.id, name: safeText(row.get('name'), 180), url: String(row.get('url') || ''), fileType: safeText(row.get('fileType'), 120), size: Number(row.get('size') || 0), createdAtISO: safeText(row.get('createdAtISO'), 40), uploaderId: safeText(row.get('uploaderId'), 100) })) };
});

Parse.Cloud.define('deleteClassroomFile', async (request) => {
  const user = requireUser(request);
  const fileId = safeText(request.params && request.params.fileId, 100);
  const q = new Parse.Query('ClassroomFile'); q.equalTo('objectId', fileId);
  const row = await q.first({ useMasterKey: true });
  if (!row) return { success: true };
  const classroom = await getClassroomForId(row.get('classroomId'));
  const access = await classroomAccess(user, classroom, false);
  if (row.get('uploaderId') !== user.id && !['owner','manager','principal'].includes(access.role)) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Bu dosyayı silme yetkin yok.');
  await row.destroy({ useMasterKey: true });
  await writeAuditLog(request, 'classroom.file_deleted', fileId, { classroomId: row.get('classroomId') });
  return { success: true };
});

Parse.Cloud.define('trackLearningActivity', async (request) => {
  const user = requireUser(request);
  const type = safeText(request.params && request.params.eventType, 40);
  const allowedTypes = ['lesson_open','curriculum_open','ai_question','quiz_answer','external_resource'];
  if (!allowedTypes.includes(type)) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Öğrenme etkinliği türü geçersiz.');
  if ((user.get('profileType') || 'student') !== 'student') return { success: true, skipped: true };
  const userId = user.id;
  const requestedClassroomId = safeText(request.params && request.params.classroomId, 100);
  let memberships = [];
  if (requestedClassroomId) {
    const q = new Parse.Query('ClassroomMembership'); q.equalTo('classroomId', requestedClassroomId); q.equalTo('userId', userId); q.equalTo('status', 'active');
    const member = await q.first({ useMasterKey: true }); if (member) memberships = [member];
  } else {
    const q = new Parse.Query('ClassroomMembership'); q.equalTo('userId', userId); q.equalTo('status', 'active'); q.limit(1);
    memberships = await q.find({ useMasterKey: true });
  }
  if (!memberships.length) return { success: true, skipped: true };
  const row = new Parse.Object('LearningActivity');
  row.set('userId', userId); row.set('classroomId', memberships[0].get('classroomId')); row.set('eventType', type);
  row.set('grade', safeText(request.params && request.params.grade || user.get('grade'), 10));
  row.set('subject', safeText(request.params && request.params.subject, 120));
  row.set('hasAnswer', type === 'quiz_answer' && typeof (request.params && request.params.isCorrect) === 'boolean');
  row.set('isCorrect', type === 'quiz_answer' && request.params && request.params.isCorrect === true);
  row.set('countryCode', safeText(user.get('countryCode') || 'TR', 2));
  row.set('createdAtISO', new Date().toISOString());
  await row.save(null, { useMasterKey: true });
  return { success: true };
});

Parse.Cloud.define('registerUser', async (request) => {
  const enabled = (await configValueAsync('REGISTRATION_ENABLED', CONFIG_DEFAULTS.REGISTRATION_ENABLED)).toLowerCase() !== 'false';
  if (!enabled) return resultError('Yeni kayıtlar şu anda kapalı.', 'REGISTRATION_CLOSED');

  const name = safeText(request.params && request.params.name, 100);
  const email = normalizeEmail(request.params && request.params.email);
  const password = String((request.params && request.params.password) || '');
  if (!name || !validEmail(email) || password.length < 8 || password.length > 128 || !request.params || request.params.acceptedTerms !== true) {
    return resultError('Ad, geçerli e-posta, en az 8 karakterli şifre ve sözleşme onayı gerekli.', 'INVALID_INPUT');
  }
  // Config-defined staff credentials are reserved for the corresponding role.
  const reservedRole = await roleForEmail(email);
  if (reservedRole !== 'member') return resultError('Bu e-posta adresi özel bir hesap için ayrılmış. Giriş ekranını kullan.', 'RESERVED_ACCOUNT');

  const existingQuery = new Parse.Query(Parse.User);
  existingQuery.equalTo('username', email);
  const existing = await existingQuery.first({ useMasterKey: true });
  if (existing) return resultError('Bu e-posta ile bir hesap zaten var. Giriş yapmayı dene.', 'EMAIL_EXISTS');

  const user = new Parse.User();
  user.set('username', email);
  user.set('email', email);
  user.set('password', password);
  user.set('displayName', name);
  user.set('name', name);
  const profileType = safeText(request.params && request.params.profileType, 20).toLowerCase() || 'student';
  const countryCode = safeText(request.params && request.params.countryCode, 2).toUpperCase() || 'TR';
  const gradeInput = safeText(request.params && request.params.grade, 10).toUpperCase();
  const educationStage = safeText(request.params && request.params.educationStage, 20).toLowerCase();
  const schoolName = safeText(request.params && request.params.schoolName, 160);
  const schoolAddress = safeText(request.params && request.params.schoolAddress, 240);
  const inviteCode = safeText(request.params && request.params.inviteCode, 80);
  if (!['student','teacher','principal'].includes(profileType) || !/^[A-Z]{2}$/.test(countryCode)) {
    return resultError('Hesap türü ve ülke seçimi geçersiz.', 'INVALID_PROFILE');
  }
  let grade = Number(gradeInput);
  let stage = educationStage;
  if (profileType === 'student') {
    if (!/^(K|[1-9]|1[0-3])$/.test(gradeInput) || (gradeInput === 'K' && countryCode !== 'US')) {
      return resultError('Öğrenci hesabı için geçerli sınıf seçmelisin.', 'GRADE_REQUIRED');
    }
    grade = gradeInput === 'K' ? 0 : Number(gradeInput);
    stage = grade === 0 ? 'primary' : (grade <= 4 ? 'primary' : (grade <= 8 ? 'middle' : 'high'));
  } else {
    if (!['primary','middle','high'].includes(stage) || !schoolName || !schoolAddress) {
      return resultError('Öğretmen ve müdür hesapları için kademe, okul adı ve okul adresi zorunludur.', 'SCHOOL_PROFILE_REQUIRED');
    }
    grade = 0;
  }
  if (profileType === 'principal' && (!schoolName || !schoolAddress)) {
    return resultError('Müdür hesabı için okul adı ve adresi zorunludur.', 'SCHOOL_PROFILE_REQUIRED');
  }
  const schoolKey = (schoolName && schoolAddress) ? sha256(countryCode + '|' + schoolName.toLocaleLowerCase('tr').replace(/\\s+/g,' ').trim() + '|' + schoolAddress.toLocaleLowerCase('tr').replace(/\\s+/g,' ').trim()) : '';
  // Config-defined staff credentials are reserved for the corresponding role.
  const reservedRole = await roleForEmail(email);
  if (reservedRole !== 'member') return resultError('Bu e-posta adresi özel bir hesap için ayrılmış. Giriş ekranını kullan.', 'RESERVED_ACCOUNT');

  const existingQuery = new Parse.Query(Parse.User);
  existingQuery.equalTo('username', email);
  const existing = await existingQuery.first({ useMasterKey: true });
  if (existing) return resultError('Bu e-posta ile bir hesap zaten var. Giriş yapmayı dene.', 'EMAIL_EXISTS');

  const user = new Parse.User();
  user.set('username', email);
  user.set('email', email);
  user.set('password', password);
  user.set('displayName', name);
  user.set('name', name);
  user.set('role', 'member');
  user.set('profileType', profileType);
  user.set('countryCode', countryCode);
  user.set('grade', grade);
  user.set('educationStage', stage);
  user.set('educationYear', academicYearForCountry(countryCode));
  user.set('schoolName', schoolName);
  user.set('schoolAddress', schoolAddress);
  user.set('schoolKey', schoolKey);
  user.set('inviteCodePending', inviteCode);
  user.set('banned', false);
  user.set('emailVerified', false);
  await user.signUp(null, { useMasterKey: true });
  await writeAuditLog(request, 'user.register', user.id, { email: email });

  const verificationRequired = (await configValueAsync('REQUIRE_EMAIL_VERIFY', CONFIG_DEFAULTS.REQUIRE_EMAIL_VERIFY)).toLowerCase() !== 'false';
  if (verificationRequired) {
    const code = String(crypto.randomInt(100000, 1000000));
    try {
      const verification = await saveVerification(email, code);
      try {
        await sendVerificationEmail(email, code, name);
        verification.set('deliveryFailed', false);
        await verification.save(null, { useMasterKey: true });
      } catch (mailError) {
        verification.set('deliveryFailed', true);
        await verification.save(null, { useMasterKey: true });
        throw mailError;
      }
    } catch (error) {
      // Do not delete the account automatically if email delivery fails; provide a useful message.
      console.error('[TdevKuantum] Registration email error:', error && error.message);
      return resultError(error && error.message ? error.message : 'E-posta gönderilemedi. Config ayarlarını kontrol et.', 'EMAIL_DELIVERY_FAILED');
    }
  } else {
    await setVerified(user);
  }
  return { success: true, verificationRequired: verificationRequired, email: email, message: verificationRequired ? 'Doğrulama kodu e-postana gönderildi.' : 'Kayıt tamamlandı.' };
});

Parse.Cloud.define('verifyEmailCode', async (request) => {
  const email = normalizeEmail(request.params && request.params.email);
  const code = safeText(request.params && request.params.code, 10);
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return resultError('Geçerli e-posta ve 6 haneli kod gir.', 'INVALID_CODE');

  const verification = await findVerification(email);
  if (!verification) return resultError('Kod bulunamadı veya süresi doldu. Yeni kod istemen gerekebilir.', 'CODE_EXPIRED');
  const attempts = Number(verification.get('attempts') || 0);
  if (attempts >= 5) return resultError('Çok fazla yanlış deneme. Yeni kod iste.', 'TOO_MANY_ATTEMPTS');
  if (!secureEqual(verification.get('codeHash'), sha256(code))) {
    verification.set('attempts', attempts + 1);
    await verification.save(null, { useMasterKey: true });
    return resultError('Doğrulama kodu hatalı.', 'INVALID_CODE');
  }

  const query = new Parse.Query(Parse.User);
  query.equalTo('username', email);
  const user = await query.first({ useMasterKey: true });
  if (!user) return resultError('Bu e-posta için hesap bulunamadı.', 'USER_NOT_FOUND');
  await setVerified(user);
  await writeAuditLog(request, 'user.email_verified', user.id, { email: email });
  verification.set('used', true);
  await verification.save(null, { useMasterKey: true });
  return { success: true, message: 'E-posta doğrulandı.' };
});

Parse.Cloud.define('resendVerificationCode', async (request) => {
  const email = normalizeEmail(request.params && request.params.email);
  if (!validEmail(email)) return resultError('Geçerli bir e-posta adresi gir.', 'INVALID_EMAIL');
  const genericMessage = 'Eğer bu e-posta doğrulanmamış bir hesaba aitse yeni kod gönderilecektir. Gelen kutunu ve spam klasörünü kontrol et.';
  const userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo('username', email);
  const user = await userQuery.first({ useMasterKey: true });
  if (!user || user.get('emailVerified') === true) return { success: true, message: genericMessage };

  const recentQuery = new Parse.Query('EmailVerification');
  recentQuery.equalTo('emailHash', sha256(email));
  recentQuery.equalTo('used', false);
  recentQuery.greaterThan('createdAt', new Date(Date.now() - 60 * 1000));
  recentQuery.descending('createdAt');
  recentQuery.limit(1);
  const recent = await recentQuery.first({ useMasterKey: true });
  if (recent && recent.get('deliveryFailed') !== true) return resultError('Güvenlik için yeni kod istemeden önce bir dakika bekle.', 'RATE_LIMITED');

  const code = String(crypto.randomInt(100000, 1000000));
  const verification = await saveVerification(email, code);
  try {
    await sendVerificationEmail(email, code, user.get('displayName') || user.get('name') || 'öğrenci');
    verification.set('deliveryFailed', false);
    await verification.save(null, { useMasterKey: true });
    await writeAuditLog(null, 'user.email_verification_resent', user.id, { emailHash: sha256(email) });
    return { success: true, message: genericMessage };
  } catch (error) {
    verification.set('deliveryFailed', true);
    await verification.save(null, { useMasterKey: true });
    console.error('[TdevKuantum] Resend verification email error:', error && error.message);
    return resultError(error && error.message ? error.message : 'Doğrulama e-postası gönderilemedi.', 'EMAIL_DELIVERY_FAILED');
  }
});

Parse.Cloud.define('loginUser', async (request) => {
  const email = normalizeEmail(request.params && request.params.email);
  const password = String((request.params && request.params.password) || '');
  if (!validEmail(email) || !password) return resultError('E-posta ve şifre gerekli.', 'INVALID_INPUT');

  const specialRole = await isConfiguredSpecialLogin(email, password);
  if (specialRole) {
    const staffQuery = new Parse.Query(Parse.User);
    staffQuery.equalTo('username', email);
    let staffUser = await staffQuery.first({ useMasterKey: true });
    const configuredPassword = await configValueAsync(specialRole === 'founder' ? 'FOUNDER_PASSWORD' : (specialRole === 'admin' ? 'ADMIN_PASSWORD' : 'BETA_PASSWORD'));
    if (!configuredPassword) return resultError('Bu özel hesap için şifre Back4App Config içinde ayarlanmamış.', 'STAFF_PASSWORD_NOT_CONFIGURED');
    if (!staffUser) {
      staffUser = new Parse.User();
      staffUser.set('username', email);
      staffUser.set('email', email);
      staffUser.set('displayName', specialRole === 'founder' ? 'Kurucu' : (specialRole === 'admin' ? 'Admin' : 'Beta'));
      staffUser.set('name', specialRole === 'founder' ? 'Kurucu' : (specialRole === 'admin' ? 'Admin' : 'Beta'));
      staffUser.set('role', specialRole);
      staffUser.set('emailVerified', true);
      staffUser.set('banned', false);
      staffUser.set('password', configuredPassword);
      await staffUser.signUp(null, { useMasterKey: true });
    } else {
      if (staffUser.get('banned') === true) return resultError('Bu hesap devre dışı bırakılmış.', 'ACCOUNT_BANNED');
      // Sync the Parse password with the server-only Config secret so Parse can
      // issue a real session token for protected Cloud Code calls.
      staffUser.set('password', configuredPassword);
      staffUser.set('role', specialRole);
      staffUser.set('emailVerified', true);
      await staffUser.save(null, { useMasterKey: true });
    }
    const authenticatedStaff = await Parse.User.logIn(email, configuredPassword);
    if (authenticatedStaff.get('banned') === true) return resultError('Bu hesap devre dışı bırakılmış.', 'ACCOUNT_BANNED');
    await writeAuditLog(request, 'user.login', authenticatedStaff.id, { email: email, role: specialRole });
    return {
      success: true,
      role: specialRole,
      name: safeText(authenticatedStaff.get('displayName') || authenticatedStaff.get('name'), 100),
      email: email,
      sessionToken: authenticatedStaff.getSessionToken()
    };
  }

  try {
    const user = await Parse.User.logIn(email, password);
    if (user.get('banned') === true) {
      try { await user.logOut(); } catch (_) {}
      return resultError('Bu hesap devre dışı bırakılmış.', 'ACCOUNT_BANNED');
    }
    if ((await configValueAsync('REQUIRE_EMAIL_VERIFY', CONFIG_DEFAULTS.REQUIRE_EMAIL_VERIFY)).toLowerCase() !== 'false' && user.get('emailVerified') !== true) {
      return { success: false, verificationRequired: true, error: 'Önce e-posta adresini doğrula.', code: 'EMAIL_NOT_VERIFIED' };
    }
    const configuredRole = await roleForEmail(email);
    const role = configuredRole !== 'member' ? configuredRole : 'member';
    await applyAnnualGradePromotion(user);
    await writeAuditLog(request, 'user.login', user.id, { email: email, role: role });
    return { success: true, role: role, name: safeText(user.get('displayName') || user.get('name') || user.get('username'), 100), email: email, sessionToken: user.getSessionToken() };
  } catch (error) {
    console.warn('[TdevKuantum] Login rejected:', error && error.code);
    return resultError('E-posta veya şifre hatalı.', 'INVALID_CREDENTIALS');
  }
});

Parse.Cloud.define('getCurriculum', async (request) => {
  const gradeInput = safeText(request.params && request.params.grade, 10).toUpperCase();
  const server = safeText(request.params && request.params.server, 5).toUpperCase();
  const isKindergarten = gradeInput === 'K' && server === 'US';
  const gradeNumber = isKindergarten ? 0 : Number(gradeInput);
  const validGrade = isKindergarten || (Number.isInteger(gradeNumber) && gradeNumber >= 1 && gradeNumber <= 12) ||
    (gradeNumber === 13 && ['UK', 'GB', 'DE'].includes(server));
  if (!validGrade || !/^[A-Z]{2}$/.test(server)) return {};
  const q = new Parse.Query('Curriculum');
  q.equalTo('grade', gradeNumber);
  q.equalTo('server', server === 'GB' ? 'UK' : server);
  q.limit(1);
  const row = await q.first({ useMasterKey: true });
  let legacySubjects = null;
  if (row && row.get('subjects') && typeof row.get('subjects') === 'object') {
    const sourceUrl = safeText(row.get('sourceUrl'), 500);
    const sourceName = safeText(row.get('sourceName'), 160);
    const curriculumYear = safeText(row.get('curriculumYear'), 20);
    const verifiedAt = row.get('verifiedAt');
    const officialVerified = row.get('isOfficial') === true &&
      /^https:\/\//i.test(sourceUrl) && !!sourceName && !!curriculumYear && !!verifiedAt;
    const curriculumMeta = {
      status: officialVerified ? 'verified' : 'unverified',
      statusLabel: officialVerified ? 'Resmî kaynak ve sürüm bilgisi doğrulanmış' : 'Veritabanı kaydı var; resmîlik/güncellik doğrulanmamış',
      countryCode: server === 'GB' ? 'UK' : server,
      grade: gradeInput,
      sourceUrl: /^https:\/\//i.test(sourceUrl) ? sourceUrl : '',
      sourceName: sourceName || '',
      curriculumYear: curriculumYear || '',
      verifiedAt: verifiedAt ? new Date(verifiedAt).toISOString() : ''
    };
    const storedSubjects = row.get('subjects');
    const decorated = {};
    Object.keys(storedSubjects).forEach((subject) => {
      const item = storedSubjects[subject];
      decorated[subject] = item && typeof item === 'object' && !Array.isArray(item)
        ? Object.assign({}, item, { curriculumMeta: curriculumMeta })
        : item;
    });
    legacySubjects = decorated;
  }
  // Prefer imported country/grade-specific programs. Merge them with legacy Curriculum rows when both exist.
  // The generated fallback below remains explicitly unverified and is not presented as an official syllabus.
  try {
    const programQuery = new Parse.Query('CurriculumProgram');
    programQuery.equalTo('countryCode', server === 'GB' ? 'UK' : server);
    programQuery.equalTo('grade', gradeNumber);
    programQuery.equalTo('active', true);
    programQuery.descending('updatedAtISO');
    programQuery.limit(100);
    const programRows = await programQuery.find({ useMasterKey: true });
    const imported = {};
    programRows.forEach((programRow) => {
      const subjectName = safeText(programRow.get('subject'), 120);
      if (!subjectName) return;
      const programType = safeText(programRow.get('programType'), 24);
      const schoolType = safeText(programRow.get('schoolType'), 120);
      const field = safeText(programRow.get('field'), 120);
      const branch = safeText(programRow.get('branch'), 120);
      const qualifier = [field, branch].filter(Boolean).join(' / ');
      const displaySubject = qualifier ? subjectName + ' · ' + qualifier : subjectName;
      const rawTopics = programRow.get('topics') || {};
      const topicRows = Array.isArray(rawTopics) ? rawTopics : (Array.isArray(rawTopics.topics) ? rawTopics.topics : (Array.isArray(rawTopics.units) ? rawTopics.units : []));
      const sourceUrl = safeText(programRow.get('sourceUrl'), 500);
      const sourceName = safeText(programRow.get('sourceName'), 180);
      const checkedAt = programRow.get('sourceCheckedAt');
      const verifiedAt = programRow.get('verifiedAt');
      const verified = programRow.get('isOfficial') === true && programRow.get('programStatus') === 'verified' && !!sourceName && /^https:\/\//i.test(sourceUrl) && !!checkedAt && !!verifiedAt;
      const meta = {
        status: verified ? 'verified' : 'not-verified',
        statusLabel: verified ? 'Kaynak alan adı ve sürüm bilgisi kaydedilmiş; güncellik ve uygulama kapsamını ayrıca kontrol et' : 'Aktarılmış kayıt; resmîlik ve güncellik doğrulanmadı',
        countryCode: server === 'GB' ? 'UK' : server,
        countryName: safeText(programRow.get('countryName'), 100) || safeText(request.params && request.params.countryName, 100) || server,
        grade: gradeInput, programType: programType, schoolType: schoolType, field: field, branch: branch,
        sourceUrl: /^https:\/\//i.test(sourceUrl) ? sourceUrl : '', sourceName: sourceName,
        curriculumYear: safeText(programRow.get('curriculumYear'), 20),
        verifiedAt: verifiedAt ? new Date(verifiedAt).toISOString() : ''
      };
      if (!imported[displaySubject]) {
        imported[displaySubject] = {
          icon: /matematik|mathemat|math/i.test(subjectName) ? '📐' : (/fen|science|fizik|kimya|biyoloji/i.test(subjectName) ? '🔬' : '📚'),
          desc: [gradeInput === 'K' ? 'Anaokulu' : gradeInput + '. sınıf', meta.countryName, programType, schoolType].filter(Boolean).join(' · '),
          tag: server === 'TR' && gradeNumber === 8 ? 'lgs' : (gradeNumber >= 9 && gradeNumber <= 12 ? 'lise' : 'temel'),
          topics: [], videos: [], curriculumMeta: meta, meb1: meta.statusLabel,
          meb2: 'Bu kayıt yalnızca belirtilen öğretim yılı ve kaynak bilgisi kapsamında değerlendirilmelidir.',
          mebLink: meta.sourceUrl
        };
      }
      topicRows.slice(0, 100).forEach((topic, index) => {
        const title = typeof topic === 'string' ? safeText(topic, 180) : safeText(topic && (topic.title || topic.name || topic.unit), 180);
        if (!title) return;
        const explanation = typeof topic === 'object' && topic ? safeText(topic.explanation || topic.description || topic.summary, 2000) : '';
        imported[displaySubject].topics.push({
          id: safeText(topic && topic.id, 100) || programRow.id + '-' + index,
          title: title,
          explanation: explanation || 'Bu program kaydında konu açıklaması ayrıca sağlanmamış. Kaynak belgesini açarak ilgili kazanım ve kapsamı kontrol et.',
          objectives: topic && Array.isArray(topic.objectives) ? topic.objectives.slice(0, 20) : [],
          videos: []
        });
      });
    });
    const importedKeys = Object.keys(imported);
    if (importedKeys.length && importedKeys.some((key) => imported[key].topics.length)) {
      if (legacySubjects) {
        importedKeys.forEach((subject) => {
          let targetKey = subject;
          if (legacySubjects[targetKey]) {
            const suffix = safeText(imported[subject].curriculumMeta && imported[subject].curriculumMeta.programType, 24) || 'program';
            targetKey = subject + ' · ' + suffix;
            let duplicate = 2;
            while (legacySubjects[targetKey]) targetKey = subject + ' · ' + suffix + ' ' + duplicate++;
          }
          legacySubjects[targetKey] = imported[subject];
        });
        return legacySubjects;
      }
      return imported;
    }
  } catch (error) {
    console.warn('[TdevKuantum] Imported curriculum fallback unavailable:', String(error && error.message || error).slice(0, 180));
  }
  if (legacySubjects) return legacySubjects;
  return defaultCurriculum(gradeInput, server, safeText(request.params && request.params.countryName, 100));
});

Parse.Cloud.define('getCurriculumCoverage', async (request) => {
  // This endpoint reports source/coverage metadata only; it never claims that
  // every country's syllabus has been imported into the database.
  requireUser(request);
  const currentYear = '2026-2027';
  let database = { totalRecords: null, recordsMarkedOfficial: null, countAvailable: false };
  try {
    const totalQuery = new Parse.Query('Curriculum');
    const officialQuery = new Parse.Query('Curriculum');
    officialQuery.equalTo('isOfficial', true);
    const counts = await Promise.all([
      totalQuery.count({ useMasterKey: true }),
      officialQuery.count({ useMasterKey: true })
    ]);
    database = {
      totalRecords: Number(counts[0]) || 0,
      recordsMarkedOfficial: Number(counts[1]) || 0,
      countAvailable: true
    };
  } catch (error) {
    console.warn('[TdevKuantum] Curriculum coverage count unavailable:', String(error && error.message || error).slice(0, 180));
  }
  let importedPrograms = { totalRecords: null, recordsMarkedOfficial: null, countAvailable: false };
  try {
    const programTotal = new Parse.Query('CurriculumProgram');
    const programOfficial = new Parse.Query('CurriculumProgram');
    programOfficial.equalTo('isOfficial', true);
    const counts = await Promise.all([
      programTotal.count({ useMasterKey: true }),
      programOfficial.count({ useMasterKey: true })
    ]);
    importedPrograms = {
      totalRecords: Number(counts[0]) || 0,
      recordsMarkedOfficial: Number(counts[1]) || 0,
      countAvailable: true
    };
  } catch (error) {
    console.warn('[TdevKuantum] Imported curriculum program count unavailable:', String(error && error.message || error).slice(0, 160));
  }
  return {
    success: true,
    currentYear: currentYear,
    checkedAt: '2026-10-25',
    database: Object.assign({}, database, { importedPrograms: importedPrograms }),
    sources: [
      { id: 'meb-programs', countryCode: 'TR', category: 'general', name: 'MEB Talim ve Terbiye Kurulu — Öğretim Programları', url: 'https://mufredat.meb.gov.tr/Programlar.aspx', sourceType: 'official', note: 'Resmî program listesi; platforma aktarım ve sürüm doğrulaması ayrıca yapılmalıdır.' },
      { id: 'tymm-programs', countryCode: 'TR', category: 'general', name: 'Türkiye Yüzyılı Maarif Modeli — Öğretim Programları', url: 'https://tymm.meb.gov.tr/ogretim-programlari', sourceType: 'official', note: 'Ders, kademe, sınıf ve ünite ayrıntıları resmî portalda kontrol edilir.' },
      { id: 'tymm-basic-plans', countryCode: 'TR', category: 'general', name: 'TYMM 2026–2027 — Temel Eğitim Çerçeve Planları', url: 'https://tymm.meb.gov.tr/taslak-cerceve-planlari/temel-egitim', sourceType: 'official', note: '2026–2027 uygulama bilgisi ve yıllık planlar için.' },
      { id: 'tymm-secondary-plans', countryCode: 'TR', category: 'general', name: 'TYMM 2026–2027 — Ortaöğretim Çerçeve Planları', url: 'https://tymm.meb.gov.tr/taslak-cerceve-planlari/ortaogretim', sourceType: 'official', note: '2026–2027 lise uygulama bilgisi ve yıllık planlar için.' },
      { id: 'vocational-programs', countryCode: 'TR', category: 'vocational', name: 'MTEGM — Mesleki ve Teknik Öğretim Programları', url: 'https://meslek.meb.gov.tr/', sourceType: 'official', note: 'Alan, dal, sınıf, ders bilgi formları ve çerçeve programları; okul türü ve öğretim yılına göre kontrol edilmelidir.' },
      { id: 'vocational-fields', countryCode: 'TR', category: 'vocational', name: 'Mesleğim Hayatım — Alan/Dal Listeleri', url: 'https://meslegimhayatim.meb.gov.tr/meslegim-gelecegim-ve-kariyerim/alandal-listesi', sourceType: 'official', note: 'Güncel alan/dal listeleri için resmî bağlantı.' },
      { id: 'imamhatip-programs', countryCode: 'TR', category: 'imamhatip', name: 'Din Öğretimi Genel Müdürlüğü — Öğretim Programları', url: 'https://dogm.meb.gov.tr/www/ogretim-programlari-arsivi/icerik/2064', sourceType: 'official', note: 'İmam hatip ortaokulu ve Anadolu imam hatip lisesi meslek dersleri; ders ve sınıf bazında program yılı ayrıca kontrol edilmelidir.' },
      { id: 'imamhatip-timetables', countryCode: 'TR', category: 'imamhatip', name: 'Din Öğretimi Genel Müdürlüğü — Haftalık Ders Çizelgeleri', url: 'https://dogm.meb.gov.tr/www/haftalik-ders-cizelgeleri/icerik/11%20class%3D', sourceType: 'official', note: 'İHO ve AİHL ders çizelgeleri ve uygulama yılı için.' },
      { id: 'uk-national-curriculum', countryCode: 'GB', category: 'international', name: 'United Kingdom — National Curriculum (England)', url: 'https://www.gov.uk/national-curriculum', sourceType: 'official', note: 'Bu kaynak İngiltere içindir; İskoçya, Galler ve Kuzey İrlanda için ayrı kaynaklar gerekir.' },
      { id: 'germany-kmk', countryCode: 'DE', category: 'international', name: 'Deutschland — Kultusministerkonferenz (KMK)', url: 'https://www.kmk.org/', sourceType: 'official', note: 'Eğitim düzenlemeleri eyaletlere göre değişir; tek bir ulusal konu listesi olarak yorumlanmamalıdır.' },
      { id: 'us-education', countryCode: 'US', category: 'international', name: 'United States — U.S. Department of Education', url: 'https://www.ed.gov/', sourceType: 'official', note: 'ABD’de müfredat ve standartlar eyalet/yerel düzeyde değişir; bu bağlantı tek bir ulusal müfredat anlamına gelmez.' },
      { id: 'azerbaijan-ministry', countryCode: 'AZ', category: 'international', name: 'Azerbaijan — Ministry of Science and Education', url: 'https://edu.gov.az/en', sourceType: 'official', note: 'Ülke, sınıf ve öğretim yılı bazında içerik ayrıca doğrulanmalıdır.' },
      { id: 'japan-mext', countryCode: 'JP', category: 'international', name: 'Japan — Ministry of Education (MEXT)', url: 'https://www.mext.go.jp/en/', sourceType: 'official', note: 'Resmî eğitim rehberleri; ders ve sınıf bazında aktarım ayrıca doğrulanmalıdır.' },
      { id: 'unesco-ibe', countryCode: 'GLOBAL', category: 'international', name: 'UNESCO-IBE — Curriculum Resources', url: 'https://www.ibe.unesco.org/en', sourceType: 'reference', note: 'Uluslararası başvuru kaynağıdır; tek başına bir ülkenin güncel resmî müfredatının doğrulandığı anlamına gelmez.' }
    ],
    notices: [
      'Ülke seçimi, o ülkenin bütün ders ve sınıflarının platforma aktarılmış olduğunu göstermez.',
      'Genel öğrenme rehberi ile resmî öğretim programı ayrı tutulur.',
      'Meslekî-teknik ve imam hatip içerikleri alan/dal, okul türü, sınıf ve program yılı bazında doğrulanmadan resmî olarak işaretlenmemelidir.'
    ]
  };
});

// Seed content is a learning guide, not a claim that every item is an official
// national syllabus. The database Curriculum class takes precedence for verified
// country/grade-specific material. Unverified countries are labelled accordingly.
const TK_TOPIC_BANK = {
  'Türkçe': [
    ['Okuduğunu anlama','Metni dikkatle okuyup ana düşünceyi, yardımcı düşünceleri ve metnin amacını belirle. Bilmediğin kelimelerin anlamını bağlamdan çıkar.'],
    ['Sözcükte anlam','Sözcükleri gerçek, mecaz ve terim anlamlarıyla ayırt et; eş ve zıt anlam ilişkilerini örneklerle incele.'],
    ['Cümlede anlam','Cümlenin bildirdiği yargıyı, neden-sonuç, amaç-sonuç ve koşul ilişkilerini belirle.'],
    ['Yazım ve noktalama','Büyük harf, eklerin yazımı, nokta, virgül, soru işareti ve konuşma çizgisini anlamına uygun kullan.'],
    ['Dil bilgisi','Sözcük türlerini ve cümle ögelerini sınıf düzeyine uygun örneklerle tanı.'],
    ['Yazılı anlatım','Giriş, gelişme ve sonuç düzeni kur; düşüncelerini açık, tutarlı ve özgün cümlelerle ifade et.']
  ],
  'Matematik': [
    ['Sayılar ve işlemler','Sayıların basamak değerini kavra; toplama, çıkarma, çarpma ve bölme işlemlerini işlem önceliğine göre uygula.'],
    ['Kesirler ve ondalık gösterim','Kesrin bütüne oranını modelle; kesirleri karşılaştır ve uygun işlemleri yap.'],
    ['Cebirsel düşünme','Bilinmeyeni sembolle göster; örüntüler, eşitlikler ve basit denklemler arasında ilişki kur.'],
    ['Geometri ve ölçme','Şekillerin özelliklerini, açıları, çevreyi, alanı ve uygun ölçü birimlerini kullanarak çözümle.'],
    ['Oran, orantı ve yüzde','İki niceliği karşılaştır; oran, yüzde ve orantıyı günlük hayat problemlerinde uygula.'],
    ['Veri ve olasılık','Verileri tablo ve grafikle göster; sonuçları yorumla ve temel olasılık kavramlarını kullan.']
  ],
  'Fen Bilimleri': [
    ['Canlılar ve yaşam','Canlıların ortak özelliklerini, hücreyi ve ekosistemdeki ilişkileri sınıf seviyene göre açıkla.'],
    ['Madde ve değişim','Maddenin tanecikli yapısını, hâl değişimlerini ve fiziksel-kimyasal değişimleri örnekle.'],
    ['Kuvvet ve hareket','Kuvvetin hareket üzerindeki etkisini gözlemle; sürat, enerji ve basit makinelerle ilişki kur.'],
    ['Işık, ses ve elektrik','Işığın ve sesin yayılmasını, devre elemanlarını ve enerji dönüşümlerini deneylerle incele.'],
    ['Dünya ve uzay','Dünya, Güneş ve Ay hareketlerini; mevsimler ve uzay araştırmalarıyla ilişkili temel kavramları öğren.'],
    ['Bilimsel araştırma','Soru oluştur, tahmin yap, değişkenleri belirle, güvenli gözlem yap ve kanıta dayalı sonuç çıkar.']
  ],
  'Sosyal Bilgiler': [
    ['Birey ve toplum','Kimlik, hak, sorumluluk ve toplumsal rollerin günlük yaşamdaki etkilerini örneklerle açıkla.'],
    ['Kültür ve miras','Tarihî eserleri ve kültürel mirası tanı; kaynakları karşılaştırarak geçmiş hakkında çıkarım yap.'],
    ['İnsanlar, yerler ve çevreler','Harita, yön, ölçek ve coğrafi özellikleri kullanarak insan-çevre ilişkisini incele.'],
    ['Bilim, teknoloji ve toplum','Teknolojik gelişmelerin iletişim, üretim ve günlük yaşam üzerindeki etkilerini değerlendir.'],
    ['Üretim, dağıtım ve tüketim','Kaynakların sınırlılığını, bütçe yapmayı ve bilinçli tüketimi örneklerle açıkla.'],
    ['Etkin vatandaşlık','Demokrasi, katılım, kurallar ve temel hakların toplumdaki önemini kavra.']
  ],
  'İngilizce': [
    ['Kendini tanıtma','Name, age, interests ve family gibi temel bilgilerle kısa ve anlaşılır cümleler kur.'],
    ['Günlük rutinler','Simple present yapısını kullanarak alışkanlıkları ve günlük programı anlat.'],
    ['Kelime ve bağlam','Yeni kelimeleri konu gruplarıyla öğren; anlamı cümle bağlamından çıkar.'],
    ['Okuma ve dinleme','Kısa metinlerde ana fikir, önemli ayrıntı ve konuşmacının amacını bul.'],
    ['Dil bilgisi','Sınıf düzeyine uygun zamanları, soru yapılarını ve zamirleri örneklerle uygula.'],
    ['Yazma ve konuşma','Kısa paragraf, diyalog ve açıklamalar hazırlarken anlaşılır dil kullan.']
  ],
  'Türk Dili ve Edebiyatı': [
    ['Metin türleri','Öykü, şiir, roman, tiyatro ve bilgilendirici metinlerin yapı ve amaçlarını karşılaştır.'],
    ['Şiir bilgisi','İmge, tema, ahenk, ölçü ve söz sanatlarının metne katkısını örneklerle yorumla.'],
    ['Edebî dönemler','Dönemleri tarihî ve kültürel bağlamlarıyla ele al; eser ve sanatçıları ezberden çok özellikleriyle ilişkilendir.'],
    ['Anlatım ve paragraf','Düşünceyi geliştirme yollarını, anlatım biçimlerini ve paragrafın yapısını çözümle.'],
    ['Dil bilgisi ve yazım','Anlatım bozukluklarını, sözcük türlerini ve yazım-noktalama kurallarını bağlam içinde uygula.'],
    ['Yazılı anlatım','Planlı, kanıtlı ve tutarlı metinler yaz; kaynak gösterme ve özgün ifade ilkelerine uy.']
  ],
  'Fizik': [
    ['Fizik ve ölçme','Fiziksel nicelikleri, SI birimlerini, ölçüm belirsizliğini ve bilimsel model kurmayı tanı.'],
    ['Hareket ve kuvvet','Konum, hız, ivme ve Newton yasalarını grafikler ve günlük örneklerle açıkla.'],
    ['Enerji ve momentum','Enerji korunumu, iş, güç ve momentum ilkelerini problem çözümünde kullan.'],
    ['Elektrik ve manyetizma','Elektrik yükü, akım, gerilim, direnç ve manyetik alan arasındaki ilişkileri incele.'],
    ['Dalgalar ve optik','Dalga özelliklerini, ses ve ışığın davranışını, yansıma ve kırılmayı modellerle açıkla.'],
    ['Modern fizik','Atom modelleri, kuantum kavramları ve teknolojik uygulamalarını temel düzeyde tanı.']
  ],
  'Kimya': [
    ['Atom ve periyodik sistem','Atomun yapısını, elektron dizilimini ve elementlerin periyodik özelliklerini ilişkilendir.'],
    ['Kimyasal türler arası etkileşim','İyonik, kovalent ve metalik bağlarla moleküller arası etkileşimleri ayırt et.'],
    ['Kimyasal tepkimeler','Tepkime denklemlerini denkleştir; kütlenin korunumu ve mol kavramını uygula.'],
    ['Karışımlar ve çözeltiler','Karışım türlerini, çözünürlüğü ve derişimi örneklerle açıkla.'],
    ['Asit, baz ve denge','Asit-baz özelliklerini, pH kavramını ve kimyasal dengeyi uygun modellerle yorumla.'],
    ['Organik kimya ve günlük yaşam','Karbon bileşiklerinin temel özelliklerini ve kimyanın çevre-sağlık bağlantılarını incele.']
  ],
  'Biyoloji': [
    ['Canlıların ortak özellikleri','Canlılık, organizasyon, metabolizma ve homeostaz kavramlarını örneklerle açıkla.'],
    ['Hücre ve organeller','Hücre zarını, sitoplazmayı ve organellerin görevlerini karşılaştır.'],
    ['Kalıtım ve genetik','DNA, gen, kromozom ve kalıtım ilkeleri arasındaki ilişkiyi problem ve modellerle incele.'],
    ['Ekoloji ve çevre','Besin ağları, madde döngüleri, biyoçeşitlilik ve insan etkisini değerlendir.'],
    ['İnsan fizyolojisi','Sistemlerin temel görevlerini ve vücudun dengeyi koruma biçimlerini öğren.'],
    ['Evrim ve biyoteknoloji','Bilimsel kanıt, biyolojik çeşitlilik ve biyoteknolojik uygulamaların temel ilkelerini tartış.']
  ],
  'Tarih': [
    ['Tarihî kaynak ve zaman','Birincil ve ikincil kaynakları ayırt et; kronoloji ve kanıtla tarihî çıkarım yap.'],
    ['İlk uygarlıklar','Yerleşik yaşam, tarım, şehirleşme ve uygarlıkların gelişimini karşılaştır.'],
    ['Türk ve dünya tarihi','Toplumların siyasi, ekonomik ve kültürel dönüşümlerini neden-sonuç ilişkisiyle incele.'],
    ['Osmanlı tarihi','Devlet yapısı, toplum, ekonomi ve kültürel değişimleri dönemlere göre değerlendir.'],
    ['Millî Mücadele ve Cumhuriyet','Yakın dönem olaylarını kaynaklar üzerinden incele; reformların toplumsal etkilerini açıkla.'],
    ['Tarihsel yorum','Farklı bakış açılarını ve kaynakların sınırlarını dikkate alarak kanıta dayalı yorum yap.']
  ],
  'Coğrafya': [
    ['Harita ve konum','Koordinat, ölçek, yön ve harita türlerini kullanarak mekânsal bilgi yorumla.'],
    ['Doğal sistemler','İklim, yer şekilleri, su ve toprak süreçlerinin yaşam üzerindeki etkilerini incele.'],
    ['Nüfus ve yerleşme','Nüfus dağılışı, göç ve kentleşmenin nedenlerini ve sonuçlarını değerlendir.'],
    ['Ekonomik faaliyetler','Tarım, sanayi, hizmetler, ulaşım ve ticaretin mekânsal dağılışını açıkla.'],
    ['Çevre ve sürdürülebilirlik','Doğal kaynakları, afet risklerini ve sürdürülebilir kalkınmayı örneklerle ele al.'],
    ['Küresel bağlantılar','Ülkeler arası ilişkileri, bölgesel farklılıkları ve küreselleşmenin etkilerini incele.']
  ],
  'Felsefe': [
    ['Felsefeye giriş','Soru sorma, kavram çözümleme, gerekçe sunma ve tutarlı düşünmenin önemini kavra.'],
    ['Bilgi felsefesi','Bilginin kaynağı, doğruluğu ve sınırları hakkındaki görüşleri karşılaştır.'],
    ['Varlık felsefesi','Varlık, değişim ve gerçeklik üzerine temel yaklaşımları argümanlarla incele.'],
    ['Ahlak felsefesi','İyi, doğru, özgürlük ve sorumluluk kavramlarını farklı etik yaklaşımlarla tartış.'],
    ['Siyaset ve toplum','Adalet, hak, devlet ve özgürlük kavramlarını felsefi argümanlarla değerlendir.'],
    ['Mantık ve argüman','Öncül-sonuç ilişkisini kur; geçerli çıkarımları ve akıl yürütme hatalarını ayırt et.']
  ],
  'Language Arts': [
    ['Reading comprehension','Identify the main idea, supporting details, tone, and purpose; infer meaning from context.'],
    ['Writing and structure','Plan a paragraph or essay with a clear claim, evidence, transitions, and conclusion.'],
    ['Vocabulary and grammar','Use context clues and grade-appropriate grammar to communicate clearly.'],
    ['Literature and genres','Compare fiction, poetry, drama, and informational texts using evidence.']
  ],
  'Science': [
    ['Scientific inquiry','Ask testable questions, identify variables, gather evidence, and explain conclusions.'],
    ['Life science','Explore cells, organisms, ecosystems, heredity, and adaptation at grade-appropriate depth.'],
    ['Physical science','Study matter, forces, energy, waves, and interactions using models and experiments.'],
    ['Earth and space','Investigate Earth systems, weather, climate, and the solar system.']
  ],
  'Mathematics': [
    ['Numbers and operations','Use number sense, operations, and estimation to solve problems and check reasonableness.'],
    ['Algebraic thinking','Represent patterns and relationships with expressions, equations, and graphs.'],
    ['Geometry and measurement','Reason about shapes, angles, dimensions, area, volume, and units.'],
    ['Statistics and probability','Represent data, describe distributions, and reason about chance.']
  ],
  'Social Studies': [
    ['Civics and citizenship','Explore rights, responsibilities, institutions, and participation in civic life.'],
    ['History and sources','Use timelines and evidence to explain change and continuity.'],
    ['Geography and people','Study maps, places, migration, resources, and human-environment interactions.'],
    ['Economics','Understand needs, resources, trade, budgets, and choices.']
  ]
};
function tkStageSubjects(grade, server) {
  if (server === 'TR') {
    if (grade <= 2) return ['Türkçe','Matematik','Hayat Bilgisi','İngilizce','Görsel Sanatlar','Müzik','Beden Eğitimi'];
    if (grade <= 4) return ['Türkçe','Matematik','Fen Bilimleri','Sosyal Bilgiler','İngilizce','Din Kültürü ve Ahlak Bilgisi','Görsel Sanatlar','Müzik','Beden Eğitimi'];
    if (grade <= 7) return ['Türkçe','Matematik','Fen Bilimleri','Sosyal Bilgiler','İngilizce','Din Kültürü ve Ahlak Bilgisi','Bilişim Teknolojileri','Görsel Sanatlar','Müzik','Beden Eğitimi'];
    if (grade === 8) return ['Türkçe','Matematik','Fen Bilimleri','T.C. İnkılap Tarihi ve Atatürkçülük','İngilizce','Din Kültürü ve Ahlak Bilgisi','Bilişim Teknolojileri'];
    return ['Türk Dili ve Edebiyatı','Matematik','Fizik','Kimya','Biyoloji','Tarih','Coğrafya','Felsefe','İngilizce','Din Kültürü ve Ahlak Bilgisi','Beden Eğitimi','Bilişim Teknolojileri'];
  }
  const profiles = {
    US: ['Language Arts','Mathematics','Science','Social Studies','English Language Development','Computer Science','Arts','Physical Education'],
    UK: ['English','Mathematics','Science','History','Geography','Computing','Modern Foreign Languages','Art and Design','Physical Education'],
    DE: ['Deutsch','Mathematik','Naturwissenschaften','Geschichte','Geographie','Englisch','Informatik','Kunst','Sport'],
    AZ: ['Azərbaycan dili','Riyaziyyat','Təbiət','Azərbaycan tarixi','İngilis dili','İnformatika','Fiziki tərbiyə'],
    JP: ['国語','数学','理科','社会','英語','技術・家庭','美術','保健体育'],
    FR: ['Français','Mathématiques','Sciences et technologie','Histoire-Géographie','Langues vivantes','Enseignement moral et civique','Arts','Éducation physique'],
    ES: ['Lengua Castellana y Literatura','Matemáticas','Ciencias de la Naturaleza','Ciencias Sociales','Inglés','Educación Física','Educación Artística'],
    IT: ['Italiano','Matematica','Scienze','Storia','Geografia','Inglese','Tecnologia','Arte e immagine','Educazione fisica'],
    PT: ['Português','Matemática','Estudo do Meio','Ciências Naturais','História e Geografia','Inglês','Educação Física'],
    BR: ['Língua Portuguesa','Matemática','Ciências','História','Geografia','Língua Inglesa','Arte','Educação Física'],
    MX: ['Español','Matemáticas','Ciencias','Historia','Geografía','Formación Cívica y Ética','Inglés','Educación Física'],
    CA: ['English / French Language Arts','Mathematics','Science','Social Studies','Indigenous Education','Arts','Physical Education'],
    AU: ['English','Mathematics','Science','Humanities and Social Sciences','Health and Physical Education','Technologies','The Arts'],
    NZ: ['English','Mathematics and Statistics','Science','Social Sciences','Technology','The Arts','Health and Physical Education'],
    IN: ['English','Hindi','Mathematics','Science','Social Science','Computer Science','Environmental Studies'],
    CN: ['语文','数学','科学','道德与法治','历史','地理','英语','信息科技','体育与健康'],
    KR: ['국어','수학','사회','과학','영어','정보','체육','예술'],
    TW: ['國語','數學','自然科學','社會','英語','科技','藝術','健康與體育'],
    TH: ['ภาษาไทย','คณิตศาสตร์','วิทยาศาสตร์','สังคมศึกษา','ภาษาอังกฤษ','เทคโนโลยี','สุขศึกษาและพลศึกษา'],
    VN: ['Ngữ văn','Toán','Khoa học tự nhiên','Lịch sử và Địa lý','Ngoại ngữ','Tin học','Công nghệ','Giáo dục thể chất'],
    ID: ['Bahasa Indonesia','Matematika','Ilmu Pengetahuan Alam','Ilmu Pengetahuan Sosial','Bahasa Inggris','Informatika','Pendidikan Pancasila'],
    MY: ['Bahasa Melayu','English','Mathematics','Science','Sejarah','Reka Bentuk dan Teknologi','Pendidikan Jasmani'],
    SG: ['English Language','Mother Tongue Languages','Mathematics','Science','Social Studies','Character and Citizenship Education','Physical Education'],
    SA: ['اللغة العربية','الرياضيات','العلوم','الدراسات الاجتماعية','اللغة الإنجليزية','التربية الإسلامية','المهارات الرقمية'],
    AE: ['اللغة العربية','الرياضيات','العلوم','الدراسات الاجتماعية','اللغة الإنجليزية','التربية الإسلامية','التصميم والتكنولوجيا'],
    EG: ['اللغة العربية','الرياضيات','العلوم','الدراسات الاجتماعية','اللغة الإنجليزية','تكنولوجيا المعلومات'],
    PK: ['Urdu','English','Mathematics','General Science','Pakistan Studies','Islamiyat','Computer Science'],
    BD: ['বাংলা','English','গণিত','বিজ্ঞান','বাংলাদেশ ও বিশ্বপরিচয়','তথ্য ও যোগাযোগ প্রযুক্তি'],
    LK: ['සිංහල / தமிழ்','English','Mathematics','Science','History','Civic Education','Information Technology'],
    NL: ['Nederlands','Rekenen / Wiskunde','Natuur en techniek','Geschiedenis','Aardrijkskunde','Engels','Burgerschap'],
    SE: ['Svenska','Matematik','Naturorienterande ämnen','Samhällsorienterande ämnen','Engelska','Teknik','Idrott och hälsa'],
    NO: ['Norsk','Matematikk','Naturfag','Samfunnsfag','Engelsk','Kunst og håndverk','Kroppsøving'],
    FI: ['Suomi / Svenska','Matematiikka','Ympäristöoppi','Yhteiskuntaoppi','Englanti','Käsityö','Liikunta'],
    PL: ['Język polski','Matematyka','Przyroda / Biologia','Historia','Geografia','Język obcy','Informatyka'],
    GR: ['Νεοελληνική Γλώσσα','Μαθηματικά','Φυσικές Επιστήμες','Ιστορία','Γεωγραφία','Αγγλικά','Πληροφορική'],
    AT: ['Deutsch','Mathematik','Sachunterricht / Naturwissenschaften','Geschichte und Sozialkunde','Geographie','Englisch','Digitale Grundbildung'],
    CH: ['Deutsch / Français / Italiano','Mathematik','Naturwissenschaften','Geschichte','Geografie','Fremdsprachen','Medien und Informatik'],
    RU: ['Русский язык','Математика','Окружающий мир / Естествознание','История','География','Иностранный язык','Информатика'],
    UA: ['Українська мова','Математика','Природничі науки','Історія України','Географія','Англійська мова','Інформатика'],
    KZ: ['Қазақ тілі','Орыс тілі','Математика','Жаратылыстану','Қазақстан тарихы','Ағылшын тілі','Информатика'],
    UZ: ['Ona tili','Matematika','Tabiiy fanlar','O‘zbekiston tarixi','Ingliz tili','Informatika'],
    IL: ['עברית','מתמטיקה','מדעים','היסטוריה','גאוגרפיה','אנגלית','אזרחות'],
    IR: ['فارسی','ریاضی','علوم تجربی','مطالعات اجتماعی','زبان انگلیسی','مطالعات دینی'],
    IQ: ['اللغة العربية','الرياضيات','العلوم','الاجتماعيات','اللغة الإنجليزية','الحاسوب'],
    KE: ['English','Kiswahili','Mathematics','Integrated Science','Social Studies','Creative Arts','Agriculture'],
    ZA: ['English / Home Language','Mathematics','Natural Sciences','Social Sciences','Technology','Life Orientation'],
    GH: ['English Language','Mathematics','Integrated Science','Social Studies','Computing','Creative Arts'],
    NG: ['English Studies','Mathematics','Basic Science','Social Studies','Civic Education','Computer Studies']
  };
  if (profiles[server]) return profiles[server];
  if (server === 'GB') return profiles.UK;
  return ['Language Arts','Mathematics','Science','Social Studies','Languages','Digital Literacy','Arts','Physical Education'];
}
function tkTopicFor(subject, grade) {
  const aliases = {
    'Deutsch':'Language Arts','Azərbaycan dili':'Language Arts','Riyaziyyat':'Mathematics',
    'Təbiət':'Science','Azərbaycan tarixi':'Social Studies','国語':'Language Arts','数学':'Mathematics',
    '理科':'Science','社会':'Social Studies','English':'Language Arts','Englisch':'Language Arts',
    'Naturwissenschaften':'Science','Geographie':'Social Studies','Geschichte':'Social Studies',
    'İngilis dili':'Language Arts','İnformatika':'Science','Computer Science':'Science','Computing':'Science',
    'Digital Literacy':'Science','Bilişim Teknolojileri':'Science','Hayat Bilgisi':'Social Studies',
    'Din Kültürü ve Ahlak Bilgisi':'Social Studies','T.C. İnkılap Tarihi ve Atatürkçülük':'Tarih',
    'Görsel Sanatlar':'Social Studies','Müzik':'Social Studies','Beden Eğitimi':'Science',
    'Art and Design':'Social Studies','Arts':'Social Studies','Physical Education':'Science',
    'Modern Foreign Languages':'Language Arts','English Language Development':'Language Arts',
    'Français':'Language Arts','Lengua Castellana y Literatura':'Language Arts','Español':'Language Arts',
    'Italiano':'Language Arts','Português':'Language Arts','Língua Portuguesa':'Language Arts',
    'Matemática':'Mathematics','Matematica':'Mathematics','Mathématiques':'Mathematics','Matemáticas':'Mathematics',
    'Rekenen / Wiskunde':'Mathematics','Matematiikka':'Mathematics','Математика':'Mathematics',
    'علوم':'Science','العلوم':'Science','الرياضيات':'Mathematics','اللغة العربية':'Language Arts',
    'فارسی':'Language Arts','Русский язык':'Language Arts','Українська мова':'Language Arts',
    'বাংলা':'Language Arts','ภาษาไทย':'Language Arts','Ngữ văn':'Language Arts','Bahasa Indonesia':'Language Arts',
    'Bahasa Melayu':'Language Arts','Svenska':'Language Arts','Norsk':'Language Arts','Język polski':'Language Arts',
    'Νεοελληνική Γλώσσα':'Language Arts','Natuur en techniek':'Science','Natuurorienterande ämnen':'Science',
    'Naturorienterande ämnen':'Science','Integrated Science':'Science','Basic Science':'Science',
    'विज्ञान':'Science','科学':'Science','자연':'Science','Khoa học tự nhiên':'Science',
    '技術・家庭':'Science','美術':'Social Studies','保健体育':'Science','Informatik':'Science','Sport':'Science','Kunst':'Social Studies'
  };
  if (TK_TOPIC_BANK[subject]) return TK_TOPIC_BANK[subject];
  const bank = TK_TOPIC_BANK[aliases[subject] || 'Social Studies'] || TK_TOPIC_BANK['Social Studies'];
  return bank;
}
function tkLocalizedTopicFor(subject, grade, server) {
  const languageArts = /language arts|english|deutsch|fran[cç]ais|espa[nñ]ol|portugu[eê]s|italiano|azərbaycan dili|国語|语文|國語|국어|اللغة العربية|русский язык|bahasa indonesia|ngữ văn|lengua|ภาษาไทย|हिंदी|اردو|বাংলা|nederlands|svenska|norsk|suomi|polski/i.test(subject);
  const mathematics = /mathemat|matematik|mathématique|数学|수학|الرياضيات|riyaziyyat|matematika|toán|математ|rekenen|matematiikka|คณิตศาสตร์|गणित|গণিত/i.test(subject);
  const science = /science|fen|fizik|kimya|biyoloji|naturwissenschaft|ciencias|sciences|ciências|理科|科学|과학|العلوم|тәбиғи|ilmu pengetahuan alam|khoa học|биологи|naturfag|วิทยาศาสตร์|विज्ञान|বিজ্ঞান|natuur en techniek/i.test(subject);
  const digital = /computer|computing|informatik|digital|teknoloji|technology|信息|信息科技|정보|الحاسوب|informatika|tin học|computación/i.test(subject);
  const social = /social|history|histor|geograph|geografie|coğraf|tarih|sosyal|사회|社会|社会科|الدراسات|história|historia|sejarah|lịch sử|geografía|geografia|สังคมศึกษา|इतिहास|भूगोल|সামাজিক|বাংলাদেশ ও বিশ্বপরিচয়/i.test(subject);
  const category = mathematics ? 'math' : science ? 'science' : digital ? 'digital' : social ? 'social' : languageArts ? 'language' : 'general';
  const en = {
    language:[['Reading and meaning','Identify the main idea, supporting details, and the meaning of words in context.'],['Writing clearly','Organize ideas into a beginning, middle, and conclusion.'],['Grammar and sentences','Use sentence structure and punctuation to communicate meaning.'],['Speaking and listening','Summarize what you hear and respond with relevant details.'],['Vocabulary','Learn new words through context and use them in original sentences.'],['Text analysis','Compare information and distinguish fact from opinion.']],
    math:[['Numbers and operations','Represent numbers, choose appropriate operations, and check whether a result is reasonable.'],['Patterns and algebra','Describe patterns and use symbols to represent unknown values.'],['Geometry and measurement','Use shapes, angles, units, perimeter, and area to solve problems.'],['Fractions and ratios','Compare parts and wholes and apply ratios to everyday situations.'],['Data and probability','Read tables and graphs and describe possible outcomes.'],['Problem solving','Show each step, explain the method, and check the answer.']],
    science:[['Scientific inquiry','Ask a testable question, identify variables, and draw a conclusion from evidence.'],['Living systems','Describe how organisms interact with their environment.'],['Matter and materials','Compare material properties and explain observable changes.'],['Forces and energy','Explain how forces affect motion and how energy changes form.'],['Earth and space','Describe patterns in Earth systems and objects in space.'],['Evidence and models','Use observations, diagrams, and simple models to explain a claim.']],
    social:[['People and communities','Explain how people, communities, and institutions influence one another.'],['Time and historical sources','Compare sources and distinguish evidence from interpretation.'],['Places and maps','Use maps, scale, direction, and location to describe places.'],['Civics and responsibility','Describe rights, responsibilities, and ways people participate in society.'],['Resources and choices','Explain how resources, needs, and decisions affect communities.'],['Culture and change','Compare cultural practices and explain how societies change over time.']],
    digital:[['Digital systems','Identify common digital systems and explain their purpose.'],['Information literacy','Check sources and distinguish reliable information from unsupported claims.'],['Algorithms','Describe a process as clear, ordered steps.'],['Data and privacy','Explain why personal data should be protected.'],['Problem solving','Break a task into smaller steps and test a solution.'],['Responsible technology','Use technology respectfully, safely, and legally.']],
    general:[['Key ideas','Identify the main ideas and explain them in your own words.'],['Important terms','Define the key terms and use them in an example.'],['Examples and evidence','Support an explanation with a relevant example.'],['Compare and connect','Find similarities, differences, and relationships.'],['Apply what you learn','Use the concept to solve a new, grade-appropriate problem.'],['Review and reflect','Summarize what you know and identify what needs more practice.']]
  };
  const banks = {
    DE: {
      language:[['Lesen und Bedeutung','Bestimme Hauptaussage, wichtige Details und die Bedeutung von Wörtern im Kontext.'],['Klar schreiben','Ordne Gedanken in Einleitung, Hauptteil und Schluss.'],['Grammatik und Sätze','Nutze Satzbau und Zeichensetzung, um Bedeutungen klar auszudrücken.'],['Wortschatz','Lerne neue Wörter im Kontext und verwende sie in eigenen Sätzen.'],['Texte untersuchen','Vergleiche Informationen und unterscheide Tatsachen von Meinungen.'],['Zuhören und sprechen','Fasse Gehörtes zusammen und antworte mit passenden Details.']],
      math:[['Zahlen und Rechenoperationen','Stelle Zahlen dar, wähle passende Rechenoperationen und prüfe Ergebnisse.'],['Muster und Algebra','Beschreibe Muster und verwende Symbole für unbekannte Werte.'],['Geometrie und Messen','Nutze Formen, Winkel, Einheiten, Umfang und Fläche zur Problemlösung.'],['Brüche und Verhältnisse','Vergleiche Teile und Ganze und wende Verhältnisse an.'],['Daten und Wahrscheinlichkeit','Lies Tabellen und Diagramme und beschreibe mögliche Ergebnisse.'],['Problemlösen','Zeige die Rechenschritte und überprüfe das Ergebnis.']],
      science:[['Wissenschaftliches Arbeiten','Formuliere eine überprüfbare Frage und leite Schlussfolgerungen aus Belegen ab.'],['Lebewesen und Umwelt','Beschreibe, wie Lebewesen mit ihrer Umwelt zusammenwirken.'],['Stoffe und Materialien','Vergleiche Materialeigenschaften und erkläre beobachtbare Veränderungen.'],['Kräfte und Energie','Erkläre die Wirkung von Kräften und Energieumwandlungen.'],['Erde und Weltraum','Beschreibe Vorgänge in Erdsystemen und im Weltraum.'],['Modelle und Belege','Nutze Beobachtungen und einfache Modelle zur Erklärung.']]
    },
    ES: {
      language:[['Lectura y significado','Identifica la idea principal, los detalles y el significado de palabras por el contexto.'],['Escritura clara','Organiza las ideas en introducción, desarrollo y conclusión.'],['Gramática y oraciones','Usa la estructura de las oraciones y la puntuación para expresar ideas.'],['Vocabulario','Aprende palabras en contexto y utilízalas en frases propias.'],['Análisis de textos','Compara información y distingue hechos de opiniones.'],['Escucha y expresión oral','Resume lo que escuchas y responde con detalles relevantes.']],
      math:[['Números y operaciones','Representa números, elige operaciones adecuadas y comprueba los resultados.'],['Patrones y álgebra','Describe patrones y utiliza símbolos para valores desconocidos.'],['Geometría y medida','Usa figuras, ángulos, unidades, perímetro y área para resolver problemas.'],['Fracciones y razones','Compara partes y totalidades y aplica razones en situaciones cotidianas.'],['Datos y probabilidad','Interpreta tablas y gráficos y describe resultados posibles.'],['Resolución de problemas','Explica los pasos y comprueba la respuesta.']],
      science:[['Investigación científica','Formula una pregunta comprobable y extrae conclusiones a partir de evidencias.'],['Seres vivos y entorno','Explica cómo los organismos interactúan con su entorno.'],['Materia y materiales','Compara propiedades y explica cambios observables.'],['Fuerzas y energía','Describe cómo las fuerzas afectan al movimiento y cómo cambia la energía.'],['Tierra y espacio','Explica patrones de los sistemas terrestres y los objetos espaciales.'],['Modelos y evidencias','Utiliza observaciones y modelos sencillos para explicar ideas.']]
    },
    FR: {
      language:[['Lecture et sens','Repère l’idée principale, les détails importants et le sens des mots en contexte.'],['Écriture claire','Organise les idées avec une introduction, un développement et une conclusion.'],['Grammaire et phrases','Utilise la structure des phrases et la ponctuation pour exprimer tes idées.'],['Vocabulaire','Apprends les mots en contexte et réutilise-les dans tes phrases.'],['Analyse de textes','Compare les informations et distingue les faits des opinions.'],['Écoute et expression','Résume ce que tu entends et réponds avec des détails pertinents.']],
      math:[['Nombres et opérations','Représente les nombres, choisis les opérations adaptées et vérifie les résultats.'],['Motifs et algèbre','Décris des régularités et utilise des symboles pour les inconnues.'],['Géométrie et mesures','Utilise les formes, les angles, les unités, le périmètre et l’aire.'],['Fractions et rapports','Compare les parties et le tout et applique les rapports.'],['Données et probabilités','Lis des tableaux et graphiques et décris les résultats possibles.'],['Résolution de problèmes','Explique les étapes et vérifie la réponse.']],
      science:[['Démarche scientifique','Pose une question vérifiable et tire une conclusion à partir de preuves.'],['Êtres vivants et environnement','Explique les interactions entre les organismes et leur environnement.'],['Matière et matériaux','Compare les propriétés et explique les changements observables.'],['Forces et énergie','Explique l’effet des forces sur le mouvement et les transformations d’énergie.'],['Terre et espace','Décris les phénomènes des systèmes terrestres et de l’espace.'],['Modèles et preuves','Utilise des observations et des modèles simples pour expliquer.']]
    },
    PT: {
      language:[['Leitura e significado','Identifica a ideia principal, os detalhes e o sentido das palavras pelo contexto.'],['Escrita clara','Organiza as ideias em introdução, desenvolvimento e conclusão.'],['Gramática e frases','Usa a estrutura das frases e a pontuação para comunicar com clareza.'],['Vocabulário','Aprende palavras no contexto e usa-as em frases próprias.'],['Análise de textos','Compara informações e distingue factos de opiniões.'],['Escuta e expressão oral','Resume o que ouves e responde com detalhes relevantes.']],
      math:[['Números e operações','Representa números, escolhe operações adequadas e verifica os resultados.'],['Padrões e álgebra','Descreve padrões e usa símbolos para valores desconhecidos.'],['Geometria e medidas','Usa formas, ângulos, unidades, perímetro e área para resolver problemas.'],['Frações e razões','Compara partes e totalidades e aplica razões em situações do dia a dia.'],['Dados e probabilidade','Interpreta tabelas e gráficos e descreve resultados possíveis.'],['Resolução de problemas','Explica os passos e confirma a resposta.']],
      science:[['Investigação científica','Formula uma pergunta testável e tira conclusões com base em evidências.'],['Seres vivos e ambiente','Explica como os organismos interagem com o ambiente.'],['Matéria e materiais','Compara propriedades e explica mudanças observáveis.'],['Forças e energia','Explica como as forças afetam o movimento e como a energia se transforma.'],['Terra e espaço','Descreve padrões dos sistemas terrestres e do espaço.'],['Modelos e evidências','Usa observações e modelos simples para explicar ideias.']]
    },
    AZ: {
      language:[['Oxuyub-anlama','Mətnin əsas fikrini, vacib detalları və sözlərin kontekstdə mənasını müəyyən et.'],['Aydın yazı','Fikirlərini giriş, əsas hissə və nəticə şəklində qur.'],['Qrammatika və cümlə','Fikri aydın çatdırmaq üçün cümlə quruluşundan və durğu işarələrindən istifadə et.'],['Söz ehtiyatı','Yeni sözləri kontekstdə öyrən və öz cümlələrində işlət.'],['Mətn təhlili','Məlumatları müqayisə et, faktı fikirdən ayır.'],['Dinləmə və danışıq','Eşitdiyini ümumiləşdir və uyğun detallarla cavab ver.']],
      math:[['Ədədlər və əməllər','Ədədləri təsvir et, uyğun əməliyyat seç və nəticəni yoxla.'],['Qanunauyğunluq və cəbr','Qanunauyğunluqları təsvir et və naməlum qiymətlər üçün simvollardan istifadə et.'],['Həndəsə və ölçmə','Fiqurları, bucaqları, vahidləri, perimetr və sahəni tətbiq et.'],['Kəsrlər və nisbətlər','Hissə ilə bütövü müqayisə et və nisbətləri tətbiq et.'],['Məlumat və ehtimal','Cədvəl və qrafikləri oxu, mümkün nəticələri izah et.'],['Məsələ həlli','Həll addımlarını göstər və cavabı yoxla.']],
      science:[['Elmi araşdırma','Yoxlanıla bilən sual ver və sübutlara əsasən nəticə çıxar.'],['Canlılar və mühit','Canlıların ətraf mühitlə qarşılıqlı əlaqəsini izah et.'],['Maddə və materiallar','Materialların xüsusiyyətlərini müqayisə et və dəyişiklikləri izah et.'],['Qüvvə və enerji','Qüvvənin hərəkətə təsirini və enerji çevrilmələrini izah et.'],['Yer və kosmos','Yer sistemlərində və kosmosda baş verən qanunauyğunluqları təsvir et.'],['Model və sübut','Müşahidələrdən və sadə modellərdən istifadə et.']]
    },
    JA: {
      language:[['読解と意味','文章の主題、重要な情報、文脈による語句の意味を読み取ります。'],['分かりやすい文章','考えを導入・展開・まとめの順に整理します。'],['文法と文','文の構造や句読点を適切に使います。'],['語彙','新しい言葉を文脈で理解し、自分の文で使います。'],['文章の分析','情報を比較し、事実と意見を区別します。'],['聞く・話す','聞いた内容を要約し、関連する情報で答えます。']],
      math:[['数と計算','数を表し、適切な計算を選び、結果を確かめます。'],['規則性と代数','規則性を説明し、未知の値を記号で表します。'],['図形と測定','図形、角度、単位、周の長さ、面積を使って考えます。'],['分数と比','部分と全体を比較し、比を活用します。'],['データと確率','表やグラフを読み、起こりうる結果を説明します。'],['問題解決','解き方を順序立てて示し、答えを確認します。']],
      science:[['科学的な探究','検証できる問いを立て、証拠に基づいて結論を導きます。'],['生物と環境','生物と環境の関わりを説明します。'],['物質と材料','物質の性質を比べ、観察できる変化を説明します。'],['力とエネルギー','力が運動に与える影響とエネルギーの変化を説明します。'],['地球と宇宙','地球や宇宙で見られる規則性を説明します。'],['モデルと証拠','観察結果や簡単なモデルを使って説明します。']]
    },
    CN: {
      language:[['阅读与理解','找出文章主旨、重要细节以及词语在上下文中的含义。'],['清晰表达','按开头、展开和总结的顺序组织想法。'],['语法与句子','运用句式和标点清楚地表达意思。'],['词汇积累','结合语境学习新词，并在自己的句子中使用。'],['文本分析','比较信息，区分事实与观点。'],['倾听与表达','概括听到的内容，并用相关细节回答。']],
      math:[['数与运算','表示数，选择合适的运算，并检查结果是否合理。'],['规律与代数','描述规律，用符号表示未知数值。'],['几何与测量','运用图形、角度、单位、周长和面积解决问题。'],['分数与比例','比较部分与整体，并应用比例关系。'],['数据与概率','阅读表格和图表，描述可能出现的结果。'],['解决问题','写出步骤，说明方法并检查答案。']],
      science:[['科学探究','提出可检验的问题，并根据证据得出结论。'],['生命与环境','解释生物与环境之间的相互作用。'],['物质与材料','比较材料性质并解释可观察到的变化。'],['力与能量','说明力对运动的影响以及能量的转化。'],['地球与宇宙','描述地球系统和宇宙中的规律。'],['模型与证据','运用观察结果和简单模型解释现象。']]
    },
    KO: {
      language:[['읽기와 의미','글의 중심 생각과 세부 정보, 문맥 속 단어의 의미를 파악합니다.'],['명확한 글쓰기','생각을 도입, 전개, 결론 순서로 정리합니다.'],['문법과 문장','문장 구조와 문장 부호를 알맞게 사용합니다.'],['어휘','문맥에서 새 단어를 배우고 자신의 문장에 활용합니다.'],['텍스트 분석','정보를 비교하고 사실과 의견을 구분합니다.'],['듣기와 말하기','들은 내용을 요약하고 관련 정보로 답합니다.']],
      math:[['수와 연산','수를 표현하고 적절한 연산을 선택해 결과를 확인합니다.'],['규칙과 대수','규칙을 설명하고 미지의 값을 기호로 나타냅니다.'],['도형과 측정','도형, 각도, 단위, 둘레와 넓이를 활용합니다.'],['분수와 비','부분과 전체를 비교하고 비를 적용합니다.'],['자료와 가능성','표와 그래프를 읽고 가능한 결과를 설명합니다.'],['문제 해결','풀이 단계를 쓰고 답을 확인합니다.']],
      science:[['과학적 탐구','검증할 수 있는 질문을 만들고 증거로 결론을 내립니다.'],['생명과 환경','생물과 환경의 상호작용을 설명합니다.'],['물질과 재료','물질의 성질을 비교하고 관찰되는 변화를 설명합니다.'],['힘과 에너지','힘이 운동에 미치는 영향과 에너지 전환을 설명합니다.'],['지구와 우주','지구 시스템과 우주의 규칙성을 설명합니다.'],['모형과 증거','관찰과 간단한 모형을 사용해 현상을 설명합니다.']]
    },
    AR: {
      language:[['القراءة والمعنى','حدد الفكرة الرئيسة والتفاصيل المهمة ومعاني الكلمات من السياق.'],['الكتابة الواضحة','رتب الأفكار في مقدمة وعرض وخاتمة.'],['القواعد والجمل','استخدم تركيب الجملة وعلامات الترقيم للتعبير بوضوح.'],['المفردات','تعلم الكلمات من السياق واستخدمها في جمل من إنشائك.'],['تحليل النصوص','قارن المعلومات وميّز بين الحقائق والآراء.'],['الاستماع والتحدث','لخص ما تسمعه وأجب بتفاصيل مناسبة.']],
      math:[['الأعداد والعمليات','مثل الأعداد واختر العملية المناسبة وتحقق من معقولية النتيجة.'],['الأنماط والجبر','صف الأنماط واستخدم الرموز للقيم المجهولة.'],['الهندسة والقياس','استخدم الأشكال والزوايا والوحدات والمحيط والمساحة.'],['الكسور والنسب','قارن الجزء بالكل وطبق النسب في مواقف حياتية.'],['البيانات والاحتمالات','اقرأ الجداول والرسوم ووضح النتائج الممكنة.'],['حل المشكلات','اكتب خطوات الحل واشرح الطريقة وتحقق من الإجابة.']],
      science:[['الاستقصاء العلمي','اطرح سؤالاً قابلاً للاختبار واستنتج بناءً على الأدلة.'],['الكائنات الحية والبيئة','اشرح تفاعل الكائنات الحية مع بيئتها.'],['المادة والمواد','قارن خصائص المواد واشرح التغيرات الملحوظة.'],['القوى والطاقة','اشرح تأثير القوى في الحركة وتحولات الطاقة.'],['الأرض والفضاء','صف الأنماط في أنظمة الأرض والفضاء.'],['النماذج والأدلة','استخدم الملاحظات والنماذج البسيطة لتفسير الظواهر.']]
    },
    RU: {
      language:[['Чтение и смысл','Определи главную мысль, важные детали и значение слов по контексту.'],['Ясное письмо','Расположи мысли во вступлении, основной части и заключении.'],['Грамматика и предложения','Используй структуру предложений и знаки препинания для ясного выражения мысли.'],['Словарный запас','Изучай слова в контексте и используй их в собственных предложениях.'],['Анализ текста','Сравнивай информацию и отличай факты от мнений.'],['Слушание и речь','Кратко перескажи услышанное и ответь по существу.']],
      math:[['Числа и действия','Представляй числа, выбирай подходящие действия и проверяй результат.'],['Закономерности и алгебра','Описывай закономерности и обозначай неизвестные символами.'],['Геометрия и измерения','Используй фигуры, углы, единицы, периметр и площадь.'],['Дроби и отношения','Сравнивай части и целое и применяй отношения.'],['Данные и вероятность','Читай таблицы и графики и описывай возможные результаты.'],['Решение задач','Показывай шаги решения и проверяй ответ.']],
      science:[['Научное исследование','Задавай проверяемый вопрос и делай вывод на основе доказательств.'],['Живые системы','Объясняй взаимодействие организмов с окружающей средой.'],['Вещества и материалы','Сравнивай свойства материалов и объясняй наблюдаемые изменения.'],['Силы и энергия','Объясняй влияние сил на движение и превращения энергии.'],['Земля и космос','Описывай закономерности земных систем и космоса.'],['Модели и доказательства','Используй наблюдения и простые модели для объяснения.']]
    },
    ID: {
      language:[['Membaca dan makna','Temukan gagasan utama, rincian penting, dan arti kata berdasarkan konteks.'],['Menulis dengan jelas','Susun gagasan menjadi pembuka, isi, dan kesimpulan.'],['Tata bahasa dan kalimat','Gunakan struktur kalimat dan tanda baca secara tepat.'],['Kosakata','Pelajari kata melalui konteks dan gunakan dalam kalimat sendiri.'],['Analisis teks','Bandingkan informasi dan bedakan fakta dari pendapat.'],['Menyimak dan berbicara','Ringkas hal yang didengar dan jawab dengan informasi yang relevan.']],
      math:[['Bilangan dan operasi','Representasikan bilangan, pilih operasi yang sesuai, dan periksa hasilnya.'],['Pola dan aljabar','Jelaskan pola dan gunakan simbol untuk nilai yang belum diketahui.'],['Geometri dan pengukuran','Gunakan bentuk, sudut, satuan, keliling, dan luas.'],['Pecahan dan rasio','Bandingkan bagian dan keseluruhan serta gunakan rasio.'],['Data dan peluang','Baca tabel dan grafik serta jelaskan hasil yang mungkin.'],['Pemecahan masalah','Tunjukkan langkah penyelesaian dan periksa jawaban.']],
      science:[['Penyelidikan ilmiah','Ajukan pertanyaan yang dapat diuji dan simpulkan berdasarkan bukti.'],['Makhluk hidup dan lingkungan','Jelaskan interaksi organisme dengan lingkungannya.'],['Materi dan bahan','Bandingkan sifat bahan dan jelaskan perubahan yang diamati.'],['Gaya dan energi','Jelaskan pengaruh gaya terhadap gerak dan perubahan energi.'],['Bumi dan antariksa','Jelaskan pola pada sistem bumi dan benda di ruang angkasa.'],['Model dan bukti','Gunakan pengamatan dan model sederhana untuk menjelaskan.']]
    },
    VI: {
      language:[['Đọc hiểu và ý nghĩa','Xác định ý chính, chi tiết quan trọng và nghĩa của từ theo ngữ cảnh.'],['Viết rõ ràng','Sắp xếp ý thành mở bài, thân bài và kết luận.'],['Ngữ pháp và câu','Dùng cấu trúc câu và dấu câu để diễn đạt rõ ràng.'],['Từ vựng','Học từ mới qua ngữ cảnh và dùng trong câu của mình.'],['Phân tích văn bản','So sánh thông tin và phân biệt sự thật với ý kiến.'],['Nghe và nói','Tóm tắt điều đã nghe và trả lời bằng chi tiết phù hợp.']],
      math:[['Số và phép tính','Biểu diễn số, chọn phép tính phù hợp và kiểm tra kết quả.'],['Quy luật và đại số','Mô tả quy luật và dùng ký hiệu cho giá trị chưa biết.'],['Hình học và đo lường','Sử dụng hình, góc, đơn vị, chu vi và diện tích để giải quyết vấn đề.'],['Phân số và tỷ lệ','So sánh phần với toàn thể và áp dụng tỷ lệ.'],['Dữ liệu và xác suất','Đọc bảng, biểu đồ và mô tả kết quả có thể xảy ra.'],['Giải quyết vấn đề','Trình bày các bước và kiểm tra đáp án.']],
      science:[['Tìm hiểu khoa học','Đặt câu hỏi có thể kiểm chứng và kết luận dựa trên bằng chứng.'],['Sinh vật và môi trường','Giải thích sự tương tác giữa sinh vật và môi trường.'],['Vật chất và vật liệu','So sánh tính chất và giải thích thay đổi quan sát được.'],['Lực và năng lượng','Giải thích tác động của lực lên chuyển động và sự chuyển hóa năng lượng.'],['Trái Đất và vũ trụ','Mô tả các quy luật trong hệ Trái Đất và vũ trụ.'],['Mô hình và bằng chứng','Dùng quan sát và mô hình đơn giản để giải thích hiện tượng.']]
    }
  };
  banks.TH = {
    language:[['การอ่านและความหมาย','ระบุใจความสำคัญ รายละเอียด และความหมายของคำจากบริบท'],['การเขียนอย่างชัดเจน','จัดลำดับความคิดเป็นบทนำ เนื้อหา และสรุป'],['ไวยากรณ์และประโยค','ใช้โครงสร้างประโยคและเครื่องหมายวรรคตอนอย่างเหมาะสม'],['คำศัพท์','เรียนรู้คำใหม่จากบริบทและนำไปใช้ในประโยค'],['การวิเคราะห์ข้อความ','เปรียบเทียบข้อมูลและแยกข้อเท็จจริงออกจากความคิดเห็น'],['การฟังและพูด','สรุปสิ่งที่ฟังและตอบด้วยรายละเอียดที่เกี่ยวข้อง']],
    math:[['จำนวนและการคำนวณ','แทนจำนวน เลือกวิธีคำนวณที่เหมาะสม และตรวจสอบคำตอบ'],['รูปแบบและพีชคณิต','อธิบายรูปแบบและใช้สัญลักษณ์แทนค่าที่ไม่ทราบ'],['เรขาคณิตและการวัด','ใช้รูปทรง มุม หน่วย เส้นรอบรูป และพื้นที่แก้ปัญหา'],['เศษส่วนและอัตราส่วน','เปรียบเทียบส่วนกับทั้งหมดและใช้อัตราส่วนในสถานการณ์จริง'],['ข้อมูลและความน่าจะเป็น','อ่านตารางและกราฟและอธิบายผลลัพธ์ที่เป็นไปได้'],['การแก้ปัญหา','แสดงขั้นตอนและตรวจสอบคำตอบ']],
    science:[['การสืบเสาะทางวิทยาศาสตร์','ตั้งคำถามที่ตรวจสอบได้และสรุปจากหลักฐาน'],['สิ่งมีชีวิตและสิ่งแวดล้อม','อธิบายปฏิสัมพันธ์ระหว่างสิ่งมีชีวิตกับสิ่งแวดล้อม'],['สสารและวัสดุ','เปรียบเทียบสมบัติของวัสดุและอธิบายการเปลี่ยนแปลง'],['แรงและพลังงาน','อธิบายผลของแรงต่อการเคลื่อนที่และการเปลี่ยนรูปพลังงาน'],['โลกและอวกาศ','อธิบายรูปแบบที่พบในระบบโลกและอวกาศ'],['แบบจำลองและหลักฐาน','ใช้การสังเกตและแบบจำลองอย่างง่ายอธิบายปรากฏการณ์']]
  };
  banks.BN = {
    language:[['পঠন ও অর্থ','মূল ভাব, গুরুত্বপূর্ণ তথ্য এবং প্রসঙ্গ থেকে শব্দের অর্থ নির্ধারণ করো।'],['স্পষ্ট লেখা','ভূমিকা, মূল অংশ ও উপসংহারে চিন্তা সাজাও।'],['ব্যাকরণ ও বাক্য','স্পষ্টভাবে ভাব প্রকাশ করতে বাক্যগঠন ও বিরামচিহ্ন ব্যবহার করো।'],['শব্দভান্ডার','প্রসঙ্গ থেকে নতুন শব্দ শেখো এবং নিজের বাক্যে ব্যবহার করো।'],['পাঠ বিশ্লেষণ','তথ্য তুলনা করো এবং সত্য ও মতামতের পার্থক্য বোঝো।'],['শোনা ও বলা','শোনা বিষয় সংক্ষেপে বলো এবং প্রাসঙ্গিক তথ্য দিয়ে উত্তর দাও।']],
    math:[['সংখ্যা ও গণনা','সংখ্যা উপস্থাপন করো, উপযুক্ত গণনা বেছে নাও এবং ফল যাচাই করো।'],['ধারা ও বীজগণিত','ধারা ব্যাখ্যা করো এবং অজানা মান বোঝাতে প্রতীক ব্যবহার করো।'],['জ্যামিতি ও পরিমাপ','আকার, কোণ, একক, পরিসীমা ও ক্ষেত্রফল ব্যবহার করো।'],['ভগ্নাংশ ও অনুপাত','অংশ ও সম্পূর্ণ তুলনা করো এবং অনুপাত প্রয়োগ করো।'],['তথ্য ও সম্ভাবনা','সারণি ও চিত্র পড়ে সম্ভাব্য ফল ব্যাখ্যা করো।'],['সমস্যা সমাধান','ধাপে ধাপে সমাধান দেখাও এবং উত্তর যাচাই করো।']],
    science:[['বৈজ্ঞানিক অনুসন্ধান','পরীক্ষাযোগ্য প্রশ্ন করো এবং প্রমাণের ভিত্তিতে সিদ্ধান্ত নাও।'],['জীব ও পরিবেশ','জীবের সঙ্গে পরিবেশের পারস্পরিক সম্পর্ক ব্যাখ্যা করো।'],['পদার্থ ও উপাদান','উপাদানের বৈশিষ্ট্য তুলনা করো এবং পরিবর্তন ব্যাখ্যা করো।'],['বল ও শক্তি','গতিতে বলের প্রভাব এবং শক্তির রূপান্তর ব্যাখ্যা করো।'],['পৃথিবী ও মহাকাশ','পৃথিবী ও মহাকাশের নিয়মিত ধারা বর্ণনা করো।'],['মডেল ও প্রমাণ','পর্যবেক্ষণ ও সহজ মডেল দিয়ে ঘটনা ব্যাখ্যা করো।']]
  };
  banks.HI = {
    language:[['पठन और अर्थ','मुख्य विचार, महत्वपूर्ण विवरण और संदर्भ से शब्दों का अर्थ पहचानें।'],['स्पष्ट लेखन','विचारों को भूमिका, मुख्य भाग और निष्कर्ष में व्यवस्थित करें।'],['व्याकरण और वाक्य','स्पष्ट अभिव्यक्ति के लिए वाक्य संरचना और विराम चिह्नों का उपयोग करें।'],['शब्दावली','संदर्भ से नए शब्द सीखें और अपने वाक्यों में प्रयोग करें।'],['पाठ विश्लेषण','जानकारी की तुलना करें और तथ्य तथा राय में अंतर करें।'],['सुनना और बोलना','सुनी हुई बात का सार बताएं और प्रासंगिक उत्तर दें।']],
    math:[['संख्याएँ और संक्रियाएँ','संख्याओं को दर्शाएँ, सही संक्रिया चुनें और परिणाम जाँचें।'],['पैटर्न और बीजगणित','पैटर्न समझाएँ और अज्ञात मानों के लिए प्रतीकों का उपयोग करें।'],['ज्यामिति और मापन','आकृतियों, कोणों, इकाइयों, परिमाप और क्षेत्रफल का उपयोग करें।'],['भिन्न और अनुपात','भाग और पूर्ण की तुलना करें तथा अनुपात लागू करें।'],['आँकड़े और प्रायिकता','तालिकाएँ और ग्राफ पढ़ें तथा संभावित परिणाम बताएँ।'],['समस्या समाधान','हल के चरण दिखाएँ और उत्तर जाँचें।']],
    science:[['वैज्ञानिक जाँच','जाँचा जा सकने वाला प्रश्न पूछें और प्रमाण से निष्कर्ष निकालें।'],['जीव और पर्यावरण','जीवों और उनके पर्यावरण के संबंध को समझाएँ।'],['पदार्थ और सामग्री','गुणों की तुलना करें और दिखाई देने वाले बदलाव समझाएँ।'],['बल और ऊर्जा','गति पर बल के प्रभाव और ऊर्जा के रूपांतरण समझाएँ।'],['पृथ्वी और अंतरिक्ष','पृथ्वी और अंतरिक्ष में पाए जाने वाले पैटर्न बताएँ।'],['मॉडल और प्रमाण','घटनाओं को समझाने के लिए अवलोकन और सरल मॉडल उपयोग करें।']]
  };
  banks.NL = {
    language:[['Lezen en betekenis','Bepaal de hoofdgedachte, belangrijke details en de betekenis van woorden uit de context.'],['Duidelijk schrijven','Orden ideeën in een inleiding, kern en conclusie.'],['Grammatica en zinnen','Gebruik zinsbouw en leestekens om helder te communiceren.'],['Woordenschat','Leer nieuwe woorden uit de context en gebruik ze in eigen zinnen.'],['Tekstanalyse','Vergelijk informatie en onderscheid feiten van meningen.'],['Luisteren en spreken','Vat wat je hoort samen en reageer met relevante details.']],
    math:[['Getallen en bewerkingen','Geef getallen weer, kies passende bewerkingen en controleer uitkomsten.'],['Patronen en algebra','Beschrijf patronen en gebruik symbolen voor onbekende waarden.'],['Meetkunde en meten','Gebruik vormen, hoeken, eenheden, omtrek en oppervlakte.'],['Breuken en verhoudingen','Vergelijk delen met het geheel en pas verhoudingen toe.'],['Gegevens en kans','Lees tabellen en grafieken en beschrijf mogelijke uitkomsten.'],['Problemen oplossen','Laat stappen zien en controleer het antwoord.']],
    science:[['Wetenschappelijk onderzoek','Stel een toetsbare vraag en trek conclusies op basis van bewijs.'],['Leven en omgeving','Leg uit hoe organismen met hun omgeving omgaan.'],['Stoffen en materialen','Vergelijk eigenschappen en verklaar waarneembare veranderingen.'],['Krachten en energie','Leg uit hoe krachten beweging beïnvloeden en energie verandert.'],['Aarde en ruimte','Beschrijf patronen in aardse systemen en de ruimte.'],['Modellen en bewijs','Gebruik waarnemingen en eenvoudige modellen om verschijnselen te verklaren.']]
  };
  banks.IT = {
    language:[['Lettura e significato','Individua l’idea principale, i dettagli importanti e il significato delle parole dal contesto.'],['Scrittura chiara','Organizza le idee in introduzione, sviluppo e conclusione.'],['Grammatica e frasi','Usa la struttura delle frasi e la punteggiatura in modo corretto.'],['Vocabolario','Impara parole nuove dal contesto e usale in frasi personali.'],['Analisi del testo','Confronta le informazioni e distingui fatti e opinioni.'],['Ascolto e comunicazione','Riassumi ciò che ascolti e rispondi con dettagli pertinenti.']],
    math:[['Numeri e operazioni','Rappresenta i numeri, scegli le operazioni adatte e verifica i risultati.'],['Schemi e algebra','Descrivi regolarità e usa simboli per valori sconosciuti.'],['Geometria e misure','Usa forme, angoli, unità, perimetro e area per risolvere problemi.'],['Frazioni e rapporti','Confronta parti e intero e applica i rapporti.'],['Dati e probabilità','Leggi tabelle e grafici e descrivi i risultati possibili.'],['Risoluzione dei problemi','Mostra i passaggi e controlla la risposta.']],
    science:[['Indagine scientifica','Formula una domanda verificabile e ricava conclusioni dalle prove.'],['Organismi e ambiente','Spiega le interazioni tra gli organismi e l’ambiente.'],['Materia e materiali','Confronta le proprietà e spiega i cambiamenti osservabili.'],['Forze ed energia','Spiega l’effetto delle forze sul movimento e le trasformazioni energetiche.'],['Terra e spazio','Descrivi i fenomeni dei sistemi terrestri e dello spazio.'],['Modelli e prove','Usa osservazioni e modelli semplici per spiegare i fenomeni.']]
  };
  const localeByCountry = {
    GB:'EN',UK:'EN',US:'EN',CA:'EN',AU:'EN',NZ:'EN',SG:'EN',ZA:'EN',GH:'EN',NG:'EN',
    DE:'DE',AT:'DE',CH:'DE',ES:'ES',MX:'ES',AR:'ES',CL:'ES',CO:'ES',PE:'ES',FR:'FR',BE:'FR',
    PT:'PT',BR:'PT',AZ:'AZ',JP:'JA',CN:'CN',TW:'CN',KR:'KO',SA:'AR',AE:'AR',EG:'AR',IQ:'AR',
    RU:'RU',UA:'RU',KZ:'RU',ID:'ID',MY:'ID',VN:'VI',TH:'TH',BD:'BN',IN:'HI',NL:'NL',IT:'IT'
  };
  let locale = localeByCountry[server] || 'EN';
  if (server === 'IN' && /हिंदी/.test(subject)) locale = 'HI';
  if (server === 'IN' && /English/i.test(subject)) locale = 'EN';
  if (server === 'CH' && /Français/i.test(subject)) locale = 'FR';
  if (server === 'CH' && /Italiano/i.test(subject)) locale = 'IT';
  const bank = banks[locale] || {};
  const fallback = en[category] || en.general;
  const localized = bank[category] || fallback;
  if (server === 'TR') return TK_TOPIC_BANK[subject] || TK_TOPIC_BANK[category === 'math' ? 'Matematik' : category === 'science' ? 'Fen Bilimleri' : category === 'social' ? 'Sosyal Bilgiler' : 'Türkçe'] || fallback;
  return localized;
}

function tkLearningObjectives(server) {
  const bank = {
    TR: ['Konuyu kendi cümlenle açıklayabilmek', 'En az bir örnek çözebilmek veya günlük hayatla ilişkilendirebilmek'],
    DE: ['Das Thema mit eigenen Worten erklären können', 'Mindestens ein Beispiel lösen oder im Alltag anwenden können'],
    ES: ['Explicar el tema con tus propias palabras', 'Resolver un ejemplo o relacionarlo con la vida cotidiana'],
    FR: ['Expliquer le sujet avec tes propres mots', 'Résoudre un exemple ou le relier à la vie quotidienne'],
    PT: ['Explicar o tema com as tuas próprias palavras', 'Resolver um exemplo ou relacioná-lo com a vida quotidiana'],
    AZ: ['Mövzunu öz sözlərinlə izah etmək', 'Ən azı bir nümunə həll etmək və ya gündəlik həyatla əlaqələndirmək'],
    JA: ['学んだ内容を自分の言葉で説明する', '例題を解くか、日常生活と結び付ける'],
    CN: ['能够用自己的话解释主题', '完成一个例题或联系日常生活'],
    TW: ['能用自己的話解釋主題', '完成一個例題或連結日常生活'],
    KR: ['배운 내용을 자신의 말로 설명하기', '예제를 풀거나 일상생활과 연결하기'],
    SA: ['شرح الموضوع بكلماتك الخاصة', 'حل مثال واحد على الأقل أو ربطه بالحياة اليومية'],
    AE: ['شرح الموضوع بكلماتك الخاصة', 'حل مثال واحد على الأقل أو ربطه بالحياة اليومية'],
    EG: ['شرح الموضوع بكلماتك الخاصة', 'حل مثال واحد على الأقل أو ربطه بالحياة اليومية'],
    IQ: ['شرح الموضوع بكلماتك الخاصة', 'حل مثال واحد على الأقل أو ربطه بالحياة اليومية'],
    RU: ['Объяснить тему своими словами', 'Решить пример или связать тему с повседневной жизнью'],
    ID: ['Menjelaskan topik dengan kata-kata sendiri', 'Menyelesaikan contoh atau menghubungkannya dengan kehidupan sehari-hari'],
    VN: ['Giải thích chủ đề bằng lời của mình', 'Giải một ví dụ hoặc liên hệ với cuộc sống hằng ngày']
  };
  return bank[server] || ['Explain the topic in your own words', 'Solve an example or connect it to everyday life'];
}
function tkCurriculumSource(server) {
  const sources = {
    TR:{name:'Türkiye — MEB Öğretim Programları',url:'https://mufredat.meb.gov.tr/Programlar.aspx'},
    US:{name:'United States — federal education portal; standards vary by state',url:'https://www.ed.gov/'},
    UK:{name:'England — National Curriculum; other UK nations have separate systems',url:'https://www.gov.uk/national-curriculum'},
    DE:{name:'Germany — KMK; curricula are state-specific',url:'https://www.kmk.org/'},
    AZ:{name:'Azerbaijan Ministry of Science and Education',url:'https://edu.gov.az/en'},
    JP:{name:'Japan MEXT',url:'https://www.mext.go.jp/en/'},
    AU:{name:'Australian Curriculum — Australian Government',url:'https://www.education.gov.au/australian-curriculum'},
    NZ:{name:'New Zealand Curriculum — Tāhūrangi',url:'https://newzealandcurriculum.tahurangi.education.govt.nz/'},
    PK:{name:'Pakistan — National Curriculum Council',url:'https://www.ncc.gov.pk/'},
    SA:{name:'Saudi Arabia — Ministry of Education curriculum service',url:'https://my.gov.sa/en/services/18629'},
    AE:{name:'United Arab Emirates — official curricula information',url:'https://u.ae/en/information-and-services/education/school-education-k-12/curricula-and-language-of-instruction-'},
    KR:{name:'Republic of Korea — National Curriculum Information Center',url:'https://www.ncic.re.kr/'},
    IN:{name:'India — NCERT curriculum frameworks and syllabi',url:'https://ncert.nic.in/'},
    FR:{name:'France — Éduscol education and curriculum portal',url:'https://eduscol.education.fr/'},
    FI:{name:'Finland — Finnish National Agency for Education',url:'https://www.oph.fi/en/education-and-qualifications'},
    SG:{name:'Singapore Ministry of Education — syllabuses',url:'https://www.moe.gov.sg/education/syllabuses'},
    CN:{name:'China — Ministry of Education',url:'https://www.moe.gov.cn/'},
    CA:{name:'Canada — CMEC; curricula are provincial/territorial',url:'https://www.cmec.ca/'},
    NL:{name:'Netherlands — SLO curriculum development',url:'https://www.slo.nl/'},
    SE:{name:'Sweden — Skolverket',url:'https://www.skolverket.se/'},
    NO:{name:'Norway — Udir national curricula',url:'https://www.udir.no/lk20/'},
    IE:{name:'Ireland — Curriculum Online',url:'https://www.curriculumonline.ie/'},
    BR:{name:'Brazil — Base Nacional Comum Curricular',url:'https://basenacionalcomum.mec.gov.br/'},
    CL:{name:'Chile — Currículum Nacional',url:'https://www.curriculumnacional.cl/'},
    ZA:{name:'South Africa — Department of Basic Education',url:'https://www.education.gov.za/'},
    ID:{name:'Indonesia — national curriculum portal',url:'https://kurikulum.kemdikbud.go.id/'},
    MY:{name:'Malaysia — Ministry of Education',url:'https://www.moe.gov.my/'},
    TH:{name:'Thailand — Office of the Basic Education Commission',url:'https://www.obec.go.th/'},
    VN:{name:'Vietnam — Ministry of Education and Training',url:'https://moet.gov.vn/'},
    BD:{name:'Bangladesh — National Curriculum and Textbook Board',url:'https://nctb.gov.bd/'},
    PH:{name:'Philippines — Department of Education',url:'https://www.deped.gov.ph/'},
    MX:{name:'Mexico — Secretaría de Educación Pública',url:'https://www.gob.mx/sep'},
    ES:{name:'Spain — official education curriculum portal',url:'https://educagob.educacionfpydeportes.gob.es/'},
    IT:{name:'Italy — Ministry of Education and Merit',url:'https://www.istruzione.it/'},
    PT:{name:'Portugal — Direção-Geral da Educação',url:'https://www.dge.mec.pt/'},
    PL:{name:'Poland — Ministry of National Education',url:'https://www.gov.pl/web/edukacja'},
    EE:{name:'Estonia — Ministry of Education and Research',url:'https://www.hm.ee/en'},
    DK:{name:'Denmark — Ministry of Children and Education',url:'https://www.uvm.dk/'},
    CH:{name:'Switzerland — EDK; curricula are cantonal',url:'https://www.edk.ch/'},
    RU:{name:'Russia — Ministry of Education',url:'https://edu.gov.ru/'},
    UA:{name:'Ukraine — Ministry of Education and Science',url:'https://mon.gov.ua/'},
    KZ:{name:'Kazakhstan — Ministry of Education',url:'https://www.gov.kz/memleket/entities/edu?lang=en'},
    AR:{name:'Argentina — national education portal; provincial systems also apply',url:'https://www.argentina.gob.ar/educacion'},
    CO:{name:'Colombia — Ministry of National Education',url:'https://www.mineducacion.gov.co/'},
    EG:{name:'Egypt — Ministry of Education',url:'https://moe.gov.eg/'},
    KE:{name:'Kenya — Ministry of Education',url:'https://www.education.go.ke/'},
    GH:{name:'Ghana — Ministry of Education',url:'https://moe.gov.gh/'},
    IL:{name:'Israel — Ministry of Education',url:'https://edu.gov.il/'}
  };
  if (server === 'GB') server = 'UK';
  if (sources[server]) return Object.assign({ status: 'portal-not-verified', isOfficialCurriculum: false }, sources[server]);
  return { status: 'not-verified', isOfficialCurriculum: false, name: 'UNESCO-IBE World Data on Education — international reference directory', url: 'https://www.ibe.unesco.org/en/node/63' };
}
function defaultCurriculum(gradeText, server, requestedCountryName) {
  const grade = String(gradeText).toUpperCase() === 'K' ? 0 : Number(gradeText);
  const gradeLabel = String(gradeText).toUpperCase() === 'K' ? 'Kindergarten' : String(grade);
  const gradeQuery = gradeLabel === 'Kindergarten' ? 'Kindergarten' : gradeLabel + '. sınıf';
  const subjects = tkStageSubjects(grade, server);
  const countryNames = {TR:'Türkiye',US:'Amerika Birleşik Devletleri',UK:'Birleşik Krallık',GB:'Birleşik Krallık',DE:'Almanya',AZ:'Azerbaycan',JP:'Japonya',AU:'Avustralya',NZ:'Yeni Zelanda',PK:'Pakistan',SA:'Suudi Arabistan',AE:'Birleşik Arap Emirlikleri',KR:'Güney Kore',IN:'Hindistan',FR:'Fransa',FI:'Finlandiya',SG:'Singapur',CN:'Çin',CA:'Kanada',NL:'Hollanda',SE:'İsveç',NO:'Norveç',IE:'İrlanda',BR:'Brezilya',CL:'Şili',ZA:'Güney Afrika',ID:'Endonezya',MY:'Malezya',TH:'Tayland',VN:'Vietnam',BD:'Bangladeş',PH:'Filipinler',MX:'Meksika',ES:'İspanya',IT:'İtalya',PT:'Portekiz',PL:'Polonya',EE:'Estonya',DK:'Danimarka',CH:'İsviçre',RU:'Rusya',UA:'Ukrayna',KZ:'Kazakistan',AR:'Arjantin',CO:'Kolombiya',EG:'Mısır',KE:'Kenya',GH:'Gana',IL:'İsrail'};
  const countryName = safeText(requestedCountryName, 100) || countryNames[server] || server;
  const source = tkCurriculumSource(server);
  const curriculumMeta = { status: 'not-verified', statusLabel: 'Genel öğrenme rehberi — bu ülkenin güncel resmî müfredatı doğrulanmadı', countryCode: server, countryName: countryName, grade: gradeLabel, sourceUrl: source.url, sourceName: source.name, curriculumYear: '', verifiedAt: '' };
  const result = {};
  subjects.forEach((subject) => {
    const bank = tkLocalizedTopicFor(subject, grade, server) || tkTopicFor(subject, grade);
    const topicCount = grade <= 4 ? 4 : 6;
    const topics = bank.slice(0, topicCount).map((entry, index) => ({
      id: server + '-' + gradeLabel + '-' + index,
      title: entry[0],
      explanation: entry[1],
      objectives: tkLearningObjectives(server),
      videos: [{
        title: entry[0] + ' — konu anlatımı',
        query: subject + ' ' + gradeQuery + ' ' + entry[0] + ' konu anlatımı',
        url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(subject + ' ' + gradeQuery + ' ' + entry[0] + ' konu anlatımı')
      }]
    }));
    result[subject] = {
      icon: /mat|matematik|数学/i.test(subject) ? '📐' : (/fen|science|fizik|kimya|biyoloji|理科/i.test(subject) ? '🔬' : '📚'),
      desc: gradeQuery + ' · ' + countryName + ' öğrenme rehberi',
      tag: server === 'TR' && grade === 8 ? 'lgs' : (grade >= 9 && grade <= 12 ? 'lise' : 'temel'),
      topics: topics,
      videos: topics.slice(0, 3).map(t => t.videos[0]),
      curriculumMeta: curriculumMeta,
      meb1: 'Bu içerik genel öğrenme rehberidir; ' + countryName + ' için güncel resmî müfredat olarak doğrulanmamıştır. Resmî kazanım ve sınav kapsamı için aşağıdaki kaynakta ilgili eğitim kademesini kontrol et.',
      meb2: 'Konu başlıkları öğrenmeyi desteklemek için hazırlanmıştır; resmî sınav kapsamı veya ulusal kazanım garantisi değildir.',
      mebLink: source.url
    };
  });
  return result;
}

Parse.Cloud.define('tdevAIChat', async (request) => {
  const user = requireUser(request);
  const message = String((request.params && request.params.message) || '').trim();
  if (message.length > 12000) return resultError('Mesaj 12.000 karakteri aşamaz; daha kısa bir mesaj gönder.', 'MESSAGE_TOO_LONG');
  const grade = safeText(request.params && request.params.grade, 2);
  const country = safeText(request.params && request.params.country, 2).toUpperCase();
  if (!message) return resultError('Mesaj boş olamaz.', 'EMPTY_MESSAGE');
  if (!/^\d{1,2}$/.test(grade) || Number(grade) < 1 || Number(grade) > 12) return resultError('Sınıf bilgisi geçersiz.', 'INVALID_GRADE');
  if (!/^[A-Z]{2}$/.test(country)) return resultError('Ülke seçimi geçersiz.', 'INVALID_COUNTRY');

  const apiKey = await configValueAsync('AI_API_KEY');
  if (!apiKey) {
    return resultError('TDEV-AI için sunucu tarafında AI_API_KEY yapılandırılmamış. Back4App Config’e anahtar eklenirse gerçek yapay zekâ yanıtları etkinleşir; anahtarı HTML dosyasına koyma.', 'AI_PROVIDER_NOT_CONFIGURED');
  }
  const model = (await configValueAsync('AI_MODEL', 'gpt-4o-mini')) || 'gpt-4o-mini';
  const endpoint = (await configValueAsync('AI_BASE_URL', 'https://api.openai.com/v1/chat/completions')) || 'https://api.openai.com/v1/chat/completions';
  if (!/^https:\/\//i.test(endpoint)) return resultError('AI_BASE_URL yalnızca HTTPS adresi olabilir.', 'AI_ENDPOINT_INVALID');

  const systemPrompt = [
    'Sen TdevKuantum eğitim platformunun Türkçe konuşan, güvenli ve sabırlı özel ders yardımcısısın.',
    'Öğrencinin sınıfı: ' + grade + '. Ülke/müfredat kodu: ' + country + '.',
    'Soruyu adım adım açıkla; gerekli tanımları, çözüm yolunu, örneği ve kısa bir kontrol sorusunu ekle.',
    'Bilmediğin resmî müfredat ayrıntısını uydurma; resmî kaynakla doğrulanması gerektiğini açıkça belirt.',
    'Öğrenciye zarar verebilecek yönlendirmeler yapma. Kısa değil, soruyu yanıtlayacak kadar tamamlanmış cevap ver.'
  ].join(' ');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
        temperature: 0.35,
        max_tokens: 2500
      })
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = null; }
    if (!response.ok) {
      console.error('[TdevKuantum] AI provider rejected request:', response.status);
      return resultError('Yapay zekâ sağlayıcısı isteği kabul etmedi (HTTP ' + response.status + '). AI_API_KEY, AI_MODEL ve sağlayıcı limitlerini kontrol et.', 'AI_PROVIDER_ERROR');
    }
    const answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof answer !== 'string' || !answer.trim()) return resultError('Yapay zekâ boş yanıt verdi. Biraz sonra tekrar dene.', 'AI_EMPTY_RESPONSE');
    await writeAuditLog(request, 'learning.ai_chat', user.id, { grade: grade, country: country, messageLength: message.length, model: model });
    return { success: true, answer: answer.trim(), model: model };
  } catch (error) {
    console.error('[TdevKuantum] AI provider connection failed:', String(error && error.message || error).slice(0, 200));
    return resultError('Yapay zekâ servisine ulaşılamadı. AI_BASE_URL ve sağlayıcı erişimini kontrol et.', 'AI_CONNECTION_FAILED');
  }
});

Parse.Cloud.define('getQuestions', async (request) => {
  const gradeInput = safeText(request.params && request.params.grade, 10).toUpperCase();
  const server = safeText(request.params && request.params.server, 5).toUpperCase();
  const isKindergarten = gradeInput === 'K' && server === 'US';
  const grade = isKindergarten ? 0 : Number(gradeInput);
  const validGrade = isKindergarten || (Number.isInteger(grade) && grade >= 1 && grade <= 12) ||
    (grade === 13 && ['UK', 'GB', 'DE'].includes(server));
  if (!validGrade || !/^[A-Z]{2}$/.test(server)) return [];
  const q = new Parse.Query('Question');
  q.equalTo('grade', grade);
  q.equalTo('server', server === 'GB' ? 'UK' : server);
  q.equalTo('active', true);
  q.limit(100);
  q.ascending('createdAt');
  const rows = isKindergarten ? [] : await q.find({ useMasterKey: true });
  const stored = rows.map((row) => ({
    id: row.id,
    grade: String(row.get('grade') || ''),
    subject: safeText(row.get('subject'), 100),
    question: safeText(row.get('question'), 1200),
    answer: safeText(row.get('correctAnswer') || row.get('answer'), 500),
    explanation: safeText(row.get('explanation'), 1200),
    source: safeText(row.get('source'), 200)
  }));
  if (stored.length) return stored;
  // A useful fallback prevents an empty quiz when a grade has no manually curated
  // Question rows. These are clearly labelled as guide-based practice, not official exam items.
  const curriculum = defaultCurriculum(gradeInput, server, safeText(request.params && request.params.countryName, 100));
  const generated = [];
  Object.keys(curriculum).forEach((subject, subjectIndex) => {
    const topics = Array.isArray(curriculum[subject].topics) ? curriculum[subject].topics : [];
    topics.forEach((topic, topicIndex) => {
      const title = safeText(topic.title, 180);
      const explanation = safeText(topic.explanation, 1000);
      if (!title || !explanation) return;
      generated.push({
        id: 'guide-' + server + '-' + gradeInput + '-' + subjectIndex + '-' + topicIndex + '-true',
        grade: gradeInput, subject: subject,
        question: title + ': ' + explanation,
        answer: 'true', explanation: explanation,
        source: 'TdevKuantum genel konu rehberi; resmî sınav sorusu değildir'
      });
      const falsePrefix = ({
        TR: 'Bu açıklama doğru değildir: ', DE: 'Diese Erklärung ist falsch: ',
        ES: 'Esta explicación es incorrecta: ', FR: 'Cette explication est incorrecte : ',
        PT: 'Esta explicação está incorreta: ', AZ: 'Bu izah yanlışdır: ',
        JP: 'この説明は正しくありません：', CN: '以下解释不正确：', TW: '以下解釋不正確：',
        KR: '이 설명은 올바르지 않습니다: ', SA: 'هذا الشرح غير صحيح: ',
        AE: 'هذا الشرح غير صحيح: ', EG: 'هذا الشرح غير صحيح: ', IQ: 'هذا الشرح غير صحيح: ',
        RU: 'Это объяснение неверно: ', ID: 'Penjelasan ini tidak benar: ',
        VN: 'Giải thích này không đúng: ', TH: 'คำอธิบายนี้ไม่ถูกต้อง: ',
        BD: 'এই ব্যাখ্যাটি সঠিক নয়: ', IN: 'यह व्याख्या सही नहीं है: ',
        NL: 'Deze uitleg is niet juist: ', IT: 'Questa spiegazione non è corretta: '
      })[server] || 'This explanation is not correct: ';
      generated.push({
        id: 'guide-' + server + '-' + gradeInput + '-' + subjectIndex + '-' + topicIndex + '-false',
        grade: gradeInput, subject: subject,
        question: title + ': ' + falsePrefix + explanation,
        answer: 'false', explanation: explanation,
        source: 'TdevKuantum genel konu rehberi; resmî sınav sorusu değildir'
      });
    });
  });
  return generated;
});

Parse.Cloud.define('getAdmins', async (request) => {
  await requireStaff(request, ['founder', 'admin']);
  const q = new Parse.Query(Parse.User);
  q.limit(200);
  q.ascending('createdAt');
  const users = await q.find({ useMasterKey: true });
  const roles = await Promise.all(users.map(u => roleForEmail(u.get('email') || u.get('username'))));
  return users.filter((u, index) => ['founder', 'admin'].includes(roles[index]))
    .map(u => ({ id: u.id, name: safeText(u.get('displayName') || u.get('name') || u.get('username'), 100), email: normalizeEmail(u.get('email') || u.get('username')) }));
});
Parse.Cloud.define('getAllUsers', async (request) => {
  await requireStaff(request, ['founder', 'admin']);
  const q = new Parse.Query(Parse.User);
  q.limit(1000);
  q.descending('createdAt');
  const users = await q.find({ useMasterKey: true });
  return Promise.all(users.map(publicUser));
});
Parse.Cloud.define('getStats', async (request) => {
  await requireStaff(request, ['founder', 'admin']);
  const countClass = async (name) => { try { const query = new Parse.Query(name); return await query.count({ useMasterKey: true }); } catch (_) { return 0; } };
  const [total, banned, studyPlans, studyNotes, studySessions, studyCards, studyMistakes, auditEvents] = await Promise.all([
    (async () => { const query = new Parse.Query(Parse.User); return await query.count({ useMasterKey: true }); })(),
    (async () => { try { const query = new Parse.Query(Parse.User); query.equalTo('banned', true); return await query.count({ useMasterKey: true }); } catch (_) { return 0; } })(),
    countClass('StudyPlan'), countClass('StudyNote'), countClass('StudyProgress'), countClass('StudyCard'), countClass('StudyMistake'), countClass('AuditLog')
  ]);
  return {
    total,
    active: Math.max(0, total - banned),
    banned,
    studyPlans, studyNotes, studySessions, studyCards, studyMistakes, auditEvents
  };
});
Parse.Cloud.define('getAuditLog', async (request) => {
  await requireStaff(request, ['founder', 'admin']);
  const limit = Math.max(1, Math.min(100, Number(request.params && request.params.limit) || 50));
  const q = new Parse.Query('AuditLog');
  q.descending('createdAt');
  q.limit(limit);
  const rows = await q.find({ useMasterKey: true });
  return rows.map(row => ({ id: row.id, actorId: safeText(row.get('actorId'), 100), actorEmail: normalizeEmail(row.get('actorEmail')), action: safeText(row.get('action'), 100), targetId: safeText(row.get('targetId'), 100), details: row.get('details') || {}, createdAtISO: safeText(row.get('createdAtISO'), 40) }));
});

async function setBanned(userId, banned, request) {
  await requireStaff(request, ['founder', 'admin']);
  if (!userId || typeof userId !== 'string') throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Geçersiz kullanıcı.');
  const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
  const email = normalizeEmail(user.get('email') || user.get('username'));
  if (await roleForEmail(email) === 'founder') throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Kurucu hesabı bu panelden kapatılamaz.');
  user.set('banned', banned);
  await user.save(null, { useMasterKey: true });
  await writeAuditLog(request, banned ? 'user.ban' : 'user.unban', user.id, { targetEmail: email, banned: banned });
  return { success: true, userId: user.id, banned: banned };
}
Parse.Cloud.define('banUser', async (request) => setBanned(safeText(request.params && request.params.userId, 100), true, request));
Parse.Cloud.define('unbanUser', async (request) => setBanned(safeText(request.params && request.params.userId, 100), false, request));

Parse.Cloud.define('getQuestionsForGrade', async (request) => {
  const gradeInput = safeText(request.params && request.params.grade, 10);
  const grade = Number(gradeInput);
  const server = safeText(request.params && request.params.server, 5).toUpperCase();
  if (!/^\d{1,2}$/.test(gradeInput) || !Number.isInteger(grade) || grade < 1 || grade > 12) return [];
  const q = new Parse.Query('Question');
  q.equalTo('grade', grade);
  if (/^[A-Z]{2}$/.test(server)) q.equalTo('server', server);
  q.equalTo('active', true);
  q.limit(100);
  const rows = await q.find({ useMasterKey: true });
  return rows.map(row => ({
    id: row.id, grade: String(row.get('grade') || ''),
    subject: safeText(row.get('subject'), 100),
    question: safeText(row.get('question'), 1200),
    answer: safeText(row.get('correctAnswer') || row.get('answer'), 500),
    explanation: safeText(row.get('explanation'), 1200),
    source: safeText(row.get('source'), 200)
  }));
});

Parse.Cloud.define('healthCheck', async (request) => {
  // Only authenticated users can request diagnostics; no secret values are returned.
  requireUser(request);
  const scriptUrl = (await configValueAsync('GOOGLE_SCRIPT_URL')) || (await configValueAsync('GOOGLE_APPS_SCRIPT_URL'));
  const scriptToken = await configValueAsync('APPS_SCRIPT_TOKEN');
  const apiKey = await configValueAsync('RESEND_API_KEY');
  const from = await configValueAsync('EMAIL_FROM');
  let appsScriptConfigured = false;
  let appsScriptDiagnostic = scriptUrl ? 'Kontrol edilmedi.' : 'Google Apps Script URL ayarlanmamış.';
  if (scriptUrl) {
    try {
      await probeAppsScript(scriptUrl, scriptToken);
      appsScriptConfigured = true;
      appsScriptDiagnostic = 'Web App erişilebilir ve Script Properties token mevcut.';
    } catch (error) {
      appsScriptDiagnostic = safeText(error && error.message || 'Apps Script kontrolü başarısız.', 220);
    }
  }
  const googleReady = !!(scriptUrl && scriptToken && appsScriptConfigured);
  const resendReady = !!(apiKey && from);
  return {
    success: true,
    service: 'TdevKuantum Cloud Code',
    timestamp: new Date().toISOString(),
    emailProviderConfigured: googleReady || resendReady,
    emailProvider: googleReady ? 'google-apps-script' : (resendReady ? 'resend' : 'misconfigured'),
    emailDiagnostics: {
      googleScriptUrlConfigured: !!scriptUrl,
      back4AppTokenConfigured: !!scriptToken,
      googleAppsScriptConfigured: appsScriptConfigured,
      googleAppsScriptStatus: appsScriptDiagnostic,
      resendConfigured: resendReady
    }
  };
});

async function sendSupportNotification(name, email, category, message) {
  const recipient = normalizeEmail(await configValueAsync('SUPPORT_EMAIL', 'tdevkuantum.official@gmail.com'));
  const scriptUrl = (await configValueAsync('GOOGLE_SCRIPT_URL')) || (await configValueAsync('GOOGLE_APPS_SCRIPT_URL'));
  const apiKey = await configValueAsync('RESEND_API_KEY');
  const from = await configValueAsync('EMAIL_FROM');
  const subject = '[TdevKuantum Destek] ' + safeText(category || 'Genel', 40) + ' — ' + safeText(name, 100);
  const textBody = 'TdevKuantum destek mesajı\\n\\nAd: ' + name + '\\nE-posta: ' + email + '\\nKategori: ' + category + '\\n\\nMesaj:\\n' + message;
  const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const htmlBody = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#172b4d"><h2>TdevKuantum Destek Mesajı</h2><p><b>Ad:</b> ' + escapeHtml(name) + '</p><p><b>E-posta:</b> ' + escapeHtml(email) + '</p><p><b>Kategori:</b> ' + escapeHtml(category) + '</p><hr><p style="white-space:pre-wrap">' + escapeHtml(message) + '</p></div>';
  const errors = [];
  if (scriptUrl) {
    try {
      const scriptToken = await configValueAsync('APPS_SCRIPT_TOKEN');
      if (!scriptToken) throw new Error('Back4App Config APPS_SCRIPT_TOKEN ayarlanmamış.');
      await probeAppsScript(scriptUrl, scriptToken);
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient, email: recipient, replyTo: email, name: name, subject: subject, html: htmlBody, text: textBody, app: 'TdevKuantum', category: category, message: message, token: scriptToken })
      });
      const body = await response.text();
      if (!response.ok) throw new Error('Apps Script HTTP ' + response.status);
      let data;
      try { data = JSON.parse(body); } catch (_) {
        throw new Error('Apps Script geçerli JSON döndürmedi; dağıtım URL’si ve erişim ayarları kontrol edilmeli.');
      }
      if (!(data && (data.success === true || data.ok === true))) {
        throw new Error(String((data && (data.error || data.message)) || 'Apps Script e-posta gönderimini doğrulamadı.'));
      }
      return { provider: 'google-apps-script' };
    } catch (error) {
      console.error('[TdevKuantum] Support Apps Script email error:', error && error.message);
      errors.push('Apps Script: ' + String(error && error.message || error));
    }
  }
  if (apiKey && from) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from, to: [recipient], reply_to: email, subject: subject, html: htmlBody, text: textBody })
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.text()).slice(0, 250); } catch (_) {}
        throw new Error('Resend HTTP ' + response.status + (detail ? ': ' + detail : ''));
      }
      return { provider: 'resend' };
    } catch (error) {
      console.error('[TdevKuantum] Support Resend email error:', error && error.message);
      errors.push('Resend: ' + String(error && error.message || error));
    }
  }
  throw new Error('Destek mesajı e-postayla gönderilemedi. Back4App Config içinde GOOGLE_SCRIPT_URL (veya GOOGLE_APPS_SCRIPT_URL) veya RESEND_API_KEY ve EMAIL_FROM ayarlarını kontrol et. ' + errors.join(' | '));
}
Parse.Cloud.define('sendSupportMessage', async (request) => {
  const user = requireUser(request);
  const name = safeText(request.params && request.params.name, 100);
  const email = normalizeEmail(request.params && request.params.email);
  const category = safeText(request.params && request.params.category, 40);
  const message = safeText(request.params && request.params.message, 4000);
  if (!name || !validEmail(email) || !message) return resultError('Ad, geçerli e-posta ve mesaj gerekli.', 'INVALID_INPUT');
  const row = new Parse.Object('SupportMessage');
  row.set('name', name);
  row.set('email', email);
  row.set('category', category);
  row.set('message', message);
  row.set('status', 'new');
  row.set('userId', user.id);
  await row.save(null, { useMasterKey: true });
  await writeAuditLog(request, 'support.message_created', row.id, { category: category });
  try {
    await sendSupportNotification(name, email, category, message);
  } catch (error) {
    console.error('[TdevKuantum] Support email delivery failed:', error && error.message);
    return resultError('Mesaj kaydedildi ancak e-posta gönderilemedi. Yönetici Back4App e-posta ayarlarını kontrol etmeli.', 'SUPPORT_EMAIL_FAILED');
  }
  return { success: true, message: 'Destek mesajı tdevkuantum.official@gmail.com adresine gönderildi.' };
});

// Legacy admin login endpoint is intentionally not reintroduced: all staff
// authenticate through loginUser and Config-held credentials, not a client-side role selector.


/* TdevKuantum schema setup. Set SCHEMA_SETUP_TOKEN in Back4App Config. Call setupDatabaseSchema with {token: SCHEMA_SETUP_TOKEN} once, then rotate/remove token. Creates missing classes/fields only; does not delete data. */
const TK_SCHEMA = {
  UserProfile: { username:'string', email:'string', displayName:'string', role:'string', grade:'number', school:'string', isBanned:'boolean', emailVerified:'boolean', referralCode:'string', createdAtISO:'string', lastLoginAtISO:'string' },
  EmailVerification: { email:'string', emailHash:'string', codeHash:'string', expiresAt:'date', attempts:'number', used:'boolean', verified:'boolean', deliveryFailed:'boolean', createdAtISO:'string' },
  PasswordReset: { emailHash:'string', codeHash:'string', expiresAt:'date', attempts:'number', used:'boolean' },
  Curriculum: { grade:'number', server:'string', subject:'string', title:'string', description:'string', subjects:'object', order:'number', active:'boolean', isOfficial:'boolean', sourceUrl:'string', sourceName:'string', curriculumYear:'string', verifiedAt:'date', language:'string', educationStage:'string' },
  CurriculumProgram: { recordKey:'string', countryCode:'string', countryName:'string', grade:'number', gradeLabel:'string', subject:'string', title:'string', programType:'string', schoolType:'string', field:'string', branch:'string', programCode:'string', programStatus:'string', curriculumYear:'string', sourceUrl:'string', sourceName:'string', sourceCheckedAt:'date', verifiedAt:'date', isOfficial:'boolean', active:'boolean', topics:'object', createdAtISO:'string', updatedAtISO:'string' },
  Question: { grade:'number', server:'string', subject:'string', topic:'string', question:'string', options:'array', correctAnswer:'string', explanation:'string', difficulty:'string', active:'boolean', order:'number' },
  SupportMessage: { email:'string', name:'string', subject:'string', category:'string', message:'string', status:'string', userId:'string', createdAtISO:'string' },
  AuditLog: { actorId:'string', actorEmail:'string', action:'string', targetId:'string', details:'object', ipHash:'string', createdAtISO:'string' },
  Referral: { code:'string', ownerId:'string', referredUserId:'string', status:'string', createdAtISO:'string' },
  StudyPlan: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyNote: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyProgress: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyCard: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyMistake: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  School: { schoolKey:'string', schoolName:'string', schoolAddress:'string', countryCode:'string', principalId:'string', createdAtISO:'string' },
  Classroom: { ownerId:'string', name:'string', schoolKey:'string', schoolName:'string', schoolAddress:'string', countryCode:'string', educationStage:'string', grade:'string', invitationCode:'string', active:'boolean', academicYear:'string', managerIds:'array', createdAtISO:'string' },
  ClassroomMembership: { classroomId:'string', userId:'string', role:'string', status:'string', createdAtISO:'string' },
  ClassroomFile: { classroomId:'string', uploaderId:'string', name:'string', url:'string', fileType:'string', size:'number', createdAtISO:'string' },
  LearningActivity: { userId:'string', classroomId:'string', eventType:'string', grade:'string', subject:'string', isCorrect:'boolean', hasAnswer:'boolean', countryCode:'string', createdAtISO:'string' }
};
const TK_FIELD_METHODS = { string:'addString', number:'addNumber', boolean:'addBoolean', date:'addDate', array:'addArray', object:'addObject' };

// ---- KİŞİSEL ÖĞRENME VERİLERİ (kullanıcıya özel, sunucu doğrulamalı) ----
function studyPayload(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Geçersiz öğrenme kaydı.');
  const item = {
    id: safeText(value.id, 100),
    updatedAt: safeText(value.updatedAt || value.createdAt || value.date, 40)
  };
  if (!item.id) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Kayıt kimliği eksik.');
  if (kind === 'plan') {
    item.title = safeText(value.title, 140);
    item.subject = safeText(value.subject, 60);
    item.date = safeText(value.date, 10);
    item.minutes = Number(value.minutes);
    item.done = value.done === true;
    item.createdAt = safeText(value.createdAt, 40);
    item.completedAt = safeText(value.completedAt, 40);
    if (!item.title || !item.subject || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isInteger(item.minutes) || item.minutes < 5 || item.minutes > 600) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'Çalışma planı alanları geçersiz.');
    }
  } else if (kind === 'note') {
    item.title = safeText(value.title, 120);
    item.subject = safeText(value.subject, 80);
    item.body = safeText(value.body, 12000);
    item.updatedAt = safeText(value.updatedAt, 40) || new Date().toISOString();
    if (!item.title || !item.body) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Not başlığı ve içeriği zorunludur.');
  } else if (kind === 'progress') {
    item.subject = safeText(value.subject, 60); item.kind = safeText(value.kind, 40);
    item.total = Number(value.total); item.correct = Number(value.correct);
    item.reflection = safeText(value.reflection, 1000); item.date = safeText(value.date, 40) || new Date().toISOString();
    if (!item.subject || !Number.isInteger(item.total) || !Number.isInteger(item.correct) || item.total < 0 || item.correct < 0 || item.correct > item.total || item.total > 1000) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Çalışma oturumu alanları geçersiz.');
  } else if (kind === 'card') {
    item.front = safeText(value.front, 300);
    item.back = safeText(value.back, 500);
    item.known = value.known === true;
    item.createdAt = safeText(value.createdAt, 40) || new Date().toISOString();
    item.lastReviewedAt = safeText(value.lastReviewedAt, 40);
    item.reviewCount = Number.isInteger(Number(value.reviewCount)) ? Math.max(0, Math.min(100000, Number(value.reviewCount))) : 0;
    if (!item.front || !item.back) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Kartın soru ve cevap alanları zorunludur.');
  } else if (kind === 'mistake') {
    item.subject=safeText(value.subject,60); item.title=safeText(value.title,180);
    item.reason=safeText(value.reason,1200); item.fix=safeText(value.fix,2000);
    item.reviewDate=safeText(value.reviewDate,10); item.status=value.status==='learned'?'learned':'review';
    if(!item.subject||!item.title||!item.reason||!item.fix||!/^\d{4}-\d{2}-\d{2}$/.test(item.reviewDate)) throw new Parse.Error(Parse.Error.INVALID_JSON,'Yanlış defteri alanları geçersiz.');
  }
  return item;
}
async function saveStudyRecord(request, className, kind) {
  const user = requireUser(request);
  const item = studyPayload(request.params && request.params.item, kind);
  const query = new Parse.Query(className);
  query.equalTo('ownerId', user.id);
  query.equalTo('itemId', item.id);
  let row = await query.first({ useMasterKey: true });
  if (!row) {
    const Record = Parse.Object.extend(className);
    row = new Record();
    row.set('ownerId', user.id);
    row.set('itemId', item.id);
    row.set('createdAtISO', new Date().toISOString());
  }
  row.set('payload', item);
  row.set('updatedAtISO', new Date().toISOString());
  await row.save(null, { useMasterKey: true });
  return { success: true, item: item };
}
async function getStudyRecords(request, className) {
  const user = requireUser(request);
  const query = new Parse.Query(className);
  query.equalTo('ownerId', user.id);
  query.descending('updatedAtISO');
  query.limit(100);
  const rows = await query.find({ useMasterKey: true });
  return { success: true, items: rows.map(function (row) { return row.get('payload'); }).filter(Boolean) };
}
Parse.Cloud.define('saveStudyPlan', async (request) => saveStudyRecord(request, 'StudyPlan', 'plan'));
Parse.Cloud.define('getStudyPlans', async (request) => getStudyRecords(request, 'StudyPlan'));
Parse.Cloud.define('saveStudyNote', async (request) => saveStudyRecord(request, 'StudyNote', 'note'));
Parse.Cloud.define('getStudyNotes', async (request) => getStudyRecords(request, 'StudyNote'));
Parse.Cloud.define('saveStudyProgress', async (request) => saveStudyRecord(request, 'StudyProgress', 'progress'));
Parse.Cloud.define('getStudyProgress', async (request) => getStudyRecords(request, 'StudyProgress'));
Parse.Cloud.define('saveStudyMistake', async (request) => saveStudyRecord(request, 'StudyMistake', 'mistake'));
Parse.Cloud.define('saveStudyCard', async (request) => saveStudyRecord(request, 'StudyCard', 'card'));
Parse.Cloud.define('getStudyCards', async (request) => getStudyRecords(request, 'StudyCard'));
Parse.Cloud.define('getStudyMistakes', async (request) => getStudyRecords(request, 'StudyMistake'));
Parse.Cloud.define('deleteStudyRecord', async (request) => {
  const user = requireUser(request);
  const allowed = ['StudyPlan', 'StudyNote', 'StudyProgress', 'StudyMistake', 'StudyCard'];
  const className = safeText(request.params && request.params.className, 40);
  const itemId = safeText(request.params && request.params.itemId, 100);
  if (!allowed.includes(className) || !itemId) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Silinecek kayıt geçersiz.');
  const query = new Parse.Query(className);
  query.equalTo('ownerId', user.id); query.equalTo('itemId', itemId);
  const row = await query.first({ useMasterKey: true });
  if (row) await row.destroy({ useMasterKey: true });
  return { success: true };
});

// ---- RESMÎ MÜFREDAT KAYITLARI: yönetici içe aktarma ve kullanıcıya güvenli listeleme ----
function trustedCurriculumSource(sourceUrl, countryCode) {
  const host = String(sourceUrl || '').toLowerCase().replace(/^https:\/\//i, '').split(/[\/:?#]/)[0];
  const trustedByCountry = {
    TR:['meb.gov.tr'], GB:['gov.uk'], UK:['gov.uk'], DE:['kmk.org'], US:['ed.gov','corestandards.org'],
    AZ:['edu.gov.az'], JP:['mext.go.jp'], AU:['education.gov.au','australiancurriculum.edu.au'],
    NZ:['education.govt.nz','tahurangi.education.govt.nz'], PK:['ncc.gov.pk','mofept.gov.pk'],
    SA:['my.gov.sa','moe.gov.sa'], AE:['u.ae','moe.gov.ae'], KR:['ncic.re.kr'], IN:['ncert.nic.in','education.gov.in'],
    FR:['eduscol.education.fr','education.gouv.fr'], FI:['oph.fi'], SG:['moe.gov.sg'], CN:['moe.gov.cn'],
    CA:['cmec.ca'], NL:['slo.nl'], SE:['skolverket.se'], NO:['udir.no'], IE:['curriculumonline.ie','ncca.ie'],
    BR:['basenacionalcomum.mec.gov.br','gov.br'], CL:['curriculumnacional.cl','mineduc.cl'], ZA:['education.gov.za'],
    ID:['kurikulum.kemdikbud.go.id','kemdikbud.go.id'], MY:['moe.gov.my'], TH:['obec.go.th','moe.go.th'],
    VN:['moet.gov.vn'], BD:['nctb.gov.bd','nctb.portal.gov.bd'], PH:['deped.gov.ph'], MX:['gob.mx'],
    ES:['educagob.educacionfpydeportes.gob.es','educacionfpydeportes.gob.es'], IT:['istruzione.it'], PT:['dge.mec.pt'],
    PL:['gov.pl'], EE:['hm.ee'], DK:['uvm.dk'], CH:['edk.ch'], RU:['edu.gov.ru'], UA:['mon.gov.ua'],
    KZ:['gov.kz'], AR:['argentina.gob.ar'], CO:['mineducacion.gov.co'], EG:['moe.gov.eg'],
    KE:['education.go.ke'], GH:['moe.gov.gh'], IL:['edu.gov.il']
  };
  const code = String(countryCode || '').toUpperCase();
  return (trustedByCountry[code] || []).some((domain) => host === domain || host.endsWith('.' + domain));
}
function curriculumProgramKey(record) {
  return sha256([
    record.countryCode, record.grade, record.programType, record.schoolType,
    record.field, record.branch, record.subject, record.curriculumYear
  ].map((part) => String(part || '').trim().toLowerCase()).join('|'));
}
function curriculumProgramPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Müfredat kaydı geçersiz.');
  }
  const countryCode = safeText(value.countryCode, 5).toUpperCase();
  const countryName = safeText(value.countryName, 100);
  const grade = Number(value.grade);
  const programType = safeText(value.programType, 24).toLowerCase();
  const curriculumYear = safeText(value.curriculumYear, 20);
  const sourceUrl = safeText(value.sourceUrl, 500);
  const sourceName = safeText(value.sourceName, 180);
  const sourceCheckedAt = value.sourceCheckedAt ? new Date(value.sourceCheckedAt) : null;
  const verifiedAt = value.verifiedAt ? new Date(value.verifiedAt) : null;
  const topics = value.topics;
  const validYear = /^(20\d{2})(?:-(20\d{2}))?$/.test(curriculumYear);
  const validSourceUrl = /^https:\/\//i.test(sourceUrl);
  const validTopics = topics && typeof topics === 'object' && !Array.isArray(topics);
  if (!/^[A-Z]{2}$/.test(countryCode) || !countryName ||
      !Number.isInteger(grade) || grade < 0 || grade > 13 ||
      !['general', 'vocational', 'imamhatip', 'international'].includes(programType) ||
      !safeText(value.subject, 120) || !safeText(value.title, 180) ||
      !validYear || !validSourceUrl || !sourceName || !validTopics ||
      JSON.stringify(topics).length > 60000) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Ülke, sınıf, program türü, ders, başlık, öğretim yılı, HTTPS kaynak ve konu verilerini kontrol et. Konu verisi 60 KB sınırını aşamaz.');
  }
  if (sourceCheckedAt && Number.isNaN(sourceCheckedAt.getTime())) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Kaynak kontrol tarihi geçersiz.');
  if (verifiedAt && Number.isNaN(verifiedAt.getTime())) throw new Parse.Error(Parse.Error.INVALID_JSON, 'Doğrulama tarihi geçersiz.');
  const official = value.isOfficial === true &&
    trustedCurriculumSource(sourceUrl, countryCode) &&
    !!sourceCheckedAt && !!verifiedAt && !!sourceName && validYear;
  const record = {
    countryCode: countryCode,
    countryName: countryName,
    grade: grade,
    gradeLabel: grade === 0 ? 'K' : (safeText(value.gradeLabel, 40) || String(grade)),
    subject: safeText(value.subject, 120),
    title: safeText(value.title, 180),
    programType: programType,
    schoolType: safeText(value.schoolType, 120),
    field: safeText(value.field, 120),
    branch: safeText(value.branch, 120),
    programCode: safeText(value.programCode, 100),
    programStatus: official ? 'verified' : 'unverified',
    curriculumYear: curriculumYear,
    sourceUrl: sourceUrl,
    sourceName: sourceName,
    sourceCheckedAt: sourceCheckedAt && !Number.isNaN(sourceCheckedAt.getTime()) ? sourceCheckedAt : null,
    verifiedAt: verifiedAt && !Number.isNaN(verifiedAt.getTime()) && official ? verifiedAt : null,
    isOfficial: official,
    active: value.active !== false,
    topics: topics
  };
  record.recordKey = curriculumProgramKey(record);
  return record;
}
function publicCurriculumProgram(row) {
  return {
    id: row.id,
    countryCode: row.get('countryCode'),
    countryName: row.get('countryName'),
    grade: row.get('grade'),
    gradeLabel: row.get('gradeLabel'),
    subject: row.get('subject'),
    title: row.get('title'),
    programType: row.get('programType'),
    schoolType: row.get('schoolType'),
    field: row.get('field'),
    branch: row.get('branch'),
    programCode: row.get('programCode'),
    programStatus: row.get('programStatus'),
    curriculumYear: row.get('curriculumYear'),
    sourceUrl: row.get('sourceUrl'),
    sourceName: row.get('sourceName'),
    sourceCheckedAt: row.get('sourceCheckedAt') ? new Date(row.get('sourceCheckedAt')).toISOString() : '',
    verifiedAt: row.get('verifiedAt') ? new Date(row.get('verifiedAt')).toISOString() : '',
    isOfficial: row.get('isOfficial') === true,
    topics: row.get('topics') || {}
  };
}
Parse.Cloud.define('getCurriculumPrograms', async (request) => {
  requireUser(request);
  try {
    const params = request.params || {};
    const query = new Parse.Query('CurriculumProgram');
    query.equalTo('active', true);
    const countryCode = safeText(params.countryCode, 5).toUpperCase();
    const programType = safeText(params.programType, 24).toLowerCase();
    const field = safeText(params.field, 120);
    const branch = safeText(params.branch, 120);
    const grade = params.grade === undefined || params.grade === null || params.grade === '' ? null : Number(params.grade);
    if (/^[A-Z]{2}$/.test(countryCode)) query.equalTo('countryCode', countryCode);
    if (['general', 'vocational', 'imamhatip', 'international'].includes(programType)) query.equalTo('programType', programType);
    if (field) query.equalTo('field', field);
    if (branch) query.equalTo('branch', branch);
    if (grade !== null && Number.isInteger(grade) && grade >= 0 && grade <= 13) query.equalTo('grade', grade);
    query.descending('updatedAtISO');
    query.limit(100);
    const rows = await query.find({ useMasterKey: true });
    return { success: true, storageReady: true, limit: 100, items: rows.map(publicCurriculumProgram) };
  } catch (error) {
    console.warn('[TdevKuantum] Curriculum program query unavailable:', String(error && error.message || error).slice(0, 180));
    return { success: true, storageReady: false, limit: 100, items: [] };
  }
});
Parse.Cloud.define('saveCurriculumProgram', async (request) => {
  const staff = await requireStaff(request, ['founder', 'admin']);
  const record = curriculumProgramPayload(request.params && request.params.record);
  const query = new Parse.Query('CurriculumProgram');
  query.equalTo('recordKey', record.recordKey);
  let row = await query.first({ useMasterKey: true });
  if (!row) {
    const CurriculumProgram = Parse.Object.extend('CurriculumProgram');
    row = new CurriculumProgram();
    row.set('createdAtISO', new Date().toISOString());
  }
  Object.keys(record).forEach((key) => row.set(key, record[key]));
  row.set('updatedAtISO', new Date().toISOString());
  await row.save(null, { useMasterKey: true });
  await writeAuditLog(request, 'curriculum.program_saved', row.id, {
    countryCode: record.countryCode, grade: record.grade, programType: record.programType,
    field: record.field, branch: record.branch, isOfficial: record.isOfficial, actorRole: staff.role
  });
  return { success: true, item: publicCurriculumProgram(row), message: record.isOfficial
    ? 'Müfredat kaydı kaydedildi; kaynak ve tarih bilgileriyle doğrulanmış olarak işaretlendi.'
    : 'Müfredat kaydı kaydedildi ancak resmî/güncel olduğu doğrulanmadı.' };
});


Parse.Cloud.define('saveCurriculumProgramsBulk', async (request) => {
  const staff = await requireStaff(request, ['founder', 'admin']);
  const records = request.params && request.params.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 20) {
    return resultError('Toplu aktarım bir istekte 1–20 kayıt içermelidir.', 'INVALID_BATCH_SIZE');
  }
  let serializedLength = 0;
  try { serializedLength = JSON.stringify(records).length; } catch (_) {}
  if (!serializedLength || serializedLength > 500000) {
    return resultError('Toplu aktarım verisi 500.000 karakteri aşamaz.', 'BATCH_TOO_LARGE');
  }
  let saved = 0;
  const errors = [];
  const countryCodes = new Set();
  for (let index = 0; index < records.length; index++) {
    try {
      const record = curriculumProgramPayload(records[index]);
      const query = new Parse.Query('CurriculumProgram');
      query.equalTo('recordKey', record.recordKey);
      let row = await query.first({ useMasterKey: true });
      if (!row) {
        const CurriculumProgram = Parse.Object.extend('CurriculumProgram');
        row = new CurriculumProgram();
        row.set('createdAtISO', new Date().toISOString());
      }
      Object.keys(record).forEach((key) => row.set(key, record[key]));
      row.set('updatedAtISO', new Date().toISOString());
      await row.save(null, { useMasterKey: true });
      saved++;
      countryCodes.add(record.countryCode);
    } catch (error) {
      errors.push({ index: index, error: safeText(error && error.message || 'Kayıt doğrulanamadı.', 240) });
    }
  }
  await writeAuditLog(request, 'curriculum.programs_bulk_saved', 'batch', {
    actorRole: staff.role, requested: records.length, saved: saved, failed: errors.length,
    countryCodes: Array.from(countryCodes).slice(0, 20)
  });
  return {
    success: saved > 0,
    requested: records.length,
    saved: saved,
    failed: errors.length,
    errors: errors.slice(0, 20),
    message: saved + ' kayıt kaydedildi; ' + errors.length + ' kayıt doğrulama/kayıt hatası nedeniyle atlandı.'
  };
});

Parse.Cloud.define('setupDatabaseSchema', async (request) => {
  const config = await Parse.Config.get({ useMasterKey: true });
  const expected = config.get('SCHEMA_SETUP_TOKEN');
  const supplied = request.params && request.params.token;
  if (!expected || typeof supplied !== 'string' || supplied.length < 24 || supplied !== expected) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Schema setup not authorized.');
  if (!Parse.Schema) throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Parse.Schema API is unavailable in this Cloud Code runtime.');
  const results = [];
  for (const [className, fields] of Object.entries(TK_SCHEMA)) {
    try { const schema = new Parse.Schema(className); for (const [field, type] of Object.entries(fields)) { const method = TK_FIELD_METHODS[type]; if (method) schema[method](field); } await schema.update({ useMasterKey: true }); results.push({className, status:'created_or_updated', fields:Object.keys(fields)}); }
    catch (error) { results.push({className, status:'error', message:String(error.message || error)}); }
  }
  return { success: !results.some(item => item.status === 'error'), results };
});
