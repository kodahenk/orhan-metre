# Büyük veri ve ekran uyumu doğrulaması

## Uygulanan yapı

- Proje ana listesi ve ortak seçim penceresi `@shopify/flash-list` 2.0.2 kullanır. Satırlar değişken yüksekliktedir; tüm veri aynı anda oluşturulmaz.
- Görev, alt görev ve seçili gün listeleri arama/durum filtresiyle 30 öğelik sayfalar gösterir. Rapor geçmişi 20, rapor proje/hedef ve önayar listeleri 10 öğelik sayfalar kullanır. Silme ve filtreleme sonrasında geçerli sayfa yeniden hesaplanır.
- Native formlar `react-native-keyboard-controller` 1.21.9 ile odaktaki alanı klavyenin üstüne taşır. Web normal ScrollView kullanır. Modal formlarda kaydırma, kapatma düğmesi ve güvenli alan payı vardır.
- Başlık ve meta alanları daralabilir; uzun liste başlıkları detay ekranına erişimi koruyarak iki satır gösterir. Buton ve özet grupları uygun yerlerde alt satıra geçer.
- Editörlerin bekleyen değişiklikleri kapanışta, kayıt kimliği değiştiğinde ve uygulama arka plana geçtiğinde tamamlanır.
- Tarih alanı yakın gün kısayollarına ek olarak YYYY-AA-GG girişi sunar; geçersiz takvim günlerini reddeder.

## Otomatik kontroller

`npm test`: 100.003 kaydın tamamına sayfalı erişim, silme/filtre sonrası sayfa sınırı, Türkçe arama, 10.000 öğelik indeksleme, tarih sınırları ve son taslağın yalnızca bir kez kaydı için 7 test.

`npx tsc --noEmit` ve `npx expo lint`: tip ve kod kontrolleri.

`npx expo export --platform all --output-dir /tmp/orhan-metre-ux-review`: Android/iOS/web paketleme kontrolü. Bu, cihaz üzerindeki etkileşim veya performans ölçümü değildir.

## Cihaz/tarayıcı üzerinde kalan doğrulama

Bu çalışma oturumunda bağlı tarayıcı veya cihazla görsel kontrol yapılamadı. Aşağıdaki matris gerçek cihazlarda denenmelidir:

| Senaryo | Beklenen davranış |
| --- | --- |
| 320 px telefon, yatay telefon, tablet | Yatay taşma olmaz; düğmeler erişilebilir kalır; tam ekran sayaç gerektiğinde kaydırılır. |
| Uzun ve boşluksuz proje/görev adları | Satır eylemleri görünür kalır; tam içerik detay veya seçim penceresinden okunabilir. |
| Büyük sistem yazı boyutu | Özetler ve düğmeler satır değiştirir; form alanları kapatma/kaydetme eylemlerini gizlemez. |
| Binlerce proje ve görev | Proje/seçim listesi görünür alanı çizer; görev filtreleri ve sayfalar tüm öğelere erişir. |
| Arama → son sayfa → son kaydı sil | Boş ve geçersiz bir sayfada kalınmaz. |
| Klavye açıkken form/pencere | Alan ve kaydetme düğmesi kaydırılarak erişilebilir. |
| Rapor → kayıt → projeyi değiştir | Sonraki seçim penceresi açık kalır ve seçim kayda uygulanır. |
| Not yaz → hemen geri/arka plan | Son düzenleme, boş nota dönüştürme dahil, kaydedilir. |
| Geçersiz saat, hedef veya tarih | Açıklayıcı hata gösterilir; kaydetme devre dışıdır. |

Native bağımlılıklar eklendiğinden mevcut development build yeniden derlenmelidir. Gerçek Android/iOS çalışma zamanı ve klavye davranışı ayrıca doğrulanmalıdır.
