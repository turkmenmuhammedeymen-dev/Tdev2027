(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cloud=async(name,params={})=>{if(!window.Parse||!Parse.Cloud||typeof Parse.Cloud.run!=='function')throw new Error('Bulut servisine bağlanılamadı.');const r=await Parse.Cloud.run(name,params);if(r&&r.success===false)throw new Error(r.error||r.message||'İşlem başarısız.');return r||{};};
const notify=m=>{if(typeof window.showNotif==='function')showNotif(m);else alert(m);};
let activeClass=null, profile=null, classrooms=[];
function ensureRegistrationFields(){
 const root=$('reg-student-fields'); if(!root)return;
 if(!$('reg-country-code')){const wrap=document.createElement('div');wrap.className='school-account-extra';wrap.innerHTML='<label for="reg-country-code">Ülke / müfredat (zorunlu)<select id="reg-country-code" required><option value="TR">Türkiye</option><option value="AZ">Azerbaycan</option><option value="GB">Birleşik Krallık</option><option value="DE">Almanya</option><option value="US">Amerika Birleşik Devletleri</option><option value="JP">Japonya</option></select></label>';root.prepend(wrap);}
 if(!$('reg-student-school-fields')){const wrap=document.createElement('div');wrap.id='reg-student-school-fields';wrap.className='school-account-extra';wrap.innerHTML='<label for="reg-school-name">Okul adı (zorunlu)<input id="reg-student-school-name" maxlength="160" required placeholder="Okulun tam adı"></label><label for="reg-school-address">Okul adresi (zorunlu)<input id="reg-student-school-address" maxlength="240" required placeholder="İl, ilçe ve adres"></label><p class="school-note">Okul bilgileri sınıf eşleştirmesi ve okul analizleri için kullanılır.</p>';root.append(wrap);}
 if(!$('reg-guardian-note')){const wrap=document.createElement('div');wrap.id='reg-guardian-note';wrap.className='school-account-extra';wrap.hidden=true;wrap.innerHTML='<p class="school-note">Veli hesabında okul veya sınıf seçimi gerekmez. Hesap oluşturduktan sonra öğrencinin TDEV ID kodunu “Öğrencilerim” bölümüne girerek bağlantı kurabilirsin.</p>';root.append(wrap);}
}
window.updateRegistrationFields=function(){
 ensureRegistrationFields();
 const type=$('reg-profile-type')?.value||'student';
 const student=$('reg-student-fields'), staff=$('reg-staff-fields'), school=$('reg-student-school-fields'), guardian=$('reg-guardian-note');
 if(student)student.style.display=['student','guardian'].includes(type)?'':'none';
 const gradeLabel=student&&student.querySelector('label[for="reg-grade"]');if(gradeLabel)gradeLabel.style.display=type==='student'?'':'none';
 const countryWrap=$('reg-country-code')?.parentElement;if(countryWrap)countryWrap.style.display=type==='student'?'':'none';
 if(school)school.style.display=type==='student'?'':'none';
 if(staff)staff.style.display=['teacher','principal'].includes(type)?'':'none';
 if(school)school.style.display=type==='student'?'':'none';
 if(guardian)guardian.hidden=type!=='guardian';
 const grade=$('reg-grade');if(grade&&!grade.options.length||grade&&grade.options.length<2){if(grade){grade.innerHTML='<option value="">Sınıfını seç</option>'+Array.from({length:13},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'. sınıf</option>').join('');}}
 ['reg-grade','reg-student-school-name','reg-student-school-address'].forEach(id=>{const el=$(id);if(el)el.required=type==='student';});
 ['reg-stage'].forEach(id=>{const el=$(id);if(el)el.required=['teacher','principal'].includes(type);});
 if($('reg-school-name')) $('reg-school-name').required=['teacher','principal'].includes(type);
 if($('reg-school-address')) $('reg-school-address').required=['teacher','principal'].includes(type);
};
function showPanel(){
 const tab=$('tab-school');if(!tab)return;
 const user=window.Parse&&Parse.User&&Parse.User.current&&Parse.User.current();
 if(!user){const status=$('school-profile-status');if(status)status.textContent='Sınıfım/Okulum için giriş yapmalısın.';return;}
 return loadSchoolDashboard();
}
window.loadSchoolDashboard=async function(){
 const status=$('school-profile-status'), list=$('school-classroom-list');if(status)status.textContent='Hesap ve okul bilgileri yükleniyor…';if(list)list.innerHTML='<p class="school-muted">Yükleniyor…</p>';
 try{
  const result=await cloud('getMyProfile',{});profile=result.profile||{};const p=profile;
  const type=p.profileType||p.role||'student';
  const staff=['teacher','principal'].includes(type);
  if($('school-staff-tools'))$('school-staff-tools').hidden=!['teacher','principal'].includes(type);
  if($('school-principal-tools'))$('school-principal-tools').hidden=type!=='principal';
  if($('school-student-tools'))$('school-student-tools').hidden=!['student','teacher'].includes(type);
  if($('school-class-list-title'))$('school-class-list-title').textContent=type==='guardian'?'Öğrencilerim':type==='principal'?'Okulumdaki sınıflar':'Sınıflarım';
  const nav=$('nav-school');if(nav)nav.style.display='';
  if(status)status.innerHTML=(p.avatarUrl?'<img src="'+esc(p.avatarUrl)+'" alt="Profil fotoğrafı" style="width:54px;height:54px;object-fit:cover;border-radius:50%;vertical-align:middle;margin-right:10px">':'')+'<strong>'+esc(p.displayName||p.name||'Hesap')+'</strong> · '+esc(typeLabel(type))+' · Kullanıcı ID: <code>'+esc(p.publicId||p.userId||'ID yükleniyor')+'</code><br>'+esc(p.schoolName||'Okul bilgisi eklenmemiş')+(p.schoolAddress?' · '+esc(p.schoolAddress):'')+'<div class="school-actions" style="margin-top:10px"><button type="button" class="school-button secondary" id="open-account-settings">⚙ Ayarlar / Hesap bilgilerim</button></div>';
  if($('open-account-settings'))$('open-account-settings').addEventListener('click',window.loadSchoolSettings);
  if(type==='guardian'){await loadGuardianPanel();return;}
  const data=await cloud('getMyClassrooms',{});classrooms=data.items||data.classrooms||[];
  renderClassrooms(classrooms);
  if(type==='principal'){const analytics=await cloud('getSchoolOverview',{});renderAnalytics(analytics.items||[]);}
  const q=new URLSearchParams(location.search), invite=q.get('invite');if(invite&&type==='student'){$('school-invite-code').value=invite;await window.joinSchoolClassroom();}
 }catch(e){if(status)status.textContent=e.message||'Okul bilgileri alınamadı.';if(list)list.innerHTML='';}
};
function typeLabel(t){return ({student:'Öğrenci',teacher:'Öğretmen',principal:'Müdür',guardian:'Veli'})[t]||t;}
function renderClassrooms(items){
 const list=$('school-classroom-list');if(!list)return;
 if(!items.length){list.innerHTML='<div class="school-item"><strong class="school-item-title">Henüz sınıf yok</strong><p class="school-muted">Öğretmen yeni sınıf oluşturabilir. Öğrenci davet bağlantısı veya koduyla katılabilir.</p></div>';return;}
 list.innerHTML=items.map(c=>'<article class="school-item"><div class="school-item-title">'+esc(c.name||'Sınıf')+'</div><div class="school-item-meta">'+esc(c.schoolName||'')+' · '+esc(c.grade||'')+'. sınıf · '+esc(c.educationStage||'')+'</div><div class="school-actions"><button class="school-button" type="button" data-class-open="'+esc(c.id||c.objectId||'')+'">Sınıfı aç</button>'+(c.invitationCode?'<button class="school-button secondary" type="button" data-invite="'+esc(c.invitationCode)+'">Davet bağlantısını kopyala</button>':'')+'</div></article>').join('');
 list.querySelectorAll('[data-class-open]').forEach(b=>b.addEventListener('click',()=>openClassroom(b.dataset.classOpen)));
 list.querySelectorAll('[data-invite]').forEach(b=>b.addEventListener('click',()=>copyInvite(b.dataset.invite)));
}
function copyInvite(code){const url=location.origin+location.pathname+'?invite='+encodeURIComponent(code);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(()=>notify('Davet bağlantısı kopyalandı.')).catch(()=>prompt('Davet bağlantısı',url));else prompt('Davet bağlantısı',url);}
window.createSchoolClassroom=async function(e){
 if(e)e.preventDefault();const form=$('school-create-form');if(!form||!form.reportValidity())return;
 const btn=form.querySelector('button[type=submit]');if(btn){btn.disabled=true;btn.textContent='Oluşturuluyor…';}
 try{const r=await cloud('createClassroom',{name:$('classroom-name').value.trim(),schoolName:$('classroom-school-name').value.trim(),schoolAddress:$('classroom-school-address').value.trim(),educationStage:$('classroom-stage').value,grade:$('classroom-grade').value,countryCode:profile&&profile.countryCode||'TR'});
 const c=r.classroom||r.item||{};notify('Sınıf oluşturuldu. Davet bağlantısını öğrencilerinle paylaş.');form.reset();if(c.invitationCode)copyInvite(c.invitationCode);await window.loadSchoolDashboard();
 }catch(err){notify(err.message||'Sınıf oluşturulamadı.');}finally{if(btn){btn.disabled=false;btn.textContent='＋ SINIF OLUŞTUR';}}
};
window.joinSchoolClassroom=async function(){
 const code=($('school-invite-code')?.value||new URLSearchParams(location.search).get('invite')||'').trim();if(!code){notify('Davet kodunu veya bağlantısını gir.');return;}
 try{await cloud('joinClassroomByInvite',{inviteCode:code});notify('Sınıfa katıldın.');await window.loadSchoolDashboard();}catch(e){notify(e.message||'Sınıfa katılınamadı.');}
};
async function openClassroom(id){
 try{const c=classrooms.find(x=>(x.id||x.objectId)===id)||{};activeClass=id;$('classroom-detail').hidden=false;$('classroom-detail-title').textContent=c.name||'Sınıf ayrıntıları';$('classroom-detail-meta').textContent=(c.schoolName||'')+' · '+(c.schoolAddress||'')+' · '+(c.grade||'')+'. sınıf';
 const roster=await cloud('getClassroomRoster',{classroomId:id});const people=roster.items||roster.roster||[];
 $('classroom-roster').innerHTML=people.length?people.map(p=>'<div class="school-item"><strong>'+esc(p.name||p.displayName||'Öğrenci')+'</strong><span class="school-muted">ID: '+esc(p.publicId||p.userId||p.id||'—')+' · Etkinlik: '+esc(p.activityCount??0)+' · Başarı: '+esc(p.successRate??p.accuracy??'—')+'%</span>'+(c.ownerId&&window.Parse?.User?.current()?.id===c.ownerId&&p.userId?'<button class="school-button secondary" data-manager="'+esc(p.userId)+'">Yönetici ata/kaldır</button>':'')+'</div>').join(''):'<p class="school-muted">Henüz üye veya etkinlik yok.</p>';
 $('classroom-roster').querySelectorAll('[data-manager]').forEach(b=>b.addEventListener('click',async()=>{try{await cloud('assignClassroomManager',{classroomId:id,userId:b.dataset.manager,makeManager:true});notify('Yönetici yetkisi güncellendi.');await openClassroom(id);}catch(e){notify(e.message);}}));
 if(c.ownerId&&window.Parse?.User?.current()?.id===c.ownerId){
  let add=$('classroom-add-member');if(!add){add=document.createElement('form');add.id='classroom-add-member';add.className='school-form';add.innerHTML='<label>Öğrenci / öğretmen / müdür TDEV ID<input id="classroom-member-id" maxlength="40" placeholder="TDEV-XXXXXXXXXXXX" required></label><div style="align-self:end"><button class="school-button" type="submit">ID İLE ÜYE EKLE</button></div>';$('classroom-roster').prepend(add);add.addEventListener('submit',async e=>{e.preventDefault();try{await cloud('addClassroomMemberById',{classroomId:id,userId:$('classroom-member-id').value.trim()});$('classroom-member-id').value='';notify('Kullanıcı sınıfa eklendi.');await openClassroom(id);}catch(err){notify(err.message);}});}
 }
 const files=await cloud('getClassroomFiles',{classroomId:id});renderFiles(files.items||[]);
 await loadMessages(id);
 }catch(e){notify(e.message||'Sınıf açılamadı.');}
}
function renderFiles(items){const box=$('classroom-files');if(!box)return;box.innerHTML=items.length?items.map(f=>'<div class="school-item"><a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">'+esc(f.name)+'</a><span class="school-muted">'+Math.max(1,Math.round((f.size||0)/1024))+' KB</span></div>').join(''):'<p class="school-muted">Henüz dosya paylaşılmadı.</p>';}
async function loadMessages(id){
 let box=$('classroom-messages');if(!box){box=document.createElement('section');box.className='school-card';box.id='classroom-messages';box.innerHTML='<h3>Sınıf mesajları</h3><div id="classroom-message-list" class="school-list"></div><form id="classroom-message-form" class="school-form"><label>Mesaj<textarea id="classroom-message-text" maxlength="3000" required></textarea></label><div><button class="school-button" type="submit">Mesaj gönder</button></div></form>';$('classroom-detail').append(box);$('classroom-message-form').addEventListener('submit',async e=>{e.preventDefault();try{await cloud('postClassroomMessage',{classroomId:activeClass,message:$('classroom-message-text').value.trim()});$('classroom-message-text').value='';await loadMessages(activeClass);}catch(err){notify(err.message);}});}
 const r=await cloud('getClassroomMessages',{classroomId:id});const list=$('classroom-message-list');if(list)list.innerHTML=(r.messages||[]).map(m=>'<div class="school-item"><strong>'+esc(m.authorName)+' <small>· '+esc(typeLabel(m.authorRole))+'</small></strong><p>'+esc(m.message)+'</p><small class="school-muted">'+esc(m.createdAtISO||'')+'</small></div>').join('')||'<p class="school-muted">Henüz mesaj yok.</p>';
}
window.uploadSchoolFile=async function(){
 if(!activeClass){notify('Önce bir sınıf aç.');return;}const input=$('classroom-file-input'),file=input&&input.files&&input.files[0];if(!file){notify('Paylaşmak için dosya seç.');return;}if(file.size>25*1024*1024){notify('Dosya 25 MB sınırını aşıyor.');return;}
 try{if(!window.Parse||!Parse.File)throw new Error('Dosya servisi hazır değil.');const parseFile=new Parse.File(file.name,file);await parseFile.save();await cloud('addClassroomFile',{classroomId:activeClass,name:file.name,url:parseFile.url(),fileType:file.type||'application/octet-stream',size:file.size});input.value='';const r=await cloud('getClassroomFiles',{classroomId:activeClass});renderFiles(r.items||[]);notify('Dosya sınıfla paylaşıldı.');}catch(e){notify(e.message||'Dosya yüklenemedi.');}
};
async function loadGuardianPanel(){
 const list=$('school-classroom-list');if(!list)return;
 list.innerHTML='<section class="school-card"><h3>Öğrencilerim</h3><p class="school-muted">Öğrencinin hesap ayarlarında görünen TDEV ID kodunu gir.</p><div class="school-form"><label>Öğrenci ID<input id="guardian-student-id" maxlength="40" placeholder="TDEV-XXXXXXXXXXXX"></label><div><button class="school-button" id="guardian-link-btn" type="button">ÖĞRENCİ EKLE</button></div></div><div id="guardian-students" class="school-list"></div></section>';
 $('guardian-link-btn').addEventListener('click',async()=>{try{await cloud('linkGuardianStudent',{studentId:$('guardian-student-id').value.trim()});$('guardian-student-id').value='';notify('Öğrenci hesabına eklendi.');await loadGuardianPanel();}catch(e){notify(e.message);}});
 const r=await cloud('getMyGuardianStudents',{});$('guardian-students').innerHTML=(r.students||[]).map(s=>'<article class="school-item"><strong>'+esc(s.name)+'</strong><span class="school-muted">'+esc(s.grade||'')+'. sınıf · '+esc(s.schoolName||'Okul belirtilmemiş')+' · '+esc(s.publicId)+'</span><button class="school-button secondary" data-unlink="'+esc(s.linkId)+'">Öğrencilerimden çıkar</button></article>').join('')||'<p class="school-muted">Henüz öğrenci eklemedin.</p>';
 $('guardian-students').querySelectorAll('[data-unlink]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Bu öğrenciyi veli bağlantılarından çıkarmak istiyor musun?'))return;try{await cloud('unlinkGuardianStudent',{linkId:b.dataset.unlink});await loadGuardianPanel();}catch(e){notify(e.message);}}));
}
function renderAnalytics(items){const box=$('school-analytics');if(!box)return;box.innerHTML=items.length?items.map(i=>'<article class="school-item"><strong>'+esc(i.name||i.classroomName||'Sınıf')+'</strong><span class="school-muted">Öğrenci: '+esc(i.studentCount??i.students??0)+' · Başarı: '+esc(i.successRate??i.accuracy??0)+'%</span><div style="height:8px;background:#26364b;border-radius:9px;overflow:hidden"><div style="height:100%;width:'+Math.max(0,Math.min(100,Number(i.successRate??i.accuracy)||0))+'%;background:linear-gradient(90deg,#3b82f6,#22c55e)"></div></div></article>').join(''):'<p class="school-muted">Okulunda henüz analiz edilecek sınıf veya etkinlik yok.</p>';}
window.loadSchoolSettings=async function(){
 try{const r=await cloud('getMyTdevId',{});const tab=$('tab-school');if(!tab)return;let box=$('school-account-settings');if(!box){box=document.createElement('section');box.id='school-account-settings';box.className='school-card';box.innerHTML='<h3>Ayarlar · Hesap bilgilerim</h3><p class="school-muted">Kullanıcı ID: <code id="my-tdev-id"></code></p><form id="school-settings-form" class="school-form"><label>Görünen ad<input id="settings-display-name" maxlength="100"></label><label>Dil<select id="settings-language"><option value="tr">Türkçe</option><option value="en">English</option></select></label><label>Profil fotoğrafı<input id="settings-avatar-file" type="file" accept="image/png,image/jpeg,image/webp"></label><div><button class="school-button" type="submit">Kaydet</button></div></form><h4>Son 10 cihaz oturumu</h4><p class="school-muted">Yaklaşık bölge, tarayıcı saat diliminden çıkarılır; kesin konum değildir.</p><div id="device-session-list" class="school-list"></div>';tab.append(box);$('school-settings-form').addEventListener('submit',async e=>{e.preventDefault();try{let avatarUrl='';const avatarFile=$('settings-avatar-file')?.files?.[0];if(avatarFile){if(!/^image\/(png|jpeg|webp)$/.test(avatarFile.type)||avatarFile.size>5*1024*1024)throw new Error('Profil fotoğrafı PNG/JPEG/WEBP ve en fazla 5 MB olmalı.');const f=new Parse.File(avatarFile.name,avatarFile);await f.save();avatarUrl=f.url();}await cloud('saveMyAccountSettings',{displayName:$('settings-display-name').value.trim(),language:$('settings-language').value,avatarUrl});notify('Hesap ayarları kaydedildi.');}catch(err){notify(err.message);}});}
 $('my-tdev-id').textContent=r.userId;const p=window.Parse.User.current();$('settings-display-name').value=p&&p.get('displayName')||'';const sessions=await cloud('getMyDeviceSessions',{});const box=$('device-session-list');if(box)box.innerHTML=(sessions.items||[]).map(s=>'<article class="school-item"><strong>'+esc(s.deviceLabel)+'</strong><span class="school-muted">'+esc(s.timezone)+' · '+esc(s.approximateRegion||'Bölge belirtilmedi')+'</span><small class="school-muted">'+esc(s.lastSeenISO)+'</small><small class="school-muted">'+esc(s.userAgent)+'</small></article>').join('')||'<p class="school-muted">Henüz cihaz kaydı yok.</p>'; }catch(e){notify(e.message);}
};
document.addEventListener('DOMContentLoaded',function(){
 ensureRegistrationFields();window.updateRegistrationFields();
 const grade=$('classroom-grade');if(grade&&grade.options.length<2)grade.innerHTML='<option value="">Sınıf seç</option>'+Array.from({length:13},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'. sınıf</option>').join('');
 const form=$('school-create-form');if(form){const name=$('classroom-school-name'),addr=$('classroom-school-address');if(name&&addr){const sync=()=>{if(profile&&profile.schoolName&&!name.value)name.value=profile.schoolName;if(profile&&profile.schoolAddress&&!addr.value)addr.value=profile.schoolAddress;};sync();}}
 const profileType=$('reg-profile-type');if(profileType)profileType.addEventListener('change',window.updateRegistrationFields);
});
window.addEventListener('load',function(){ensureRegistrationFields();window.updateRegistrationFields();});
let deviceRecordedFor='';
async function refreshSchoolNav(){
 try{const current=window.Parse&&Parse.User&&Parse.User.current&&Parse.User.current();const nav=$('nav-school');if(nav&&current)nav.style.display='';if(current&&deviceRecordedFor!==current.id){deviceRecordedFor=current.id;const ua=navigator.userAgent||'';const label=/Android/i.test(ua)?'Android cihaz':/iPhone|iPad/i.test(ua)?'Apple cihaz':/Windows/i.test(ua)?'Windows cihaz':/Macintosh/i.test(ua)?'Mac cihaz':'Tarayıcı';const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Bilinmiyor';const region=(navigator.language||'').split('-').slice(-1)[0]||'Bilinmiyor';cloud('recordDeviceSession',{deviceLabel:label,userAgent:ua,timezone,approximateRegion:region}).catch(()=>{});}}catch(_){}
}
document.addEventListener('DOMContentLoaded',refreshSchoolNav);
window.setInterval(refreshSchoolNav,1200);
})();
