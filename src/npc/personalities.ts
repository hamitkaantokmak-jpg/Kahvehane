/** NPC kişilikleri ve replikleri. */
import { ActionName } from '../characters/Animator';

export type ActivityKind = 'sitTable' | 'watchTv' | 'sleep' | 'chat' | 'wander' | 'bench' | 'serve';

export interface Personality {
  id: string;
  temper: number; // 0 sakin .. 1 çabuk sinirlenen
  favoriteTables: ('okey' | 'tavla' | 'kart')[];
  activities: Partial<Record<ActivityKind, number>>;
  signature: ActionName[];
  /** Bahsi artırmaya meyil (0..1) */
  betBoldness: number;
  /** Kavgada yardım edeceği dostları */
  friends: string[];
  /** Kavgada karşısına geçeceği rakipleri */
  rivals: string[];
  lines: {
    greet: string[];
    bonked: string[];
    bonkedAgain: string[];
    retaliate: string[];
    tea: string[];
    tv: string[];
    idle: string[];
    laf: string[];
    win: string[];
    lose: string[];
    think: string[];
    goodMove: string[];
    joinGame: string[];
    /** Kavgaya dalarken */
    brawlJoin: string[];
    /** Kavgayı ayırmaya çalışırken */
    brawlBreakUp: string[];
    /** Kavga yatışınca / sakinleştirirken */
    calmDown: string[];
    /** Kavgadan kaçarken */
    brawlFlee: string[];
    /** Veresiye sınırını aşmış oyuncuya laf */
    debtTease: string[];
    /** Bahsi artırmayı önerirken */
    betRaise: string[];
  };
}

