# Költésfigyelő

Telefonos app (iOS és Android), ami a bankszámlakivonatod alapján megmutatja, hova megy a pénzed, és konkrét, forintosított javaslatokat ad a spóroláshoz.

**Funkciók**

- **CSV-import** az **Erste**, **MBH** és **Wise** exportjaiból. A fejléc alapján ismeri fel az oszlopokat, kezeli a Windows-1250 kódolást és a fejléc előtti előszöveget. Ha az oszlopokat nem ismeri fel, kézzel is párosíthatók.
- **Duplikációszűrés:** ugyanaz a kivonat újraimportálva nem kerül be kétszer, és a kézi besorolások megmaradnak.
- **Automatikus kategorizálás** magyar kereskedőkre hangolt kulcsszavakkal (Lidl, Wolt, MOL, MVM, Netflix…). Ha egy tételt kézzel átsorolsz, az app felajánlja, hogy szabályt csináljon belőle, és visszamenőleg is alkalmazza.
- **Áttekintés:** havi kiadás és bevétel, kategóriánkénti bontás, 6 hónapos trend, összevetés az előző hónap azonos időszakával.
- **Keretek:** havi limit kategóriánként, figyelmeztetés a költési tempó alapján („ezzel a tempóval hó végére X lesz”).
- **Spórolás:** kiugró kategóriák, gyakori apró kiadások, rendszeres előfizetések felismerése (havi és éves költséggel), bankköltségek.
- **Adatvédelem:** minden adat csak a telefonon tárolódik, fiók és szerver nélkül.

## Technológia

Expo (SDK 58) · React Native · TypeScript · Expo Router · AsyncStorage · Vitest

```
src/
  app/            képernyők (Expo Router)
  components/     közös UI-elemek
  lib/            tiszta üzleti logika, tesztekkel
    csv/          kivonat-feldolgozás (oszlopfelismerés, szám- és dátumformátumok)
    categorize.ts szabályalapú besorolás
    insights.ts   összesítések, keretek, előfizetések, tippek
  services/       helyi adattárolás (AsyncStorage)
  state/          React context (adatok)
sample-data/      kitalált minta-kivonat teszteléshez
```

## Indítás

```bash
npm install
npx expo start
```

Telefonra telepítsd az **Expo Go** appot (App Store / Google Play), és olvasd be vele a terminálban megjelenő QR-kódot. A telefonnak és a gépnek ugyanazon a Wi-Fi-hálózaton kell lennie. Ha nem jelenik meg az app, indítsd így: `npx expo start --tunnel`.

Kipróbáláshoz a `sample-data/erste-minta.csv` kitalált mintakivonat használható (pl. küldd át magadnak e-mailben, és a telefonon onnan válaszd ki).

## Adattárolás

Minden adat **csak a telefonon** van (AsyncStorage), nincs fiók és nincs szerver. A tételek havonta külön kulcsban tárolódnak (`src/services/data.ts`). Az app törlésével az adatok is törlődnek; a kivonatok bármikor újraimportálhatók. Felhős szinkron később hozzáadható ugyanebbe a rétegbe.

## Ellenőrzések

```bash
npm test           # üzleti logika tesztjei
npm run typecheck
npm run lint
```

## Bankok exportformátuma

A feldolgozó a fejlécszavak alapján dolgozik (pl. *Könyvelés dátuma*, *Tranzakció dátuma*, *Összeg*, *Terhelés* / *Jóváírás*, *Partner neve*, *Közlemény*, *Devizanem*), ezért nem függ a pontos oszlopsorrendtől. A szinonimák listája: `src/lib/csv/statement.ts`.

A tesztekben szereplő minta-fejlécek a bankok nyilvános leírásai alapján készült **közelítések**. Ha egy valódi export nem töltődik be, a hozzáadandó oszlopnév a `SYNONYMS` listába kerül, és a mintasor egy tesztbe.

A Wise két formátumát ismeri: a klasszikus kivonatot (*TransferWise ID, Date, Amount…*) és az újabb *Transaction history* exportot (*Direction, Source amount…*). Az utóbbiból a saját egyenlegek közötti átváltásokat kihagyja.

## Tervek

- Blokk fotózása (OCR)
- AI-alapú besorolás a szabályok mellé
- Saját kategóriák
- Több pénznem összesítése árfolyammal
- Felhős mentés / szinkron több eszköz között
