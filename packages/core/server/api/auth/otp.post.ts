import { randomInt } from 'node:crypto'
import { ID, Query } from 'node-appwrite'
import { createAdminClient, createSessionClient } from '../../lib/appwrite'
import { recoverySchema } from '../../../schemas/auth'

/**
 * Eine Sicherheitsphrase, die nach einer echten aussieht — für den Pfad, in
 * dem bewusst NICHTS passiert (s. Kopf des Handlers). Zwei großgeschriebene
 * Wörter, dieselbe Form wie Appwrites eigene.
 *
 * EHRLICHE GRENZE: die Wortliste ist unsere, nicht Appwrites. Wer beide kennt,
 * könnte an einem Wort erkennen, dass keine Mail unterwegs ist. Das ist ein
 * deutlich schmalerer Spalt als der vorherige 403/200-Unterschied, und die
 * Alternative — Appwrites Liste nachbauen — wäre eine Kopie, die beim nächsten
 * Appwrite-Update still auseinanderläuft. Steht als Restposten in OPEN-ITEMS.
 */
const DECOY_ADJECTIVES = ['Amber', 'Bright', 'Calm', 'Clever', 'Golden', 'Gentle', 'Happy', 'Kind', 'Lucky', 'Quiet', 'Rapid', 'Silent', 'Silver', 'Sunny', 'Swift', 'Warm']
const DECOY_NOUNS = ['Anchor', 'Bridge', 'Canyon', 'Compass', 'Falcon', 'Garden', 'Harbor', 'Island', 'Lantern', 'Meadow', 'Mountain', 'Otter', 'River', 'Summit', 'Thunder', 'Willow']

function decoySecurityPhrase(): string {
  return `${DECOY_ADJECTIVES[randomInt(DECOY_ADJECTIVES.length)]} ${DECOY_NOUNS[randomInt(DECOY_NOUNS.length)]}`
}

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
      // Id, `phrase` eine plausible Attrappe (s. o.) — die Antwort trägt
      // dieselben Felder in derselben Form wie eine erfolgreiche. Es entsteht
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
  }).catch((error) => { throw toH3Error(error, 'Could not send login code') })

  return { ok: true, userId: token.userId, phrase: token.phrase }
})
