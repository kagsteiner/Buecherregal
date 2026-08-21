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
npm run books:list
npm run dev
```

`npm run dev` startet das Regal im lokalen Netz. Nach einem Produktions-Build mit
`npm run build` startet `npm start` dieselbe App ohne Entwicklungsserver.

Die optionale Metadatenanreicherung sucht konservativ nach Titel und Autor bei
Open Library und übernimmt nur eindeutige Treffer. Für Bücher ohne Treffer erzeugt
die Oberfläche aus der stabilen Kindle-ID eine Seitenzahl zwischen 300 und 600;
dadurch bleibt die Rückenbreite bei jedem Start gleich.

Die Datenbank liegt standardmäßig unter `data/bookshelf.sqlite`. Mit `BOOKSHELF_DATABASE` kann ein anderer Zielpfad und mit `KINDLE_DATABASE` ein anderer Pfad zur Kindle-Datenbank gesetzt werden.

Die lokale Datenbank enthält private Bibliotheksdaten und wird deshalb nicht in
Git eingecheckt. `npm run db:init` legt sie auf einem neuen Rechner wieder an.

Der Import ist wiederholbar: vorhandene Kindle-Einträge werden anhand ihrer Kindle-ID aktualisiert. Wörterbücher blendet der Import aus, weil sie in der Kindle-App nicht zur normalen Bibliothek gehören. Lesefortschritt wird nur eingetragen, wenn Kindle eine aktuelle und eine maximale Position lokal gespeichert hat.
