# Feza ve Bilbo Huysuzlara Karşı ⚔️✨

5 yaşındaki Feza için yapılmış, üç boyutlu, Türkçe seslendirmeli bir macera oyunu (Diablo tarzı, ama çocuklara göre).
Gerçek Bilbo'dan esinlenen çikolata renkli Labrador Bilbo, maceranın başından sonuna kadar Feza'nın yanında koşar ve yakındaki huysuzlara havlayarak yardım eder.
Feza tuvalette kitabını okurken Bilbo’yla neşeli bir hayal kuruyor. Başlangıç ekranındaki gerçek Feza modeli klozette oturup kitabını okur;
özel masal banyosunda oyuncaklar, kitaplar ve içinde dünyalar olan hayal baloncukları bulunur. Her kapı yeni bir hayale açılır.
Feza ışın kılıcıyla ya da sihirli değneğiyle oyun arkadaşlarını neşelendirince
onlar sevinçten kocaman gülümseyip kalpler saçarak kayboluyorlar. Bütün yaratıklar sevimli ve güler yüzlü; kan yok, ölüm yok, korkutucu hiçbir şey yok.

## Nasıl açılır

- **Bilgisayarda:** `index.html` dosyasına çift tıklamanız yeterli. Kurulum ya da internet gerekmez.
- **iPad'de:** Oyun GitHub Pages'ta yayınlanınca iPad'de Safari ile https://goktugkarpat.github.io/feza-huysuzlara-karsi/ adresini açıp
  Paylaş › **Ana Ekrana Ekle** deyin. Oyun kendi simgesiyle, tam ekran bir uygulama gibi açılır.
  İlk açılıştan sonra **internet olmadan da** çalışır (`sw.js` oyunu cihaza kaydeder).
- Aynı Wi-Fi'daki iPad'de denemek için Mac'te `python3 serve.py` çalıştırıp yazdığı adresi iPad'de açabilirsiniz.

## Nasıl oynanır

- **Karakter:** Oyna düğmesinden sonra Savaşçı Feza, Büyücü Feza veya **Büyülü Şövalye Feza** seçilir. Savaşçı ışın kılıcıyla yaklaşır; büyücü ahşap değneğiyle uzaktan vurur. Büyülü şövalye iki silahı birlikte taşır: yakında kılıç, uzakta değnek kullanır.
- **Yürümek:** Parmağını ekranda gitmek istediğin yere bas. Feza parmağının altındaki yere koşar; parmağını kaydırdıkça peşinden gider.
- **Bilbo:** Feza'yı kendiliğinden takip eder; küçük portresi Feza'nın yanındadır. Yakındaki huysuzlara gerçek bir erkek Labrador kaydından iki kez tok sesle havlar. Feza'nın canı %50'nin altına düşünce koruyucu havlaması 5,5 adımlık çevredeki görünür huysuzları 3 saniye, bölüm sonu huysuzlarını 1,5 saniye sersemletir. Tekrar kullanabilmesi için canın en az %50'ye çıkması ve 20 saniyenin geçmesi gerekir; onu ayrıca yönetmek gerekmez. Sesin kaynağı ve izni: [ses bilgileri](assets/audio/CREDITS.md).
- **Bilbo’nun yeni oyunları:** Bazen yakındaki huysuza neşeyle sıçrayıp onu sakinleştirir. Sağdaki, yeteneklerin üzerindeki **kemik** düğmesi baştan açıktır:
  Feza kemiği Bilbo’ya atar; Bilbo ağzını açıp yaklaşık bir saniyede yakalar, kemiği kısa süre ağzında tutup çiğner. Sonra huysuzlara dönerek ağzından sırayla küçük et lokmaları püskürtür; en fazla beş görünür hedefe ulaşırlar, duvarlardan geçmezler. Düğme 8 saniyede yeniden hazır olur.
- **Vurmak:** Bir huysuza dokun: Feza yanına gidip vurur. Yakınına gelen huysuza kendiliğinden de vurur.
  Sağ alttaki büyük **ışın kılıcı** düğmesi de en yakındakine vurur.
