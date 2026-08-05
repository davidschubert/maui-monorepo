/**
 * Die AUTORITÄT über die Vertrauensstufen (F1 Teilpaket 3): der posts-Layer
 * besitzt `member_counters` und beantwortet deshalb, was core fragt
 * (`registerTrustLevelResolver`).
 *
 * Dieselbe Bauart und derselbe Grund wie beim Zähl-Recorder nebenan: core
 * beschreibt die Frage, der Layer mit der Tabelle gibt die Antwort (A14).
 *
 * Fehlt dieser Layer (Silo-App ohne Discussions, Playground, CI-Build), ist der
 * Vertrag unbesetzt und jede Stufe 0 — die drei Stufen-Capabilities werden dort
 * schlicht nie vergeben, und die App verhält sich wie vor diesem Teilpaket.
 */
export default defineNitroPlugin(() => {
  registerTrustLevelResolver(trustLevelOf)
})
