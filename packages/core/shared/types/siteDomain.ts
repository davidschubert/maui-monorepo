/**
 * EIGENE DOMAIN FÜR EINE SILO-APP — der VERTRAG zwischen den beiden Seiten.
 *
 * Er steht in core und nicht im control-Layer, und das ist die ganze
 * A14-Begründung dieses Blocks: die eine Seite ist der `domains`-Layer, den
 * eine Silo-App zieht (portfolio, comments) — die andere ist das Control
 * Plane, das eine Silo-App NIE mitliefert. Ein gemeinsamer Typ, der im
 * control-Layer stünde, wäre ein Import aus einem Layer, der in dieser App gar
 * nicht existiert.
 *
 * Was hier steht, ist reine FORM: Feldnamen und Wertebereiche. Die REGELN
 * (was gilt als Domain, wie sieht der TXT-Nachweis aus, wann wird eine Domain
 * aktiv) liegen unverändert im control-Layer (`shared/customDomain.ts`) — dort
 * werden sie gebraucht, dort sind sie unit-getestet, und dort bleiben sie.
 * Eine zweite Fassung im Silo hätte genau eine Wirkung: zwei Wahrheiten
 * darüber, was eine gültige Domain ist.
 *
 * ── WARUM DIE STATUS-LISTE HIER NOCH EINMAL STEHT ─────────────────────────
 * Weil der Silo sie ANZEIGT und nicht rechnet. Sie ist Teil der Antwort, die
 * über die Naht kommt — der Silo muss die Werte benennen können (Übersetzung,
 * Farbe, „was ist der nächste Schritt"), er darf sie aber nie selbst setzen.
 * Der Wertebereich ist mit `CUSTOM_DOMAIN_STATUSES` im control-Layer identisch
 * und per Test daran genagelt (`packages/control/tests/siteDomain.test.ts`) —
 * ein Auseinanderlaufen bricht dort, nicht erst beim Kunden.
 */

export const SITE_DOMAIN_STATUSES = [
  'none',
  'pending_dns',
  'pending_cert',
  'pending_platform',
  'active',
  'error',
] as const
export type SiteDomainStatus = (typeof SITE_DOMAIN_STATUSES)[number]

/** FAIL-CLOSED wie überall an dieser Spalte: unbekannt ⇒ „keine Domain". */
export function resolveSiteDomainStatus(value: string | null | undefined): SiteDomainStatus {
  return (SITE_DOMAIN_STATUSES as readonly string[]).includes(value ?? '')
    ? value as SiteDomainStatus
    : 'none'
}

/**
 * Die MAGERE Auskunft für die Middleware: „unter welcher Adresse bin ich zu
 * Hause, und welche Adressen gehören mir sonst noch?"
 *
 * Sie ist bewusst von `SiteDomainState` getrennt und wird von einer eigenen
 * Route bedient, die KEIN Nutzer-JWT verlangt — die Middleware läuft vor jedem
 * Request, auch für Gäste. Genau deshalb darf hier NICHTS Vertrauliches
 * hinein: kein Verifikations-Token, kein Fehlertext, keine Anleitung. Alles,
 * was drinsteht, steht ohnehin im DNS und in jedem Zertifikatsprotokoll.
 */
export interface SiteDomainAddress {
  /** Die Adresse, auf die alle anderen zeigen. '' = unbekannt (fail-soft). */
  canonicalHost: string
  /** Die Pukalani-Subdomain; sie bleibt Rückfall und verschwindet nie. */
  fallbackHost: string
  /**
   * ALLE Hosts, die zu dieser Website gehören (Subdomain + beide Formen der
   * eigenen Domain). Die Middleware leitet NUR von diesen um — ein Host, den
   * wir nicht kennen (`localhost`, eine Vorschau-Adresse, eine IP), wird in
   * Ruhe gelassen. Ohne diese Liste würde die lokale Entwicklung beim ersten
   * Aufruf auf die Kundendomain geworfen.
   */
  knownHosts: string[]
}

/** Der volle Zustand für das Dashboard — mit Token, Anleitung und Fehlertext. */
export interface SiteDomainState extends SiteDomainAddress {
  domain: string
  status: SiteDomainStatus
  /** Text für den Betreiber ('' = keiner). */
  error: string
  /** Beide Formen, die eingetragene zuerst. */
  forms: string[]
  verifiedAt: string | null
  activatedAt: string | null
  /** Ist bei ploi hinterlegt, wohin die Domain gehängt wird? Ohne das hält
   *  der Zertifikatsschritt an — die Seite soll das SAGEN, nicht raten. */
  ploiConfigured: boolean
  instructions: {
    txtName: string
    txtValue: string
    cnameTarget: string
    serverIps: string[]
    apexForm: string | null
    wwwForm: string | null
  }
}

/** Antwort auf „Prüfen": der geschriebene Zustand + die Bitte an die Runtime,
 *  den letzten Schritt (Appwrite-Web-Platform, F45) zu erledigen. */
export interface SiteDomainVerifyResult extends SiteDomainState {
  needsPlatformRegistration?: boolean
}
