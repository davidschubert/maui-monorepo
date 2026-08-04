/**
 * Die core-Seite des Zähl-Vertrags (F1 Stufe 4): „ist das Profil ausgefüllt?".
 *
 * WARUM CORE UND NICHT DER ABZEICHEN-LAYER: das Profil lebt in den
 * Account-prefs (A1 — es gibt bewusst keine `profiles`-Tabelle), und die
 * gehören dem core-Layer. Ein Produkt-Layer, der `prefs.bio` selbst liest,
 * hätte sich an eine Datenform gebunden, die ihm nicht gehört.
 *
 * KEINE ABFRAGE: die prefs des Handelnden stehen schon im Request-Kontext
 * (Auth-Middleware). Diese Quelle kostet damit nichts — anders als die
 * zählenden Quellen in `posts`/`comments`/`moderation`.
 *
 * „AUSGEFÜLLT" heißt BEIDES: ein Text über sich UND ein Bild. Nur eines von
 * beiden ist ein halbes Profil, und ein Abzeichen dafür wäre ein Lob für
 * nichts.
 */
export default defineNitroPlugin(() => {
  registerUserCounterProvider('core', (event) => {
    const prefs = event.context.user?.prefs
    const complete = Boolean(prefs?.bio?.trim()) && Boolean(prefs?.avatarUrl?.trim())
    return { [COUNTER_PROFILE_COMPLETE]: complete ? 1 : 0 }
  })
})