- **Yetenekler:** Feza seviye atladıkça kılıç düğmesinin etrafında yeni bir düğme çıkar (toplam 3):
  ⭐ Yıldız Atışı (üç güçlü yıldız görünür hedeflere yönelir ve kalabalığı deler), 🌪️ Kasırga (fırıl fırıl dönüp etrafındakilere dokunur),
  ☄️ Meteor Yağmuru (gökyüzünden yıldız taşları yağdırır). Büyücüde bunların yerini **Işık Okları**, **Buz Çiçeği** (dondurma ve kısa kalkan) ve **Yıldız Bahçesi** alır. Büyülü şövalye **Hilal Dalgası**, **Işık Bağı** ve **Gökkuşağı Mührü** kullanır. Düğmenin üstündeki koyu gölge çekilince yetenek yeniden hazırdır.
- **Can:** Sol alttaki kırmızı top Feza'nın canıdır. Azalınca yanındaki **kırmızı iksire** bas ya da yerdeki kalpleri topla.
  Can biterse Feza uyuyakalır ve son parlattığı **neşe taşının** yanında dinlenmiş olarak uyanır.
- **Hazineler:** Sandıklar, küpler ve fıçılar altın ve eşya saklar. Işık sütunlu eşyalar ışın kılıcı (mavi, yeşil, kırmızı, mor, gökkuşağı…), şapka ya da pelerindir;
  daha güçlüyse Feza hemen giyer. Eşya seyrek düşer ve çantada her eşyadan yalnızca bir tane olur: aynısının daha güçlüsü bulunursa eskisinin yerini alır.
  🎒 düğmesiyle çantayı açıp istediği şapkayı, pelerini ve ışın kılıcını seçebilir.
  Eşyanın altındaki **yıldızlar** yalnızca ne kadar güçlü olduğunu gösterir (1–5 ★): daha güçlü eşyanın yıldızı hiçbir zaman daha az olmaz.
  Eşyanın rengi ve parıltısı (beyaz, mavi, sarı, turuncu) ise ne kadar özel ve nadir olduğunu gösterir.
- **Harita:** Sağ üstteki yuvarlak harita gidilecek yönü altın okla gösterir. Mor **sihirli kapıdan** geçince yeni bölgeye gidilir.
- **Hayal Haritası:** Macera bir kez bitince sağ üstte **Harita** düğmesi açılır. Başlangıç, mola ve bitiş ekranlarından da açılabilir.
  Sekiz resimli adadan birine dokununca oraya gidilir; seviye, çanta ve eşyalar korunur. Haritanın açılması cihazda hatırlanır;
  maceradaki ilerleme yine yalnızca **Kaydet** ile saklanır. Klavyede **M** harita, **K** kemik düğmesidir.
