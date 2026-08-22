# Bücherregal

Lokales Node.js-26-Projekt für ein virtuelles Bücherregal. Der erste Importer liest die auf diesem Mac von der Kindle-App synchronisierte Bibliothek aus und schreibt sie in SQLite.

## Voraussetzungen

- Node.js 26 (`.nvmrc` und `.node-version` sind enthalten)
- macOS Kindle-App mit synchronisierter Bibliothek

## Start

```bash
npm install
npm run db:init
npm run kindle:import
npm run metadata:pages
npm run metadata:colors
npm run metadata:covers
npm run metadata:typography
npm run metadata:hardcover
npm run books:list
npm run dev
```

`npm run dev` startet das Regal im lokalen Netz. Nach einem Produktions-Build mit
`npm run build` startet `npm start` dieselbe App ohne Entwicklungsserver.
Der Produktionsserver verwendet standardmäßig Port `3040`; `PORT` und `HOST`
können diesen Wert beziehungsweise die Bind-Adresse überschreiben.

Die optionale Metadatenanreicherung sucht konservativ nach Titel und Autor bei
Open Library und übernimmt nur eindeutige Treffer. Für Bücher ohne Treffer erzeugt
die Oberfläche aus der stabilen Kindle-ID eine Seitenzahl zwischen 300 und 600;
dadurch bleibt die Rückenbreite bei jedem Start gleich.

`npm run metadata:colors` lädt verfügbare Cover, ermittelt deren dominante Farbe,
entsättigt und verdunkelt sie leicht und speichert das Ergebnis in SQLite. Ohne
erreichbares Cover verwendet die Oberfläche weiterhin eine stabile Ersatzfarbe.

### Lokale Typografieanalyse mit LM Studio

Die Typografieanalyse ist ein einmaliger Anreicherungsschritt auf dem Mac. Die
laufende Regal-App benötigt weder LM Studio noch ein KI-Modell. Erfolgreich
getestet ist `google/gemma-4-12b`; die konkrete Quantisierung muss in LM Studio
als vision-fähig ausgewiesen sein. Eine stabile lokale Einrichtung sieht
beispielsweise so aus:

```bash
lms get google/gemma-4-12b
lms ls
lms load <MODEL_KEY_AUS_LMS_LS> --gpu max --context-length 8192 --identifier bookshelf-vision
lms server start
```

Der Server bleibt dabei an `127.0.0.1:1234` gebunden.

Für einen ersten Probelauf mit 25 Covern:

```bash
TYPOGRAPHY_LIMIT=25 npm run metadata:typography
```

Um dieselbe bereits analysierte Pilotgruppe erneut auszuwerten:

```bash
TYPOGRAPHY_REANALYZE=1 TYPOGRAPHY_LIMIT=25 npm run metadata:typography
```

Das Skript rendert für jedes Buch einen Kontaktbogen der erlaubten freien Fonts
und sendet ihn zusammen mit dem Cover ausschließlich an den lokalen
LM-Studio-Endpunkt. Das Modell rankt je drei Kandidaten für Titel und Autor; der
Batch wählt daraus mit einer leichten Diversitätskorrektur und erzwingt über die
Gruppe 80 Prozent durchgehende sowie 20 Prozent getrennte Rückenlayouts.
Gespeichert werden außerdem Schriftstärke, Laufweite, Groß-/Kleinschreibung,
Konfidenz sowie Titel- und Autorfarbe. Bereits analysierte Bücher werden bei
normalen Läufen übersprungen. Die einmalig geladenen Fontdateien liegen im nicht
versionierten Verzeichnis `data/font-cache`.

### Fehlende Cover über Open Library

`npm run metadata:covers` ergänzt Bücher, für die Amazon kein Cover geliefert
hat, konservativ über Open Library. Das Skript verarbeitet immer genau ein Buch
vollständig: Suche, Coverdownload, lokale Datei, dominante Rückenfarbe,
LM-Studio-Typografie und sofortiges SQLite-Update. Erst danach beginnt das
nächste Buch. Zwischen sämtlichen Open-Library-Anfragen liegen mindestens 1,1
Sekunden; erfolglose Suchen werden gespeichert und bei späteren normalen Läufen
übersprungen.

Für einen kleinen Probelauf oder eine bewusste Wiederholung der erfolglosen
Suchen:

```bash
COVER_LIMIT=5 npm run metadata:covers
COVER_RETRY=1 npm run metadata:covers
```

Die Cover werden unter `data/covers` abgelegt und nicht versioniert. Zur Laufzeit
liefert die App sie selbst aus; die App auf der Synology benötigt weder Open
Library noch LM Studio.

### Manuelle Cover-Werkstatt

Für Bücher ohne automatischen Cover-Treffer gibt es ein ausschließlich lokal
erreichbares Hilfsprogramm:

```bash
npm run covers:review
```

Die Oberfläche unter `http://127.0.0.1:3041` listet die noch offenen Bücher.
Eine direkte Bild-URL startet einen Hintergrundauftrag, der das Bild prüft und
lokal speichert, die Rückenfarbe ermittelt, Gemma über LM Studio aufruft und
alle Ergebnisse sofort in SQLite schreibt. Mehrere Aufträge werden nacheinander
verarbeitet; abgeschlossene Bücher werden in der geöffneten Liste ausgegraut.
LM Studio und `google/gemma-4-12b` müssen dafür wie oben beschrieben laufen.

