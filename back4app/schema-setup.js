/* TdevKuantum schema setup. Set SCHEMA_SETUP_TOKEN in Back4App Config. Call setupDatabaseSchema with {token: SCHEMA_SETUP_TOKEN} once, then rotate/remove token. Creates missing classes/fields only; does not delete data. */
const TK_SCHEMA = {
  GuardianStudent: { guardianId:'string', studentId:'string', status:'string', createdAtISO:'string', removedAtISO:'string' },
  ClassroomMessage: { classroomId:'string', authorId:'string', authorName:'string', authorRole:'string', message:'string', createdAtISO:'string' },
  DeviceSession: { userId:'string', deviceLabel:'string', userAgent:'string', timezone:'string', approximateRegion:'string', lastSeenISO:'string' },
  UserProfile: { username:'string', email:'string', displayName:'string', role:'string', grade:'number', school:'string', isBanned:'boolean', emailVerified:'boolean', referralCode:'string', createdAtISO:'string', lastLoginAtISO:'string' },
  EmailVerification: { email:'string', emailHash:'string', codeHash:'string', expiresAt:'date', attempts:'number', used:'boolean', verified:'boolean', deliveryFailed:'boolean', createdAtISO:'string' },
  PasswordReset: { emailHash:'string', codeHash:'string', expiresAt:'date', attempts:'number', used:'boolean' },
  Curriculum: { grade:'number', server:'string', subject:'string', title:'string', description:'string', order:'number', active:'boolean' },
  Question: { grade:'number', server:'string', subject:'string', topic:'string', question:'string', options:'array', correctAnswer:'string', explanation:'string', difficulty:'string', active:'boolean', order:'number' },
  SupportMessage: { email:'string', name:'string', subject:'string', category:'string', message:'string', status:'string', userId:'string', createdAtISO:'string' },
  AuditLog: { actorId:'string', actorEmail:'string', action:'string', targetId:'string', details:'object', ipHash:'string', createdAtISO:'string' },
  Referral: { code:'string', ownerId:'string', referredUserId:'string', status:'string', createdAtISO:'string' },
  StudyPlan: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyNote: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyProgress: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyCard: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyMistake: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' },
  StudyGoal: { ownerId:'string', itemId:'string', payload:'object', createdAtISO:'string', updatedAtISO:'string' }
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