- ⏸ düğmesini kısa bir an basılı tutunca oyun durur (efektler, müzik, **Kaydet**, **Baştan Başla**). Oyun kendiliğinden kaydedilmez.
  Kalınan yerden sürmek isterseniz ⏸ › **Kaydet**'e basın; oyunu yeniden açınca **Devam Et** ve **Baştan Başla** düğmeleri çıkar.
  **Baştan Başla** oyunu tuvalet hayalinden, 1. seviyeden yeniden başlatır; kayıt silinmez (yeniden **Kaydet**'e basılana kadar durur).
- **Bilgisayarda klavye:** ok tuşları / WASD yürür, Boşluk vurur, **1 2 3** yetenekleri kullanır, **Q** iksir içer (tuşlar düğmelerin üstünde
  beyaz etiketle yazar; iksir düğmesinin altındaki kırmızı **×3** ise kalan iksir sayısıdır), B çanta, Esc mola.
- **FPS göstergesi:** klavyede **.** (nokta) tuşu açıp kapatır; iPad'de adresin sonuna `?fps` eklenirse açık başlar.
- **Kare hızı ve görüntü:** PC ve Mac'te çizim çözünürlüğü ekran ölçeklendirmesinden bağımsız **1.5×** başlar. Açılışta
  tarayıcının kare sıklığı ölçülür; hedef en fazla **120 FPS** olur. Sürekli yavaşlamada çözünürlük **1.25× → 1×** azaltılır,
  uzun süre akıcı çalışınca tekrar yükseltilir. Mola ve bölüm yüklemeleri bu ölçüme katılmaz. Tablet/telefonun **60 FPS**
  üst sınırı ve en fazla **1.25×** başlangıç çözünürlüğü korunur. `.` tuşu anlık FPS, hedef ve çizim çözünürlüğünü gösterir.
- Adresin sonuna `?sessiz` eklersen oyun tamamen sessiz açılır (test için).

Karakter seçimi güncellemesinden önceki kayıtlar ilk açılışta temizlenir. Yeni kayıtlar seçilen karakterle birlikte korunur.

Tuvalet ve Ay bölümlerine sabun, damla, Ay ışığı ve yıldız tozu silahları; köpük ve Ay pelerinleri ile altı özel bölüm sonu silahı eklendi.
Önceki 14 yeni eşya da korunur: **Pamuk Şeker**, **Kalpli**, **Uzay Roketi** ve **Kuyruklu Yıldız** ışın kılıçları; **Lolipop**, **Kedi Patisi**
ve **Gezegen** değnekleri; **Kedi Kulaklı Bere**, **Dondurma Şapkası**, **Yunikorn Tacı** ve **Astronot Kaskı**; **Şeker**, **Panda** ve
**Galaksi** pelerinleri. Bazıları ancak ilerideki bölgelerde çıkar (Uzay Roketi, Gezegen ve Galaksi gibi).

## Normal modun dengesi

- Bölüm sonu huysuzlarının canı **Normal** zorlukta önceki ayarın %57’sidir; karşılaşmalar belirgin biçimde kısalır.
  **Zor** seçeneğinde önceki dayanıklılık korunur. Zorluk değişince kalan canın yüzdesi korunur.
- Daha güçlü silah bulunca huysuzların canı daha yavaş artar; yükseltmeler dövüşü daha belirgin kısaltır.
- Büyücü Feza'nın normal değnek atışı biraz daha hızlıdır.
- Bossun kendi küçük oyununu başarıp onu sersemletince, sersemleme boyunca saldırıların **%25 daha fazla hasar** verir.
  Ejderhaya gönderilen dostluk kalbinin sabit hasarı ve şövalyenin sancakları bu artışa dahil değildir.
- Bu ayarlar Normal zorluğa özeldir; Zor seçeneği daha sert dövüş dengesini korur.

## Bölgeler

Bütün bölümler ilk iki bölümün kısa temposundadır: 6 ana alan ve en fazla 2 yan alan. Kale koridorları da daha doğrudan ilerler; her bölümün özel huysuzları, hazineleri ve son bossu korunur.

Her bölgenin sonunda bir **bölüm sonu huysuzu** bekler; o neşelenince sihirli kapı açılır ve Feza ona özgü sabit bir hazine kazanır. İlk iki bölüm Köpük Usta ve Ay Tavşanı'nın özel silahlarını verir. Ardından önceki altı bölümün bütün ödülleri korunur. Her karakterin her huysuzdan alacağı özel ödül farklıdır (toplam 24); Huysuz Şövalye büyücüye Şövalyenin Arma Pelerini'ni, büyülü şövalyeye Şövalyenin Turnuva Kılıcı'nı verir. Normal ganimetler savaşçıda kılıç, büyücüde değnek, büyülü şövalyede her ikisi olabilir. Hibrit karakterde kılıç ve değnek çantadan ayrı ayrı kuşanılır; biri diğerini çıkarmaz.

1. **Köpüklü Tuvalet Rüyası:** gülümseyen kakacıklar, süzülen çiş damlaları, sabun köpükleri; yollar boyunca köpüklü küvetler, aynalı dolaplar, havlular, diş fırçaları, sabunluklar ve ördekli köşeler.
   **Köpük Usta** ile sabun toplama oyunu oynanır. Açık döşeme yürünebilen alanı, koyu çevre ve bordürler sınırını gösterir.
   Bölüm geçişinde Feza ve Bilbo kendiliğinden köpük roketine biner; anlatımlı uçuş animasyonu Ay’a götürür. Ek düğme veya pencere yoktur.
2. **Zıp Zıp Ay:** gece tonlarında gümüş-mavi Ay tozu, gölgeli çukur kraterler, kubbeli istasyonlar, paneller, antenler, bayraklar ve kristaller. Açık toz alanının sınırında doğal alçak taşlar bulunur; koyu dış araziye yürünmez. Yıldızlı ufukta Dünya, halkalı uzak gezegen ve sürekli geçen zararsız kuyruklu yıldızlar ile meteorlar görülür; Güneş görünmez.
   Ay ponponları, ışık baloncuklu yıldızcıklar ve saklanan kratercikler; **Ponpon Ay Tavşanı** için üç yıldız toplanır.
   Sonra yıldız yapraklı mekikle Orman Hayali’ne otomatik, anlatımlı bir uçuşla geçilir. İki yeni bossun da her karakter için özel bir silah ödülü vardır.
3. **Huysuz Orman:** köyün kenarından başlar. Bilge Baykuş yol gösterir. Jöleler, mantarlar, yarasalar ve haylaz goblinler.
   Sonunda **Kral Jöle**: taçlı dev jöle; zıplayıp yere konunca halka dalga yapar, minik jöleler çağırır.
4. **Kefir Vadisi:** akan süt ve kefir nehirleri, parlak yoğurt tepecikleri, delikli dev peynirler, güğümler, yayıklar ve bisküvi köprüler.
   Jöle Kralı’nın kapısından yeni bir hayal: yoğurtlar, kayan kaymaklar, uçan kefir köpükleri, peynir dilimleri ve muhallebi jöleler şenlik yapar.
   Sonunda **Köpüklü Kefir Devi**: dev bir kefir şişesi; neşelenince Feza'ya en güzel kefirinden ikram eder.
5. **Köstebek ve Salyangoz Mağarası:** kefir köpükleri parlayan kristallere dönüşür. Toprağın altından "pıt" diye çıkan madenci köstebekler,
   baloncuk üfleyen salyangozlar, yarasalar ve kocaman ama sevimli kaya devleri. Sonunda **Usta Köstebek**: matkap baretli dev köstebek.
6. **Lav Yanardağı:** kristaller turuncu ışık nehirlerine dönüşür. Parlak göller, taş köprüler ve kıvılcımlar. Minik lav kaplumbağaları, ateş kuşları, lav jöleleri ve magma devi.
   Sonunda **Koca Lav Kaplumbağası**: kabuğu küçük bir yanardağ; lav topları fışkırtır (düşecekleri yer kırmızı daireyle görünür).
7. **Surlu Şehir (Feza'nın isteği):** dağın ışıkları şehrin fenerleri olur. Arnavut kaldırımlı sokaklar, içinden akan
   nehir ve taş köprüler, renkli ahşap evler, pazar tezgâhları, çeşme, bayraklar; surlar ve kuleler, uzakta ejderhanın kalesi.
   Buradaki arkadaşlar bir şenlik oyunu oynar. Ponpon uçlu mızraklı nöbetçiler,
   simit fırlatan simitçiler, tozu savurarak gelen süpürgeciler ve davuluyla "güm" diye vuran kocaman tellal. Neşelenince hepsi
   yeniden güler yüzlü şehirliler olur. Sonunda turnuva meydanında **Huysuz Şövalye** ve kocaman atı: yolunu gösterip dörtnala
   koşar, atı şaha kalkıp yere basar, mızrağını savurur, at nalı fırlatır ve nöbetçi çağırır.
8. **Ejderhanın Kalesi:** şehrin bayrakları gökkuşağına dönüşüp dost ejderhanın kalesine uzanır. Oyuncak askerler, ateşçikler, hayaletler
   ve en sonda **Huysuz Ejderha**. Ejderha neşelenince neşe kristalini paylaşır; arkadaşların kahkahaları yıldızlara dönüşür ve Hayal Haritası açılır.

Boss savaşlarında küçük sürprizler de var: Kral Jöle küçük parçalara ayrılır, Kefir Devi köpük dansı yaptırır,
Usta Köstebek sıralı toprak dalgaları gönderir, Lav Kaplumbağası yeşil geçit bırakan bir lav dalgası çıkarır,
Huysuz Şövalyenin meydanında üç turnuva sancağı çıkar: üçü de devrilince şövalyenin başı döner ve bir süre hiçbir şey yapamaz.
Son ejderhanın benekli yumurtaları savaş boyunca çoğalır; yaklaşıp dokununca minik ejderhalar çıkar.
Aynı anda en fazla 7 yumurta ve 4 yavru bulunur. Savaş bitince veya Feza dinlenince bu sürprizler temizlenir.

Her boss ayrıca bir TBC esintili hareket kullanır; tehlikeli alanlar 2 saniye önceden gösterilir:

| Boss | İlham | Yeni hareket |
|---|---|---|
| Kral Jöle | Leotheras — Whirlwind | İşaretli kısa yol boyunca dönerek ilerleyen jöle kasırgası. |
| Köpüklü Kefir Devi | The Lurker Below — Spout | Yavaşça dönen, köpüklerle süslü kefir jeti. |
| Usta Köstebek | Gruul — Shatter | Üç kristal belirir; yakında kalırsan parçalanırken hasar verir. Tek oyuncuya uyarlanmıştır. |
| Koca Lav Kaplumbağası | Kael’thas — Flamestrike | Feza'nın bulunduğu yerde işaretlenen çember parlar ve kısa süre sıcak kalır. |
| Huysuz Şövalye | Attumen the Huntsman — Berserker Charge | Meydanın kenarına gidip işaretli iki hat boyunca (bir artı gibi) dörtnala koşar. |
| Huysuz Ejderha | Illidan — Eye Blast | İki göz ışını işaretli hattı tarar ve kısa süreli mavi bir iz bırakır. |

Yeni hareketler diğer özel saldırılarla sırayla kullanılır; yumurtalar savaş boyunca çoğalmaya devam eder.

### Bossların oyunları

Her bossun savaşın ortasında bir oyunu var. Yapılırsa boss bir süre şaşırıp hiçbir şey yapamaz (tam vurma zamanı!);
yapılmazsa hiçbir şey kaybedilmez. Gidilecek yeri altın (ejderhada pembe) parlayan bir halka ve haritadaki altın nokta gösterir.

- **Kral Jöle — Taç Kovalamaca:** büyük bir zıplayışta tacı başından düşer. Kral tacına yürürken Feza önce koşup tacı kaparsa
  taç kralın başına geri uçar, kral utanıp kıpkırmızı olur.
- **Kefir Devi — Dev Köpük Balonu:** kocaman bir köpük balonu üfler, balon yavaşça Feza'ya doğru süzülür. İki kez vurunca
  "pof!" diye patlar, içinden bir kalp çıkar ve dev hıçkırık tutar.
- **Usta Köstebek — Saklambaç:** yere girer, meydanda dört delik açılır. Parlayan deliğe koş, başı görününce dokun ("tak!");
  üç kez yakalayınca köstebeğin başı döner.
- **Lav Kaplumbağası — Serin Taşlar:** üç serin taş çıkar. Kaplumbağa yuvarlanmaya hazırlanırken taşın arkasına saklanınca
  taşa çarpar ve yan yatıp ayaklarını sallar.
- **Huysuz Şövalye — Havuç:** meydanın kenarında altın bir havuç belirir. Feza havucu alıp başının üstünde tutar; aç at
  koşa koşa gelir, havucu mutlulukla yer, şövalye de surat asıp bekler.
- **Huysuz Ejderha — Dostluk Kalpleri:** ejderha iç çekip üç pembe kalp üfler. Hepsini toplayınca kocaman bir sevgi kalbi
  ejderhaya uçar ve ejderha bir süre sevgiyle oturur.


## Mola ve zorluk

Mola menüsünde **Devam Et**, **Zorluk**, **Kaydet** ve **Baştan Başla** bulunur. Müzik düğmesi açılış ekranındadır.

- **Hasar çarpanı:** Normal zorlukta bütün huysuz ve boss saldırıları eski Normal değerlere göre **%160** (2,6 katı), Zor zorlukta eski Zor değerlere göre **%350** (4,5 katı) daha güçlüdür. Yakın vuruşlar, uzaktan atışlar ve bossların alan/özel saldırıları buna dahildir.
  Artış zırh ve Bulut Örtüsü azaltmasından önce, tek kez uygulanır; küçük hasarlarda tam sayıya yuvarlama vardır. Düşman canı, hız, saldırı sıklığı ve ödüller korunmuştur.
- **Mola → Zorluk** içinde **Normal** veya **Zor** seçilir. Seçim hemen uygulanır; devam edince yeni ayarla oynarsın.
  Bölüm, karakter, eşyalar ve ilerleme korunur. Mevcut düşmanların kalan can yüzdesi değişmez; dövüş yeniden başlamaz.
- Seçili zorluk hem Mola düğmesinde hem oyun ekranındaki küçük **Normal / Zor** işaretinde görünür.
- İki zorlukta da **Mola → Kaydet** ile kayıt alınır. **Devam Et** kayıtlı zorluğu da yükler. Yenilince aynı bölümdeki
  neşe taşından uyanılır; Hardcore'un ayrı kayıt ve bölüm başına dönme kuralları kaldırılmıştır.
- **Baştan Başla** ile yeni karakter seçilerek açılan macera **Normal** başlar. Oyunu bitirince **Tekrar Oyna** ile açılan
  sonraki macera, karakterle birlikte seçili zorluğu da korur.
- **Zor** seçeneğinde yaratıklar daha dayanıklı, hızlı ve sık saldırır; bossların özel saldırıları daha sert vurur.
  Savaşta kendiliğinden can yenilenmez, sakin anlarda daha yavaş yenilenir. Yenilgilere bağlı düşman zayıflaması uygulanmaz.
- Önceki sürümden yalnızca bir Hardcore kaydı kaldıysa **Devam Et** onu Zor olarak açabilir. Normal kayıt varsa önceliklidir.
  Eski kayıt kendiliğinden silinmez; yeni ortak kayıt ancak **Kaydet** denince yazılır.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Oyunu açan sayfa |
| `src/*.js`, `src/ui.css` | Oyunun bölümleri: dokular, ses, efektler, Feza, Bilbo ve ışın kılıçları, yaratıklar, haritalar, oyun kuralları, yetenekler, ekran |
| `vendor/three.js` | 3D kütüphanesi (three.js r170, MIT lisansı) |
| `sesler.js` | Türkçe kadın sesiyle kaydedilmiş anlatıcı cümleleri (dosyaya gömülü) |
| `gen_voice.py` | Cümle değişirse sesleri yeniden kaydeder |
| `manifest.webmanifest`, `sw.js`, `icons/` | iPad'de uygulama gibi açılma, simge ve internetsiz çalışma |
| `yayinla.command` | Çift tıklayınca değişiklikleri GitHub'a gönderir |
| `serve.py` | İsteğe bağlı yerel sunucu (iPad'i aynı Wi-Fi'dan bağlamak için) |

## Oyunu bitirdikten sonra devam etmek

İlk maceranın Normal/Zor dengesi değişmez. Oyunu bitirip yeni tura geçince seviye ve eşyalar korunur;
düşmanların canı ve hasarı, **o turun başındaki** saldırı gücü, can ve zırha göre belirlenir.
Bu ölçü tur boyunca sabittir: yeni eşya, seviye veya tüccar güçlendirmesi düşmanları anında güçlendirmez.
Bölümler ilerledikçe zorluk yükselir; sonraki turlarda saldırılar arasındaki bekleme biraz kısalır, kaçınma uyarıları aynı kalır.
Bossların ilk maceraya ait can tavanı tekrar turlarında uygulanmaz; canları her turda katlanarak uzamaz.

Turun güç ölçüsü **Kaydet** ile saklanır; Devam Et veya zorluk değiştirmek bu ölçüyü yenilemez.
Eski bir tekrar-turu kaydında ölçü yoksa ilk yüklemede mevcut seviye, ekipman ve bölümden hesaplanır.
Baştan Başla, ilk maceraya ve onun mevcut dengesine döner.

## Gezgin tüccar: Mırmır Ayışığı

Mırmır, 4., 6. ve 8. bölümlerin başındaki güvenli alanda bekleyen, yıldızlı pelerinli ve fenerli bir kedi tüccardır.
Yanına yaklaşınca **Alışveriş** düğmesine dokun veya **E** tuşuna bas. Seçim sırasında oyun durur.

- **Pofuduk Yudum:** çantaya bir can iksiri ekler; her tezgahta en fazla 3 adet, çanta doluyken alınamaz.
- **Bulut Örtüsü:** o bölüm boyunca alınan hasarı %8 azaltır. Yenilince devam eder, yeni bölümde sona erer.
- **Kıvılcım Cilası / Yıldız Tozu:** kuşanılmış kılıcı / değneği, ilk gücünün %12’si kadar (yuvarlanmış, en az 1) güçlendirir.
  Eşya başına en fazla 2 güçlendirme; her tezgahta toplam 2 kullanım. Hibrit Feza hangi elindeki silahı güçlendireceğini seçer.

2./4./6. bölüm fiyatları sırasıyla iksir için **45/75/110**, örtü için **100/170/240**, silah için **130/220/320** altındır.
Alışveriş ve güçlendirmeler **Mola → Kaydet** ile saklanır; tekrar yüklemek stokları yenilemez.
Yeni macera alışveriş geçmişini sıfırlar. Yeni Oyun+ tezgâhları yeniler; fiyatlar her turda temel fiyatın %35’i kadar artar.

## Cümleleri değiştirmek

Anlatıcının bütün cümleleri `src/02_audio.js` içindeki `AUD.LINES` bölümündedir. Bir cümleyi değiştirdikten sonra:

```bash
python3 -m pip install edge-tts
python3 gen_voice.py      # sadece yeni/değişen cümleleri seslendirir (internet gerekir)
```

Sesler Microsoft Edge'in "tr-TR-EmelNeural" sesiyle üretilir; `ffmpeg` kuruluysa başlardaki/sonlardaki sessizlik kırpılır.
