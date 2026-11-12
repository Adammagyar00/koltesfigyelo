# Költésfigyelő

Telefonos app (iOS, Android, web), ami a bankszámlakivonatod alapján megmutatja, hova megy a pénzed, és konkrét, forintosított javaslatokat ad a spóroláshoz.

**Funkciók**

- **CSV-import** az **Erste**, **MBH** és **Wise** exportjaiból. A fejléc alapján ismeri fel az oszlopokat, kezeli a Windows-1250 kódolást és a fejléc előtti előszöveget. Ha az oszlopokat nem ismeri fel, kézzel is párosíthatók.
- **Duplikációszűrés:** ugyanaz a kivonat újraimportálva nem kerül be kétszer, és a kézi besorolások megmaradnak.
- **Automatikus kategorizálás** magyar kereskedőkre hangolt kulcsszavakkal (Lidl, Wolt, MOL, MVM, Netflix…). Ha egy tételt kézzel átsorolsz, az app felajánlja, hogy szabályt csináljon belőle, és visszamenőleg is alkalmazza.
- **Áttekintés:** havi kiadás és bevétel, kategóriánkénti bontás, 6 hónapos trend, összevetés az előző hónap azonos időszakával.
- **Keretek:** havi limit kategóriánként, figyelmeztetés a költési tempó alapján („ezzel a tempóval hó végére X lesz”).
- **Spórolás:** kiugró kategóriák, gyakori apró kiadások, rendszeres előfizetések felismerése (havi és éves költséggel), bankköltségek.
- **Fiók és felhő:** Firebase Auth (e-mail és jelszó) és Firestore. Mindenki csak a saját adatait látja (`firestore.rules`).

## Technológia

Expo (SDK 58) · React Native · TypeScript · Expo Router · Firebase (Auth + Firestore) · Vitest

```
src/
  app/            képernyők (Expo Router)
  components/     közös UI-elemek
  lib/            tiszta üzleti logika, tesztekkel
    csv/          kivonat-feldolgozás (oszlopfelismerés, szám- és dátumformátumok)
    categorize.ts szabályalapú besorolás
    insights.ts   összesítések, keretek, előfizetések, tippek
  services/       Firebase-kapcsolat és adatműveletek
  state/          React context (bejelentkezés, adatok)
sample-data/      kitalált minta-kivonat teszteléshez
```

## Indítás

```bash
npm install
cp .env.example .env   # majd töltsd ki (lásd lent)
npx expo start
```

Telefonon az **Expo Go** appal olvasd be a QR-kódot, vagy nyomd meg a `w` gombot a webes nézethez.

## Firebase beállítása

1. A [Firebase-konzolban](https://console.firebase.google.com) hozz létre egy projektet.
2. **Authentication → Sign-in method:** kapcsold be az **Email/Password** módot.
3. **Firestore Database:** hozd létre az adatbázist (production mode, `eur3` régió).
4. **Project settings → Your apps:** adj hozzá egy **Web appot**, és a kapott konfigurációt másold a `.env` fájlba.
5. Töltsd fel a biztonsági szabályokat:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project <projekt-azonosító>
   ```

A `.env` nincs a repóban. Az `EXPO_PUBLIC_` értékek nem titkos kulcsok, beépülnek az appba. Az adatokat a `firestore.rules` védi.

### Helyi fejlesztés emulátorral (fiók nélkül)

```bash
npx firebase-tools emulators:start --only auth,firestore --project demo-koltesfigyelo
```

A `.env`-be ekkor elég ennyi:

```
EXPO_PUBLIC_FIREBASE_API_KEY=demo-key
EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-koltesfigyelo
EXPO_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:demo
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1
```

Telefonról a gép helyi IP-címét add meg `127.0.0.1` helyett.

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
