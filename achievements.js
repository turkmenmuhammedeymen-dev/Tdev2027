(function () {
  'use strict';
  const PREFIX = 'tdevkuantum_xp_v1';
  const TASKS = [
    { id:'study-20', title:'20 dakika odaklı çalış', description:'Odak sayacını kullan veya bir ders oturumunu tamamla.', points:10 },
    { id:'review-notes', title:'Notlarını gözden geçir', description:'Kaydettiğin notları veya bilgi kartlarını tekrar et.', points:8 },
    { id:'mistake-review', title:'Bir yanlışını analiz et', description:'Yanlış defterine doğru yaklaşımını ve tekrar tarihini kaydet.', points:10 },
    { id:'plan-next', title:'Bir sonraki çalışmanı planla', description:'Çalışma planına en az bir gerçekçi görev ekle.', points:5 }
  ];
  const BADGES = [
    { icon:'🌱', title:'İlk Adım', desc:'10 XP', xp:10 }, { icon:'📘', title:'Düzenli Öğrenci', desc:'50 XP', xp:50 },
    { icon:'🎯', title:'Odaklanma Ustası', desc:'100 XP', xp:100 }, { icon:'🧭', title:'Planlı İlerleme', desc:'200 XP', xp:200 },
    { icon:'🏅', title:'Bilgi Avcısı', desc:'500 XP', xp:500 }, { icon:'🏆', title:'İstikrarlı Gelişim', desc:'1000 XP', xp:1000 }
  ];
  function dayKey(d) { d=d||new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function key() {
    let user='guest';
    try { const u=window.Parse&&Parse.User&&Parse.User.current&&Parse.User.current(); if(u) user=String(u.get('email')||u.get('username')||u.id||'account').toLowerCase(); } catch (_) {}
    return PREFIX+':'+user;
  }
  function read() { try { const v=JSON.parse(localStorage.getItem(key())||'{}'); return v&&typeof v==='object'&&!Array.isArray(v)?v:{}; } catch (_) { return {}; } }
  function write(s) { try { localStorage.setItem(key(),JSON.stringify(s)); return true; } catch (_) { return false; } }
  function escapeText(v) { const n=document.createElement('span'); n.textContent=String(v); return n.innerHTML; }
  function render() {
    const s=read(), today=dayKey();
    if(!s.daily||typeof s.daily!=='object') s.daily={};
    const done=Array.isArray(s.daily[today])?s.daily[today]:[];
    const xp=Math.max(0,Number(s.xp)||0), level=Math.max(1,Math.floor(Math.sqrt(xp/25))+1);
    const el=id=>document.getElementById(id);
    if(el('xp-total')) el('xp-total').textContent=String(xp);
    if(el('xp-level')) el('xp-level').textContent=String(level);
    if(el('xp-level-caption')) el('xp-level-caption').textContent=xp<25?'Başlangıç':'Seviye '+level+' · sonraki seviye için '+Math.max(0,level*level*25-xp)+' XP';
    if(el('xp-streak')) el('xp-streak').textContent=Math.max(0,Number(s.streak)||0)+' gün';
    if(el('xp-today-label')) el('xp-today-label').textContent=new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'});
    if(el('xp-daily-tasks')) el('xp-daily-tasks').innerHTML=TASKS.map(t=>{const checked=done.includes(t.id);return '<label class="xp-task'+(checked?' is-done':'')+'"><input type="checkbox" data-xp-task="'+t.id+'"'+(checked?' checked disabled':'')+'><span><strong>'+escapeText(t.title)+'</strong><small>'+escapeText(t.description)+'</small></span><span class="xp-points">+'+t.points+' XP</span></label>';}).join('');
    if(el('xp-badges')) el('xp-badges').innerHTML=BADGES.map(b=>'<article class="xp-badge'+(xp>=b.xp?' unlocked':'')+'"><div class="xp-badge-icon" aria-hidden="true">'+b.icon+'</div><strong>'+escapeText(b.title)+'</strong><small>'+escapeText(b.desc)+(xp>=b.xp?' · Açıldı':'')+'</small></article>').join('');
    const status=el('xp-status'); if(status&&!status.dataset.ready){status.textContent='Görevleri gerçekten tamamladıktan sonra işaretle. XP bu cihazda ve bu hesap için yerel olarak saklanır.';status.dataset.ready='1';}
    write(s);
  }
  function bind() {
    const box=document.getElementById('xp-daily-tasks'); if(!box||box.dataset.bound) return;
    box.addEventListener('change',function(e){
      const input=e.target; if(!(input instanceof HTMLInputElement)||!input.matches('[data-xp-task]')||!input.checked) return;
      const task=TASKS.find(t=>t.id===input.getAttribute('data-xp-task')); if(!task) return;
      const s=read(),today=dayKey(); if(!s.daily||typeof s.daily!=='object')s.daily={};
      const done=Array.isArray(s.daily[today])?s.daily[today]:[]; if(done.includes(task.id)){render();return;}
      done.push(task.id);s.daily[today]=done;
      const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
      s.streak=s.lastTaskDay===today?(Number(s.streak)||0):s.lastTaskDay===dayKey(yesterday)?(Number(s.streak)||0)+1:1;
      s.lastTaskDay=today;s.xp=Math.max(0,Number(s.xp)||0)+task.points;
      if(!write(s)){const status=document.getElementById('xp-status');if(status)status.textContent='Tarayıcı depolaması kullanılamıyor; görev kaydedilemedi.';return;}
      const status=document.getElementById('xp-status');if(status)status.textContent='Görev işaretlendi: +'+task.points+' XP. Puanların bu cihazda saklandı.';
      render();
    });
    box.dataset.bound='1';
  }
  function load(){render();bind();}
  window.loadAchievements=load;
  document.addEventListener('DOMContentLoaded',load);
})();