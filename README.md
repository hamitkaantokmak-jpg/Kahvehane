# KAHVEHANE — 3D Sosyal Kahvehane ve Masa Oyunları

TypeScript + Three.js + Vite. Gerçek 3D, perspektif kamera, karikatür (toon + dış hat) karakterler.

```
npm install
npm run dev      # http://localhost:5173
npm test         # kural motoru birim testleri (Vitest)
npm run build    # tip kontrolü + üretim derlemesi
```

## Telefonda oynamak (GitHub Pages)

`main` dalına her gönderimde `.github/workflows/deploy.yml` testleri çalıştırır, oyunu derler ve GitHub Pages'e yayınlar:
**https://hamitkaantokmak-jpg.github.io/Kahvehane/**

- İlk kurulumda depo ayarlarında **Settings → Pages → Source: GitHub Actions** seçili olmalı.
- Telefonda tarayıcıdan açıp **Ana ekrana ekle** dersen tam ekran, uygulama gibi açılır (yatay tutman önerilir).
- Kaydın (para, ayarlar) o telefonun tarayıcısında saklanır; bilgisayardaki kayıtla paylaşılmaz.
- Aynı Wi-Fi'de bilgisayardan oynatmak için: `npm run dev` → terminaldeki `Network:` adresini telefonda aç.

## Kontroller
Masaüstü: WASD yürü · Shift koş · fare (tıkla = pointer lock / sürükle) kamera · tekerlek zoom · E etkileşim/otur ·
F ıstakayla şaplak · G çay fırlat · Q hareket menüsü · 1-8 hızlı hareket (selam, kahkaha, alkış, göbek at, masaya vur, laf at, çay iç, yüzünü sil) ·
T Şükrü'den çay iste · C karakter oluşturucu · Esc menü / masadan kalk.
Mobil: sol yarı sanal joystick (uzağa çekince koşar), sağ yarı kamera, ✋ etkileşim, 🏏 ıstaka, 💦 çay fırlat, 😀 hareketler, 🍵 çay.

