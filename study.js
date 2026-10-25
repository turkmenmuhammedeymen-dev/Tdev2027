(function () {
  'use strict';
  const KEYS = {
    plans: 'tdev2027.study.plans',
    notes: 'tdev2027.study.notes',
    cards: 'tdev2027.study.cards',
    practice: 'tdev2027.study.practice',
    mistakes: 'tdev2027.study.mistakes'
  };
  function read(key) {
    try { const v = JSON.parse(localStorage.getItem(KEYS[key]) || '[]'); return Array.isArray(v) ? v : []; }
    catch (_) { return []; }
  }
  function write(key, items) { localStorage.setItem(KEYS[key], JSON.stringify(items)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function id() {
    return window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function notify(message) { if (typeof window.showNotif === 'function') window.showNotif(message); }
  async function cloud(name, params) {
    try {
      if (!window.Parse || !Parse.Cloud || typeof Parse.Cloud.run !== 'function') return null;
      return await Parse.Cloud.run(name, params);
    } catch (error) {
      console.info('[TDEV study sync]', name, error && error.message);
      return null;
    }
  }
  function mergeCloud(key, items) {
    if (!Array.isArray(items)) return;
    const merged = new Map(read(key).filter(function (x) { return x && x.id; }).map(function (x) { return [x.id, x]; }));
    items.forEach(function (remote) {
      if (!remote || !remote.id) return;
      const local = merged.get(remote.id);
      const stamp = function (x) {
        const value = x && (x.updatedAt || x.createdAt || x.date || x.reviewDate);
        const time = value ? new Date(value).getTime() : 0;
        return Number.isFinite(time) ? time : 0;
      };
      if (!local || stamp(remote) >= stamp(local)) merged.set(remote.id, remote);
    });
    write(key, Array.from(merged.values()));
  }
  window.saveStudyPlan = async function (event) {
    event.preventDefault();
    const item = {
      id: id(),
      title: document.getElementById('plan-title').value.trim(),
      subject: document.getElementById('plan-subject').value.trim(),
      date: document.getElementById('plan-date').value,
      minutes: Number(document.getElementById('plan-minutes').value),
      done: false,
      createdAt: new Date().toISOString()
    };
    item.updatedAt = item.createdAt;
    if (!item.title || !item.subject || !item.date || !Number.isInteger(item.minutes) || item.minutes < 5 || item.minutes > 600) {
      notify('Plan bilgilerini kontrol et.'); return;
    }
    const list = read('plans'); list.unshift(item); write('plans', list);
    const result = await cloud('saveStudyPlan', { item: item });
    notify(result && result.success === true ? 'Çalışma planı kaydedildi ve buluta eşitlendi.' : 'Plan bu cihazda kaydedildi. Bulut eşitlemesi doğrulanamadı.');
    document.getElementById('study-plan-form').reset();
    document.getElementById('plan-date').value = today();
    document.getElementById('plan-minutes').value = '25';
    renderStudyPlans();
  };
  function renderStudyPlans() {
    const host = document.getElementById('study-plan-list'); if (!host) return;
    const list = read('plans');
    host.innerHTML = list.length ? list.map(function (p) {
      return '<article class="study-item ' + (p.done ? 'done' : '') + '"><div><div class="study-item-title">' + esc(p.title) +
        '</div><div class="study-item-meta">' + esc(p.subject) + ' · ' + esc(p.date) + ' · ' + (Number(p.minutes) || 0) +
        ' dk</div></div><div class="study-item-actions"><button class="study-mini" onclick="toggleStudyPlan(\'' + esc(p.id) + '\')">' +
        (p.done ? 'Geri al' : 'Tamamlandı') + '</button><button class="study-mini" onclick="deleteStudyItem(\'plans\',\'' + esc(p.id) + '\')">Sil</button></div></article>';
    }).join('') : '<p class="study-item-meta">Henüz plan yok. İlk çalışma hedefini yukarıdan ekle.</p>';
  }
  window.loadStudyPlanner = async function () {
    const date = document.getElementById('plan-date'); if (date && !date.value) date.value = today();
    const mistakeDate = document.getElementById('mistake-review-date'); if (mistakeDate && !mistakeDate.value) mistakeDate.value = today();
    renderFocusClock();
    renderStudyPlans();
    const result = await cloud('getStudyPlans', {});
    if (result && result.success && Array.isArray(result.items)) { mergeCloud('plans', result.items); renderStudyPlans(); }
  };
  window.toggleStudyPlan = async function (itemId) {
    const list = read('plans'); const item = list.find(function (x) { return x.id === itemId; }); if (!item) return;
    item.done = !item.done; item.updatedAt = new Date().toISOString(); item.completedAt = item.done ? item.updatedAt : '';
    write('plans', list); renderStudyPlans(); await cloud('saveStudyPlan', { item: item }); window.renderLearningProgress();
  };
  window.saveStudyNote = async function (event) {
    event.preventDefault();
    const item = {
      id: id(),
      title: document.getElementById('note-title').value.trim(),
      subject: document.getElementById('note-subject').value.trim(),
      body: document.getElementById('note-body').value.trim(),
      updatedAt: new Date().toISOString()
    };
    if (!item.title || !item.body) { notify('Not başlığı ve içeriği zorunlu.'); return; }
    const list = read('notes'); list.unshift(item); write('notes', list);
    const result = await cloud('saveStudyNote', { item: item });
    notify(result && result.success === true ? 'Not kaydedildi ve buluta eşitlendi.' : 'Not bu cihazda kaydedildi. Bulut eşitlemesi doğrulanamadı.');
    document.getElementById('study-note-form').reset(); renderStudyNotes();
  };
  function renderStudyNotes() {
    const host = document.getElementById('study-note-list'); if (!host) return;
    const list = read('notes');
    host.innerHTML = list.length ? list.map(function (n) {
      return '<article class="study-item"><div><div class="study-item-title">' + esc(n.title) + '</div><div class="study-item-meta">' +
        esc(n.subject || 'Genel') + ' · ' + esc(String(n.updatedAt || '').slice(0, 10)) + '<p>' +
        esc(n.body).replace(/\n/g, '<br>') + '</p></div></div><div class="study-item-actions"><button class="study-mini" onclick="deleteStudyItem(\'notes\',\'' +
        esc(n.id) + '\')">Sil</button></div></article>';
    }).join('') : '<p class="study-item-meta">Henüz not kaydetmedin.</p>';
  }
  window.loadStudyNotes = async function () {
    renderStudyNotes();
    const result = await cloud('getStudyNotes', {});
    if (result && result.success && Array.isArray(result.items)) { mergeCloud('notes', result.items); renderStudyNotes(); }
  };
  window.addStudyCard = async function (event) {
    event.preventDefault();
    const item = { id: id(), front: document.getElementById('card-front').value.trim(), back: document.getElementById('card-back').value.trim(), known: false, createdAt: new Date().toISOString() };
    if (!item.front || !item.back) return;
    item.updatedAt = item.createdAt;
    const list = read('cards'); list.unshift(item); write('cards', list); event.target.reset(); renderStudyCards();
    const result = await cloud('saveStudyCard', { item: item });
    notify(result && result.success === true ? 'Bilgi kartı oluşturuldu ve buluta eşitlendi.' : 'Kart bu cihazda oluşturuldu. Bulut eşitlemesi doğrulanamadı.');
  };
  window.loadStudyCards = async function () {
    renderStudyCards();
    const result = await cloud('getStudyCards', {});
    if (result && result.success && Array.isArray(result.items)) { mergeCloud('cards', result.items); renderStudyCards(); window.renderLearningProgress(); }
  };
  window.renderStudyCards = function () {
    const host = document.getElementById('study-card-list'); if (!host) return;
    const list = read('cards');
    host.innerHTML = list.length ? list.map(function (c) {
      return '<button type="button" class="study-flashcard" onclick="flipStudyCard(this,\'' + esc(c.id) + '\')" data-flipped="false"><small>' +
        (c.known ? 'BİLİNİYOR' : 'KARTI ÇEVİR') + '</small><strong class="card-front">' + esc(c.front) +
        '</strong><span class="card-answer" hidden>' + esc(c.back) + '</span><span class="study-item-actions">' +
        '<span class="study-mini" onclick="event.stopPropagation();markStudyCard(\'' + esc(c.id) + '\',true)">✓ BİLİYORUM</span>' +
        '<span class="study-mini" onclick="event.stopPropagation();markStudyCard(\'' + esc(c.id) + '\',false)">↻ TEKRAR</span>' +
        '<span class="study-mini" onclick="event.stopPropagation();deleteStudyItem(\'cards\',\'' + esc(c.id) + '\')">Sil</span></span></button>';
    }).join('') : '<p class="study-item-meta">Henüz kart yok. Bir soru ve cevap ekleyerek başla.</p>';
  };
  window.flipStudyCard = function (el) {
    const flipped = el.dataset.flipped !== 'true'; el.dataset.flipped = String(flipped);
    el.querySelector('.card-front').hidden = flipped; el.querySelector('.card-answer').hidden = !flipped;
    el.querySelector('small').textContent = flipped ? 'CEVAP' : 'KARTI ÇEVİR';
  };
  window.markStudyCard = function (itemId, known) {
    const list = read('cards'); const card = list.find(function (x) { return x.id === itemId; }); if (!card) return;
    card.known = known; card.lastReviewedAt = new Date().toISOString(); card.updatedAt = card.lastReviewedAt; card.reviewCount = (card.reviewCount || 0) + 1;
    write('cards', list); renderStudyCards();
    cloud('saveStudyCard', { item: card }).then(function (result) {
      if (!result || result.success !== true) notify('Kart bu cihazda güncellendi; bulut eşitlemesi doğrulanamadı.');
    });
    window.renderLearningProgress();
  };
  window.savePractice = async function (event) {
    event.preventDefault();
    const total = Number(document.getElementById('practice-total').value);
    const correct = Number(document.getElementById('practice-correct').value);
    if (!Number.isInteger(total) || !Number.isInteger(correct) || total < 0 || correct < 0 || correct > total) {
      notify('Doğru sayısı, toplam soru sayısını aşamaz.'); return;
    }
    const item = {
      id: id(), subject: document.getElementById('practice-subject').value.trim(),
      kind: document.getElementById('practice-kind').value, total: total, correct: correct,
      reflection: document.getElementById('practice-reflection').value.trim(), date: new Date().toISOString()
    };
    const list = read('practice'); list.unshift(item); write('practice', list);
    const result = await cloud('saveStudyProgress', { item: item });
    document.getElementById('practice-reflection').value = ''; renderPracticeLog(); window.renderLearningProgress();
    notify(result && result.success === true ? 'Çalışma oturumu kaydedildi ve buluta eşitlendi.' : 'Oturum bu cihazda kaydedildi. Bulut eşitlemesi doğrulanamadı.');
  };
  function renderPracticeLog() {
    const host = document.getElementById('practice-log'); if (!host) return;
    const list = read('practice');
    host.innerHTML = list.length ? list.map(function (p) {
      const percent = p.total ? Math.round(p.correct / p.total * 100) : 0;
      return '<article class="study-item"><div><div class="study-item-title">' + esc(p.subject) + ' · ' + esc(p.kind) +
        '</div><div class="study-item-meta">' + esc(String(p.date || '').slice(0, 10)) + ' · ' + p.correct + '/' + p.total +
        ' doğru · ' + percent + '% başarı' + (p.reflection ? '<br>' + esc(p.reflection) : '') +
        '</div></div><div class="study-item-actions"><button class="study-mini" onclick="deleteStudyItem(\'practice\',\'' + esc(p.id) + '\')">Sil</button></div></article>';
    }).join('') : '<p class="study-item-meta">Henüz çalışma oturumu kaydedilmedi.</p>';
  }
  window.loadPracticeLog = async function () { renderPracticeLog(); const result = await cloud('getStudyProgress', {}); if (result && result.success && Array.isArray(result.items)) { mergeCloud('practice', result.items); renderPracticeLog(); window.renderLearningProgress(); } };
  window.deleteStudyItem = async function (key, itemId) {
    if (!Object.prototype.hasOwnProperty.call(KEYS, key)) return;
    write(key, read(key).filter(function (x) { return x.id !== itemId; }));
    const cloudClass = { plans:'StudyPlan', notes:'StudyNote', cards:'StudyCard', practice:'StudyProgress', mistakes:'StudyMistake' }[key];
    if (cloudClass) { const result = await cloud('deleteStudyRecord', { className: cloudClass, itemId: itemId }); if (!result || result.success !== true) notify('Kayıt bu cihazdan silindi; sunucu kopyasının silindiği doğrulanamadı.'); }
    if (key === 'plans') renderStudyPlans();
    if (key === 'notes') renderStudyNotes();
    if (key === 'cards') renderStudyCards();
    if (key === 'practice') renderPracticeLog();
    window.renderLearningProgress();
  };

  window.saveStudyMistake = async function (event) {
    event.preventDefault();
    const item = { id:id(), subject:document.getElementById('mistake-subject').value.trim(), title:document.getElementById('mistake-title').value.trim(), reason:document.getElementById('mistake-reason').value.trim(), fix:document.getElementById('mistake-fix').value.trim(), reviewDate:document.getElementById('mistake-review-date').value, status:document.getElementById('mistake-status').value, updatedAt:new Date().toISOString() };
    if (!item.subject || !item.title || !item.reason || !item.fix || !item.reviewDate) { notify('Yanlış defterindeki alanları kontrol et.'); return; }
    const list=read('mistakes'); list.unshift(item); write('mistakes',list);
    const result=await cloud('saveStudyMistake',{item:item});
    document.getElementById('mistake-form').reset();
    const date=document.getElementById('mistake-review-date'); if(date) date.value=today();
    renderStudyMistakes(); window.renderLearningProgress();
    notify(result && result.success===true ? 'Yanlış kaydedildi ve buluta eşitlendi.' : 'Yanlış bu cihazda kaydedildi. Bulut eşitlemesi doğrulanamadı.');
  };
  function renderStudyMistakes() {
    const host=document.getElementById('study-mistake-list'); if(!host) return;
    const list=read('mistakes');
    host.innerHTML=list.length ? list.map(function(m){
      return '<article class="study-item"><div><div class="study-item-title">'+esc(m.subject)+' · '+esc(m.title)+'</div><div class="study-item-meta">Tekrar: '+esc(m.reviewDate)+' · '+(m.status==='learned'?'ÖĞRENİLDİ':'TEKRAR EDİLECEK')+'<p><strong>Neden:</strong> '+esc(m.reason)+'</p><p><strong>Doğru yaklaşım:</strong> '+esc(m.fix)+'</p></div></div><div class="study-item-actions"><button class="study-mini" onclick="toggleStudyMistake(\''+esc(m.id)+'\')">'+(m.status==='learned'?'Tekrara al':'Öğrendim')+'</button><button class="study-mini" onclick="deleteStudyItem(\'mistakes\',\''+esc(m.id)+'\')">Sil</button></div></article>';
    }).join('') : '<p class="study-item-meta">Henüz yanlış kaydetmedin. Bir sorudan öğrendiğin noktayı burada saklayabilirsin.</p>';
  }
  window.renderStudyMistakes=renderStudyMistakes;
  window.loadStudyMistakes=async function(){
    const date=document.getElementById('mistake-review-date'); if(date&&!date.value) date.value=today();
    renderStudyMistakes(); const result=await cloud('getStudyMistakes',{});
    if(result&&result.success&&Array.isArray(result.items)){mergeCloud('mistakes',result.items);renderStudyMistakes();}
  };
  window.toggleStudyMistake=async function(itemId){
    const list=read('mistakes'), item=list.find(function(x){return x.id===itemId;}); if(!item)return;
    item.status=item.status==='learned'?'review':'learned'; item.updatedAt=new Date().toISOString(); write('mistakes',list); renderStudyMistakes();
    const result=await cloud('saveStudyMistake',{item:item});
    notify(result&&result.success===true?'Yanlış defteri güncellendi.':'Değişiklik bu cihazda kaydedildi; bulut eşitlemesi doğrulanamadı.'); window.renderLearningProgress();
  };
  let focusInterval=null, focusRemaining=25*60;
  function renderFocusClock(){const el=document.getElementById('focus-clock');if(!el)return;el.textContent=String(Math.floor(focusRemaining/60)).padStart(2,'0')+':'+String(focusRemaining%60).padStart(2,'0');}
  window.startFocusTimer=function(){
    if(focusInterval)return;
    const duration=Number(document.getElementById('focus-duration')?.value||25);
    if(!Number.isFinite(duration)||duration<1||duration>120){notify('Odak süresini kontrol et.');return;}
    if(focusRemaining<=0||focusRemaining>duration*60)focusRemaining=duration*60;
    const subject=(document.getElementById('focus-subject')?.value||'').trim(),status=document.getElementById('focus-status');
    if(status)status.textContent=subject?'Odaklanılan ders: '+subject:'Odak oturumu başladı. Dikkatini tek konuya ver.';
    renderFocusClock();
    focusInterval=window.setInterval(function(){
      focusRemaining-=1;renderFocusClock();
      if(focusRemaining<=0){window.clearInterval(focusInterval);focusInterval=null;focusRemaining=0;renderFocusClock();if(status)status.textContent='Odak süresi tamamlandı. '+(document.getElementById('focus-break')?.value||5)+' dakika mola vermen önerilir.';notify('Odak süren tamamlandı. Kısa bir mola ver!');}
    },1000);
  };
  window.pauseFocusTimer=function(){if(focusInterval)window.clearInterval(focusInterval);focusInterval=null;const s=document.getElementById('focus-status');if(s)s.textContent='Sayaç duraklatıldı. Hazır olduğunda devam edebilirsin.';};
  window.resetFocusTimer=function(){if(focusInterval)window.clearInterval(focusInterval);focusInterval=null;focusRemaining=Number(document.getElementById('focus-duration')?.value||25)*60;renderFocusClock();const s=document.getElementById('focus-status');if(s)s.textContent='Sayaç sıfırlandı.';};

  window.renderLearningProgress = function () {
    const host = document.getElementById('learning-progress-summary'); if (!host) return;
    const plans = read('plans'), notes = read('notes'), cards = read('cards'), practice = read('practice');
    const completed = plans.filter(function (p) { return p.done; }).length;
    const minutes = plans.filter(function (p) { return p.done; }).reduce(function (sum, p) { return sum + (Number(p.minutes) || 0); }, 0);
    const total = practice.reduce(function (sum, p) { return sum + (Number(p.total) || 0); }, 0);
    const correct = practice.reduce(function (sum, p) { return sum + (Number(p.correct) || 0); }, 0);
    const accuracy = total ? Math.round(correct / total * 100) : 0;
    const tiles = [
      [completed + '/' + plans.length, 'Tamamlanan plan'], [minutes + ' dk', 'Tamamlanan plan süresi'],
      [String(notes.length), 'Kişisel not'], [cards.filter(function (c) { return c.known; }).length + '/' + cards.length, 'Bilinen bilgi kartı'],
      [String(practice.length), 'Çalışma oturumu'], [accuracy + '%', 'Kaydedilen sorularda başarı'], [String(read('mistakes').length), 'Yanlış defteri kaydı']
    ];
    host.innerHTML = tiles.map(function (t) { return '<div class="progress-tile"><strong>' + esc(t[0]) + '</strong><span>' + esc(t[1]) + '</span></div>'; }).join('');
  };
  window.exportLearningData = function () {
    const data = { exportedAt: new Date().toISOString(), plans: read('plans'), notes: read('notes'), cards: read('cards'), practice: read('practice'), mistakes: read('mistakes') };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'tdev2027-ogrenme-verilerim.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    notify('Verilerin dışa aktarıldı.');
  };
  window.clearLocalLearningData = function () {
    if (!window.confirm('Bu cihazdaki plan, not, kart ve oturum kayıtları silinsin mi? Sunucudaki kayıtlar silinmez.')) return;
    Object.keys(KEYS).forEach(function (key) { localStorage.removeItem(KEYS[key]); });
    renderStudyPlans(); renderStudyNotes(); renderStudyCards(); renderPracticeLog(); window.renderLearningProgress();
    notify('Bu cihazdaki öğrenme verileri temizlendi.');
  };
  document.addEventListener('DOMContentLoaded', function () {
    const date = document.getElementById('plan-date'); if (date && !date.value) date.value = today();
  });
})();