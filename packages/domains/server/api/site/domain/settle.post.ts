import { requireControlCaller } from '../../../utils/controlCaller'
import { invalidateSiteDomainAddress, siteProjectId } from '../../../utils/siteDomain'
import type { SiteDomainAddress } from '../../../../../core/shared/types/siteDomain'

/**
 * DER LETZTE SCHRITT, ANGESTOSSEN VON DER BETREIBER-KONSOLE (control-036).
 *
 * Die Konsole hat gerade DNS geprüft, den Alias gesetzt und das Zertifikat
 * bekommen — jetzt fehlt nur noch die Appwrite-Web-Platform, und die kann nur
 * diese App anlegen (F45: sie hat den Schlüssel ihres Projekts, das Control
 * Plane nicht). Also fragt die Konsole hier an.
 *
 * ── DER RUMPF IST LEER, UND DAS IST DIE SICHERUNG ────────────────────────
 * Naheliegend wäre gewesen, die Hostnamen einfach mitzuschicken — die Konsole
 * kennt sie ja. Genau das wäre die Lücke: wer das Service-Secret hat, könnte
 * damit einen BELIEBIGEN Hostnamen als Appwrite-Origin dieses Projekts
 * eintragen und ihn anschließend mit unserem Appwrite sprechen lassen.
 *
 * Die Hostnamen holt diese Route deshalb SELBST beim Control Plane, aus der
 * `websites`-Zeile ihres eigenen Projekts. Der Aufruf sagt „schau nach", der
 * Inhalt kommt aus der Wahrheit.
 *
 * ── UND SIE ARBEITET NUR IN EINER EINZIGEN STUFE ─────────────────────────
 * `pending_platform`. Jeder andere Zustand ist ein 409. Damit lässt sich diese
 * Route nicht als Dauer-Werkzeug benutzen: sie tut genau dann etwas, wenn das
 * Control Plane selbst gemessen hat, dass alles davor steht.
 *
 * Zurück geht das ERGEBNIS, nicht der Zustand: schreiben darf hier niemand,
 * das tut die Konsole mit ihrer eigenen Berechtigung.
 */
export default defineEventHandler(async (event) => {
  requireControlCaller(event)

  const projectId = siteProjectId(event)
  // FRISCH gelesen, nicht aus dem 30-s-Zwischenspeicher: der Zustand hat sich
  // eine Sekunde zuvor geändert, und der Cache wäre hier genau falsch.
  const address = await callControlService<SiteDomainAddress>(event, '/api/control/site/domain/host', { projectId })

  if (address.status !== 'pending_platform' || !address.forms.length) {
    throw createError({ status: 409, statusText: 'Domain is not ready', data: { code: 'domain_not_ready' } })
  }

  // F54: eintragen versuchen, ERFOLG über die schlüssellose Origin-Probe
  // messen — die Projects-API scheitert auf Produktions-Keys am Scope.
  const result = await ensureAppwriteOrigins(event, address.forms)
  invalidateSiteDomainAddress()
  logEvent(result.ok ? 'info' : 'warn', 'website.custom_domain_settled', {
    projectId,
    hosts: address.forms.join(','),
    added: result.added.join(','),
    detail: result.message.slice(0, 200),
  })
  return { ok: result.ok, message: result.message, added: result.added }
})
