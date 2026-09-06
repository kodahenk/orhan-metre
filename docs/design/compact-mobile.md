# Kompakt mobil tasarım

`compact-mobile.png` ve `compact-mobile.svg`, örnek içerikle hazırlanmış tasarım çizimleridir; gerçek uygulama ekran görüntüsü değildir.

- Üst bar 56 px; kontrol ve ikon eylemleri en az 44 px dokunma alanı sunar.
- Kontroller 4 px, yüzeyler 6 px köşe kullanır. Proje ve görevler ayrı büyük kartlar yerine ince ayırıcılı listelerde gösterilir.
- Tanıtım başlıkları kaldırıldı. Odak ekranında seçim → süre → başlat; proje ekranında görevler → sabit ekleme alanı; görevde başlık → not → kontrol listesi akışı var.
- İkincil proje ayarları menüde; sık yapılan ekleme ve çalışma eylemleri doğrudan görünür.
- Arama, filtreler, sayfalama ve FlashList korunur. Dar ekranlarda metin alanları daralır veya satır değiştirir.

## Görev modeli

Görevler birbirinden bağımsızdır. Her görev `checklist` içinde düz bir madde listesi taşır. Kontrol maddeleri görev ekranı açmaz, kendi altında yeni madde taşımaz ve zamanlayıcıda ayrı görev olarak seçilmez. İşaretleme, düzenleme, sıralama ve silme aynı ekran üzerinden yapılır. Tüm maddeleri işaretlemek ana görevi otomatik olarak tamamlamaz.

Eski `tasks-v1` kayıtları yeni `tasks-v2-checklists` anahtarına dönüştürülür; eski anahtar yedek olarak bırakılır. Derin alt görevler ana görevin kontrol maddelerine dönüşür. Başlık, tamamlanma, not ve tarih korunur. `legacyTaskIds` eski oturum bağlantılarını ve eski görev bağlantılarının ana göreve erişimini korur. Yeni açılışlar yeni anahtarı kullanır, böylece silinen maddeler eski kayıtlardan yeniden oluşmaz.

## Doğrulama sınırı

Model dönüşümü ve büyük koleksiyon yardımcıları otomatik testlerle kontrol edildi. Android, iOS ve web paketleme kontrolü ayrıca çalıştırıldı. Gerçek cihazdaki klavye, dokunma ve görsel yerleşim kontrolleri bu oturumda tamamlanamadı.
