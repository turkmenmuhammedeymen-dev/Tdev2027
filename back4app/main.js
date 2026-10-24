'use strict';

/**
 * TdevKuantum — Back4App Cloud Code
 * Upload as Cloud Code main.js.
 *
 * REQUIRED Back4App Config keys:
 *   FOUNDER_EMAIL        default: admin.tr.reis@gamil.com (confirm spelling in Config)
 *   FOUNDER_PASSWORD     strong secret; never place in HTML/GitHub
 *   ADMIN_EMAIL          admin account email
 *   ADMIN_PASSWORD       strong secret; never place in HTML/GitHub
 *   BETA_EMAIL           beta account email
 *   BETA_PASSWORD        strong secret; never place in HTML/GitHub
 *   RESEND_API_KEY       optional, required for sending verification emails
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
 *   is sent using Resend when configured.
 */

const crypto = require('crypto');

const CONFIG_DEFAULTS = {
  FOUNDER_EMAIL: 'admin.tr.reis@gamil.com',
  REGISTRATION_ENABLED: 'true',
  REQUIRE_EMAIL_VERIFY: 'true'
};

function configValue(key, fallback) {
  try {
    const cfg = (Parse && Parse.Config && Parse.Config.get) ? Parse.Config.get() : null;
    const value = cfg && cfg.get(key);
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  } catch (_) {}
  const env = (typeof process !== 'undefined' && process.env) ? process.env[key] : undefined;
  if (env !== undefined && env !== null && String(env).trim() !== '') return String(env).trim();
  return fallback !== undefined ? String(fallback) : '';
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
function roleForEmail(email) {
  const e = normalizeEmail(email);
  if (e && e === normalizeEmail(configValue('FOUNDER_EMAIL', CONFIG_DEFAULTS.FOUNDER_EMAIL))) return 'founder';
  if (e && e === normalizeEmail(configValue('ADMIN_EMAIL'))) return 'admin';
  if (e && e === normalizeEmail(configValue('BETA_EMAIL'))) return 'beta';
  return 'member';
}
function staffEmailForRole(role) {
  if (role === 'founder') return normalizeEmail(configValue('FOUNDER_EMAIL', CONFIG_DEFAULTS.FOUNDER_EMAIL));
  if (role === 'admin') return normalizeEmail(configValue('ADMIN_EMAIL'));
  if (role === 'beta') return normalizeEmail(configValue('BETA_EMAIL'));
  return '';
}
function isConfiguredSpecialLogin(email, password) {
  const role = roleForEmail(email);
  if (role === 'founder') {
    const expected = configValue('FOUNDER_PASSWORD');
    return !!expected && secureEqual(password, expected) ? role : null;
  }
  if (role === 'admin') {
    const expected = configValue('ADMIN_PASSWORD');
    return !!expected && secureEqual(password, expected) ? role : null;
  }
  if (role === 'beta') {
    const expected = configValue('BETA_PASSWORD');
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
function requireStaff(request, allowedRoles) {
  const user = requireUser(request);
  const email = normalizeEmail(user.get('email') || user.get('username'));
  const role = roleForEmail(email);
  if (!allowedRoles.includes(role)) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Bu işlem için yetkin yok.');
  return { user, email, role };
}
function publicUser(user) {
  return {
    id: user.id,
    name: safeText(user.get('displayName') || user.get('name') || user.get('username'), 100),
    email: normalizeEmail(user.get('email') || user.get('username')),
    role: roleForEmail(user.get('email') || user.get('username')),
    banned: user.get('banned') === true,
    emailVerified: user.get('emailVerified') === true,
    date: user.createdAt ? user.createdAt.toISOString().slice(0, 10) : ''
  };
}
function verificationKey(email) {
  return 'emailVerification:' + sha256(normalizeEmail(email));
}
async function sendVerificationEmail(email, code) {
  const apiKey = configValue('RESEND_API_KEY');
  const from = configValue('EMAIL_FROM');
  if (!apiKey || !from) {
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'E-posta gönderimi yapılandırılmamış. Back4App Config içine RESEND_API_KEY ve EMAIL_FROM ekle.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: from,
      to: [email],
      subject: 'TdevKuantum e-posta doğrulama kodu',
      html: '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172b4d">' +
        '<h1 style="color:#2457c5">TdevKuantum</h1><p>Hesabını doğrulamak için aşağıdaki kodu kullan:</p>' +
        '<div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:18px;background:#f3f6fb;border-radius:12px;text-align:center">' + code + '</div>' +
        '<p>Bu kod 10 dakika geçerlidir. Bu isteği sen yapmadıysan e-postayı yok sayabilirsin.</p></div>'
    })
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 300); } catch (_) {}
    console.error('[TdevKuantum] Verification email provider error:', response.status, detail);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Doğrulama e-postası gönderilemedi. E-posta sağlayıcı ayarlarını kontrol et.');
  }
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

