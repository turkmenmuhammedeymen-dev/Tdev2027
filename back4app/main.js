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
 *   RESEND_API_KEY       fallback provider API key
 *   EMAIL_FROM           verified sender, e.g. TdevKuantum <noreply@your-domain>
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
async function sendVerificationEmail(email, code, name) {
  const scriptUrl = (await configValueAsync('GOOGLE_SCRIPT_URL')) || (await configValueAsync('GOOGLE_APPS_SCRIPT_URL'));
  const apiKey = await configValueAsync('RESEND_API_KEY');
  const from = await configValueAsync('EMAIL_FROM');
  const subject = 'TdevKuantum e-posta doğrulama kodu';
  const html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172b4d">' +
    '<h1 style="color:#2457c5">TdevKuantum</h1><p>Merhaba ' + safeText(name || 'öğrenci', 100) + ', hesabını doğrulamak için aşağıdaki kodu kullan:</p>' +
    '<div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:18px;background:#f3f6fb;border-radius:12px;text-align:center">' + code + '</div>' +
    '<p>Bu kod 10 dakika geçerlidir. Bu isteği sen yapmadıysan e-postayı yok sayabilirsin.</p></div>';
  const errors = [];

  // Google Apps Script Web App: deploy with access set so the server can call it.
  if (scriptUrl) {
    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email, email: email, name: safeText(name || 'öğrenci', 100),
          code: code, subject: subject, html: html, app: 'TdevKuantum',
          token: await configValueAsync('APPS_SCRIPT_TOKEN'),
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
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email, email: email, subject: subject, html: html,
          text: 'TdevKuantum şifre yenileme kodun: ' + code + ' (10 dakika geçerlidir)',
          app: 'TdevKuantum', token: await configValueAsync('APPS_SCRIPT_TOKEN')
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
  user.set('role', 'member');
  user.set('banned', false);
  user.set('emailVerified', false);
  await user.signUp(null, { useMasterKey: true });
  await writeAuditLog(request, 'user.register', user.id, { email: email });

  const verificationRequired = (await configValueAsync('REQUIRE_EMAIL_VERIFY', CONFIG_DEFAULTS.REQUIRE_EMAIL_VERIFY)).toLowerCase() !== 'false';
  if (verificationRequired) {
    const code = String(crypto.randomInt(100000, 1000000));
    try {
      await saveVerification(email, code);
      await sendVerificationEmail(email, code, name);
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
    await writeAuditLog(request, 'user.login', user.id, { email: email, role: role });
    return { success: true, role: role, name: safeText(user.get('displayName') || user.get('name') || user.get('username'), 100), email: email, sessionToken: user.getSessionToken() };
  } catch (error) {
    console.warn('[TdevKuantum] Login rejected:', error && error.code);
    return resultError('E-posta veya şifre hatalı.', 'INVALID_CREDENTIALS');
  }
});

Parse.Cloud.define('getCurriculum', async (request) => {
  const gradeInput = safeText(request.params && request.params.grade, 10);
  const gradeNumber = Number(gradeInput);
  const server = safeText(request.params && request.params.server, 5).toUpperCase();
  if (!/^\d{1,2}$/.test(gradeInput) || !Number.isInteger(gradeNumber) || gradeNumber < 1 || gradeNumber > 12 || !/^(TR|US|UK|DE|AZ|JP)$/.test(server)) return {};
  const grade = String(gradeNumber);
  const q = new Parse.Query('Curriculum');
  q.equalTo('grade', gradeNumber);
  q.equalTo('server', server);
  q.limit(1);
  const row = await q.first({ useMasterKey: true });
  if (row && row.get('subjects') && typeof row.get('subjects') === 'object') return row.get('subjects');
  return defaultCurriculum(grade, server);
});
function defaultCurriculum(grade, server) {
  const subjects = server === 'TR'
    ? ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce']
    : ['Mathematics', 'Science', 'Language Arts', 'Social Studies'];
  const result = {};
  subjects.forEach((subject) => {
    result[subject] = {
      icon: subject.toLowerCase().includes('mat') ? '📐' : (subject.toLowerCase().includes('fen') || subject.toLowerCase().includes('science') ? '🔬' : '📚'),
      desc: grade + '. sınıf için temel ders içerikleri',
      tag: grade === '8' ? 'lgs' : 'temel',
      topics: [],
      videos: [],
      meb1: 'İçerik yönetim panelinden eklenecek.',
      meb2: 'İçerik yönetim panelinden eklenecek.',
      mebLink: ''
    };
  });
  return result;
}

Parse.Cloud.define('getQuestions', async (request) => {
  const gradeInput = safeText(request.params && request.params.grade, 10);
  const grade = Number(gradeInput);
  const server = safeText(request.params && request.params.server, 5).toUpperCase();
  if (!/^\d{1,2}$/.test(gradeInput) || !Number.isInteger(grade) || grade < 1 || grade > 12) return [];
  const q = new Parse.Query('Question');
  q.equalTo('grade', grade);
  if (/^(TR|US|UK|DE|AZ|JP)$/.test(server)) q.equalTo('server', server);
  q.equalTo('active', true);
  q.limit(100);
  q.ascending('createdAt');
  const rows = await q.find({ useMasterKey: true });
  return rows.map((row) => ({
    id: row.id,
    grade: String(row.get('grade') || ''),
    subject: safeText(row.get('subject'), 100),
    question: safeText(row.get('question'), 1200),
    answer: safeText(row.get('correctAnswer') || row.get('answer'), 500),
    explanation: safeText(row.get('explanation'), 1200),
    source: safeText(row.get('source'), 200)
  }));
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
  if (/^(TR|US|UK|DE|AZ|JP)$/.test(server)) q.equalTo('server', server);
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

Parse.Cloud.define('healthCheck', async () => {
  const scriptUrl = (await configValueAsync('GOOGLE_SCRIPT_URL')) || (await configValueAsync('GOOGLE_APPS_SCRIPT_URL'));
  const apiKey = await configValueAsync('RESEND_API_KEY');
  const from = await configValueAsync('EMAIL_FROM');
  return {
    success: true,
    service: 'TdevKuantum Cloud Code',
    timestamp: new Date().toISOString(),
    emailProviderConfigured: !!(scriptUrl || (apiKey && from)),
    emailProvider: scriptUrl ? 'google-apps-script' : (apiKey && from ? 'resend' : 'none')
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
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient, email: recipient, replyTo: email, name: name, subject: subject, html: htmlBody, text: textBody, app: 'TdevKuantum', category: category, message: message, token: await configValueAsync('APPS_SCRIPT_TOKEN') })
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
  EmailVerification: { email:'string', emailHash:'string', codeHash:'string', expiresAt:'date', attempts:'number', used:'boolean', verified:'boolean', createdAtISO:'string' },
  PasswordReset: { emailHash:'string', codeHash:'string', expiresAt:'date', attempts:'number', used:'boolean' },
  Curriculum: { grade:'number', server:'string', subject:'string', title:'string', description:'string', subjects:'object', order:'number', active:'boolean' },
  Question: { grade:'number', server:'string', subject:'string', topic:'string', question:'string', options:'array', correctAnswer:'string', explanation:'string', difficulty:'string', active:'boolean', order:'number' },
  SupportMessage: { email:'string', name:'string', subject:'string', category:'string', message:'string', status:'string', userId:'string', createdAtISO:'string' },
  AuditLog: { actorId:'string', actorEmail:'string', action:'string', targetId:'string', details:'object', ipHash:'string', createdAtISO:'string' },
  Referral: { code:'string', ownerId:'string', referredUserId:'string', status:'string', createdAtISO:'string' },
  StudyPlan: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyNote: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyProgress: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyCard: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyMistake: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' }
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
