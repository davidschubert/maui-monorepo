/**
 * DIE NAHT IN DIE ANDERE RICHTUNG — das Control Plane ruft die Silo-App an
 * (control-036).
 *
 * ── WOFÜR ÜBERHAUPT ──────────────────────────────────────────────────────
 * Die Freischaltung einer Domain hat einen letzten Schritt, den NUR diese App
 * tun kann: die Appwrite-Web-Platform in IHREM Projekt (F45). Steht der
 * Betreiber dabei in seiner Konsole (`control.pukalani.app/dashboard/websites`)
 * und drückt „Prüfen", ist dort niemand, der ein JWT dieses Silos hätte — die
 * Konsole läuft in einem anderen Appwrite-Projekt.
 *
 * Ohne diesen Rückruf würde die Betreiber-Oberfläche in `pending_platform`
 * stehen bleiben und der Betreiber müsste sich zusätzlich im Silo anmelden.
 * Das wäre kein ploi-Panel, aber es wäre ein zweiter Handgriff für etwas, das
 * die Maschine kann.
 *
 * ── WARUM DAS NICHT DER ABGELEHNTE FALL AUS CLAUDE.md IST ────────────────
 * Dort steht eine bewusste Absage an eine Naht control→platform (die
 * Zahlungswarnung, C15). Ihre Gründe waren: ein ZWEITES Secret, ein
 * Dienst-Endpunkt auf einem öffentlichen MEHR-MANDANTEN-Host, ein GELDPFAD,
 * der bei einem Ausfall Stripe-Wiederholungen auslöst — und Sofortigkeit, die
 * neben einer 14-Tage-Frist wertlos ist.
 *
 * Hier trifft nichts davon zu: dasselbe Secret-Paar (kein zweites), ein SILO
 * (ein Mandant, kein fremder Kunde auf demselben Host), kein Geld, und die
 * Sofortigkeit ist der ganze Zweck — der Betreiber steht vor dem Knopf. Der
 * Vergleich lohnt sich trotzdem, deshalb steht er hier: die Absage war keine
 * Regel gegen die Richtung, sondern gegen diese vier Kosten.
 *
 * ── UND WARUM DIE ROUTE TROTZDEM FAST NICHTS ANNIMMT ─────────────────────
 * Wer das Secret hat, darf hier NICHT bestimmen, welche Hostnamen als
 * Appwrite-Origin zugelassen werden — das wäre die Erlaubnis, eine fremde
 * Adresse mit dem Appwrite-Projekt dieses Silos sprechen zu lassen. Die
 * Hostnamen holt die Route deshalb selbst beim Control Plane ab, aus der
 * `websites`-Zeile. Der Aufruf sagt nur „schau nach", nicht „nimm das".
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

const SERVICE_HEADER = 'x-pukalani-onboarding-secret'

/** Beide Seiten gehasht — sonst verrät schon die Länge etwas, und
 *  `timingSafeEqual` verlangt gleich lange Puffer. */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Gate + Aufrufer-Prüfung, spiegelbildlich zu `requireOnboardingCaller` im
 * Control Plane: 404 wenn die Naht nicht konfiguriert ist (die Route soll für
 * Fremde nicht einmal existieren), 401 bei falschem Secret.
 */
export function requireControlCaller(event: H3Event): void {
  const config = useRuntimeConfig(event) as { onboardingServiceSecret?: string }
  const expected = (config.onboardingServiceSecret || '').trim()
  if (!expected) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  const provided = getHeader(event, SERVICE_HEADER) || ''
  if (!provided || !secretsMatch(provided, expected)) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
}
