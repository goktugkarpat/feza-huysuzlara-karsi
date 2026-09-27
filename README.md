# Feza Kötülere Karşı ⚔️✨

5 yaşındaki Feza için yapılmış, üç boyutlu, Türkçe seslendirmeli bir macera oyunu (Diablo tarzı, ama çocuklara göre).
Huysuz Ejderha köyün neşe kristalini almış ve ormandaki herkesi haylaz yapmış. Feza ışın kılıcıyla haylazlara dokununca
onlar sevinçten kocaman gülümseyip kalpler saçarak kayboluyorlar. Bütün yaratıklar sevimli ve güler yüzlü; kan yok, ölüm yok, korkutucu hiçbir şey yok.

## Nasıl açılır

- **Bilgisayarda:** `index.html` dosyasına çift tıklamanız yeterli. Kurulum ya da internet gerekmez.
- **iPad'de:** Oyun GitHub Pages'ta yayınlanınca iPad'de Safari ile https://goktugkarpat.github.io/feza-kotulere-karsi/ adresini açıp
  Paylaş › **Ana Ekrana Ekle** deyin. Oyun kendi simgesiyle, tam ekran bir uygulama gibi açılır.
  İlk açılıştan sonra **internet olmadan da** çalışır (`sw.js` oyunu cihaza kaydeder).
- Aynı Wi-Fi'daki iPad'de denemek için Mac'te `python3 serve.py` çalıştırıp yazdığı adresi iPad'de açabilirsiniz.

## Nasıl oynanır

- **Yürümek:** Parmağını ekranda gitmek istediğin yere bas. Feza parmağının altındaki yere koşar; parmağını kaydırdıkça peşinden gider.
- **Vurmak:** Bir huysuza dokun: Feza yanına gidip vurur. Yakınına gelen huysuza kendiliğinden de vurur.
  Sağ alttaki büyük **ışın kılıcı** düğmesi de en yakındakine vurur.
- **Yetenekler:** Feza seviye atladıkça kılıç düğmesinin etrafında yeni bir düğme çıkar (toplam 3):
  ⭐ Yıldız Atışı (uzaktakilere yıldız fırlatır), 🌪️ Kasırga (fırıl fırıl dönüp etrafındakilere dokunur),
  ☄️ Meteor Yağmuru (gökyüzünden yıldız taşları yağdırır). Düğmenin üstündeki koyu gölge çekilince yetenek yeniden hazırdır.
- **Can:** Sol alttaki kırmızı top Feza'nın canıdır. Azalınca yanındaki **kırmızı iksire** bas ya da yerdeki kalpleri topla.
  Can biterse Feza uyuyakalır ve son parlattığı **neşe taşının** yanında dinlenmiş olarak uyanır.
- **Hazineler:** Sandıklar, küpler ve fıçılar altın ve eşya saklar. Işık sütunlu eşyalar ışın kılıcı (mavi, yeşil, kırmızı, mor, gökkuşağı…), şapka ya da pelerindir;
  daha güçlüyse Feza hemen giyer. Eşya seyrek düşer ve çantada her eşyadan yalnızca bir tane olur: aynısının daha güçlüsü bulunursa eskisinin yerini alır.
  🎒 düğmesiyle çantayı açıp istediği şapkayı, pelerini ve ışın kılıcını seçebilir.
  Eşyanın altındaki **yıldızlar** yalnızca ne kadar güçlü olduğunu gösterir (1–5 ★): daha güçlü eşyanın yıldızı hiçbir zaman daha az olmaz.
  Eşyanın rengi ve parıltısı (beyaz, mavi, sarı, turuncu) ise ne kadar özel ve nadir olduğunu gösterir.
