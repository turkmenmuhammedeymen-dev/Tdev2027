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
const appCode = html + '\n' + files['study.js'] + '\n' + files['school.js'];
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
  'requestTdevPasswordReset', 'completeTdevPasswordReset', 'healthCheck', 'getMyTdevId', 'linkGuardianStudent', 'getMyGuardianStudents', 'unlinkGuardianStudent', 'getMyDeviceSessions', 'recordDeviceSession', 'postClassroomMessage', 'getClassroomMessages', 'addClassroomMemberById',
  'saveStudyPlan', 'getStudyPlans', 'saveStudyNote', 'getStudyNotes',
  'saveStudyProgress', 'getStudyProgress', 'saveStudyCard', 'getStudyCards',
  'saveStudyMistake', 'getStudyMistakes', 'deleteStudyRecord'
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
  check(new RegExp('runPublicAuthCloud\\(\\s*[\\'\\"]' + functionName + '[\\'\\"]').test(html),
    'Public auth endpoint uses sessionless request: ' + functionName);
}

check(cloudCode.includes('async function assertVerificationProviderReady()') &&
      cloudCode.includes("await assertVerificationProviderReady();") &&
      cloudCode.includes("'EMAIL_PROVIDER_NOT_READY'"),
  'Registration checks email-provider readiness before creating an account');

check(cloudCode.includes('StudyCard:') && cloudCode.includes("Parse.Cloud.define('saveStudyCard'") &&
      cloudCode.includes("Parse.Cloud.define('getStudyCards'"),
  'Flashcards have a server schema and cloud sync endpoints');

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