export const PERSONALITIES: Record<string, Personality> = {
  riza: {
    id: 'riza', temper: 0.9, favoriteTables: ['okey'], activities: { sitTable: 5, watchTv: 1, chat: 2, wander: 1 },
    signature: ['slamTable', 'angry', 'think'],
    betBoldness: 0.35,
    friends: ['kemal', 'hasan'],
    rivals: ['cemal', 'ferhat'],
    lines: {
      greet: ['Gel evlat gel, otur bakalım.', 'Hoş geldin! Okeyi bilir misin sen?', 'Selamün aleyküm!'],
      bonked: ['Oğlum ne yapıyorsun!', 'Hoppala! Kafam!', 'Bu ıstaka değil, sopa!', 'Saygı kalmadı saygı!'],
      bonkedAgain: ['Bak yemin ederim kalkarsam...', 'YETER BE!', 'Ben senin dedenle okey oynadım!'],
      retaliate: ['Al sana ıstaka!', 'Sen de gör bakalım!'],
      tea: ['Oh be, çay gibisi yok.', 'Şükrü! Bu çay soğuk!', 'Demi tam olmuş.'],
      tv: ['Hakem nerede be!', 'Ofsayt bu ofsayt!'],
      idle: ['Ben bu okeyi 1974\'te icat ettim.', 'Eskiden okey taşları mermerdendi.', 'Gençler okey bilmiyor...', 'Belim ağrıyor yine.'],
      laf: ['Sen kime laf atıyorsun!', 'Hıh! Bıyığın yok daha!', 'Gel bir el oynayalım da görelim seni.'],
      win: ['Ben demiştim! Ustaya saygı!', 'Hahaha! Kimse beni yenemez!', 'İşte okey böyle oynanır!'],
      lose: ['Taşlar bozuktu!', 'Hile var bu işte!', 'Gözlüğümü evde unuttum, ondan.'],
      think: ['Hımm...', 'Dur bakalım...', 'Bu taş kimde acaba?'],
      goodMove: ['Hah! Bunu bekliyordum.', 'Gel bakalım!'],
      joinGame: ['Okey mi? Ben varım!', 'Masaya otur, ders vereyim.'],
      brawlJoin: ['Kim dokundu benim adamıma!', 'Çekilin, ben hallederim!', 'Bu yaşta bana mı dayılanıyorsun?'],
      brawlBreakUp: ['Durun be! Ayıp ayıp!', 'Ben yaşlıyım ama araya girerim!'],
      calmDown: ['Tamam, tamam... Ama haklıydım.', 'Hadi bir çay söyleyin de unutalım.'],
      brawlFlee: ['Belim tutulur, ben uzaktan bakarım!', 'Bu iş gençlerin işi!'],
      debtTease: ['Evlat, Şükrü\'ye borcun dağ oldu!', 'Benim zamanımda veresiye ayıptı!'],
      betRaise: ['Bu bahis az, bir çay daha koy!', 'Ustaya karşı bu kadar mı?'],
    },
  },
  cemal: {
    id: 'cemal', temper: 0.6, favoriteTables: ['tavla', 'okey'], activities: { sitTable: 4, chat: 2, watchTv: 1, wander: 1 },
    signature: ['leanBack', 'point', 'shrug'],
    betBoldness: 0.9,
    friends: ['nihat'],
    rivals: ['riza', 'kemal'],
    lines: {
      greet: ['Reis geldi, ortam şenlendi!', 'Bahse var mısın? Ben kazanırım.', 'Hoş geldin aslanım.'],
      bonked: ['Bu sayılmaz, hazır değildim!', 'Ayy! Sigortam yoktu!', 'Bunun hesabını soracağım!'],
      bonkedAgain: ['İddiaya girerim bir daha vuramazsın!', 'Tamam, kaybettim iddiayı...'],
      retaliate: ['Bahse girerim bunu beklemiyordun!'],
      tea: ['Bahse girerim bu günün en iyi çayı.', 'Şükrü, hesaba yaz!'],
      tv: ['Bunlar kazanacak, iddiaya girerim!', 'Ben söylemiştim, gol gelecek!'],
      idle: ['Zarım bugün çok iyi geliyor.', 'Dün 6-6 attım, üç kere!', 'Benimle iddiaya giren pişman olur.'],
      laf: ['Laf atma, zar at!', 'İddiaya girelim mi?'],
      win: ['Zar dediğin böyle gelir!', 'Söylemiştim, iddiayı kazandım!', 'Reis her zaman reistir!'],
      lose: ['Zar bozuktu, değiştirin şunu!', 'Güneş gözüme geldi!', 'Ben bilerek kaybettim, sen üzülme diye.'],
      think: ['Hesaplıyorum...', 'Olasılıklar benden yana.'],
      goodMove: ['İşte bu! Bahis kazanıldı!', 'Gördün mü?'],
      joinGame: ['Bir el atalım! Kaybeden çayları ısmarlar.', 'İddiasına varım!'],
      brawlJoin: ['Bahse girerim bu kavgayı ben kazanırım!', 'Reis geliyor, kenara çekilin!', 'İddiasına varım, tek atarım!'],
      brawlBreakUp: ['Durun, bahsi bozmayın!', 'Ayrılın, iddialar geçersiz!'],
      calmDown: ['Peki, berabere sayalım.', 'Neyse, bahis iptal.'],
      brawlFlee: ['Bu kavgaya oran vermem, kaçıyorum!', 'Ceketim kirlenmesin!'],
      debtTease: ['Borçla bahis olmaz aslanım, önce hesabı kapat!', 'Bahse girerim bu borcu ödeyemezsin, şaka şaka!'],
      betRaise: ['Az bu! İkiye katlayalım mı?', 'Reis masasında bu bahis oynanmaz, artıralım!', 'İddiasına varım, bahsi büyütelim!'],
    },
  },
  nihat: {
    id: 'nihat', temper: 0.3, favoriteTables: ['kart', 'okey'], activities: { sitTable: 4, chat: 3, wander: 2, watchTv: 1 },
    signature: ['laugh', 'point', 'bellyDance'],
    betBoldness: 0.5,
    friends: ['riza', 'cemal', 'sukru', 'hasan', 'ferhat', 'kemal'],
    rivals: [],
    lines: {
      greet: ['Ooo kimleri görüyorum!', 'Gel gel, pişti var mı?', 'Yeni kurban geldi! Şaka şaka.'],
      bonked: ['Hahaha, iyiydi bu!', 'Ay! Ama hak ettim galiba.', 'Bunu Rıza Dayı\'ya yap, daha komik!'],
      bonkedAgain: ['Tamam tamam, sıra bende!', 'Kafamda tavla zarı gibi şişlik oldu.'],
      retaliate: ['Ödeştik!'],
      tea: ['Çay iyi de simit nerede?', 'Şükrü\'nün çayı bir harika!'],
      tv: ['Hakemi de alalım masaya, okey oynasın.', 'Bu maç pişti olur!'],
      idle: ['Pişti yaparım, kartları sayarım.', 'Rıza Dayı\'nın taşlarını gördüm, hıh hıh.', 'Bugün şansım yaver.'],
      laf: ['Hahaha, iyi laf!', 'Sen bana mı dedin? Ayna gibi konuşuyorsun.'],
      win: ['PİŞTİ! Hahaha!', 'Kart sayarım ben kart!', 'Üzülme, alışırsın.'],
      lose: ['Kartlar bana küstü bugün.', 'Peki peki, bu seferlik.'],
      think: ['Hangi kart çıktı bakalım...', 'Hıh hıh...'],
      goodMove: ['Tak!', 'Ah, şimdi oldu!'],
      joinGame: ['Pişti mi? Hemen geliyorum!', 'Kart dağıtın!'],
      brawlJoin: ['Hahaha, ben de varım!', 'Dur abi, ben tutuyorum!'],
      brawlBreakUp: ['Abiler, pişti yapalım kavga etmeyelim!', 'Hadi hadi, herkes köşesine!', 'Gülün biraz be!'],
      calmDown: ['Hah, işte böyle. Kim çay içer?', 'Barıştık mı? Ben çayları söylüyorum!'],
      brawlFlee: ['Ben kartları toplayıp kaçıyorum!', 'Hah, ben yokum!'],
      debtTease: ['Hesap defterinde adın birinci sırada!', 'Şükrü seni bulaşığa koyacak, hıh hıh!'],
      betRaise: ['Biraz daha koyalım, heyecan olsun!', 'Pişti gibi bahis, ikiye katla!'],
    },
  },
  sukru: {
    id: 'sukru', temper: 0.4, favoriteTables: [], activities: { serve: 10 },
    signature: ['pour', 'wave', 'talk'],
    betBoldness: 0.1,
    friends: ['riza', 'cemal', 'nihat', 'hasan', 'ferhat', 'kemal'],
    rivals: [],
    lines: {
      greet: ['Hoş geldin abi! Çay mı, açık mı?', 'Çaylar benden!', 'Taze demledim abi.'],
      bonked: ['Abi tepsi düşecekti!', 'Abi ben çaycıyım, düşman değil!', 'Yavaş abi, bardaklar!'],
      bonkedAgain: ['Abi bunu hesaba yazıyorum!', 'Bir daha vurursan çayına tuz koyarım!'],
      retaliate: ['Tepsiyle cevap!'],
      tea: ['Çaylar geldi!', 'Taze çay, ince belli!', 'Buyur abi, tavşan kanı!'],
      tv: ['Ne oldu ne oldu?'],
      idle: ['Kimin çayı bu? Unuttum yine.', 'Üç demli, bir açık, iki şekersiz...', 'Semaver fokurduyor!'],
      laf: ['Abi ben buradayım, sen söyle!', 'Laf atacağına çay iç abi.'],
      win: ['Çaylar benden!'],
      lose: ['Olsun abi, çay içelim.'],
      think: ['Hmm...'],
      goodMove: ['Vay be!'],
      joinGame: ['Abi benim işim var ama bir el atarım!'],
      brawlJoin: ['Abi bırak, bardaklar kırılacak!', 'Tepsiyle gelirim ha!'],
      brawlBreakUp: ['Beyler, sakin olun! Çaylar benden!', 'Abiler, ocak başında kavga olmaz!', 'Durun durun, bardak kalmadı!'],
      calmDown: ['Beyler, sakin olun! Taze çay geliyor!', 'Hadi barışın, herkese bir demli!', 'Tamam abiler, çaylar benden!'],
      brawlFlee: ['Tepsiyi kurtarmam lazım!', 'Ben ocağa kaçıyorum!'],
      debtTease: ['Abi, defterde yer kalmadı!', 'Abi önce eski çayları bir öde.'],
      betRaise: ['Abi benim işim var ama olur, artıralım.', 'Bir çay daha koyalım abi.'],
    },
  },
  hasan: {
    id: 'hasan', temper: 0.2, favoriteTables: ['tavla'], activities: { sleep: 6, bench: 2, watchTv: 1 },
    signature: ['leanBack', 'shrug'],
    betBoldness: 0.2,
    friends: ['riza', 'nihat'],
    rivals: [],
    lines: {
      greet: ['Hmm? Ne? Kim geldi?', 'Zzz... hoş geldin... zzz'],
      bonked: ['Ha?! Deprem mi?!', 'Uyuyordum be!', 'Kim söndürdü ışıkları?'],
      bonkedAgain: ['Rüyamda okey kazanıyordum...', 'Tamam uyandım, uyandım!'],
      retaliate: ['Bırak uyuyayım!'],
      tea: ['Çay... uyandırır beni... zzz'],
      tv: ['Kaç kaç oldu? ... zzz'],
      idle: ['Zzz...', 'Hrrr... zzz...', 'Beş dakika daha...'],
      laf: ['Hı? Bana mı dedin?', 'Zzz...'],
      win: ['Kazandım mı? Ne güzel... zzz'],
      lose: ['Rüya gibi bir oyundu...'],
      think: ['Zzz... hı? Sıra bende mi?'],
      goodMove: ['Hı!'],
      joinGame: ['Uyandırdın, bari bir el oynayalım.'],
      brawlJoin: ['Uyandırdınız madem... Geliyorum!', 'Kim bağırıyor?! Ha, kavga mı?'],
      brawlBreakUp: ['Yavaş olun, uyuyan var...', 'Kavga etmeyin, gelin uyuyalım.'],
      calmDown: ['Oh, sonunda sessizlik... zzz', 'Bitti mi? İyi, uyuyorum.'],
      brawlFlee: ['Ben bankta uyumaya gidiyorum.', 'Bana dokunmayın, uykum var!'],
      debtTease: ['Borç... zzz... ödenir mi?', 'Veresiye defteri... rüyamda da vardı...'],
      betRaise: ['Artıralım mı? Ben uyurken karar verin...', 'Olur... zzz...'],
    },
  },
  ferhat: {
    id: 'ferhat', temper: 0.75, favoriteTables: ['kart'], activities: { watchTv: 6, chat: 1, sitTable: 1 },
    signature: ['cheer', 'angry', 'point'],
    betBoldness: 0.7,
    friends: ['nihat', 'cemal'],
    rivals: ['kemal', 'riza'],
    lines: {
      greet: ['Maçı izliyor musun?! Gel gel!', 'Hoş geldin, sessiz ol maç var!'],
      bonked: ['Maçı kaçırdım yüzünden!', 'Gol oldu mu?! Görmedim!', 'Kardeşim ne yapıyorsun?!'],
      bonkedAgain: ['Kırmızı kart sana!', 'Penaltı bu penaltı!'],
      retaliate: ['Faul yapan sensin!'],
      tea: ['Çayı ver, maç gergin!', 'Bir çay daha Şükrü, devre arası!'],
      tv: ['GOOOL! Ah değilmiş...', 'Hakem gözlüğünü tak!', 'Koş be koş!', 'Bu nasıl pas?!', 'Kaleci uyuyor!'],
      idle: ['Bu sezon şampiyonuz!', 'Teknik direktör istifa!'],
      laf: ['Sen hangi takımdansın?!', 'Laf atma, maça bak!'],
      win: ['ŞAMPİYON! ŞAMPİYON!', 'Golü attık!'],
      lose: ['Hakem bizi yaktı!', 'Bu maç satıldı!'],
      think: ['Taktik düşünüyorum...'],
      goodMove: ['Gol gibi hamle!'],
      joinGame: ['Devre arası, bir el oynarım!'],
      brawlJoin: ['Faul bu! Ben de giriyorum!', 'Kırmızı kart görene kadar devam!', 'Taraftar sahada!'],
      brawlBreakUp: ['Hakem benim, ayrılın!', 'Oyun durdu, ayrılın!'],
      calmDown: ['Tamam, devre arası.', 'Maç bitti, tokalaşalım.'],
      brawlFlee: ['Ben maça dönüyorum!', 'Sakatlanmadan kaçayım!'],
      debtTease: ['Borcun transfer bütçesi gibi, kabarık!', 'Kardeşim, önce kulübün borcunu kapat!'],
      betRaise: ['Gol gibi bahis istiyorum, artıralım!', 'Maç heyecanı lazım, ikiye katla!'],
    },
  },
  kemal: {
    id: 'kemal', temper: 0.5, favoriteTables: ['okey', 'kart'], activities: { sitTable: 4, chat: 3, bench: 1 },
    signature: ['think', 'talk', 'facepalm'],
    betBoldness: 0.4,
    friends: ['riza'],
    rivals: ['cemal', 'ferhat'],
    lines: {
      greet: ['Muhtarlığa hoş geldin! Yani kahveye.', 'Bak bu mahallenin sorunlarını burada çözeriz.'],
      bonked: ['Muhtara el kaldırılır mı!', 'Tutanak tutacağım!', 'Bu resmi bir şikayettir!'],
      bonkedAgain: ['Mühürlü belgeyle şikayet ediyorum!', 'Seçimde oyumu alamazsın!'],
      retaliate: ['Resmi cevabım budur!'],
      tea: ['Çay devletin malıdır, israf etmeyin.', 'Şükrü, makbuz kes!'],
      tv: ['Haberleri açın, bakalım ne diyorlar.'],
      idle: ['Kaldırım taşları yine söküldü.', 'Mahallede kedi sayımı yapacağız.', 'İkametgah lazım olan var mı?'],
      laf: ['Muhtara laf atılmaz evlat.', 'Dilekçeyle başvur.'],
      win: ['Halkın iradesi tecelli etti!', 'Muhtar her zaman kazanır.'],
      lose: ['İtiraz ediyorum! Yeniden sayım!', 'Bu oylama geçersizdir!'],
      think: ['Değerlendiriyorum...', 'Komisyona havale ediyorum.'],
      goodMove: ['Onaylandı!', 'Mühürledim!'],
      joinGame: ['Bir el oynayalım, halkla iç içe olalım.'],
      brawlJoin: ['Muhtar olarak müdahale ediyorum!', 'Resmi kavga başladı!'],
      brawlBreakUp: ['Muhtarlık emridir, ayrılın!', 'Tutanak tutacağım, durun!', 'Mahallede kavga yasak!'],
      calmDown: ['Barış tutanağı imzalandı.', 'Kayıtlara geçti, herkes çayını içsin.'],
      brawlFlee: ['Muhtarlığa gidip tutanak getireyim!', 'Ben resmi işlere bakayım!'],
      debtTease: ['Muhtarlık kayıtlarında borçlu görünüyorsun.', 'Borç senedi imzaladın mı evlat?'],
      betRaise: ['Bütçe uygun, bahsi artırabiliriz.', 'Resmi teklifim: ikiye katlayalım.'],
    },
  },
};