Parse.Cloud.define('registerUser', async (request) => {
  const enabled = configValue('REGISTRATION_ENABLED', CONFIG_DEFAULTS.REGISTRATION_ENABLED).toLowerCase() !== 'false';
  if (!enabled) return resultError('Yeni kayıtlar şu anda kapalı.', 'REGISTRATION_CLOSED');

  const name = safeText(request.params && request.params.name, 100);
  const email = normalizeEmail(request.params && request.params.email);
  const password = String((request.params && request.params.password) || '');
  if (!name || !validEmail(email) || password.length < 8 || password.length > 128) {
    return resultError('Ad, geçerli e-posta ve en az 8 karakterli şifre gerekli.', 'INVALID_INPUT');
  }
  // Config-defined staff credentials are reserved for the corresponding role.
  const reservedRole = roleForEmail(email);
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

  const verificationRequired = configValue('REQUIRE_EMAIL_VERIFY', CONFIG_DEFAULTS.REQUIRE_EMAIL_VERIFY).toLowerCase() !== 'false';
  if (verificationRequired) {
    const code = String(crypto.randomInt(100000, 1000000));
    try {
      await saveVerification(email, code);
      await sendVerificationEmail(email, code);
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
  verification.set('used', true);
  await verification.save(null, { useMasterKey: true });
  return { success: true, message: 'E-posta doğrulandı.' };
});

Parse.Cloud.define('loginUser', async (request) => {
  const email = normalizeEmail(request.params && request.params.email);
  const password = String((request.params && request.params.password) || '');
  if (!validEmail(email) || !password) return resultError('E-posta ve şifre gerekli.', 'INVALID_INPUT');

  const specialRole = isConfiguredSpecialLogin(email, password);
  if (specialRole) {
    const staffQuery = new Parse.Query(Parse.User);
    staffQuery.equalTo('username', email);
    let staffUser = await staffQuery.first({ useMasterKey: true });
    const configuredPassword = configValue(specialRole === 'founder' ? 'FOUNDER_PASSWORD' : (specialRole === 'admin' ? 'ADMIN_PASSWORD' : 'BETA_PASSWORD'));
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
    if (configValue('REQUIRE_EMAIL_VERIFY', CONFIG_DEFAULTS.REQUIRE_EMAIL_VERIFY).toLowerCase() !== 'false' && user.get('emailVerified') !== true) {
      return { success: false, verificationRequired: true, error: 'Önce e-posta adresini doğrula.', code: 'EMAIL_NOT_VERIFIED' };
    }
    const role = roleForEmail(email) !== 'member' ? roleForEmail(email) : (safeText(user.get('role'), 30) || 'member');
    return { success: true, role: role, name: safeText(user.get('displayName') || user.get('name') || user.get('username'), 100), email: email, sessionToken: user.getSessionToken() };
  } catch (error) {
    console.warn('[TdevKuantum] Login rejected:', error && error.code);
    return resultError('E-posta veya şifre hatalı.', 'INVALID_CREDENTIALS');
  }
});

Parse.Cloud.define('getCurriculum', async (request) => {
  const grade = safeText(request.params && request.params.grade, 10);
  const server = safeText(request.params && request.params.server, 5).toUpperCase();
  if (!grade || !/^(TR|US|UK|DE|AZ|JP)$/.test(server)) return {};
  const q = new Parse.Query('Curriculum');
  q.equalTo('grade', grade);
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
  const grade = safeText(request.params && request.params.grade, 10);
  if (!grade) return [];
  const q = new Parse.Query('Question');
  q.equalTo('grade', grade);
  q.equalTo('active', true);
  q.limit(100);
  q.ascending('createdAt');
  const rows = await q.find({ useMasterKey: true });
  return rows.map((row) => ({
    id: row.id,
    grade: String(row.get('grade') || ''),
    subject: safeText(row.get('subject'), 100),
    question: safeText(row.get('question'), 1200),
    answer: safeText(row.get('answer'), 500),
    explanation: safeText(row.get('explanation'), 1200),
    source: safeText(row.get('source'), 200)
  }));
});

Parse.Cloud.define('getAdmins', async (request) => {
  requireStaff(request, ['founder', 'admin']);
  const q = new Parse.Query(Parse.User);
  q.limit(200);
  q.ascending('createdAt');
  const users = await q.find({ useMasterKey: true });
  return users.filter(u => ['founder', 'admin'].includes(roleForEmail(u.get('email') || u.get('username'))))
    .map(u => ({ id: u.id, name: safeText(u.get('displayName') || u.get('name') || u.get('username'), 100), email: normalizeEmail(u.get('email') || u.get('username')) }));
});
Parse.Cloud.define('getAllUsers', async (request) => {
  requireStaff(request, ['founder', 'admin']);
  const q = new Parse.Query(Parse.User);
  q.limit(1000);
  q.descending('createdAt');
  const users = await q.find({ useMasterKey: true });
  return users.map(publicUser);
});
Parse.Cloud.define('getStats', async (request) => {
  requireStaff(request, ['founder', 'admin']);
  const q = new Parse.Query(Parse.User);
  q.limit(1000);
  const users = await q.find({ useMasterKey: true });
  return {
    total: users.length,
    active: users.filter(u => u.get('banned') !== true).length,
    banned: users.filter(u => u.get('banned') === true).length
  };
});
async function setBanned(userId, banned, request) {
  requireStaff(request, ['founder', 'admin']);
  if (!userId || typeof userId !== 'string') throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Geçersiz kullanıcı.');
  const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
  const email = normalizeEmail(user.get('email') || user.get('username'));
  if (roleForEmail(email) === 'founder') throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Kurucu hesabı bu panelden kapatılamaz.');
  user.set('banned', banned);
  await user.save(null, { useMasterKey: true });
  return { success: true, userId: user.id, banned: banned };
}
Parse.Cloud.define('banUser', async (request) => setBanned(safeText(request.params && request.params.userId, 100), true, request));
Parse.Cloud.define('unbanUser', async (request) => setBanned(safeText(request.params && request.params.userId, 100), false, request));

Parse.Cloud.define('getQuestionsForGrade', async (request) => {
  const grade = safeText(request.params && request.params.grade, 10);
  const q = new Parse.Query('Question');
  q.equalTo('grade', grade);
  q.equalTo('active', true);
  q.limit(100);
  const rows = await q.find({ useMasterKey: true });
  return rows.map(row => ({
    id: row.id, grade: String(row.get('grade') || ''),
    subject: safeText(row.get('subject'), 100),
    question: safeText(row.get('question'), 1200),
    answer: safeText(row.get('answer'), 500),
    explanation: safeText(row.get('explanation'), 1200),
    source: safeText(row.get('source'), 200)
  }));
});

Parse.Cloud.define('healthCheck', async () => ({
  success: true,
  service: 'TdevKuantum Cloud Code',
  timestamp: new Date().toISOString(),
  emailProviderConfigured: !!configValue('RESEND_API_KEY') && !!configValue('EMAIL_FROM')
}));

Parse.Cloud.define('sendSupportMessage', async (request) => {
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
  await row.save(null, { useMasterKey: true });
  return { success: true, message: 'Mesajın kaydedildi.' };
});

// Legacy admin login endpoint is intentionally not reintroduced: all staff
// authenticate through loginUser and Config-held credentials, not a client-side role selector.


/* TdevKuantum schema setup. Set SCHEMA_SETUP_TOKEN in Back4App Config. Call setupDatabaseSchema with {token: SCHEMA_SETUP_TOKEN} once, then rotate/remove token. Creates missing classes/fields only; does not delete data. */
const TK_SCHEMA = {
  UserProfile: { username:'string', email:'string', displayName:'string', role:'string', grade:'number', school:'string', isBanned:'boolean', emailVerified:'boolean', referralCode:'string', createdAtISO:'string', lastLoginAtISO:'string' },
  EmailVerification: { email:'string', codeHash:'string', expiresAt:'date', attempts:'number', verified:'boolean', createdAtISO:'string' },
  Curriculum: { grade:'number', server:'string', subject:'string', title:'string', description:'string', order:'number', active:'boolean' },
  Question: { grade:'number', server:'string', subject:'string', topic:'string', question:'string', options:'array', correctAnswer:'string', explanation:'string', difficulty:'string', active:'boolean', order:'number' },
  SupportMessage: { email:'string', name:'string', subject:'string', message:'string', status:'string', createdAtISO:'string' },
  AuditLog: { actorId:'string', actorEmail:'string', action:'string', targetId:'string', details:'object', ipHash:'string', createdAtISO:'string' },
  Referral: { code:'string', ownerId:'string', referredUserId:'string', status:'string', createdAtISO:'string' }
};
const TK_FIELD_METHODS = { string:'addString', number:'addNumber', boolean:'addBoolean', date:'addDate', array:'addArray', object:'addObject' };
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
