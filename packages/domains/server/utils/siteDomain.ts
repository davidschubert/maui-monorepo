/**
 * DIE SILO-SEITE DER NAHT — „welche Adresse ist meine?" (control-036).
 *
 * Eine Silo-App weiß von sich aus NICHTS über ihre eigene Domain: die Wahrheit
 * steht in der `websites`-Zeile im Control-Plane-Projekt, zu dem diese App
 * weder Schlüssel noch Kenntnis hat. Sie fragt also — mit dem Service-Secret
 * (beweist: unser Deployment) und, wo ein Mensch handelt, zusätzlich mit dem
 * Appwrite-JWT dieses Menschen (beweist: dieses Konto, dieses Projekt).
 *
 * Ihre eigene Identität ist dabei `config.public.appwriteProjectId` — die
 * unveränderliche F6-Identität, an der auch die Entitlements hängen. Kein
 * Slug, kein Hostname: beides darf sich ändern, ohne dass eine Domain umzieht.
 *
 * ── DIE EINE REGEL, DIE MAN HIER NICHT BRECHEN DARF ───────────────────────
 * **Fail-soft heißt: KEINE Umleitung.** Wenn die Naht nicht antwortet — Secret
 * fehlt, Control Plane down, Netz weg —, dann ist die Antwort auf „welche
 * Adresse ist meine?" nicht etwa „die alte" und schon gar nicht „irgendeine",
 * sondern GAR KEINE. Die Middleware leitet dann nichts um, und die App
 * antwortet weiter unter jedem Host, unter dem sie erreichbar ist.
 *
 * Der Fehler, den das verhindert, wäre der teuerste denkbare: eine Umleitung
 * auf eine Adresse, die vielleicht gerade nicht (mehr) bedient wird, mit
 * `Cache-Control` im Browser des Kunden. Ein Ausfall des Control Plane darf
 * eine laufende Silo-Site nicht mitreißen — sie hat mit ihm im Normalbetrieb
 * nichts zu tun.
 */
import type { H3Event } from 'h3'
import type { SiteDomainAddress, SiteDomainState, SiteDomainVerifyResult } from '../../../core/shared/types/siteDomain'

/** Die Projekt-Id DIESER App — ihre Identität im Website-Register. */
export function siteProjectId(event: H3Event): string {
  return useRuntimeConfig(event).public.appwriteProjectId || ''
}

/**
 * Zwischenspeicher der Adress-Auskunft.
 *
 * 30 Sekunden, dieselbe Zahl wie beim Tenant-Resolver des Pools — und aus
 * demselben Grund: die Frage wird bei JEDEM Request gestellt, die Antwort
 * ändert sich alle paar Monate. Ohne Zwischenspeicher hinge jede Seite dieser
 * App an der Erreichbarkeit des Control Plane.
 *
 * NEGATIV WIRD EBENFALLS GEMERKT, aber KÜRZER (5 s): nach einer Freischaltung
 * soll die Umleitung zügig greifen, und ein Ausfall soll sich nicht eine halbe
 * Minute festsetzen. Gemerkt wird er trotzdem — sonst schlüge jeder Request
 * einzeln gegen ein totes Control Plane und die Seite würde langsam statt
 * unbeeindruckt.
 */
const TTL_MS = 30_000
const TTL_MISS_MS = 5_000
let cached: { value: SiteDomainAddress | null, until: number } | null = null
/** Ein gleichzeitiger Ruf genügt — sonst schickt ein kalter Start bei
 *  parallelen Requests ebenso viele Anfragen los. */
let inFlight: Promise<SiteDomainAddress | null> | null = null

export function invalidateSiteDomainAddress(): void {
  cached = null
}

async function fetchAddress(event: H3Event): Promise<SiteDomainAddress | null> {
  const projectId = siteProjectId(event)
  if (!projectId) return null
  if (!controlServiceAvailable(event)) return null
  try {
    return await callControlService<SiteDomainAddress>(event, '/api/control/site/domain/host', { projectId })
  }
  catch {
    // Bewusst STUMM im Rückgabewert und laut im Log: `callControlService`
    // protokolliert die Unerreichbarkeit bereits. Was hier zählt, ist, dass
    // der Aufrufer `null` bekommt und nichts umleitet.
    return null
  }
}

