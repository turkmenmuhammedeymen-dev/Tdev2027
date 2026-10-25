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
,
    {"id":"world-curriculum-directory","country":"Uluslararası","category":"international","level":"Ülkeler arası başvuru dizini","title":"UNESCO-IBE — World Data on Education ve ülke profilleri","url":"https://www.ibe.unesco.org/en/node/63","status":"Uluslararası referans · ulusal müfredatın yerine geçmez","description":"Ülkelerin eğitim sistemleri ve resmî kaynaklarına yönlendiren karşılaştırmalı dizin; her programın platforma aktarıldığını göstermez."},
    {"id":"world-curriculum-originals","country":"Uluslararası","category":"international","level":"Dünya eğitim programları","title":"NCIC — Dünya eğitim programları kaynak koleksiyonu","url":"https://www.ncic.re.kr/","status":"Uluslararası kaynak dizini","description":"Birçok ülkenin seçilmiş eğitim programı belgelerine erişim; her belgenin güncel geçerliliği ayrıca kontrol edilmelidir."},
    {"id":"australia-curriculum","country":"Avustralya","category":"international","level":"Foundation–Year 10","title":"Australian Curriculum — Australian Government","url":"https://www.education.gov.au/australian-curriculum","status":"Resmî kaynak · uygulama takvimi bölgeye göre değişebilir","description":"Öğrenme alanları ve başarı standartları; sürüm ve uygulama takvimi ayrıca doğrulanmalıdır."},
    {"id":"new-zealand-curriculum","country":"Yeni Zelanda","category":"international","level":"Okul kademeleri","title":"The New Zealand Curriculum — Tāhūrangi","url":"https://newzealandcurriculum.tahurangi.education.govt.nz/","status":"Resmî eğitim kaynağı","description":"Öğrenme alanları ve evre bilgileri; tüm kayıtların platforma aktarıldığı anlamına gelmez."},
    {"id":"pakistan-ncc","country":"Pakistan","category":"international","level":"Ulusal çerçeve ve sınıf programları","title":"Pakistan — National Curriculum Council","url":"https://www.ncc.gov.pk/","status":"Resmî kurum portalı","description":"Ulusal çerçeve ve yayımlanan/taslak programlar; taslak belgeler yürürlükteki programla karıştırılmamalıdır."},
    {"id":"saudi-curriculum","country":"Suudi Arabistan","category":"international","level":"Dijital müfredat hizmeti","title":"Saudi Arabia — Ministry of Education Curriculum Service","url":"https://my.gov.sa/en/services/18629","status":"Resmî kamu hizmeti","description":"Resmî dijital müfredat hizmeti; bazı içerikler oturum gerektirebilir."},
    {"id":"uae-curricula","country":"Birleşik Arap Emirlikleri","category":"international","level":"Kamu ve özel okul sistemleri","title":"UAE Government — Curricula and Language of Instruction","url":"https://u.ae/en/information-and-services/education/school-education-k-12/curricula-and-language-of-instruction-","status":"Resmî hükümet bilgilendirmesi","description":"Kamu ve özel okullardaki farklı programlar; özel okul müfredatları tek ulusal program gibi ele alınmamalıdır."},
    {"id":"korea-curriculum","country":"Güney Kore","category":"international","level":"Ulusal program ve kaynak arşivi","title":"National Curriculum Information Center (NCIC)","url":"https://www.ncic.re.kr/","status":"Resmî eğitim programı bilgi merkezi","description":"Kore program bilgileri ve seçilmiş dünya programları; her belge için sürüm kontrolü gerekir."},
    {"id":"india-ncert","country":"Hindistan","category":"international","level":"Ulusal çerçeve ve ders programları","title":"NCERT — National Curriculum Frameworks and Syllabi","url":"https://ncert.nic.in/","status":"Resmî kurum portalı · eyalet/kurul farkları olabilir","description":"Ulusal çerçeveler ve ders programları; tüm eyalet ve kurulların aynı olduğu varsayılmamalıdır."},
    {"id":"france-eduscol","country":"Fransa","category":"international","level":"Okul kademeleri ve ders programları","title":"Éduscol — Ministère de l’Éducation nationale","url":"https://eduscol.education.fr/","status":"Resmî eğitim portalı","description":"Okul programları ve ders kaynakları; güncel program sürümü ve kademe ayrıca kontrol edilmelidir."},
    {"id":"finland-curriculum","country":"Finlandiya","category":"international","level":"Temel ve ortaöğretim","title":"Finnish National Agency for Education — Curricula","url":"https://www.oph.fi/en/education-and-qualifications","status":"Resmî eğitim kurumu","description":"Ulusal çekirdek müfredatlar; yerel sağlayıcılar ulusal çerçeve içinde programlarını ayrıntılandırabilir."},
    {"id":"singapore-syllabuses","country":"Singapur","category":"international","level":"Ders bazlı programlar","title":"Singapore Ministry of Education — Syllabuses","url":"https://www.moe.gov.sg/education/syllabuses","status":"Resmî bakanlık kaynağı","description":"Ders programları ve öğretim belgeleri; sınıf ve uygulama yılı ayrıca doğrulanmalıdır."},
    {"id":"china-ministry","country":"Çin","category":"international","level":"Ulusal eğitim politikaları","title":"Ministry of Education of the People’s Republic of China","url":"https://www.moe.gov.cn/","status":"Resmî bakanlık portalı","description":"Eğitim politikaları ve resmî duyurular; ders bazlı programların aktarımı ayrıca yapılmalıdır."},
    {"id":"canada-cmec","country":"Kanada","category":"international","level":"Eyalet ve bölge sistemleri","title":"Council of Ministers of Education, Canada (CMEC)","url":"https://www.cmec.ca/","status":"Resmî eğitim koordinasyon kurumu · tek ulusal müfredat değildir","description":"Programlar eyalet/bölge düzeyinde belirlenir; her eyaletin programı ayrı doğrulanmalıdır."},
    {"id":"netherlands-slo","country":"Hollanda","category":"international","level":"Ulusal hedefler ve program geliştirme","title":"SLO — Netherlands Institute for Curriculum Development","url":"https://www.slo.nl/","status":"Müfredat geliştirme kurumu","description":"Öğrenme hedefleri ve müfredat kaynakları; uygulama ve sürüm belge bazında kontrol edilmelidir."},
    {"id":"sweden-skolverket","country":"İsveç","category":"international","level":"Okul ve ders programları","title":"Skolverket — Swedish National Agency for Education","url":"https://www.skolverket.se/","status":"Resmî eğitim kurumu","description":"Ders programları ve resmî belgeler; yürürlükteki sürüm ayrıca kontrol edilmelidir."},
    {"id":"norway-udir","country":"Norveç","category":"international","level":"Ders ve yeterlilik hedefleri","title":"Udir — National Curriculum (LK20)","url":"https://www.udir.no/lk20/","status":"Resmî müfredat portalı","description":"Ders programları, yeterlilik hedefleri ve geçerlilik tarihleri; eski sürümler kontrol edilmelidir."},
    {"id":"ireland-curriculum","country":"İrlanda","category":"international","level":"İlkokul ve ortaöğretim","title":"Curriculum Online — NCCA","url":"https://www.curriculumonline.ie/","status":"Resmî eğitim programı portalı","description":"Ders ve kademe belgeleri; güncel sürüm ve uygulama tarihleri doğrulanmalıdır."},
    {"id":"brazil-bncc","country":"Brezilya","category":"international","level":"Temel eğitim","title":"Base Nacional Comum Curricular (BNCC)","url":"https://basenacionalcomum.mec.gov.br/","status":"Resmî ulusal çerçeve","description":"Ortak öğrenme beklentileri; eyalet ve okul sistemleri kendi programlarını ayrıntılandırır."},
    {"id":"chile-curriculum","country":"Şili","category":"international","level":"Kurs ve ders bazlı belgeler","title":"Currículum Nacional — Ministerio de Educación","url":"https://www.curriculumnacional.cl/","status":"Resmî müfredat portalı","description":"Kurs ve ders bazında öğrenme hedefleri, programlar ve teknik-profesyonel eğitim kaynakları."},
    {"id":"south-africa-caps","country":"Güney Afrika","category":"international","level":"CAPS ve ulusal eğitim","title":"Department of Basic Education — South Africa","url":"https://www.education.gov.za/","status":"Resmî bakanlık portalı","description":"CAPS programları ve ders belgeleri; sınıf/ders doğrulaması gerekir."},
    {"id":"indonesia-curriculum","country":"Endonezya","category":"international","level":"Ulusal müfredat","title":"Kurikulum — Ministry of Education","url":"https://kurikulum.kemdikbud.go.id/","status":"Resmî bakanlık kaynağı","description":"Müfredat portalı; program sürümü ve okul kademesi kontrol edilmelidir."},
    {"id":"malaysia-curriculum","country":"Malezya","category":"international","level":"Okul müfredatı","title":"Ministry of Education Malaysia","url":"https://www.moe.gov.my/","status":"Resmî bakanlık portalı","description":"Ulusal eğitim sistemi ve ders programı kaynakları; güncellik kontrolü gerekir."},
    {"id":"thailand-curriculum","country":"Tayland","category":"international","level":"Temel eğitim","title":"Office of the Basic Education Commission","url":"https://www.obec.go.th/","status":"Resmî eğitim kurumu","description":"Temel eğitim programları; kaynak dili ve sürümü doğrulanmalıdır."},
    {"id":"vietnam-curriculum","country":"Vietnam","category":"international","level":"Genel eğitim","title":"Ministry of Education and Training — Vietnam","url":"https://moet.gov.vn/","status":"Resmî bakanlık portalı","description":"Genel eğitim programları ve mevzuat; sınıf/ders verisi ayrıca aktarılmalıdır."},
    {"id":"bangladesh-nctb","country":"Bangladeş","category":"international","level":"Ders kitapları ve program","title":"National Curriculum and Textbook Board","url":"https://nctb.gov.bd/","status":"Resmî eğitim kurumu","description":"Ulusal müfredat ve materyaller; öğretim yılı ve sınıf kontrol edilmelidir."},
    {"id":"philippines-deped","country":"Filipinler","category":"international","level":"K–12","title":"Department of Education — Philippines","url":"https://www.deped.gov.ph/","status":"Resmî bakanlık portalı","description":"K–12 programı ve uygulama rehberleri; farklı program sürümleri karıştırılmamalıdır."},
    {"id":"mexico-curriculum","country":"Meksika","category":"international","level":"Temel eğitim","title":"Secretaría de Educación Pública","url":"https://www.gob.mx/sep","status":"Resmî hükümet portalı","description":"Eğitim kaynakları; ilgili programın belge sayfası ve geçerlilik yılı doğrulanmalıdır."},
    {"id":"spain-educagob","country":"İspanya","category":"international","level":"Eğitim kademeleri","title":"Educagob — Ministerio de Educación","url":"https://educagob.educacionfpydeportes.gob.es/","status":"Resmî eğitim portalı · özerk bölgeler önemlidir","description":"Ulusal çerçeve ve eğitim aşamaları; özerk bölgelerin uygulamaları ayrıca incelenmelidir."},
    {"id":"italy-education","country":"İtalya","category":"international","level":"Ulusal eğitim sistemi","title":"Ministero dell’Istruzione e del Merito","url":"https://www.istruzione.it/","status":"Resmî bakanlık portalı","description":"Eğitim ve öğretim belgelerine yönlendirme; ders programlarının güncelliği ayrıca kontrol edilmelidir."},
    {"id":"portugal-dge","country":"Portekiz","category":"international","level":"Aprendizagens Essenciais","title":"Direção-Geral da Educação","url":"https://www.dge.mec.pt/","status":"Resmî eğitim kurumu","description":"Ders bazlı temel öğrenme beklentileri ve program belgeleri."},
    {"id":"poland-education","country":"Polonya","category":"international","level":"Ulusal çerçeve","title":"Poland — Ministry of National Education","url":"https://www.gov.pl/web/edukacja","status":"Resmî bakanlık portalı","description":"Ulusal eğitim ve müfredat mevzuatı; sınıf/ders verileri belge bazında kontrol edilmelidir."},
    {"id":"estonia-education","country":"Estonya","category":"international","level":"Ulusal eğitim programı","title":"Estonia — Ministry of Education and Research","url":"https://www.hm.ee/en","status":"Resmî bakanlık portalı","description":"Eğitim sistemi ve program kaynakları; belge bazında sürüm kontrolü gerekir."},
    {"id":"denmark-education","country":"Danimarka","category":"international","level":"Folkeskole","title":"Ministry of Children and Education — Denmark","url":"https://www.uvm.dk/","status":"Resmî bakanlık portalı","description":"Ders hedefleri ve okul sistemi; yerel uygulama ayrıntıları ayrıca kontrol edilmelidir."},
    {"id":"switzerland-education","country":"İsviçre","category":"international","level":"Kantonlara göre değişir","title":"EDK — Swiss Conference of Cantonal Ministers of Education","url":"https://www.edk.ch/","status":"Resmî koordinasyon kurumu · tek ulusal müfredat değildir","description":"Kanton ve dil bölgesi programları ayrı doğrulanmalıdır."},
    {"id":"russia-education","country":"Rusya","category":"international","level":"Ulusal eğitim portalı","title":"Ministry of Education of the Russian Federation","url":"https://edu.gov.ru/","status":"Resmî bakanlık portalı","description":"Eğitim mevzuatı ve program kaynakları; güncel belge/sınıf kapsamı kontrol edilmelidir."},
    {"id":"ukraine-education","country":"Ukrayna","category":"international","level":"Ulusal eğitim programı","title":"Ministry of Education and Science of Ukraine","url":"https://mon.gov.ua/","status":"Resmî bakanlık portalı","description":"Eğitim standartları, program belgeleri ve duyurular."},
    {"id":"kazakhstan-education","country":"Kazakistan","category":"international","level":"Ulusal eğitim portalı","title":"Ministry of Education — Kazakhstan","url":"https://www.gov.kz/memleket/entities/edu?lang=en","status":"Resmî hükümet portalı","description":"Bakanlık kaynakları; sınıf ve öğretim yılına göre veri ayrıca doğrulanmalıdır."},
    {"id":"argentina-education","country":"Arjantin","category":"international","level":"Ulusal çerçeve ve eyalet uygulaması","title":"Argentina — Education Portal","url":"https://www.argentina.gob.ar/educacion","status":"Resmî hükümet portalı · eyaletler ayrıca incelenmeli","description":"Ulusal çerçeve ve duyurular; yerel uygulamalar ayrı doğrulanmalıdır."},
    {"id":"colombia-education","country":"Kolombiya","category":"international","level":"Ulusal eğitim standartları","title":"Ministerio de Educación Nacional — Colombia","url":"https://www.mineducacion.gov.co/","status":"Resmî bakanlık portalı","description":"Ulusal standartlar ve ders kaynakları; program sürümü ve kapsamı doğrulanmalıdır."},
    {"id":"egypt-education","country":"Mısır","category":"international","level":"Ulusal eğitim portalı","title":"Ministry of Education — Egypt","url":"https://moe.gov.eg/","status":"Resmî bakanlık portalı","description":"Eğitim duyuruları ve program kaynakları; ders/sınıf verileri ayrıca aktarılmalıdır."},
    {"id":"kenya-education","country":"Kenya","category":"international","level":"Competency-Based Curriculum","title":"Ministry of Education — Kenya","url":"https://www.education.go.ke/","status":"Resmî bakanlık portalı","description":"Eğitim ve müfredat uygulama kaynakları; ayrıntılı ders programları ayrıca doğrulanmalıdır."},
    {"id":"ghana-education","country":"Gana","category":"international","level":"Standards-based curriculum","title":"Ministry of Education — Ghana","url":"https://moe.gov.gh/","status":"Resmî bakanlık portalı","description":"Eğitim politikaları ve kaynaklar; sınıf/ders programları ayrıca içe aktarılmalıdır."},
    {"id":"us-standards","country":"Amerika Birleşik Devletleri","category":"international","level":"Eyalet standartları","title":"Common Core State Standards","url":"https://www.corestandards.org/","status":"Standartlar kaynağı · federal ulusal müfredat değildir","description":"Bazı eyaletlerin benimsediği İngilizce ve matematik standartları; tüm ABD için tek müfredat değildir."},
    {"id":"uk-scotland-curriculum","country":"Birleşik Krallık","category":"international","level":"İskoçya","title":"Curriculum for Excellence — Scotland","url":"https://education.gov.scot/curriculum-for-excellence/","status":"Resmî bölgesel kaynak","description":"İskoçya’nın programı İngiltere, Galler ve Kuzey İrlanda’dan ayrıdır."},
    {"id":"uk-wales-curriculum","country":"Birleşik Krallık","category":"international","level":"Galler","title":"Curriculum for Wales","url":"https://hwb.gov.wales/curriculum-for-wales/","status":"Resmî bölgesel kaynak","description":"Galler’in ayrı müfredat çerçevesi; İngiltere programıyla aynı kabul edilmemelidir."},
    {"id":"uk-northern-ireland-curriculum","country":"Birleşik Krallık","category":"international","level":"Kuzey İrlanda","title":"Northern Ireland Curriculum","url":"https://www.education-ni.gov.uk/","status":"Resmî bölgesel kaynak portalı","description":"Kuzey İrlanda için eğitim programı kaynakları; program sayfası ve uygulama yılı ayrıca doğrulanmalıdır."},
  ];

  const CATEGORY_LABELS = {
    general: 'Genel öğretim programları',
    vocational: 'Meslekî ve teknik eğitim',
    imamhatip: 'İmam hatip dersleri',
    international: 'Uluslararası kaynaklar'
  };
  let serverCoverageRequested = false;
  let importedProgramsRequested = false;
  let importedPrograms = [];
  let importedProgramsStorageReady = false;

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
        host.textContent = 'Genel müfredat veritabanı: ' + Number(db.totalRecords || 0) +
          ' kayıt; ' + Number(db.recordsMarkedOfficial || 0) +
          ' kayıt “resmî” olarak işaretlenmiş. Bu işaret, kayıtların güncelliğinin otomatik olarak kanıtlandığı anlamına gelmez.';
        const imported = db.importedPrograms || {};
        if (imported.countAvailable === true) {
          host.textContent += ' Aktarılan ayrıntılı program kayıtları: ' + Number(imported.totalRecords || 0) +
            '; resmî olarak işaretli: ' + Number(imported.recordsMarkedOfficial || 0) + '.';
        } else {
          host.textContent += ' Ayrıntılı program kayıtları için CurriculumProgram veritabanı sınıfının kurulumu gerekebilir.';
        }
      } else {
        host.textContent = 'Kaynak kataloğu hazır; sunucu veritabanı kayıt sayımı alınamadı.';
      }
    } catch (_) {
      serverCoverageRequested = false;
      host.textContent = 'Sunucu kapsam sayımı alınamadı. Bu durum kaynak bağlantılarını etkilemez; Back4App Cloud Code dağıtımını kontrol et.';
    }
  }

  function populateProgramFilters() {
    const countrySelect = document.getElementById('curriculum-program-country');
    if (!countrySelect) return;
    const previous = countrySelect.value || 'all';
    const codeMap = {'Türkiye':'TR','Amerika Birleşik Devletleri':'US','Birleşik Krallık':'UK','Almanya':'DE','Azerbaycan':'AZ','Japonya':'JP','Avustralya':'AU','Yeni Zelanda':'NZ','Pakistan':'PK','Suudi Arabistan':'SA','Birleşik Arap Emirlikleri':'AE','Güney Kore':'KR','Hindistan':'IN','Fransa':'FR','Finlandiya':'FI','Singapur':'SG','Çin':'CN','Kanada':'CA','Hollanda':'NL','İsveç':'SE','Norveç':'NO','İrlanda':'IE','Brezilya':'BR','Şili':'CL','Güney Afrika':'ZA','Endonezya':'ID','Malezya':'MY','Tayland':'TH','Vietnam':'VN','Bangladeş':'BD','Filipinler':'PH','Meksika':'MX','İspanya':'ES','İtalya':'IT','Portekiz':'PT','Polonya':'PL','Estonya':'EE','Danimarka':'DK','İsviçre':'CH','Rusya':'RU','Ukrayna':'UA','Kazakistan':'KZ','Arjantin':'AR','Kolombiya':'CO','Mısır':'EG','Kenya':'KE','Gana':'GH','İsrail':'IL'};
    const countryMap = new Map();
    SOURCES.forEach(function (source) { const code = codeMap[source.country]; if (code && !countryMap.has(code)) countryMap.set(code, source.country); });
    importedPrograms.forEach(function (item) { if (item.countryCode && item.countryName && /^[A-Z]{2}$/.test(item.countryCode)) countryMap.set(item.countryCode, item.countryName); });
    const options = ['<option value="all">Tüm ülkeler</option>'].concat(Array.from(countryMap.entries()).sort(function(a,b){return a[1].localeCompare(b[1],'tr');}).map(function(entry){return '<option value="'+escapeHtml(entry[0])+'">'+escapeHtml(entry[1])+'</option>'; }));
    countrySelect.innerHTML = options.join('');
    countrySelect.value = countryMap.has(previous) ? previous : 'all';
  }

  window.loadImportedCurriculumFilter = function () { importedProgramsRequested = false; loadImportedPrograms(true); };

  function renderImportedPrograms() {
    const host = document.getElementById('curriculum-program-list');
    const count = document.getElementById('curriculum-program-count');
    if (!host) return;
    const query = String((document.getElementById('curriculum-search') || {}).value || '').trim().toLocaleLowerCase('tr');
    const category = String((document.getElementById('curriculum-category') || {}).value || 'all');
    const countryFilter = String((document.getElementById('curriculum-program-country') || {}).value || 'all');
    const gradeFilter = String((document.getElementById('curriculum-program-grade') || {}).value || 'all');
    const filtered = importedPrograms.filter(function (item) {
      const matchesCategory = category === 'all' || item.programType === category;
      const matchesCountry = countryFilter === 'all' || item.countryCode === countryFilter;
      const matchesGrade = gradeFilter === 'all' || Number(item.grade) === Number(gradeFilter);
      const searchable = [
        item.countryName, item.countryCode, item.gradeLabel, item.subject, item.title,
        item.programType, item.schoolType, item.field, item.branch, item.curriculumYear
      ].join(' ').toLocaleLowerCase('tr');
      return matchesCategory && matchesCountry && matchesGrade && (!query || searchable.includes(query));
    });
    if (count) count.textContent = importedProgramsStorageReady
      ? filtered.length + ' kayıt gösteriliyor · en fazla 100 kayıt listelenir'
      : 'Program kayıt deposu henüz hazır değil veya erişilemiyor.';
    if (!importedProgramsStorageReady) {
      host.innerHTML = '<div class="detail-box"><p>Back4App üzerinde CurriculumProgram sınıfı hazır değil. Önce güncel main.js dosyasını dağıtıp yetkili kurulum işlemini bir kez çalıştır.</p></div>';
      return;
    }
    if (!filtered.length) {
      host.innerHTML = '<div class="detail-box"><p>Bu filtrede aktarılmış program kaydı bulunamadı. Resmî kaynak bağlantıları yukarıda kullanılabilir; henüz içe aktarılmamış içerik varmış gibi gösterilmez.</p></div>';
      return;
    }
    host.innerHTML = filtered.map(function (item) {
      const topicContainer = item.topics && typeof item.topics === 'object' ? item.topics : {};
      const rawTopics = Array.isArray(topicContainer.topics) ? topicContainer.topics :
        (Array.isArray(topicContainer.units) ? topicContainer.units : []);
      const topicNames = rawTopics.slice(0, 5).map(function (topic) {
        return typeof topic === 'string' ? topic : (topic && (topic.title || topic.name || topic.unit) || '');
      }).filter(Boolean);
      const status = item.isOfficial === true ? 'RESMÎ KAYIT · TARİHLİ' : 'DOĞRULAMA GEREKLİ';
      const details = [item.countryName, item.gradeLabel ? (item.gradeLabel === 'K' ? 'Kindergarten (K)' : item.gradeLabel + '. sınıf') : '', item.schoolType, item.field, item.branch, item.subject, item.curriculumYear].filter(Boolean).join(' · ');
      return '<article class="bot-card curriculum-source-card">' +
        '<div class="bot-header"><div class="bot-name">' + escapeHtml(item.title || item.subject || 'Müfredat kaydı') + '</div><span class="bot-status">' + status + '</span></div>' +
        '<div class="curriculum-card-meta">' + escapeHtml(details) + '</div>' +
        (topicNames.length ? '<p class="bot-desc"><strong>İlk konu başlıkları:</strong> ' + escapeHtml(topicNames.join(' · ')) + '</p>' : '<p class="bot-desc">Konu başlıkları bu kayıtta ayrıca yapılandırılmamış.</p>') +
        '<p class="bot-desc">' + escapeHtml(item.sourceName || 'Kaynak adı yok') + '</p>' +
        (item.sourceUrl && /^https:\/\//i.test(item.sourceUrl) ? '<p><a href="' + escapeHtml(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Kaynak belgesini aç ↗</a></p>' : '') +
        '</article>';
    }).join('');
  }

  async function loadImportedPrograms(force) {
    if (importedProgramsRequested && !force) { renderImportedPrograms(); return; }
    const host = document.getElementById('curriculum-program-list');
    if (!host) return;
    importedProgramsRequested = true;
    if (!window.Parse || !Parse.Cloud || typeof Parse.Cloud.run !== 'function') {
      importedProgramsRequested = false;
      importedProgramsStorageReady = false;
      renderImportedPrograms();
      return;
    }
    host.innerHTML = '<div class="detail-box"><p>Aktarılan program kayıtları yükleniyor…</p></div>';
    try {
      populateProgramFilters();
      const countryCode = String((document.getElementById('curriculum-program-country') || {}).value || 'all');
      const gradeValue = String((document.getElementById('curriculum-program-grade') || {}).value || 'all');
      const programType = String((document.getElementById('curriculum-category') || {}).value || 'all');
      const params = {};
      if (/^[A-Z]{2}$/.test(countryCode)) params.countryCode = countryCode;
      if (gradeValue !== 'all' && /^\\d{1,2}$/.test(gradeValue)) params.grade = Number(gradeValue);
      if (['general','vocational','imamhatip','international'].includes(programType)) params.programType = programType;
      const result = await Parse.Cloud.run('getCurriculumPrograms', params);
      if (!result || result.success !== true) throw new Error('Program kayıtları yüklenemedi.');
      importedProgramsStorageReady = result.storageReady === true;
      importedPrograms = Array.isArray(result.items) ? result.items : [];
      populateProgramFilters();
      renderImportedPrograms();
    } catch (_) {
      importedProgramsRequested = false;
      importedProgramsStorageReady = false;
      host.innerHTML = '<div class="detail-box"><p>Program kayıtları şu anda alınamadı. Cloud Code dağıtımını ve oturumunu kontrol et.</p></div>';
    }
  }

  window.submitCurriculumProgramForm = async function (event) {
    if (event) event.preventDefault();
    const role = String(window.currentCurriculumRole || '').toLowerCase();
    const panel = document.getElementById('curriculum-admin-import');
    if (!panel || panel.style.display === 'none' || !['founder', 'admin'].includes(role)) {
      if (typeof window.showNotif === 'function') window.showNotif('Bu işlem için kurucu/yönetici yetkisi gerekir.');
      return;
    }
    if (!window.Parse || !Parse.Cloud || typeof Parse.Cloud.run !== 'function') {
      if (typeof window.showNotif === 'function') window.showNotif('Sunucu bağlantısı hazır değil.');
      return;
    }
    let topics;
    try {
      topics = JSON.parse(document.getElementById('cp-topics-json').value);
    } catch (_) {
      if (typeof window.showNotif === 'function') window.showNotif('Konu verisi geçerli JSON olmalı.');
      return;
    }
    const dateIso = function (id) {
      const value = document.getElementById(id).value;
      return value ? new Date(value + 'T12:00:00.000Z').toISOString() : '';
    };
    const record = {
      countryCode: document.getElementById('cp-country-code').value.trim().toUpperCase(),
      countryName: document.getElementById('cp-country-name').value.trim(),
      grade: Number(document.getElementById('cp-grade').value),
      gradeLabel: String(document.getElementById('cp-grade').value),
      programType: document.getElementById('cp-program-type').value,
      schoolType: document.getElementById('cp-school-type').value.trim(),
      field: document.getElementById('cp-field').value.trim(),
      branch: document.getElementById('cp-branch').value.trim(),
      subject: document.getElementById('cp-subject').value.trim(),
      title: document.getElementById('cp-title').value.trim(),
      curriculumYear: document.getElementById('cp-year').value.trim(),
      sourceName: document.getElementById('cp-source-name').value.trim(),
      sourceUrl: document.getElementById('cp-source-url').value.trim(),
      sourceCheckedAt: dateIso('cp-source-checked'),
      verifiedAt: dateIso('cp-verified-at'),
      isOfficial: document.getElementById('cp-is-official').checked,
      active: true,
      topics: topics
    };
    try {
      const result = await Parse.Cloud.run('saveCurriculumProgram', { record: record });
      if (!result || result.success !== true) throw new Error((result && result.error) || 'Kayıt sonucu doğrulanamadı.');
      if (typeof window.showNotif === 'function') window.showNotif(result.message || 'Müfredat kaydı kaydedildi.');
      const form = document.getElementById('curriculum-admin-import');
      const inputs = form ? form.querySelector('form') : null;
      if (inputs) inputs.reset();
      importedProgramsRequested = false;
      serverCoverageRequested = false;
      await loadImportedPrograms(true);
      await loadServerCoverage();
    } catch (error) {
      if (typeof window.showNotif === 'function') window.showNotif('Müfredat kaydı kaydedilemedi: ' + (error && error.message || 'Sunucu hatası'));
    }
  };

  window.filterCurriculumCenter = function () {
    renderCards();
    renderImportedPrograms();
  };
  window.renderCurriculumCenter = function (role) {
    window.currentCurriculumRole = String(role || '').toLowerCase();
    const adminPanel = document.getElementById('curriculum-admin-import');
    if (adminPanel) adminPanel.style.display = ['founder', 'admin'].includes(window.currentCurriculumRole) ? 'block' : 'none';
    const sourceChecked = document.getElementById('cp-source-checked');
    const verifiedAt = document.getElementById('cp-verified-at');
    const today = new Date().toISOString().slice(0, 10);
    if (sourceChecked && !sourceChecked.value) sourceChecked.value = today;
    if (verifiedAt && !verifiedAt.value) verifiedAt.value = today;
    renderCards();
    loadServerCoverage();
    loadImportedPrograms();
  };

  window.addEventListener('DOMContentLoaded', function () {
    renderCards();
  });
})();