Die Datenbank liegt standardmäßig unter `data/bookshelf.sqlite`. Mit `BOOKSHELF_DATABASE` kann ein anderer Zielpfad und mit `KINDLE_DATABASE` ein anderer Pfad zur Kindle-Datenbank gesetzt werden.

Die lokale Datenbank enthält private Bibliotheksdaten und wird deshalb nicht in
Git eingecheckt. `npm run db:init` legt sie auf einem neuen Rechner wieder an.

### Buchdetails von Hardcover

`npm run metadata:hardcover` reichert die lokale SQLite-Datenbank mit Beschreibung,
Genres, Stimmungen, Tags, Durchschnittsbewertung und vollständiger
Bewertungsverteilung von Hardcover an. Der API-Schlüssel wird ausschließlich aus
`HARDCOVER_API_KEY` in `.env` gelesen und weder in die Datenbank noch in Logs
geschrieben. Die laufende Regal-App greift nicht auf Hardcover zu.

Das Skript versucht zunächst eine exakte ASIN-Zuordnung und verwendet andernfalls
eine konservative Titel-und-Autor-Suche. Unsichere Treffer werden nicht gespeichert;
erfolglose Suchen werden markiert und bei normalen Folgeläufen übersprungen.

Für einen Probelauf oder eine bewusste Wiederholung:

```bash
HARDCOVER_LIMIT=10 npm run metadata:hardcover
HARDCOVER_RETRY=1 npm run metadata:hardcover
HARDCOVER_IDS=217,514 npm run metadata:hardcover
```

Automatisch präsentierte Bücher zeigen zunächst die ruhige Coveransicht. Ein
Antippen von Cover oder Titel öffnet die gespeicherten Hardcover-Details und stoppt
den automatischen Schließtimer. Direkt aus dem Regal angetippte Bücher öffnen die
Detailansicht sofort.

## Installation auf einem VPS

Der aktuelle Anwendungsstand liegt auf dem Branch
`cover-derived-spine-colors`. Eine Erstinstallation besteht aus dem geklonten
Code und den separat übertragenen privaten Laufzeitdaten:

```bash
git clone --branch cover-derived-spine-colors --single-branch \
  https://github.com/kagsteiner/Buecherregal.git
cd Buecherregal
npm ci
npm run build
mkdir -p data/covers
```

Anschließend werden vom Mac ausschließlich diese Daten auf den VPS übertragen:

- `data/bookshelf.sqlite`
- der vollständige Inhalt von `data/covers/`

`data/font-cache` und die `bookshelf.before-*.sqlite`-Sicherungen werden zur
Laufzeit nicht benötigt. Für die Übertragung sollte SFTP statt unverschlüsseltem
FTP verwendet werden. Vor dem Ersetzen einer bereits produktiv verwendeten
SQLite-Datei muss die App auf Quelle und Ziel gestoppt sein; danach wird sie mit
`npm start` neu gestartet.

Für HTTPS lauscht der Reverse Proxy öffentlich auf Port 443 und leitet intern
auf die App weiter. Die App kann dafür beispielsweise ausschließlich an
Loopback gebunden werden:

```bash
HOST=127.0.0.1 PORT=3040 npm start
```

Der Produktionsserver verlangt außerdem ein gemeinsames App-Passwort und ein
mindestens 32 Zeichen langes Geheimnis zum Signieren der 365 Tage gültigen
Anmelde-Cookies. Beide Werte gehören ausschließlich in die nicht versionierte
`.env`-Datei. Als Ausgangspunkt dient `.env.example`:

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

Ein geeignetes Session-Geheimnis lässt sich beispielsweise mit
`openssl rand -hex 32` erzeugen. Das Ändern von `SESSION_SECRET` meldet alle
bislang angemeldeten Geräte ab. `npm start` lädt `.env` nativ über Node 26.

Mit PM2 wird dieselbe Datei so geladen:

```bash
pm2 start src/server.js --name buecherregal \
  --interpreter "$(nvm which 26)" --node-args="--env-file=.env" --time
pm2 save
```

Das Reverse-Proxy-Ziel ist dann `http://127.0.0.1:3040`. Weder LM Studio noch
das Vision-Modell werden auf dem VPS benötigt.

In der mitgelieferten Nginx-Konfiguration ist das Regal unter
`https://srv706843.hstgr.cloud/buecherregal/` eingetragen. Der Build verwendet
relative Asset-, API- und Coverpfade und funktioniert deshalb unverändert auch
lokal unter `/`.

Der Import ist wiederholbar: vorhandene Kindle-Einträge werden anhand ihrer Kindle-ID aktualisiert. Wörterbücher blendet der Import aus, weil sie in der Kindle-App nicht zur normalen Bibliothek gehören. Lesefortschritt wird nur eingetragen, wenn Kindle eine aktuelle und eine maximale Position lokal gespeichert hat.
