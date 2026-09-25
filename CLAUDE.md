# Feza Kötülere Karşı – çalışma notları

- Diablo tarzı 3D oyun (three.js r170, `vendor/three.js` klasik script). Kod modüllere bölünmüş, hepsi klasik `<script src>` (ES module yok,
  file:// ile de çalışmalı). Modüller arası sözleşme: `src/SPEC.md`. Sıra: `00_core` (yardımcılar, çizici, kamera, parlama) → `01_textures` (TEX)
  → `02_audio` (AUD) → `03_fx` (FX) → `04_feza` (FEZA, ITEMS) → `05_enemies` (EDEF, EMODEL) → `06_level` (ZONES, LEVEL) → `07_game` (GAME)
  → `08_skills` (SKILLS) → `09_ui` (UI, boot, ana döngü) + `src/ui.css`. Her dosya sadece kendi genel adlarını açar (IIFE); aynı üst düzey ad iki
  dosyada olursa oyun hiç açılmaz.
- Anlatıcı cümleleri `src/02_audio.js` içinde `AUD.LINES = /*SESLER*/{...}/*SESLER-SON*/` (geçerli JSON). Cümle eklenir/değişirse
  `python3 gen_voice.py` → `sesler.js` yeniden üretilir (`.ses_onbellek/` önbellek, git'e girmez).
- Test ederken oyunu her zaman `?sessiz` ile aç. Ekran görüntüsü: `tools/shot.sh "index.html?sessiz" cikti.png [gen] [yuk] [ms]`
  (headless Chrome; konsol hatalarını da yazar). Node yok: sözdizimi için
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -e "checkSyntax('src/07_game.js')"`.
- Hata ayıklama: `window.__T` (god, tp, xp, zone, kill, give, boss, win…), `?tohum=N` (sabit harita), `?kam=uzaklık,eğim` (kamera),
  `?basit` (parlama efekti kapalı), `?hd` (tam çözünürlük), `?ikon` (simge pozu).
- GitHub'a SADECE kullanıcı "yükle / GitHub'a gönder" dediğinde gönder (depo: github.com/goktugkarpat/feza-kotulere-karsi, `main`'e doğrudan).
  Kullanıcı `yayinla.command` ile de gönderebilir (ilk seferde depoyu oluşturup GitHub Pages'ı açar).
- iPad uygulaması: `manifest.webmanifest`, `sw.js` (dosya eklenirse `CORE` listesine ekle; önemli değişiklikte `CACHE` sürümünü artır), `icons/`.
  Simge `index.html?sessiz&ikon` sayfasının 1024x1024 ekran görüntüsünden üretilir.
