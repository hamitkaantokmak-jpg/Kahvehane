# KAHVEHANE — 3D Sosyal Kahvehane ve Masa Oyunları

TypeScript + Three.js + Vite. Gerçek 3D, perspektif kamera, karikatür (toon + dış hat) karakterler.

```
npm install
npm run dev      # http://localhost:5173
npm test         # kural motoru birim testleri (Vitest)
npm run build    # tip kontrolü + üretim derlemesi
```

## Kontroller
Masaüstü: WASD yürü · Shift koş · fare (tıkla = pointer lock / sürükle) kamera · tekerlek zoom · E etkileşim/otur ·
F ıstakayla şaplak · Q hareket menüsü · 1-7 hızlı hareket (selam, kahkaha, alkış, göbek at, masaya vur, laf at, çay iç) ·
T Şükrü'den çay iste · Esc menü / masadan kalk.
Mobil: sol yarı sanal joystick (uzağa çekince koşar), sağ yarı kamera, ✋ etkileşim, 🏏 ıstaka, 😀 hareketler, 🍵 çay.

## Mimari
| Klasör | Görev |
|---|---|
| `src/chaos` | **Saf mantık:** Kaos Direktörü (gerginlik, olay seçimi, kayıt defteri), zincirleme kavga modeli |
| `src/economy` | **Saf mantık:** cüzdan, veresiye defteri, fiyatlar/zam, günlük bonus, iflas koruması, bahis hesabı; kalıcılık arayüzü |
| `src/games/common` | RNG, taş seti, per doğrulama, el çözümleyici (grafikten bağımsız) |
| `src/games/okey`, `okey101`, `tavla`, `pisti` | Her oyunun kural motoru + ayrı bot modülü |
| `src/world` | Kahvehane sahnesi, materyaller, prosedürel dokular, çarpışma + A* yol bulma |
| `src/characters` | Modüler karakter tanımı (gelecekteki karakter oluşturucu için), model, prosedürel animatör |
| `src/npc` | Kişilikler/replikler (dost/rakip ilişkileri), davranış sistemi, kavga davranış katmanı (`BrawlController`) |
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
