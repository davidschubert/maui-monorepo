---
seo:
  title: Maui Docs
  description: Die Dokumentation des Maui Monorepos — Nuxt 4 Layer-Architektur mit Appwrite, von der Architektur bis zum Guide für neue Apps.
---

::u-page-hero{class="dark:bg-gradient-to-b from-neutral-900 to-neutral-950"}
---
orientation: horizontal
---
#title
Das [Maui]{.text-primary} Monorepo, dokumentiert.

#description
Nuxt 4 Monorepo mit zentralem Core Layer und komponierbaren Feature Layers auf Appwrite-Basis. Auth, Design-Fundament, Realtime und Utilities werden einmal gebaut — und per `extends` in beliebig viele Apps eingebunden.

#links
  :::u-button
  ---
  to: /erste-schritte
  size: xl
  trailing-icon: i-lucide-arrow-right
  ---
  Loslegen
  :::

  :::u-button
  ---
  icon: i-simple-icons-github
  color: neutral
  variant: outline
  size: xl
  to: https://github.com/davidschubert/maui-monorepo
  target: _blank
  ---
  Zum Repository
  :::

#default
  :::prose-pre
  ---
  filename: apps/meine-app/nuxt.config.ts
  code: |
    export default defineNuxtConfig({
      extends: [
        '../../packages/comments', // früher gelistet = höhere Priorität
        '../../packages/core',
        '../../packages/system',
      ],
    })
  ---

  ```ts [apps/meine-app/nuxt.config.ts]
  export default defineNuxtConfig({
    extends: [
      '../../packages/comments', // früher gelistet = höhere Priorität
      '../../packages/core',
      '../../packages/system',
    ],
  })
  ```
  :::
::

::u-page-section{class="dark:bg-neutral-950"}
#title
Was dich hier erwartet

#features
  :::u-page-feature
  ---
  icon: i-lucide-rocket
  to: /erste-schritte
  ---
  #title
  Erste Schritte

  #description
  Was Maui ist, wie du das Monorepo lokal aufsetzt und wie die Verzeichnisstruktur aufgebaut ist.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-layers
  to: /architektur/layer-modell
  ---
  #title
  Architektur

  #description
  Das 3-Ebenen-Layer-Modell, Feature-/Site-Manifeste, die Appwrite-SSR-Integration, Migrationen und Realtime.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-package
  to: /features/uebersicht
  ---
  #title
  Feature Layers

  #description
  Der Katalog aller Layer — Themes, Kommentare & Moderation, Admin, Billing & Co. — und die Core-Bausteine dahinter.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-compass
  to: /guides/neue-app
  ---
  #title
  Guides

  #description
  Schritt-für-Schritt: neue App per `create-site`, neuer Feature Layer, Coding-Konventionen, Tests & CI.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-database
  to: /architektur/appwrite
  ---
  #title
  SSR-first mit Appwrite

  #description
  Zwei Server-Clients, Session-Cookies, TablesDB, Row-Level-Permissions — CRUD ausschließlich über `server/api/*`.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-radio
  to: /architektur/realtime-und-presence
  ---
  #title
  Realtime & Presence

  #description
  Ein geteilter, JWT-authentifizierter WebSocket für Rows, Presence und Config-Flags — plus das Presence-Modell.
  :::
::

::u-page-section{class="dark:bg-gradient-to-b from-neutral-950 to-neutral-900"}
  :::u-page-c-t-a
  ---
  links:
    - label: Erste Schritte
      to: '/erste-schritte'
      trailingIcon: i-lucide-arrow-right
    - label: Konzept lesen (CONCEPT.md)
      to: 'https://github.com/davidschubert/maui-monorepo/blob/main/docs/CONCEPT.md'
      target: _blank
      variant: subtle
      icon: i-lucide-book-open
  title: Einmal bauen, überall nutzen.
  description: Diese Docs sind der kuratierte Einstieg. Die Tiefe — Konzept, Roadmap, Theme-System, RBAC — liegt als Markdown direkt daneben in docs/*.md.
  class: dark:bg-neutral-950
  ---
  :::
::