export const ARGUMENTS: [string, string, string, string][] = [
  ['riza', 'cemal', 'Sen okeyden ne anlarsın Cemal!', 'Dayı, dün üç el üst üste yendim seni!'],
  ['cemal', 'nihat', 'Bahse girerim bu akşam beni yenemezsin.', 'Pişti masasına gel de görelim reis!'],
  ['kemal', 'riza', 'Rıza, kahvede bağırmak yasak, tabelada yazıyor.', 'O tabelayı ben astım muhtar!'],
  ['ferhat', 'kemal', 'Muhtar, televizyona çanak anten lazım!', 'Bütçe yok Ferhat, bütçe!'],
  ['nihat', 'riza', 'Dayı, ıstakan ters duruyor!', 'Benim ıstakam hep düzdür!'],
];

export function pickLine(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Şükrü'ye özgü ekonomi replikleri */
export const SUKRU_LINES = {
  noCredit: ['Abi kusura bakma, defter doldu. Önce borcu bir kapat.', 'Abi veresiye sınırı doldu, çay yok bugün!', 'Abi defterde yer kalmadı, bir el bulaşık yıkasan?'],
  credit: ['Tamam abi, deftere yazdım.', 'Veresiye yazıldı abi, unutma ha!'],
  workOffer: ['Abi paran yoksa dert etme, bulaşık var! Semavere gel.', 'Abi bir el bulaşık yıka, borçtan düşerim.'],
  workDone: ['Eline sağlık abi, bardaklar pırıl pırıl!', 'Helal abi, borçtan düştüm!'],
  raise: ['Duyuru! Çaya zam geldi, şekeri ben ödüyorum!', 'Abiler, fiyatlar azıcık arttı... Semaver de enflasyonda!'],
  raiseOver: ['Zam bitti abiler, çay eski fiyatına!'],
  paid: ['Sağ ol abi, hesap temiz!', 'Eyvallah abi, defteri sildim!'],
};
