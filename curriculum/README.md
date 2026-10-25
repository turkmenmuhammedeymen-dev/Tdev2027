# TdevKuantum müfredat merkezi

Bu klasör, uygulamanın müfredat kaynaklarını ve içe aktarma politikasını belgelendirir.

## Dosyalar ve işleyiş

- `../index.html`: giriş sonrası “Yeni Müfredat Merkezi”, kaynak arama/filtreleme ve kurucu/yönetici içe aktarma formu.
- `../curriculum-catalog.js`: resmî kaynak bağlantıları, arayüz filtreleri ve aktarılan kayıtların listesi.
- `../back4app/main.js`: `CurriculumProgram` şeması ve `getCurriculumPrograms`, `saveCurriculumProgram`, `getCurriculumCoverage` Cloud Functions.
- `../study.js`: kişisel çalışma planı, not, bilgi kartı, deneme ve yanlış defteri kayıtları; bunlar müfredat kaynak kataloğundan ayrı tutulur.

## Back4App kurulum adımları

1. Güncel `back4app/main.js` dosyasını Back4App Cloud Code'a dağıt.
2. Back4App Config'e en az 24 karakterlik rastgele `SCHEMA_SETUP_TOKEN` değeri ekle.
3. Kurucu/yönetici oturumuyla `setupDatabaseSchema({ token: SCHEMA_SETUP_TOKEN })` Cloud Function'ını bir kez çalıştır.
4. Sonuçta `CurriculumProgram` sınıfının oluşturulduğunu doğrula. Kurulumdan sonra `SCHEMA_SETUP_TOKEN` değerini döndürme/yenileme; mümkünse Config'ten kaldır.
5. Giriş sonrası menüden **Yeni Müfredat Merkezi** bölümünü aç. Kurucu/yönetici formundan bir kayıt ekle ve “Aktarılan program kayıtları” bölümünde göründüğünü kontrol et.

## Kayıt alanları

Her kayıt ülke kodu/adı, sınıf, program türü, okul türü, alan, dal, ders, başlık, öğretim yılı, kaynak adı/HTTPS URL'si, kaynak kontrol tarihi ve konu verisini taşıyabilir. Konu verisi JSON nesnesi olmalı; örneğin:

```json
{
  "topics": [
    {
      "title": "Konu başlığı",
      "explanation": "Kendi ifadelerinle yazılmış kısa açıklama"
    }
  ]
}
```

Sunucu yalnızca yetkili kurucu/yönetici hesabının kayıt eklemesine izin verir. `isOfficial` seçeneği tek başına yeterli değildir: sunucu, ülke için tanımlı güvenilir kaynak alan adını ve kaynak/doğrulama tarihlerini de kontrol eder. Yeni ülke veya resmî alan adı eklenmeden önce kaynak insan tarafından doğrulanmalı ve `trustedCurriculumSource` içindeki izin listesi bilinçli şekilde güncellenmelidir.

## Kapsam ve doğruluk politikası

Kaynak kartları resmî portallara yönlendirir; **bu, bütün derslerin/ünitelerin platforma aktarıldığı anlamına gelmez**. Şu anki katalog, Türkiye'nin genel programları, TYMM yıllık planları, meslekî-teknik programlar, imam hatip programları ve seçilmiş uluslararası kaynaklara bağlantılar içerir. Her ülkenin tüm sınıfları, her meslek alanı/dalı veya tüm imam hatip dersleri eksiksiz biçimde otomatik olarak içe aktarılmış değildir.

- Bir kayıt resmî kaynak ve güncel program yılı üzerinden kontrol edilmedikçe “doğrulanmış resmî program” olarak işaretlenmemelidir.
- ABD, Almanya ve Birleşik Krallık gibi yerlerde eğitim programlarının yetkisi eyalet/bölge/ülkeye göre değişebilir.
- Genel öğrenme rehberi, ulusal müfredatın yerine geçmez.
- Resmî program metinlerini uzun pasajlar halinde kopyalamak yerine kaynak bağlantısı, konu başlığı ve özgün kısa özet kullan.
- Kaynak sürümleri değiştiğinde eski kaydı otomatik olarak güncel sayma; öğretim yılı ve doğrulama tarihini yenile.

## Resmî başlangıç kaynakları

- MEB Talim ve Terbiye Kurulu: https://mufredat.meb.gov.tr/Programlar.aspx
- Türkiye Yüzyılı Maarif Modeli: https://tymm.meb.gov.tr/ogretim-programlari
- 2026–2027 temel eğitim planları: https://tymm.meb.gov.tr/taslak-cerceve-planlari/temel-egitim
- 2026–2027 ortaöğretim planları: https://tymm.meb.gov.tr/taslak-cerceve-planlari/ortaogretim
- Mesleki ve Teknik Eğitim Genel Müdürlüğü: https://meslek.meb.gov.tr/
- Din Öğretimi Genel Müdürlüğü: https://dogm.meb.gov.tr/
