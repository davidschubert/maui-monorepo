import { ID, Query } from 'node-appwrite'
import { createAdminClient, createSessionClient } from '../../lib/appwrite'
import { decoySecurityPhrase } from '../../utils/securityPhrase'
import { recoverySchema } from '../../../schemas/auth'
import { AUTH_METHOD_UNAVAILABLE_CODE, instanceAuthFeatureGap } from '../../../shared/authMethodAvailability'

/**
 * Email-OTP anfordern (passwortloser Login). Läuft als GUEST — Appwrite
 * legt unbekannte E-Mails dabei automatisch als User an (Auto-Signup).
 * Die Security-Phrase geht in Mail UND Response — die UI zeigt sie an,
 * damit User die echte Mail von Phishing unterscheiden können.
 *
 * KEINE KONTEN-ENUMERATION (Audit-Befund 8, 2026-08-02): bei GESCHLOSSENER
 * Registrierung antwortete die Route für unbekannte Adressen 403 und für
 * bekannte 200 — damit war sie ein Werkzeug, um Mitgliederlisten gegen eine
 * Community zu prüfen („wer von diesen 500 Adressen hat hier ein Konto?").
 * `recovery.post.ts` macht es seit jeher richtig: identische Antwort in JEDEM
 * Pfad. Genau das gilt hier jetzt auch — die Antwort sieht immer aus wie ein
 * verschickter Code, nur passiert bei unbekannter Adresse eben nichts.
 *
 * DER PREIS, bewusst getragen: wer sich vertippt, wartet auf eine Mail, die
 * nicht kommt. Das ist dieselbe Erfahrung wie beim Passwort-Zurücksetzen, und
 * die Anmeldeseite sagt es auch so („Falls ein Konto existiert …"). Die
 * Alternative wäre, jedem Fremden zu bestätigen, wer hier Mitglied ist.
 */
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, recoverySchema.parse)

  // Auto-Signup würde die Registrierungssperre umgehen: ist die Registrierung
  // zu, dürfen sich nur BESTEHENDE User per Code einloggen — für unbekannte
  // E-Mails keine Neuanlage. „Zu" hat ZWEI Ebenen, und eine genügt: die
  // Instanz-Sperre (app_config/Wartungsmodus, EINE Row pro Projekt) und — seit
  // S1 — die Mandanten-Sperre (tenants.openRegistration, control-018), die im
  // Pool pro Community stehen kann, wo app_config es nicht kann.
  const appConfig = await getAppConfig(event)
  if (!appConfig.registrationEnabled || appConfig.maintenanceMode || !tenantRegistrationOpen(event)) {
    // Exakter Treffer mit explizitem Limit (search ohne Limit könnte den
    // exakten Match jenseits der 25er-Default-Seite verfehlen und einen legitimen
    // bestehenden User fälschlich aussperren). E-Mail ist im Schema bereits
    // normalisiert (lowercase), Appwrite speichert Account-Mails ebenfalls klein.
    const admin = createAdminClient(event)
    const found = await admin.users.list({ queries: [Query.equal('email', email), Query.limit(1)] })
    if (found.total === 0) {
      // STILL aussteigen, nicht 403. `userId` ist eine frische, nie vergebene
      // Id, `phrase` eine Attrappe aus Appwrites EIGENEN Wortlisten
      // (server/utils/securityPhrase.ts — bis F35 war es eine selbstgebaute
      // Liste mit zwei GROSSgeschriebenen Wörtern, an der jede Attrappe auf
      // einen Blick zu erkennen war). Die Antwort trägt jetzt dieselben Felder
      // in derselben Form UND aus derselben Verteilung. Es entsteht
      // kein Konto und es geht keine Mail hinaus; der eingegebene Code läuft
      // danach in dasselbe „Code ungültig" wie ein Tippfehler.
      logEvent('info', 'auth.otp_suppressed_closed_registration', {})
      return { ok: true, userId: ID.unique(), phrase: decoySecurityPhrase() }
    }
  }

  const { account } = createSessionClient(event)

  const token = await account.createEmailToken({
    userId: ID.unique(),
    email,
    phrase: true,
  }).catch((error) => {
    /**
     * KEINE SACKGASSE, WENN DIE INSTANZ DAS FEATURE NICHT HAT (F37,
     * 2026-08-02). `pukalani.auth.otp` ist ein Schalter in der APP — ob
     * „Email OTP" im Appwrite-PROJEKT aktiv ist und ob die Instanz überhaupt
     * Mail versenden kann, entscheidet die Console. Passt beides nicht
     * zusammen, kam bis heute ein generischer 500 heraus und die Anmeldeseite
     * sagte „Code konnte nicht angefordert werden" — der Nutzer probierte es
     * wieder, der Betreiber suchte im Code.
     *
     * Jetzt: 503 mit `data.code`, den der zentrale Handler als `reason` ins
     * Envelope hebt (core/server/error.ts) — die Anmeldeseite macht daraus
     * „hier gerade nicht verfügbar, nimm Passwort/Zurücksetzen". Und EINE
     * benannte Log-Zeile, die dem Betreiber sagt, wo er nachsehen muss;
     * `gap` unterscheidet dort, was der Gast nicht zu wissen braucht.
     *
     * Die Regel selbst ist pur und getestet: shared/authMethodAvailability.ts.
     */
    const gap = instanceAuthFeatureGap(error)
    if (gap) {
      logEvent('error', 'auth.otp_unavailable', { gap })
      throw createError({
        status: 503,
        statusText: 'Passwordless login is unavailable on this instance',
        data: { code: AUTH_METHOD_UNAVAILABLE_CODE },
      })
    }
    throw toH3Error(error, 'Could not send login code')
  })

  return { ok: true, userId: token.userId, phrase: token.phrase }
})
