#!/usr/bin/env node
'use strict';

/**
 * Dependency-free repository checks for TdevKuantum.
 * Run with: node scripts/validate-project.js
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const failures = [];
const passed = [];
function check(condition, message) {
  if (condition) passed.push(message);
  else failures.push(message);
}
function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    failures.push('Required file cannot be read: ' + relativePath);
    return '';
  }
}
function syntaxCheck(source, filename) {
  try {
    new vm.Script(source, { filename });
    passed.push('Syntax OK: ' + filename);
  } catch (error) {
    failures.push('Syntax error in ' + filename + ': ' + error.message);
  }
}

const requiredFiles = [
  'index.html',
  'learning-center.js',
  'learning-center.js',
  'school.js',
  'study.js',
  'curriculum-catalog.js',
  'back4app/main.js',
  'back4app/schema-setup.js',
  'apps-script/Code.gs',
  'terms.html',
  'privacy.html'
];
const files = {};
for (const filename of requiredFiles) {
  files[filename] = read(filename);
}

for (const filename of [
  'school.js',
  'study.js',
  'curriculum-catalog.js',
  'back4app/main.js',
  'back4app/schema-setup.js',
  'apps-script/Code.gs'
]) {
  if (files[filename]) syntaxCheck(files[filename], filename);
}

const html = files['index.html'];
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
for (let index = 0; index < scriptTags.length; index++) {
  const attrs = scriptTags[index][1];
  const body = scriptTags[index][2];
  if (/\bsrc\s*=/i.test(attrs)) continue;
  const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || 'text/javascript';
  if (!/^(text\/javascript|application\/javascript|module)$/i.test(type)) continue;
  syntaxCheck(body, 'index.html inline script #' + (index + 1));
}

const localScriptRefs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1])
  .filter(value => !/^https?:\/\//i.test(value) && !value.startsWith('//'));
for (const asset of localScriptRefs) {
  const clean = asset.split(/[?#]/)[0].replace(/^\.\//, '');
  check(fs.existsSync(path.join(root, clean)), 'Local script asset exists: ' + clean);
}

for (const filename of ['terms.html', 'privacy.html']) {
  check(html.includes('href="' + filename + '"') || html.includes("href='" + filename + "'"),
    'index.html links to ' + filename);
}

const cloudCode = files['back4app/main.js'];
const definedFunctions = new Set(
  [...cloudCode.matchAll(/Parse\.Cloud\.define\(\s*['"]([^'"]+)['"]/g)].map(match => match[1])
);
const appCode = html + '\n' + files['learning-center.js'] + '\n' + files['study.js'] + '\n' + files['school.js'];
const calledFunctions = new Set([
  ...[...appCode.matchAll(/Parse\.Cloud\.run\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
  ...[...appCode.matchAll(/runPublicAuthCloud\(\s*['"]([^'"]+)['"]/g)].map(match => match[1])
]);
for (const functionName of calledFunctions) {
  check(definedFunctions.has(functionName),
    'Cloud function is defined for frontend call: ' + functionName);
}

for (const functionName of [
  'registerUser', 'verifyEmailCode', 'resendVerificationCode', 'loginUser',
  'requestTdevPasswordReset', 'completeTdevPasswordReset', 'healthCheck',
  'getMyTdevId', 'linkGuardianStudent', 'getMyGuardianStudents', 'unlinkGuardianStudent',
  'getMyDeviceSessions', 'recordDeviceSession', 'postClassroomMessage',
  'getClassroomMessages', 'addClassroomMemberById',
  'saveStudyPlan', 'getStudyPlans', 'saveStudyNote', 'getStudyNotes',
  'saveStudyProgress', 'getStudyProgress', 'saveStudyCard', 'getStudyCards',
  'saveStudyMistake', 'getStudyMistakes', 'deleteStudyRecord', 'saveStudyGoal', 'getStudyGoals',
  'getMyActiveSessions', 'revokeMySession', 'deleteMyAccountData', 'tdevAIResearch'
]) {
  check(definedFunctions.has(functionName), 'Required Cloud function exists: ' + functionName);
}

const appsScript = files['apps-script/Code.gs'];
check(appsScript.includes("const TOKEN_PROPERTY = 'APPS_SCRIPT_TOKEN'"),
  'Apps Script reads the expected Script Property');
check(appsScript.includes("payload.action || '') === 'healthcheck'") &&
      appsScript.includes('tokenValid: true'),
  'Apps Script supports token-only health check');
check(cloudCode.includes("JSON.stringify({ action: 'healthcheck', token: expectedToken })"),
  'Back4App probes Apps Script using the matching health-check protocol');
check(cloudCode.includes("configValueAsync('APPS_SCRIPT_TOKEN')"),
  'Back4App reads the server-side mail token');
check(cloudCode.includes("Back4App Config is the dashboard's source of truth") &&
      cloudCode.indexOf("const cfg = await loadParseConfig();") < cloudCode.indexOf("const env = (typeof process !== 'undefined' && process.env)"),
  'Back4App Config takes precedence over stale environment values');
check(cloudCode.includes("'deepseek-ai/deepseek-v4-flash'") &&
      cloudCode.includes("configValueAsync('NVIDIA_API_KEY')") &&
      cloudCode.includes("configValueAsync('NVIDIA_BASE_URL'"),
  'NVIDIA provider has a current default model and reads server-side credentials');
check(cloudCode.includes("nvidiaApiKeyConfigured: !!nvidiaApiKey") &&
      cloudCode.includes("nvidiaBaseUrlValid") &&
      cloudCode.includes("nvidiaModel: safeText"),
  'Health check reports NVIDIA configuration without exposing the API key');
check(cloudCode.includes("providerError || ''") &&
      cloudCode.includes("providerErrors.push(provider.label + ' HTTP ' + response.status"),
  'AI provider errors preserve safe HTTP response details for diagnosis');
check(cloudCode.includes('PARSE_CONFIG_CACHE_TTL_MS') &&
      cloudCode.includes('Do not cache a failed/empty read forever'),
  'Parse Config cache refreshes and does not permanently retain failed reads');
check(cloudCode.includes("EXPECTED_APPS_SCRIPT_BUILD = '2026-10-26.1'") &&
      appsScript.includes("const SERVICE_BUILD = '2026-10-26.1'") &&
      appsScript.includes('build: SERVICE_BUILD'),
  'Back4App and Apps Script use a matching deployment build marker');
check(!/\b(?:APPS_SCRIPT_TOKEN|RESEND_API_KEY)\b/.test(
  html + '\n' + files['study.js'] + '\n' + files['school.js'] + '\n' + files['curriculum-catalog.js']
), 'No mail-service secret key names appear in frontend source');
check(html.includes('async function runPublicAuthCloud(') &&
      html.includes("'X-Parse-Application-Id': TDEV_PARSE_APP_ID") &&
      html.includes("'X-Parse-JavaScript-Key': TDEV_PARSE_JS_KEY") &&
      html.includes('Intentionally omit X-Parse-Session-Token'),
  'Public auth requests do not inherit a stale browser session token');
for (const functionName of [
  'registerUser', 'verifyEmailCode', 'resendVerificationCode', 'loginUser',
  'requestTdevPasswordReset', 'completeTdevPasswordReset'
]) {
  check(html.includes("runPublicAuthCloud('" + functionName + "'"),
    'Public auth endpoint uses sessionless request: ' + functionName);
}

check(!/user\.set\(\s*['"]className['"]/.test(cloudCode) &&
      cloudCode.includes("user.set('schoolClassName', safeText(request.params && request.params.className, 40))"),
  'Registration avoids the reserved Parse className field and stores class label safely');

check(cloudCode.includes("cache: 'no-store'") &&
      cloudCode.includes("verification.set('deliveryFailed', true);") &&
      cloudCode.includes("verification.set('used', true);"),
  'Email health checks avoid cached status and failed-delivery codes are invalidated');

check(cloudCode.includes('async function assertVerificationProviderReady()') &&
      cloudCode.includes('await assertVerificationProviderReady();') &&
      cloudCode.includes("'EMAIL_PROVIDER_NOT_READY'"),
  'Registration checks email-provider readiness before creating an account');

check(cloudCode.includes('StudyCard:') && cloudCode.includes("Parse.Cloud.define('saveStudyCard'") &&
      cloudCode.includes("Parse.Cloud.define('getStudyCards'"),
  'Flashcards have a server schema and cloud sync endpoints');

check(cloudCode.includes('async function issueVerificationCode(') &&
      cloudCode.includes('deliveryFailed') &&
      cloudCode.includes('EMAIL_DELIVERY_FAILED'),
  'Verification delivery failures are recorded and recoverable');
check(cloudCode.includes('Environment variables are a fallback only') &&
      cloudCode.indexOf("const cfg = await loadParseConfig();") < cloudCode.indexOf("const env = (typeof process !== 'undefined' && process.env)"),
  'Back4App Config values take precedence over environment fallbacks');
check(cloudCode.includes('AI_ALL_PROVIDERS_FAILED') &&
      cloudCode.includes('fallbackUsed: index > 0') &&
      cloudCode.includes("configValueAsync('AI_FALLBACK_API_KEY')"),
  'AI provider errors trigger a configured fallback and return provider metadata');
check(cloudCode.includes('function currentRequestSessionToken') &&
      cloudCode.includes("'SESSION_CONTEXT_UNAVAILABLE'"),
  'Remote session revocation requires a verified current session token');
check(cloudCode.includes("Parse.Cloud.define('tdevAIResearch'") &&
      cloudCode.includes("configValueAsync('TAVILY_API_KEY')") &&
      !html.includes('TAVILY_API_KEY') &&
      html.includes("Parse.Cloud.run('tdevAIResearch'"),
  'Source-linked research uses a server-side configured search provider');
check(cloudCode.includes("Parse.Cloud.define('saveStudyGoal'") &&
      cloudCode.includes("Parse.Cloud.define('getStudyGoals'") &&
      cloudCode.includes('StudyGoal:'),
  'Exam goals have server-side ownership and persistence');
check(html.includes('function startVoiceInput()') && html.includes('function aiFileLoad(input)') &&
      html.includes('window.pdfjsLib') && html.includes('window.Tesseract'),
  'AI workspace supports voice dictation and local text extraction/OCR');
check(cloudCode.includes("Parse.Query('_Session')") &&
      cloudCode.includes("Parse.Cloud.define('revokeMySession'") &&
      cloudCode.includes("Parse.Cloud.define('deleteMyAccountData'"),
  'Security center supports active-session listing, remote sign-out and account deletion');
check(html.includes('id="tdev-final-polish"') && html.includes('id="nav-exam-goals"'),
  'Dashboard has readable corporate styling and direct exam-goal navigation');
check(cloudCode.includes('Apps Script GET ve POST token kontrolleri birbiriyle uyuşmuyor') &&
      cloudCode.includes('GOOGLE_APPS_SCRIPT_URL'),
  'Email provider diagnostics identify deployment/token mismatch without exposing secrets');

check(html.includes('id="tab-security"') && html.includes('id="nav-security"') &&
      html.includes("Parse.Cloud.run('getMyActiveSessions'") &&
      html.includes("Parse.Cloud.run('revokeMySession'"),
  'Security and privacy center is connected to server endpoints');

check(html.includes('id="tab-student-center"') &&
      html.includes('id="nav-student-center"') &&
      html.includes('id="student-weekly-report"') &&
      html.includes('id="student-subject-progress"') &&
      html.includes('id="student-goal-progress"'),
  'Student control center includes daily goal, weekly report and subject progress UI');
check(html.includes('id="tab-exam-center"') &&
      html.includes('id="exam-question-bank"') &&
      html.includes('id="exam-session-area"') &&
      html.includes('id="exam-result-area"') &&
      html.includes('learning-center.js'),
  'Timed exam center UI and client module are connected');
check(files['learning-center.js'].includes('window.startTimedExam') &&
      files['learning-center.js'].includes('window.finishTimedExam') &&
      files['learning-center.js'].includes("cloud('saveStudyProgress'") &&
      files['learning-center.js'].includes("cloud('saveStudyMistake'"),
  'Timed exams save results and automatically record incorrect/blank questions');
check(files['learning-center.js'].includes('durationLimitSeconds') &&
      files['learning-center.js'].includes('deadline') &&
      files['learning-center.js'].includes('timeExpired'),
  'Timed exam has a deadline, countdown and timeout completion path');
check(files['learning-center.js'].includes('window.addStudentTask') &&
      files['learning-center.js'].includes('window.addExamReminder') &&
      files['learning-center.js'].includes('window.saveStudentDailyGoal'),
  'Student center includes task, exam reminder and daily goal actions');

console.log('TdevKuantum repository validation');
console.log('Passed: ' + passed.length);
for (const item of passed) console.log('  ✓ ' + item);
if (failures.length) {
  console.error('Failed: ' + failures.length);
  for (const item of failures) console.error('  ✗ ' + item);
  process.exitCode = 1;
} else {
  console.log('All static checks passed. This does not replace live Back4App/Google Apps Script email testing.');
}
