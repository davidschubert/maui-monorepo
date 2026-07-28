# Agenten-Regeln → siehe CLAUDE.md

**Die Regeln für dieses Repository stehen vollständig in [CLAUDE.md](CLAUDE.md).**
Lies sie dort, unabhängig davon, welches Werkzeug dich startet (Claude Code,
Codex, ein anderer Agent).

## Warum diese Datei nur zeigt statt zu erklären

Bis zum 2026-07-28 war `AGENTS.md` eine **Kopie** von `CLAUDE.md` — und sie war
auseinandergelaufen: 190 statt 334 Zeilen, Appwrite noch als 1.9.5 statt 1.9.6,
und es fehlten unter anderem die Datentür (`tenantDb`), der Kompositions-Layer
`packages/blueprint`, die Host-Umbenennung auf `control.` sowie die
Pool-Produkt-Gates. Ein Agent, der aus der Kopie gearbeitet hätte, hätte gegen
Regeln gebaut, die es nicht mehr gibt.

Zwei gepflegte Regelwerke sind eines zu viel. Deshalb: **eine Quelle, ein
Zeiger.** Wenn dein Werkzeug einen anderen Dateinamen erwartet, legt es besser
einen weiteren Zeiger an, als den Inhalt zu duplizieren.

## Kurzorientierung

- Regeln, Konventionen, Fallen: [CLAUDE.md](CLAUDE.md)
- Was ist offen, was kommt als Nächstes: [docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md)
- Wo steht welches Dokument: [docs/README.md](docs/README.md)
- Architektur im Detail: [docs/CONCEPT.md](docs/CONCEPT.md)