- **Harita:** Sağ üstteki yuvarlak harita gidilecek yönü altın okla gösterir. Mor **sihirli kapıdan** geçince yeni bölgeye gidilir.
- ⏸ düğmesini kısa bir an basılı tutunca oyun durur (efektler, müzik, **Kaydet**, **Baştan Başla**). Oyun kendiliğinden kaydedilmez.
  Kalınan yerden sürmek isterseniz ⏸ › **Kaydet**'e basın; oyunu yeniden açınca **Devam Et** ve **Baştan Başla** düğmeleri çıkar.
  **Baştan Başla** oyunu ormandan, 1. seviyeden yeniden başlatır; kayıt silinmez (yeniden **Kaydet**'e basılana kadar durur).
- **Bilgisayarda klavye:** ok tuşları / WASD yürür, Boşluk vurur, **1 2 3** yetenekleri kullanır, **Q** iksir içer (tuşlar düğmelerin üstünde
  beyaz etiketle yazar; iksir düğmesinin altındaki kırmızı **×3** ise kalan iksir sayısıdır), B çanta, Esc mola.
- Adresin sonuna `?sessiz` eklersen oyun tamamen sessiz açılır (test için).

## Bölgeler

Her bölgenin sonunda bir **bölüm sonu canavarı** bekler; o neşelenince sihirli kapı açılır ve Feza bir hazine kazanır.

1. **Huysuz Orman:** köyün kenarından başlar. Bilge Baykuş yol gösterir. Jöleler, mantarlar, yarasalar ve haylaz goblinler.
   Sonunda **Kral Jöle**: taçlı dev jöle; zıplayıp yere konunca halka dalga yapar, minik jöleler çağırır.
2. **Kefir Vadisi:** akan süt ve kefir nehirleri, parlak yoğurt tepecikleri, delikli dev peynirler, güğümler, yayıklar ve bisküvi köprüler.
   Ejderhanın büyüsüyle yoğurtlar ekşimiş, kaymaklar kesilmiş: ekşi yoğurtlar, kayan kaymaklar, uçan kefir köpükleri, peynir dilimleri ve muhallebi jöleler.
   Sonunda **Köpüklü Kefir Devi**: dev bir kefir şişesi; neşelenince Feza'ya en güzel kefirinden ikram eder.
3. **Köstebek ve Salyangoz Mağarası:** parlayan kristallerle aydınlanan mağara. Toprağın altından "pıt" diye çıkan madenci köstebekler,
   baloncuk üfleyen salyangozlar, yarasalar ve kocaman ama sevimli kaya devleri. Sonunda **Usta Köstebek**: matkap baretli dev köstebek.
4. **Lav Yanardağı:** parlak lav gölleri, taş köprüler ve kıvılcımlar. Minik lav kaplumbağaları, ateş kuşları, lav jöleleri ve magma devi.
   Sonunda **Koca Lav Kaplumbağası**: kabuğu küçük bir yanardağ; lav topları fışkırtır (düşecekleri yer kırmızı daireyle görünür).
5. **Ejderhanın Kalesi:** oyuncak askerler, ateşçikler, hayaletler ve en sonda **Huysuz Ejderha**. Ejderha neşelenip ışıltılar içinde
   kaybolur, neşe kristali köye döner. İstenirse macera en baştan yeniden başlar.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Oyunu açan sayfa |
| `src/*.js`, `src/ui.css` | Oyunun bölümleri: dokular, ses, efektler, Feza ve ışın kılıçları, yaratıklar, haritalar, oyun kuralları, yetenekler, ekran |
| `vendor/three.js` | 3D kütüphanesi (three.js r170, MIT lisansı) |
| `sesler.js` | Türkçe kadın sesiyle kaydedilmiş anlatıcı cümleleri (dosyaya gömülü) |
| `gen_voice.py` | Cümle değişirse sesleri yeniden kaydeder |
| `manifest.webmanifest`, `sw.js`, `icons/` | iPad'de uygulama gibi açılma, simge ve internetsiz çalışma |
| `yayinla.command` | Çift tıklayınca değişiklikleri GitHub'a gönderir |
| `serve.py` | İsteğe bağlı yerel sunucu (iPad'i aynı Wi-Fi'dan bağlamak için) |

## Cümleleri değiştirmek

Anlatıcının bütün cümleleri `src/02_audio.js` içindeki `AUD.LINES` bölümündedir. Bir cümleyi değiştirdikten sonra:

```bash
python3 -m pip install edge-tts
python3 gen_voice.py      # sadece yeni/değişen cümleleri seslendirir (internet gerekir)
```

Sesler Microsoft Edge'in "tr-TR-EmelNeural" sesiyle üretilir; `ffmpeg` kuruluysa başlardaki/sonlardaki sessizlik kırpılır.