/** Die Adresse dieser Site — gecacht, fail-soft, wirft nie. */
export async function siteDomainAddress(event: H3Event): Promise<SiteDomainAddress | null> {
  const now = Date.now()
  if (cached && cached.until > now) return cached.value
  if (inFlight) return await inFlight

  inFlight = fetchAddress(event)
    .then((value) => {
      cached = { value, until: Date.now() + (value ? TTL_MS : TTL_MISS_MS) }
      return value
    })
    .finally(() => { inFlight = null })
  return await inFlight
}

/* ── Die Wege, an denen ein Mensch steht (JWT) ─────────────────────────── */

export async function readSiteDomainState(event: H3Event): Promise<SiteDomainState> {
  const jwt = await mintServiceJwt(event)
  return await callControlService<SiteDomainState>(event, '/api/control/site/domain/state', {
    jwt, projectId: siteProjectId(event),
  })
}

export async function setSiteDomain(event: H3Event, domain: string): Promise<SiteDomainState> {
  const jwt = await mintServiceJwt(event)
  const state = await callControlService<SiteDomainState>(event, '/api/control/site/domain/set', {
    jwt, projectId: siteProjectId(event), domain,
  })
  invalidateSiteDomainAddress()
  return state
}

/**
 * PRÜFEN — die zwei Hände, die zusammen eine Domain freischalten.
 *
 * Das CONTROL PLANE besitzt die Zeile, prüft DNS und bestellt bei ploi. Es
 * kann im Appwrite-Projekt DIESER App nichts registrieren (kein Schlüssel).
 * DIESE APP läuft in ihrem Projekt und kann dort die Web-Platform für die
 * Kundendomain anlegen (F45 — ohne sie ist dort jede Realtime tot, und der
 * WebSocket-Handschlag verrät es nicht). Sie darf die Zeile aber nicht
 * schreiben.
 *
 * Also: Naht rufen → wenn `needsPlatformRegistration`, die Platform anlegen →
 * das Ergebnis über `activate` zurückmelden. Die zweite Runde ist kein Umweg,
 * sondern die Quittung: das Control Plane setzt `active` NUR aus
 * `pending_platform` heraus, also nur nachdem es selbst gemessen hat.
 *
 * ZWEITES JWT für die Quittung: das erste ist 120 s gültig und hat DNS, ploi
 * und Appwrite hinter sich — es kann abgelaufen sein. Ein neues kostet einen
 * Appwrite-Aufruf, ein abgelaufenes kostet die Freischaltung.
 */
export async function verifySiteDomain(event: H3Event): Promise<SiteDomainState> {
  const projectId = siteProjectId(event)
  const jwt = await mintServiceJwt(event)
  const checked = await callControlService<SiteDomainVerifyResult>(event, '/api/control/site/domain/verify', {
    jwt, projectId,
  })
  invalidateSiteDomainAddress()
  if (!checked.needsPlatformRegistration) return checked

  // GEMESSEN WIRD DIE ORIGIN-PROBE, nicht der Eintragungs-Versuch (F54): auf
  // Produktions-Keys scheitert die Projects-API am Scope, die schlüssellose
  // Probe aber nicht. Stehen die Platforms schon (von Hand angelegt), ist das
  // hier ein Erfolg — vorher war es einer, der nie ankam.
  const platforms = await ensureAppwriteOrigins(event, checked.forms)
  if (platforms.added.length) {
    logEvent('info', 'website.custom_domain_platforms_added', {
      projectId, hosts: platforms.added.join(','),
    })
  }

  const jwt2 = await mintServiceJwt(event)
  const activated = await callControlService<SiteDomainState>(event, '/api/control/site/domain/activate', {
    jwt: jwt2,
    projectId,
    ...(platforms.ok ? {} : { error: platforms.message }),
  })
  invalidateSiteDomainAddress()
  return activated
}

/**
 * Die Domain abgeben.
 *
 * REIHENFOLGE WIE ÜBERALL: erst die WAHRHEIT (die Zeile, über die Naht), dann
 * das Aufräumen. Die Formen werden VORHER geholt — nach dem Entfernen weiß
 * niemand mehr, welche Hostnamen bei Appwrite abzuräumen sind (die Antwort
 * trägt bewusst den leeren Zustand).
 */
export async function removeSiteDomain(event: H3Event): Promise<SiteDomainState> {
  const projectId = siteProjectId(event)
  const before = await readSiteDomainState(event)

  const jwt = await mintServiceJwt(event)
  const after = await callControlService<SiteDomainState>(event, '/api/control/site/domain/remove', {
    jwt, projectId,
  })
  invalidateSiteDomainAddress()

  if (before.forms.length) {
    await removeAppwriteWebPlatforms(event, before.forms).catch(() => null)
  }
  return after
}
