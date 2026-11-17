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
| `src/games/common` | RNG, taş seti, per doğrulama, el çözümleyici (grafikten bağımsız) |
| `src/games/okey`, `okey101`, `tavla`, `pisti` | Her oyunun kural motoru + ayrı bot modülü |
| `src/world` | Kahvehane sahnesi, materyaller, prosedürel dokular, çarpışma + A* yol bulma |
| `src/characters` | Modüler karakter tanımı (gelecekteki karakter oluşturucu için), model, prosedürel animatör |
| `src/npc` | Kişilikler/replikler, davranış sistemi |
| `src/interactions` | Istaka şaplağı, emote'lar, laf atma, çay ısmarlama |
| `src/tables` | Masa oturumu: oyun seçimi, botların masaya yerleşmesi, 3D masa geri bildirimi |
| `src/ui` | HUD, konuşma balonları, oyun arayüzleri (DOM) |
| `src/audio` | WebAudio ile prosedürel sesler (dosya yok → telif riski yok) |
| `src/save` | Ayarlar + istatistik (localStorage) |

Botlar yalnızca `viewFor/view101/viewPisti` görünümlerini alır; gizli taş/kart bilgisi verilmez.

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
Okeyi masadan gerçek taşla değiştirme ve katlamalı 101 henüz yok (`Okey101Options` genişletilebilir).

**Tavla:** 24 hane, 15'er pul, standart diziliş. Açılışta büyük zar atan başlar ve zarları yeniden atar. Azami zar
kullanımı ve "tek zar oynanabiliyorsa büyüğü" kuralı, kırma/bar, kapalı hane, toplama (büyük zarla en gerideki).
Normal 1, mars 2, katmerli mars 3 (seçenek). Katlama küpü yok. Maç 1/3/5 puan.

**Pişti (2 ve 4 kişi, aynı motor):** yere 4 kart (3 kapalı), üstteki vale ise desteye karıştırılıp yenisi açılır.
4'er dağıtım. Aynı değer ya da vale yığını alır; tek kartı aynı değerle almak pişti 10, vale ile vale 20.
As 1, Vale 1, ♣2 = 2, ♦10 = 3, en çok kart +3 (eşitlikte yok). Son kalan kartlar son alana. 4 kişide karşılıklı takım.
Hedef 51/101/151; hedefe ulaşılan elin sonunda yüksek olan kazanır (eşitse devam).