## Mimari
| Klasör | Görev |
|---|---|
| `src/chaos` | **Saf mantık:** Kaos Direktörü (gerginlik, olay seçimi, kayıt defteri), zincirleme kavga modeli |
| `src/economy` | **Saf mantık:** cüzdan, veresiye defteri, fiyatlar/zam, günlük bonus, iflas koruması, bahis hesabı; kalıcılık arayüzü |
| `src/games/common` | RNG, taş seti, per doğrulama, el çözümleyici (grafikten bağımsız) |
| `src/games/okey`, `okey101`, `tavla`, `pisti`, `batak`, `king`, `dart` | Her oyunun kural motoru + ayrı bot modülü (`trick/`: Batak ve King'in ortak el alma çekirdeği) |
| `src/games/atyarisi` | TV at yarışı motoru (saf, tohumlu) |
| `src/world` | Kahvehane sahnesi, materyaller, prosedürel dokular, çarpışma + A* yol bulma |
| `src/characters` | Modüler karakter tanımı (gelecekteki karakter oluşturucu için), model, prosedürel animatör |
| `src/npc` | **Kadro (`roster.ts`)**: her NPC tek yerde (tip, görünüş farkı, kişilik değerleri, dost/rakip, ses); **tipler (`archetypes.ts`, saf)**; replikler (`personalities.ts`); davranış sistemi; kavga katmanı (`BrawlController`) |
| `src/interactions` | Istaka şaplağı, emote'lar, laf atma, çay ısmarlama |
| `src/tables` | Masa oturumu: oyun seçimi, botların masaya yerleşmesi, 3D masa geri bildirimi |
| `src/ui` | HUD, konuşma balonları, oyun arayüzleri (DOM) |
| `src/audio` | WebAudio ile prosedürel sesler (dosya yok → telif riski yok) |
| `src/save` | Ayarlar + istatistik (localStorage) |

Botlar yalnızca `viewFor/view101/viewPisti` görünümlerini alır; gizli taş/kart bilgisi verilmez (birim testle doğrulanır).
Bot seviyeleri: Kolay / Orta / Zor (oyun seçim ekranında).

## Testler
```
npm test          # birim testleri (kurallar, botlar, zorluk, gizli bilgi)
npm run e2e       # Playwright uçtan uca testleri (tests/e2e) — --trace off
```
Test kancaları: `?speed=N` bot beklemelerini, `?gspeed=N` oyun zamanını hızlandırır; `window.__game.session.ui` ve `ui.refresh()`.

## Masa görünümü (okey, 101, tavla, pişti, batak, king)
Tüm masa oyunları aynı dili kullanır: yeşil çuha masa, **sen altta**, diğerleri kendi kenarında; sırası gelenin kenarı ve
isim plakası parlar. Yatay telefonda ıstaka/el bir yanda, durum ve düğmeler öbür yanda durur.
- **Pişti:** herkesin elindeki kart sayısı kendi kenarında; aldığın kartlar kapalı yığın olarak önünde (kart, puan ve pişti
  puanı yazar), karşı tarafınki rakibin önünde. Ortada deste ve yerdeki kartlar, köşede küçük skor tabelası.
- **Batak ve King:** ortaya oynanan her kart oynayanın önüne düşer; el bitince kimin aldığı bir an görünür. Elinde yalnızca
  oynayabileceğin kartlar parlar (soluk karta basınca nedenini söyler). İhale/koz/oyun seçimi masanın ortasında açılır;
  King'de köşedeki "tablo" bağlantısı oynanan elleri ve kalan cezaları gösterir.
- **Tavla:** rakip tahtanın karşısında, sen altta (pul rengi, pip ve maç skoru plakada). Zarlar tahtanın ortasında, atanın
  sağ yarısına düşer; toplanan pullar tahtanın yanındaki kutularda yığılır (üstte rakibin, altta senin). Pullar hane
  yüksekliğine göre küçülür, dar ekranda üst üste taşmaz.

### Okey masası
Klasik Okey ve 101, yukarıdan bakılan yeşil çuha bir masada oynanır (`src/ui/games/OkeyTable.ts`, yalnızca çizim):
- Her oyuncu kendi kenarında: **sen altta**, sağında 1, karşında 2, solunda 3; sıra sağdan döner (0 → 1 → 2 → 3).
  Sırası gelen oyuncunun kenarı ve isim plakası parlar.
- **101'de herkes açtığı perleri kendi önüne koyar.** Hazırladığın (henüz açmadığın) perler de senin önünde kesik çizgiyle durur.
  Istakadan tek taş seçince işlenebilecek perler (kimin önünde olursa olsun) parlar; pere dokununca işlenir.
- Atılan taşlar gerçek masadaki gibi her oyuncunun sağındaki köşede yığılır: senin attıkların sağ altta,
  alabileceğin taş (soldakinin attığı) sol altta. Ortada deste, gösterge ve okey.
- Dar ekranda yan ve karşı kenarlardaki perler küçük çizilir; o kenara dokununca büyük görünüm açılır.
  Yatay telefonda ıstaka solda, durum ve düğmeler sağda durur.

## Çevrimiçi: arkadaşlarla masa (1. aşama)
Herhangi bir masaya otur → **🌐 Arkadaşlarla oyna** → **Oda kur** (ya da 4 harflik kodla **Koda katıl**). Lobide oda kodu ve
**davet bağlantısı** (`…/Kahvehane/?oda=KOD`) paylaşılır; bağlantıyı açan arkadaş masaya oturup odaya katılır.
- Oda, kurulduğu masanın türüne bağlıdır; koda katılan ya da davet bağlantısını açan oyuncu kendiliğinden o türde bir masaya geçer.
  - **Kart masası:** İhaleli Batak, King, Pişti (2 ve 4 kişi)
  - **Okey masası:** Klasik Okey, 101 (el sayısı, katlamalı)
  - **Tavla masası:** Tavla, 2 kişilik (maç puanı, katmerli mars). Her iki oyuncu da tahtayı kendi tarafından (beyaz) görür.
- Oda sahibi oyunu, seçenekleri ve müdavim seviyesini seçip başlatır.
- En çok 4 kişi (tavla 2); boş koltuklara müdavimler (bot) oturur. Arkadaşların, karakter oluşturucudaki karakterleriyle masada oturur.
- Bağlantısı kopanın ya da 60 sn oynamayanın yerine müdavim oynar; geri dönen (aynı tarayıcı sekmesi) koltuğuna döner.
- **Kaos (yalnızca görsel):** 💬 hazır sözlerle laf atma, 🙋 itiraz, 👊 masaya vurma, 💦 çay atma, 🌪️ masayı devirme (maçta bir kez).
  Herkes kendi kaos ayarını seçer: **Sakin** olana çay atılamaz, sakin olan da çay atamaz/masa deviremez. Bekleme süreleri var;
  susturulan oyuncunun kaosu ulaşmaz. Serbest yazışma yoktur. Oyun parası çevrimiçi masada kullanılmaz.

**Mimari:** kurallar sunucuda çalışır (istemci yalnızca niyet yollar), herkes yalnızca kendi elini görür.
- `src/online/protocol.ts` mesajlar · `games.ts` oyun bağdaştırıcıları (doğrulama, bot, gizli bilgisi çıkarılmış görünüm) ·
  `room.ts` saf oda mantığı (zaman ve rastgelelik dışarıdan, JSON durum) · `rotate.ts` "ben = 0" görünümü ·
  `OnlineClient.ts` yeniden bağlanan WebSocket · `OnlineSession.ts` lobi + masa + kaos · `OnlineUIs.ts` çevrimiçi oyun arayüzleri.
- `server/`: Cloudflare Worker + Durable Object (her oda ayrı nesne; uyuyup uyansa da durum korunur; yalnızca sitenin ve yerel
  adreslerin bağlanmasına izin verir). Yayın: `cd server && npx wrangler deploy` (Cloudflare API anahtarı gerekir).
- Yerel geliştirme: `npx wrangler dev --config server/wrangler.toml --port 8788` ve oyunu `?server=http://localhost:8788` ile aç.
- Testler: `tests/onlineRoom.test.ts`, `tests/onlineRotate.test.ts`, `tests/e2e/online.spec.ts` (iki tarayıcı, yerel sunucu).

## Karakter oluşturucu
**C** tuşu ya da ☰ menü → **Karakterini düzenle**. Kamera karakterine döner; her değişiklik modeli canlı olarak yeniden kurar.
- **Yüz:** ten rengi, kafa şekli ve büyüklüğü, burun şekli ve büyüklüğü, kaş, gözlük
- **Saç:** saç modeli, saç/bıyık rengi, bıyık, şapka (kasket, fes, bere — aynı anda tek şapka)
- **Beden:** boy, göbek, bacak
- **Kıyafet:** gömlek, ceket (ya da ceketsiz), pantolon; boyun (atkı, papyon, kravat — tek parça); ekstralar (yelek, eşofman,
  tespih, kulakta kalem, cep defteri, önlük, omuzda havlu); **hazır kıyafet**: kahvehane tiplerinden birinin kıyafeti ve bedeni,
  yüzün ve şapkan korunur
- **Ses:** ses inceliği (mırıltının perdesi) + deneme
- 🎲 Rastgele, ⟲ ⟳ döndür, takma ad (en çok 16 karakter)

Mantık saf modülde (`src/characters/creator.ts`): seçenek listeleri, sınırlar, rastgele karakter, şablonlar. Kayıt
`kahvehane.character.v1` anahtarında; okunan her veri beyaz listeye ve sınırlara çekilir (bozuk ya da elle değiştirilmiş kayıt oyunu
bozamaz) — ileride sunucudan gelecek karakterler de aynı süzgeçten geçer.

## NPC tipleri
Her müdavim bir tipe bağlıdır. Tip; kıyafeti, yürüyüşü, oturuşu, ayakta bekleme huylarını, sesi ve davranışın
varsayılanlarını verir. NPC tanımı (`src/npc/roster.ts`) yalnızca tipten farkını yazar. Uzaktan bile kim hangi tip, anlaşılsın diye:

| Tip | Kim | Görünüş | Hareket | Davranış |
|---|---|---|---|---|
| Emekli dayı | Rıza, Hasan | yelek, tespih, göbek, kambur | ağır, **elleri arkada** yürür; arkaya yaslanıp oturur; eller arkada bekler | bolca akıl verir (kibitz ×1,6) |
| Esnaf | Cemal | kolları sıvalı gömlek, **kulakta kalem**, cepte not defteri | hızlı adım, kollar sallanır; rahat oturur, kolu sandalyede; elleri belde bekler | pazarlıkçı, bahse meraklı |
| Delikanlı | Nihat, Ferhat | **eşofman** (beyaz şeritler, fermuar), ince | zıplayarak en hızlı yürür; öne eğilip oturur; yerinde duramaz | maç, kart, TV |
| Memur | Muhtar Kemal | ceket, **kravat**, gözlük | dimdik ve ölçülü; dik oturur; kollarını kavuşturur | kurallara titiz, akıl verir (×1,3) |
| Kahveci | Şükrü | önlük, papyon, **omzunda havlu** | çevik, dengeli | servis |

Her tipin kendine özgü genel boşta replikleri de NPC'nin kendi repliklerine karışır. NPC'ye yaklaşınca ipucunda tipi yazar.
Tip ve kadro verisi saf ve JSON'a çevrilebilir (sunucuya taşınabilir); birim testleri `tests/archetypes.test.ts`.

## Uygulanan kural varyantları
**Klasik Okey:** 106 taş, başlayan 15 / diğerleri 14. Gösterge +1 = okey (13→1), sahte okey okeyin yerine geçer.
Seri aynı renk ardışık ≥3 (12-13-1 geçerli, 13-1-2 geçersiz), grup aynı sayı farklı renk 3-4, 7 çift.
Yalnızca soldaki oyuncunun son attığı taş alınabilir. 20 puandan düşmeli: normal −2, okey atarak −4, çift −4,
çift+okey −8; ilk turda gösterge gösteren dışındakilere −1. Deste biterse el berabere.

**101 Okey (standart, katlamasız):** başlayan 22 / diğerleri 21. Seri açma ≥101, çift açma ≥5 çift. Açtıktan sonra
yeni per serme (seriyle açan seri/grup, çiftle açan çift) ve masadaki seri/gruplara uçlardan işleme. 13-1 bağlantısı yok.
Yerden alınan taş o tur kullanılmalı (bu uygulamada ceza yerine "geri koy" hakkı var). İşlek taş ya da okey atmak +101.
Puan: kazanan −101; elden bitme ×2, okey atarak bitme ×2; açmayan +202×çarpan, açan el toplamı×çarpan (okey 101),
çiftçi ×2. Deste biterse kazanan yok. Seri maç: seçilen el sayısı, en düşük toplam kazanır.
**Okey alma:** El açmış oyuncu, masadaki bir perde okeyin temsil ettiği taş elindeyse onu pere koyup okeyi eline alabilir
(seride tam renk+sayı, grupta eksik renkten aynı sayı). Ceza uyarısı oyunun kendi penceresiyle gösterilir.
**Katlamalı 101 (seçenek, "yükselen açış"):** aynı elde her yeni seri açış o ana kadarki en yüksek seri açıştan en az 1 fazla,
her yeni çift açış en çok çiftle açılandan en az 1 çift fazla olmalıdır. Puanlama standart 101 ile aynıdır.
(Katlamalı 101'in bölgeden bölgeye farklı yorumları vardır; burada yükselen açış eşiği uygulanmıştır.)

**İhaleli Batak (tekli / eşli):** 52 kart, 13'er. Dağıtanın solundan ihale: en az 5 (eşlide 7), en çok 13; pas diyen o elde
ihaleye dönmez, üç pas ihaleyi bitirir, herkes pas derse son kalan en az ihaleyle almak zorunda. İhaleyi alan kozu seçer ve açar.
Renge uymak zorunlu; o renkten eli alabiliyorsan yükseltmek zorunlu (ortaya koz düşmüşse gerekmez). Rengin yoksa koz atmak
zorunlu, ortada koz varsa geçebiliyorsan büyük koz. Koz açılmadan kozla açılmaz (elde yalnızca koz yoksa). Puan: tutan aldığı
el kadar, batan ihale kadar eksi, diğerleri aldıkları el kadar; eşlide ortakların elleri birlikte sayılır. 3/5/7/11 el.
Seçenek **El almayan cezalı**: ihaleyi almayanlardan hiç el alamayan ihale kadar kaybeder (eşlide hiç el alamayan takım);
ihaleyi alan taraf zaten batmış sayılır, ona ayrıca uygulanmaz.

**King:** 4 kişi, 13'er kart. Seçen sırayla değişir ve açar. Tam King 20 el (her oyuncu 2 koz + 3 ceza, her ceza en çok 2 kez),
Kısa King 8 el (1 koz + 1 ceza, her ceza en çok 1 kez). Cezalar: el almaz −50/el, kupa almaz −30/kupa, erkek almaz −60/papaz ve vale,
kız almaz −100/kız, rıfkı −320 (kupa papazı), son iki −180/el. Koz: seçen kozu belirler, +50/el. Renge uymak zorunlu; rengin yoksa
kozda koz zorunlu, rıfkıda kupa papazı elindeyse onu atmak zorunlu. Kozda koz, kupa almaz ve rıfkıda kupa açılmadan o renkle
açılmaz. Ceza elleri cezanın tamamı alınınca erken biter. En yüksek toplam kazanır.

**Tavla:** 24 hane, 15'er pul, standart diziliş. Açılışta büyük zar atan başlar ve zarları yeniden atar. Azami zar
kullanımı ve "tek zar oynanabiliyorsa büyüğü" kuralı, kırma/bar, kapalı hane, toplama (büyük zarla en gerideki).
Normal 1, mars 2, katmerli mars 3 (seçenek). Katlama küpü yok. Maç 1/3/5 puan.

**Pişti (2 ve 4 kişi, aynı motor):** yere 4 kart (3 kapalı), üstteki vale ise desteye karıştırılıp yenisi açılır.
4'er dağıtım. Aynı değer ya da vale yığını alır; tek kartı aynı değerle almak pişti 10, vale ile vale 20.
As 1, Vale 1, ♣2 = 2, ♦10 = 3, en çok kart +3 (eşitlikte yok). Son kalan kartlar son alana. 4 kişide karşılıklı takım.
Hedef 51/101/151; hedefe ulaşılan elin sonunda yüksek olan kazanır (eşitse devam).

## Kaos sistemi (Aşama 1)
Saf mantık (`src/chaos/`) three.js ve DOM kullanmaz; rastgelelik `rng.ts` ile, zaman `dt` ile dışarıdan verilir; durum JSON'a çevrilebilir.

- **Gerginlik (0-100):** olaylar puan ekler (`TENSION_POINTS`: şaplak +8, kavga başlangıcı +10, kavga vuruşu +2, masa devirme +25,
  kedi +15, bardak kırılması +3, yatıştırma −30) ve saniyede 0.6 düşer. Seviyeler: Sakin < 25 ≤ Hareketli < 50 ≤ Gergin < 75 ≤ Patlamak üzere.
- **Kaos Direktörü:** ~20 sn'de bir, gerginlikle artan olasılıkla, kayıt defterinden (`events.ts`) bir olay seçer:
  gerginlik aralığına uyan, bekleme süresi dolmuş, bir önceki olaydan farklı olaylar arasında ağırlıklı seçim.
  Yeni olay = `DEFAULT_EVENTS`'e bir satır + oyun katmanında bir işleyici. Bu aşamada yalnızca **kavga** işleyicisi var
  (TV'de gol, elektrik kesintisi, kedi kayıtlı ama işleyicisi Aşama 5'te).
- **Zincirleme kavga:** ıstaka yiyen NPC'nin öfkesi `0.35 + temper×0.3` artar; 0.6'yı geçince oyuncuyla kavga başlar
  (Rıza Dayı ilk şaplakta, sakin karakterler ikincide). Yakındakiler kavga başına bir kez değerlendirilir:
  dost → yardıma gelir, rakip → karşı tarafa geçer, tarafsız → ayırmaya çalışır ya da kaçar
  (olasılık = ilişki × öfke × mesafe). En fazla 5 savaşan; kavga en geç 18 sn'de, yorulunca ya da yatıştırılınca biter.
- **Şükrü:** gerginlik 28'i geçince ya da kavga 4 sn'yi aşınca tepsiyle gelir, "Beyler, sakin olun!" der, gerginliği 30 düşürür.
- **Masadaki oyun:** kavgaya karışan masa botu masadan kalkar; **oyun duraklar** (bot sırası bekler, ekranda "⏸ Oyun bekliyor"),
  bot masasına dönünce kaldığı yerden devam eder. İnsan oyuncu kendi hamlesini yapabilir.
- **HUD:** ekranın üstünde "Gerginlik" çubuğu (renk/seviye), tavana yaklaşınca uyarı yazısı.
- **Ayar:** Menü → Kaos yoğunluğu: Sakin (puan ×0.6, olay sıklığı ×0.5) / Normal / Tam kaos (×1.6 / ×2).

## Ekonomi (Aşama 2)
Tüm para **oyun içi sanal "kahve parası"dır (🪙)**; gerçek parayla, ödemeyle ya da dışarı çıkarılabilir bir değerle hiçbir bağı yoktur.
Mantık `src/economy/` altında saftır; kalıcılık `EconomyStore` arayüzü arkasında (şimdilik localStorage, `kahvehane.economy.v1`).

- **Cüzdan:** başlangıç 100🪙, her yeni günde +25🪙 günlük bonus. NPC'lerin de basit cüzdanı var (150🪙).
- **Fiyatlar:** çay 5, simit 8, tost 15, kırık bardak 10. Şükrü ara sıra %10-40 geçici zam yapar (duyurur).
- **Çay (T tuşu / semaver):** para ister. Para yetmezse Şükrü **veresiyeye** yazar. Veresiye sınırı **40🪙**;
  sınır dolunca Şükrü çay getirmez ve yakındaki NPC'ler borçluya laf atar.
- **Borç ödeme:** Şükrü'nün yanına gidip E (önce kahvehane, sonra diğer alacaklılar).
- **İflas koruması:** parası ve veresiye hakkı kalmayan oyuncu oyundan atılmaz; semaverde E ile **bulaşık yıkar** (+12🪙, önce borca sayılır, 60 sn bekleme).
- **Bahisli masa:** masa kurulurken bahis seçilir (Yok / 3 / 5 / 10 çay; 1 çay = 5🪙). Bahsi artırmaya meyilli bir NPC
  (en çok Cemal Reis) iki katına çıkarmayı teklif edebilir. Ödeme kural motorlarına dokunmadan, oyun sonuçlarından otomatik yapılır:
  Okey — puanı en düşük olan öder, en yüksek alır · 101 — seride en yüksek toplam öder, en düşük alır ·
  Tavla — her oyunda kaybeden öder (normal 1×, mars 2×, katmerli mars 3×) · Pişti — kaybeden takımın her üyesi öder, kazananlara bölünür.
  Oyuncunun parası yetmezse kalan alacaklıya veresiye yazılır; NPC'ler ellerindeki kadarını öder.
- **HUD:** sağ üstte bakiye (🪙) ve veresiye (📒); değişince "+/−" animasyonu.

## Çay fırlatma ve çaylı yüz (Aşama 3)
Saf mantık: `src/interactions/teaThrow.ts` (ücret, bekleme, leke süresi). **Yalnızca görsel ve sosyaldir**: hiçbir oyun kuralına,
taşa, karta ya da bota etkisi yoktur; masada oynarken de çalışır ("💦 Çay fırlat" düğmesi → hedef seç).

- **Tuş:** G (mobil: 💦). Hedef önündeki en yakın kişidir; bardak yay çizerek uçar, isabette çay sıçrar, bardak kırılır.
- **Ücret** (kahve parasından): kırık bardak 10🪙 + çay 5🪙 (elinde çay varsa çay bedeli alınmaz) + aynı hedefe 60 sn içinde
  her yeni atışta +5🪙 (en fazla +20). Para yoksa veresiyeye yazılır; veresiye sınırı doluysa atılamaz. Atışlar arası 4 sn bekleme.
- **Çaylı yüz:** isabet alanın yüzünde/saçında 22 sn çay lekesi ve süzülen damlalar; tekrar isabette süre uzar (en fazla 30 sn),
  son 6 sn'de solarak kaybolur. Oyuncu 8 (ya da hareket menüsü → 🧻) ile yüzünü silebilir; NPC'ler bazen kendileri siler.
  Oyuncunun yüzü çaylıyken ekran kenarlarında damlalar görünür.
- **Tepkiler:** isabet gerginliğe +6 ekler; NPC kişiliğine göre söylenir, sinirliler kendi parasıyla çay fırlatarak karşılık verir,
  öfkesi taşarsa kavga başlar. Çaylı yüzlü birini gören NPC'ler laf atar (`teaSplashed`, `teaSeen` replikleri).
- **Ayar:** Menü → Çay fırlatma: Herkes / Kapalı (kapalıyken oyuncu da NPC'ler de fırlatamaz).

## Dart ve TV'de at yarışı (Aşama 4)
**Dart** (`src/games/dart/dart.ts` + `dartBot.ts`, arayüz `ui/games/DartUI.ts`, 3D `tables/DartSession.ts`):
- Sol duvardaki tahtanın önüne (kırmızı çizgi) gidip E. 301 / 501, isteğe bağlı **çift ile bitirme**, isteğe bağlı 2'şer kişilik takım.
- Standart tahta: 20 dilim, üçlü/çift halka, dış boğa 25, iç boğa 50 (çift sayılır). Her turda 3 ok.
- **Bust:** kalan negatife düşerse, çiftle bitirme açıkken 1'e inerse ya da 0'a çift olmayan okla inerse tur geçersiz (puan geri alınır).
- **Kontrol:** fare/parmakla tahtaya nişan al (mavi halka), basılı tut → güç çubuğu gidip gelir, beyaz çizgiye yakınken bırak.
  Güç azsa ok aşağı, fazlaysa yukarı sapar. Son 60 sn'de çay içtiysen ya da yüzün çaylıysa nişan titrer.
- Botlar kişiliğe göre isabet eder: Rıza ağır ve isabetli, Cemal iddialı (hep üçlü 20'ye) ama sapan, Hasan uykulu...
  Kötü atış duvara saplanabilir (yalnızca görsel şaka). Bahisli oynanabilir (kaybeden taraf öder).

**At yarışı** (`src/games/atyarisi/atyarisi.ts`, oyun katmanı `world/HorseRaceTV.ts`):
- Birkaç dakikada bir TV'de yarış açılır: 40 sn bahis süresi → yarış → sonuç. 6 komik isimli at, güçlerine göre oranlar.
- Sonuç tohumdan tek seferde belirlenir (aynı tohum = aynı sonuç); TV yalnızca oynatır.
- TV'ye gidip E → at ve miktar (5/10/20/50🪙, yalnızca nakit) seç. Kazanırsan yatırdığın × oran (aşağı yuvarlanır).
- NPC'ler de bahis yapar (Cemal her zaman, uzun oranlı atlara). Foto finişte kaybedenler "Hileli!" diye bağırır, gerginlik artar.

## Küçük kaos olayları (Aşama 5)
Kurallar `src/chaos/eventRules.ts` (saf), kayıtlar `src/chaos/events.ts`, görsel katman `src/world/ChaosEvents.ts` ve `src/world/Cat.ts`.
Kaos Direktörü gol, elektrik kesintisi ve kediyi gerginliğe göre kendiliğinden seçer. Masa devirme, itiraz ve kibitz bir duruma bağlıdır:
kayıtta ağırlıkları 0'dır, yani rastgele seçilmezler ama puan ve bekleme süreleri yine kayıttan gelir.

| Olay | Gerginlik aralığı | Puan | Bekleme |
|---|---|---|---|
| TV'de gol | 0–70 | +5 | 45 sn |
| Elektrik kesintisi | 20–100 | +6 | 120 sn |
| Kedi | 0–80 | +15 | 90 sn |
| Kavga | 30–100 | +10 | 60 sn |
| Masa devirme (tetiklenir) | — | +25 | 120 sn |
| İtiraz (oyuncu) | — | +3…+8 (mizaca göre) | 8 sn |

- **TV'de gol:** TV "GOOOL!" der, yakındakiler ayağa kalkıp bağırır; TV'ye yakın masalarda bardaklar titrer, bazıları devrilir.
- **Elektrik kesintisi:** ~22 sn ışıklar söner, turuncu acil fener yanar, NPC'ler bağırır. Masa arayüzü etkilenmez, oyun oynanır.
- **Kedi:** kapıdan girer, bir masaya çıkıp çayı devirir, NPC'ler kişiliklerine göre tepki verir (masadakiler kaçabilir), sonra çıkar.
- **İtiraz (masada 🙋):** bir bota "hile" iddiası; yalnızca replik + gerginlik (gerçek hile tespiti yok). 8 sn bekleme.
- **Masa devirme:** çok sinirli biri (Rıza Dayı) okeyi kaybedip öfkelenirse masayı devirir, taşlar havalanır; **sonuç ve puanlar geçerli kalır**.
- **Kibitz:** oyun sırasında boştaki bir NPC arkanda durup akıl verir ("O taşı atma!"). Menü → "Masada izleyici yorumları" ile kapatılabilir.

## NPC mırıltısı (Aşama 6)
Saf mantık `src/audio/voiceLogic.ts`, ses katmanı `src/audio/Voice.ts`.
- Konuşma balonu çıkınca NPC'nin kendine özgü **prosedürel mırıltısı** çalar (Sims/Animal Crossing tarzı): her ünlü grubu bir hece,
  ünlü türü metindeki Türkçe ünlülere göre (a/e/ı-i/o-ö/u-ü), soru cümlesinde ton sonda yükselir, ünlemde daha hızlı ve yüksek.
- Her NPC'nin ayrı sesi var: Rıza kalın ve ağır, Nihat ince ve kıkırdak, Şükrü hızlı ve çok konuşan, Hasan uykulu ve yavaş,
  Kemal resmi ve tekdüze, Cemal hızlı ve iddialı, Ferhat coşkulu.
- **Konumsal ses:** PannerNode ile NPC'nin kafa konumundan; dinleyici kamera. Aynı anda **en yakın 3** kişi sesli konuşur, diğerleri yalnızca balon.
- Konuşurken ağız ve baş hareket eder (sesi kısık olanlarda da).
- Ayar: Menü → "NPC sesleri (mırıltı)".
- **İleride gerçek ses kaydı:** çalma noktası soyutlanmıştır (`VoiceSource`). `voice.samples.register(npcId, metin, AudioBuffer)` ile
  kaydedilen bir replik varsa o çalar; yoksa mırıltı. (Bu turda kayıt yok.)
