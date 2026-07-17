/**
 * Cases der Portfolio-Landing — bewusst als typisierte Daten im App-Code
 * (kein CMS/Layer: Inhalte ändern sich selten, Deploy = Contentpflege).
 * Ein Journal/Blog wird später ein EIGENER Feature-Layer (Beschluss
 * 2026-07-17), genau wie pages — die Site hier bleibt dünn.
 */

export interface CaseText {
  de: string
  en: string
}

export interface PortfolioCase {
  slug: string
  title: string
  year: string
  role: CaseText
  stack: string[]
  /** Kurzzeile für die Landing-Liste. */
  teaser: CaseText
  /** Absätze der Detailseite. */
  paragraphs: CaseText[]
  link?: { href: string, label: string }
}

export const CASES: PortfolioCase[] = [
  {
    slug: 'maui-platform',
    title: 'Maui Platform',
    year: '2026',
    role: { de: 'Konzept, Architektur & Entwicklung', en: 'Concept, architecture & development' },
    stack: ['Nuxt 4', 'Appwrite', 'TypeScript', 'pnpm Workspaces', 'Stripe'],
    teaser: {
      de: 'Multi-Site-Plattform: ein Monorepo, aus dem beliebig viele Sites entstehen — mit Control Plane, Feature-Katalog und signierten Entitlements.',
      en: 'Multi-site platform: one monorepo that spawns any number of sites — with a control plane, feature catalog and signed entitlements.',
    },
    paragraphs: [
      {
        de: 'Die Maui Platform ist ein Nuxt-4-Monorepo mit einem Fundament-Layer und komponierbaren Feature-Layern (Kommentare, Medien, Events, Tickets, Billing …). Jede Site wählt ihre Features per Manifest; ein CI-Check erzwingt die Konsistenz von Verträgen, Abhängigkeiten und Migrationen.',
        en: 'Maui Platform is a Nuxt 4 monorepo with a foundation layer and composable feature layers (comments, media, events, tickets, billing …). Every site picks its features via manifest; a CI check enforces consistency of contracts, dependencies and migrations.',
      },
      {
        de: 'Das Control Plane (Studio) provisioniert neue Sites als Job — Appwrite-Projekt, Schema-Migrationen, Register-Eintrag und Feature-Zuteilung entstehen aus einem Klick. Entitlements werden als signierte Ed25519-Dokumente zugestellt und serverseitig durchgesetzt.',
        en: 'The control plane (Studio) provisions new sites as a job — Appwrite project, schema migrations, registry entry and feature grants spring from a single click. Entitlements are delivered as signed Ed25519 documents and enforced server-side.',
      },
    ],
  },
  {
    slug: 'comments',
    title: 'Comments',
    year: '2026',
    role: { de: 'Design & Fullstack-Entwicklung', en: 'Design & full-stack development' },
    stack: ['Nuxt 4', 'Appwrite Realtime', 'SSR-Auth', 'Playwright'],
    teaser: {
      de: 'Realtime-Kommentarsystem mit SSR-Auth, Moderations-Workflows, KI-Assist und einbettbarem Widget — vollständig self-hosted.',
      en: 'Real-time commenting system with SSR auth, moderation workflows, AI assist and an embeddable widget — fully self-hosted.',
    },
    paragraphs: [
      {
        de: 'Verschachtelte Kommentare mit Votes, @-Mentions und Markdown, live über einen geteilten Realtime-Socket. Die Auth läuft SSR-first über httpOnly-Session-Cookies — das Web-SDK spricht im Browser ausschließlich Realtime.',
        en: 'Nested comments with votes, @-mentions and markdown, live via a shared realtime socket. Auth is SSR-first through httpOnly session cookies — the web SDK only ever speaks realtime in the browser.',
      },
      {
        de: 'Moderation als Zweiphasen-Flow (Ausblenden + Meldungs-Auflösung), Presence-Anzeigen („tippt gerade"), E-Mail-Digests und eine Playwright-Suite, die in der CI gegen eine echte Wegwerf-Appwrite läuft.',
        en: 'Moderation as a two-phase flow (hide + report resolution), presence indicators (“typing…”), email digests and a Playwright suite that runs in CI against a real throwaway Appwrite instance.',
      },
    ],
  },
  {
    slug: 'maui-photos',
    title: 'maui.photos',
    year: '2026',
    role: { de: 'Editorial Design & Entwicklung', en: 'Editorial design & development' },
    stack: ['Nuxt 4', 'media-Layer', '@nuxt/fonts', 'OKLCH-Themes'],
    teaser: {
      de: 'Fine-Art-Fotografie-Site im dunklen Editorial-Look — die Galerie lebt im Dashboard, die Site liest sie über den media-Layer der Plattform.',
      en: 'Fine-art photography site in a dark editorial look — the gallery lives in the dashboard, the site reads it through the platform’s media layer.',
    },
    paragraphs: [
      {
        de: 'Cormorant Garamond, großzügige Kacheln, kaum UI — die Bilder tragen die Seite. Uploads, Reihenfolge und Featured-Auswahl pflegt das Plattform-Dashboard; veröffentlicht wird ohne Deploy.',
        en: 'Cormorant Garamond, generous tiles, barely any UI — the images carry the page. Uploads, ordering and featured picks are managed in the platform dashboard; publishing needs no deploy.',
      },
      {
        de: 'Die Site ist zugleich der Erstabnehmer des media-Layers: dieselben Verträge, die hier eine Galerie rendern, machen auf jeder anderen Plattform-Site eine Mediathek auf.',
        en: 'The site doubles as the first consumer of the media layer: the same contracts that render a gallery here open up a media library on any other platform site.',
      },
    ],
  },
]

export function findCase(slug: string): PortfolioCase | undefined {
  return CASES.find(entry => entry.slug === slug)
}
