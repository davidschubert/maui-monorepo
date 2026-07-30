import { Account, AppwriteException, Client, ID, Query } from 'node-appwrite'
import { createAdminClient, requestLocale, setSessionCookie } from '../../lib/appwrite'
import { registerSchema } from '../../../schemas/auth'

/**
 * Account + Session in einem Request (AdminClient: users.write + sessions.write).
 * Validierung zentral via Zod — ungültiger Body wirft 400.
 */
export default defineEventHandler(async (event) => {
  const appConfig = await getAppConfig(event)
  if (!appConfig.registrationEnabled || appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Registration is currently disabled' })
  }
  // Zweite, MANDANTEN-Ebene (S1): app_config ist EINE Row pro Projekt — im Pool
  // teilen sich alle Communities sie, der Schalter oben kann also nicht pro
  // Community stehen. tenants.openRegistration kann es (control-018).
  assertTenantRegistrationOpen(event)

  const { email, password, name } = await readValidatedBody(event, registerSchema.parse)
  const { account } = createAdminClient(event)

  // Appwrite-Fehler kapseln: doppelte E-Mail (409) sauber melden, Rest generisch —
  // keine Appwrite-Fehlerdetails an den Client leaken.
  let session
  try {
    await account.create({ userId: ID.unique(), email, password, name })
    session = await account.createEmailPasswordSession({ email, password })
  }
  catch (error) {
    if (error instanceof AppwriteException) {
      if (error.code === 409) {
        throw createError({ status: 409, statusText: 'Email already registered' })
      }
      // Das E-Mail-Format ist bereits Zod-validiert → ein 4xx von Appwrite hier
      // ist faktisch eine Email-Policy-Ablehnung (Wegwerf-/Free-Provider, seit
      // Appwrite 1.9.5 in Auth → Security konfigurierbar). 422 → eigene Meldung.
      if (error.code >= 400 && error.code < 500) {
        throw createError({ status: 422, statusText: 'Email not allowed' })
      }
    }
    throw createError({ status: 400, statusText: 'Registration failed' })
  }

  setSessionCookie(event, session.secret, session.expire)
  await logAuthEvent(event, 'user.login', { userId: session.userId, name, method: 'signup' })

  /**
   * BEITRITT (A5, Davids Entscheidung 1 vom 2026-07-29). Wer sich AUF DEM
   * MANDANTEN-HOST ein Konto anlegt, tritt dieser Community bei — deutlicher
   * wird eine Absicht nicht, und der Feed sagt drei Zeilen weiter unten
   * ohnehin schon „ist der Community beigetreten". Jetzt steht es auch in
   * `community_members`, also in etwas, das man entziehen kann.
   *
   * Hier ist der beste Moment, den es gibt: das Label steht damit VOR dem
   * ersten Seitenaufruf und lange vor dem Realtime-Socket.
   *
   * `sessionSecret` + `userId` explizit — die Session ist eine Millisekunde alt
   * und steckt noch nicht im Request-Cookie (dasselbe Problem wie bei der
   * Verifizierungs-Mail unten). No-Op auf Kontroll-Hosts und in Silo-Apps.
   * Der Registrierungs-Schalter der Community ist oben schon geprüft
   * (assertTenantRegistrationOpen); das Control Plane prüft ihn erneut selbst.
   */
  await joinSite(event, 'registration', { sessionSecret: session.secret, userId: session.userId })

  // Nicht-blockierende E-Mail-Verifizierung (maui.auth.verification): die
  // Bestätigungs-Mail geht über die Instanz-SMTP raus, der User ist trotzdem
  // sofort eingeloggt. Best-effort — ein Mail-Fehler darf den Signup nie
  // kippen. Der frische Session-Secret ist noch nicht im Request-Cookie,
  // daher ein eigener Client statt createSessionClient(event).
  const config = useRuntimeConfig(event)
  const appConfig2 = useAppConfig() as { maui?: { auth?: { verification?: boolean } } }
  if (appConfig2.maui?.auth?.verification && config.public.appUrl) {
    try {
      const client = new Client()
        .setEndpoint(config.public.appwriteEndpoint)
        .setProject(config.public.appwriteProjectId)
        .setSession(session.secret)
      const locale = requestLocale(event)
      if (locale) client.setLocale(locale)
      await new Account(client).createVerification({ url: `${config.public.appUrl}/verify` })
    }
    catch (error) {
      console.error('[core] Verifizierungs-Mail nach Signup fehlgeschlagen:', error)
    }
  }

  // Activity-Feed: „ist der Community beigetreten" (best-effort). Bewusst NUR
  // hier — der OTP-Flow legt User schon beim Token-Versand an (unverifiziert),
  // dort wäre der Eintrag verfrüht.
  await recordActivity(event, {
    actorId: session.userId,
    actorName: name,
    type: 'user.joined',
    objectType: 'user',
    objectId: session.userId,
    link: '/',
  })
  // Meilenstein („Die Community hat N Mitglieder") — best-effort wie der Feed
  const { users } = createAdminClient(event)
  const totalUsers = await users.list({ queries: [Query.limit(1)] }).then(r => r.total).catch(() => 0)
  await maybeRecordMilestone(event, { type: 'milestone.members', count: totalUsers })

  return { ok: true }
})
