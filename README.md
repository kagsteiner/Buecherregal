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
npm run metadata:typography
npm run books:list
npm run dev
```

`npm run dev` startet das Regal im lokalen Netz. Nach einem Produktions-Build mit
`npm run build` startet `npm start` dieselbe App ohne Entwicklungsserver.

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

Die Datenbank liegt standardmäßig unter `data/bookshelf.sqlite`. Mit `BOOKSHELF_DATABASE` kann ein anderer Zielpfad und mit `KINDLE_DATABASE` ein anderer Pfad zur Kindle-Datenbank gesetzt werden.

Die lokale Datenbank enthält private Bibliotheksdaten und wird deshalb nicht in
Git eingecheckt. `npm run db:init` legt sie auf einem neuen Rechner wieder an.

Der Import ist wiederholbar: vorhandene Kindle-Einträge werden anhand ihrer Kindle-ID aktualisiert. Wörterbücher blendet der Import aus, weil sie in der Kindle-App nicht zur normalen Bibliothek gehören. Lesefortschritt wird nur eingetragen, wenn Kindle eine aktuelle und eine maximale Position lokal gespeichert hat.
