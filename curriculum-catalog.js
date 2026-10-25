(function () {
  'use strict';

  const SOURCES = [
    {
      id: 'meb-programs', country: 'Türkiye', category: 'general', level: 'Tüm kademeler',
      title: 'MEB Talim ve Terbiye Kurulu — Öğretim Programları',
      url: 'https://mufredat.meb.gov.tr/Programlar.aspx',
      status: 'Resmî kaynak',
      description: 'Ders programlarının resmî listesi. Platforma aktarılmış ders, ünite ve konu verileri bu kaynaktan ayrı ayrı doğrulanmalıdır.'
    },
    {
      id: 'tymm-programs', country: 'Türkiye', category: 'general', level: 'Temel eğitim ve ortaöğretim',
      title: 'Türkiye Yüzyılı Maarif Modeli — Öğretim Programları',
      url: 'https://tymm.meb.gov.tr/ogretim-programlari',
      status: 'Resmî kaynak',
      description: 'Kademe, sınıf, ders ve ünite bazında yayımlanan programları incelemek için MEB portalı.'
    },
    {
      id: 'tymm-basic-plans', country: 'Türkiye', category: 'general', level: 'İlkokul ve ortaokul',
      title: '2026–2027 Temel Eğitim Çerçeve Planları',
      url: 'https://tymm.meb.gov.tr/taslak-cerceve-planlari/temel-egitim',
      status: 'Resmî kaynak · 2026–2027',
      description: 'MEB’in 2026–2027 temel eğitim uygulama açıklamaları ve ders bazlı taslak yıllık planları.'
    },
    {
      id: 'tymm-secondary-plans', country: 'Türkiye', category: 'general', level: 'Lise',
      title: '2026–2027 Ortaöğretim Çerçeve Planları',
      url: 'https://tymm.meb.gov.tr/taslak-cerceve-planlari/ortaogretim',
      status: 'Resmî kaynak · 2026–2027',
      description: 'Ortaöğretim kademesinde modelin hangi sınıflarda uygulandığını ve ders bazlı planları kontrol et.'
    },
    {
      id: 'vocational-programs', country: 'Türkiye', category: 'vocational', level: 'Meslek ortaokulu ve meslek lisesi',
      title: 'MTEGM — Mesleki ve Teknik Öğretim Programları',
      url: 'https://meslek.meb.gov.tr/',
      status: 'Resmî kaynak',
      description: 'Çerçeve öğretim programları, ders bilgi formları ve ders materyalleri. Okul türü, alan/dal, sınıf ve öğretim yılı birlikte doğrulanmalıdır.'
    },
    {
      id: 'vocational-fields', country: 'Türkiye', category: 'vocational', level: 'Alan ve dal',
      title: 'Mesleğim Hayatım — Güncel Alan/Dal Listeleri',
      url: 'https://meslegimhayatim.meb.gov.tr/meslegim-gelecegim-ve-kariyerim/alandal-listesi',
      status: 'Resmî kaynak',
      description: 'Mesleki ve Teknik Anadolu Liseleri ile Mesleki Eğitim Merkezleri için güncel alan/dal listelerine erişim.'
    },
    {
      id: 'imamhatip-programs', country: 'Türkiye', category: 'imamhatip', level: 'İmam hatip ortaokulu ve Anadolu imam hatip lisesi',
      title: 'Din Öğretimi Genel Müdürlüğü — Öğretim Programları Arşivi',
      url: 'https://dogm.meb.gov.tr/www/ogretim-programlari-arsivi/icerik/2064',
      status: 'Resmî kaynak',
      description: 'Kur’an-ı Kerim, Arapça, Hadis, Siyer, Fıkıh ve diğer meslek derslerinin programları. Her dersin güncel program yılı ve uygulama durumu ayrıca kontrol edilmelidir.'
    },
    {
      id: 'imamhatip-timetables', country: 'Türkiye', category: 'imamhatip', level: 'Haftalık ders çizelgeleri',
      title: 'Din Öğretimi Genel Müdürlüğü — Haftalık Ders Çizelgeleri',
      url: 'https://dogm.meb.gov.tr/www/haftalik-ders-cizelgeleri/icerik/11%20class%3D',
      status: 'Resmî kaynak',
      description: 'İmam hatip ortaokulları ve Anadolu imam hatip liseleri için okul türü ve uygulama yılına göre ders çizelgeleri.'
    },
    {
      id: 'uk-national-curriculum', country: 'Birleşik Krallık', category: 'international', level: 'İngiltere',
      title: 'National Curriculum — England',
      url: 'https://www.gov.uk/national-curriculum',
      status: 'Ulusal resmî kaynak · bölgesel kapsam',
      description: 'Bu kaynak İngiltere içindir. İskoçya, Galler ve Kuzey İrlanda farklı eğitim düzenlemelerine ve ayrı kaynaklara sahiptir.'
    },
    {
      id: 'germany-kmk', country: 'Almanya', category: 'international', level: 'Eyaletlere göre değişir',
      title: 'Kultusministerkonferenz (KMK)',
      url: 'https://www.kmk.org/',
      status: 'Resmî kurum · eyalet kapsamı',
      description: 'Almanya’da okul programları eyaletlere göre değişebilir; bu portalı tek ve eksiksiz bir ulusal konu listesi olarak değerlendirme.'
    },
    {
      id: 'us-education', country: 'Amerika Birleşik Devletleri', category: 'international', level: 'Eyalet ve yerel düzey',
      title: 'U.S. Department of Education',
      url: 'https://www.ed.gov/',
      status: 'Resmî kurum · ulusal müfredat değildir',
      description: 'ABD’de ders standartları ve müfredatlar eyalet/yerel düzeyde değişir. Bu bağlantı bütün ülke için tek bir müfredat bulunduğu anlamına gelmez.'
    },
    {
      id: 'azerbaijan-ministry', country: 'Azerbaycan', category: 'international', level: 'Ülke ve sınıf bazında doğrulanmalı',
      title: 'Azerbaijan Ministry of Science and Education',
      url: 'https://edu.gov.az/en',
      status: 'Resmî kaynak portalı',
      description: 'Resmî eğitim portalı. Güncel ders, sınıf, ünite ve program yılı verilerinin platforma aktarımı ayrıca doğrulanmalıdır.'
    },
    {
      id: 'japan-mext', country: 'Japonya', category: 'international', level: 'Ülke ve sınıf bazında doğrulanmalı',
      title: 'Japan — Ministry of Education (MEXT)',
      url: 'https://www.mext.go.jp/en/',
      status: 'Resmî kaynak portalı',
      description: 'Japonya Eğitim, Kültür, Spor, Bilim ve Teknoloji Bakanlığının resmî portalı; ders bazlı aktarım ayrıca doğrulanmalıdır.'
    },
    {
      id: 'unesco-ibe', country: 'Uluslararası', category: 'international', level: 'Karşılaştırmalı başvuru',
      title: 'UNESCO-IBE — Curriculum Resources',
      url: 'https://www.ibe.unesco.org/en',
      status: 'Uluslararası referans · ulusal müfredat değildir',
      description: 'Uluslararası karşılaştırma ve eğitim kaynakları için başvuru noktasıdır; tek başına bir ülkenin güncel resmî programını doğrulamaz.'
    }
  ];

  const CATEGORY_LABELS = {
    general: 'Genel öğretim programları',
    vocational: 'Meslekî ve teknik eğitim',
    imamhatip: 'İmam hatip dersleri',
    international: 'Uluslararası kaynaklar'
  };
  let serverCoverageRequested = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function renderCards() {
    const host = document.getElementById('curriculum-catalog-list');
    const queryInput = document.getElementById('curriculum-search');
    const categoryInput = document.getElementById('curriculum-category');
    if (!host) return;

    const query = String(queryInput && queryInput.value || '').trim().toLocaleLowerCase('tr');
    const category = String(categoryInput && categoryInput.value || 'all');
    const filtered = SOURCES.filter(function (source) {
      const matchesCategory = category === 'all' || source.category === category;
      const searchable = [source.country, source.level, source.title, source.description, source.status].join(' ').toLocaleLowerCase('tr');
      return matchesCategory && (!query || searchable.includes(query));
    });

    host.innerHTML = filtered.length ? filtered.map(function (source) {
      return '<article class="bot-card curriculum-source-card">' +
        '<div class="bot-header"><div class="bot-name">' + escapeHtml(source.title) + '</div><span class="bot-status">' + escapeHtml(source.status) + '</span></div>' +
        '<div class="curriculum-card-meta">' + escapeHtml(source.country) + ' · ' + escapeHtml(source.level) + ' · ' + escapeHtml(CATEGORY_LABELS[source.category] || source.category) + '</div>' +
        '<p class="bot-desc">' + escapeHtml(source.description) + '</p>' +
        '<p><a href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener noreferrer">Resmî/başvuru kaynağını aç ↗</a></p>' +
        '</article>';
    }).join('') : '<div class="detail-box"><p>Bu aramayla eşleşen kaynak bulunamadı. Arama metnini veya kategori filtresini değiştir.</p></div>';

    const count = document.getElementById('curriculum-result-count');
    if (count) count.textContent = filtered.length + ' kaynak gösteriliyor · ' + SOURCES.length + ' kaynak kayıtlı';
  }

  async function loadServerCoverage() {
    const host = document.getElementById('curriculum-db-status');
    if (!host || serverCoverageRequested) return;
    serverCoverageRequested = true;
    if (!window.Parse || !Parse.Cloud || typeof Parse.Cloud.run !== 'function') {
      host.textContent = 'Sunucu kapsam sayımı şu anda kullanılamıyor. Kaynak bağlantıları yine açılabilir.';
      return;
    }
    try {
      const result = await Parse.Cloud.run('getCurriculumCoverage');
      if (!result || result.success !== true) throw new Error('Kapsam yanıtı doğrulanamadı.');
      const db = result.database || {};
      if (db.countAvailable === true) {
        host.textContent = 'Sunucu veritabanı: ' + Number(db.totalRecords || 0) +
          ' müfredat kaydı; ' + Number(db.recordsMarkedOfficial || 0) +
          ' kayıt “resmî” olarak işaretlenmiş. Bu işaret, kayıtların güncelliğinin otomatik olarak kanıtlandığı anlamına gelmez.';
      } else {
        host.textContent = 'Kaynak kataloğu hazır; sunucu veritabanı kayıt sayımı alınamadı.';
      }
    } catch (_) {
      host.textContent = 'Sunucu kapsam sayımı alınamadı. Bu durum kaynak bağlantılarını etkilemez; Back4App Cloud Code dağıtımını kontrol et.';
    }
  }

  window.filterCurriculumCenter = renderCards;
  window.renderCurriculumCenter = function () {
    renderCards();
    loadServerCoverage();
  };

  window.addEventListener('DOMContentLoaded', function () {
    renderCards();
  });
})();