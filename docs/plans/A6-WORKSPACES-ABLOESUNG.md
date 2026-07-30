# A6 — die Community wird das zahlende Objekt, `workspaces` fällt weg

**Status:** geplant, nicht ausgeführt · **Entschieden:** 2026-07-29 (David) ·
**Blockiert:** A2 (Stripe-Live) · **Blockiert teilweise:** E8 ([Umbenennung auf `community`](UMBENENNUNG-AUF-COMMUNITY.md))

> Liegt in `docs/plans/`, weil es NOCH NICHT gebaut ist. Nach der Ausführung:
> Datei nach `docs/archiv/`, Reste nach `docs/OPEN-ITEMS.md`.

## Der Befund, der das auslöst

Alle vier Checkout-Routen hängen an `workspaces`. Das Wort `tenant` kommt im
gesamten Geldpfad nicht vor. Und `tenants.plan` — das Feld, aus dem Quota
(`tenantQuota.ts`) und Produkt-Sichtbarkeit (`tenantPlanProducts.ts`) ihre
Antworten ziehen — wird nur an drei Stellen geschrieben:

| Schreiber | Wert |
|---|---|
| `onboardingProvision.ts` (Wizard) | `pro` für 14 Tage, dann `basic` |
| `trialSweep.ts` | zurück auf `basic` |
| `tenants/[id].patch.ts` (Betreiber-Auswahlfeld) | was David wählt |

**Ein Pool-Kunde könnte bezahlen und bliebe auf `basic`.** Aus den Codepfaden
abgeleitet, nicht am lebenden System durchgespielt — der Beweis ist Schritt 0
unten und braucht keinen echten Kauf.

## Korrektur zu meiner ersten Einschätzung

Ich habe David gesagt, mit `workspaces` verschwinde auch „der ganze
`entitlements`-Apparat samt Signatur-Dokumenten". **Das war zu schnell.** Es sind
zwei Dinge, die nur ähnlich heißen:

- `packages/billing/server/utils/entitlements.ts` — „hat DIESER NUTZER ein
  aktives Abo?" (pro Person, z. B. bezahlte Kurse in comments). Bleibt.
- Control-Plane-Tabelle `entitlements` + signierte Dokumente
  (`core/server/utils/entitlementDocument.ts`, `featureGates.ts` dritte
  UND-Bedingung) — „welche Produkte darf DIESE INSTALLATION betreiben?". Das ist
  die **Lizenz-Mechanik der Studio-Seite**, nicht Teil der Abrechnung.
  `workspaces` war nur ihr Rechnungs-Behälter.

Heute ist sie unbenutzt (0 Zeilen `entitlements`, 0 Zeilen `feature_catalog`,
kein ausgestelltes Dokument — deshalb greift `featureGates` überall den Zweig
„kein Dokument = neutral AN"). Sie zu löschen wäre kein Ausfall, würde der
Studio-Seite aber ihren einzigen Hebel nehmen, einem Kunden mit eigener
Installation Produkte freizugeben oder zu entziehen.

**Entschieden: stehen lassen und parken.** Aus dem Menü nimmt sie der
Dashboard-Umbau ohnehin heraus; sie kostet nichts, solange niemand ein Dokument
ausstellt. Wenn der erste Studio-Kunde kommt, ist sie da.

## Reihenfolge — erweitern, umschalten, verengen

Stripe ist ein EXTERNES System mit eigenem Zustand. Es gibt keinen Weg, das in
einem Commit zu drehen. Jeder Schritt ist für sich deploybar und rückwärts
verträglich.

**Schritt 0 — den Befund beweisen, ohne Stripe zu klicken.** Die
Fulfillment-Funktion direkt mit einem erfundenen Abo-Ereignis aufrufen und
prüfen, was sie schreibt: heute `workspaces.plan`, nichts an der Community. Das
ist ehrlicher als ein Klick-Durchlauf (der belegt nur diesen einen Fall), kostet
keine Kartendaten — und der Test bleibt danach als Netz liegen.

**Schritt 1 — Spalten anlegen (additiv, ruhend).** `tenants` bekommt die
Vertragsfelder (control-021: `stripeCustomerId`, `stripeSubscriptionId`,
`billingStatus`). Ohne Wirkung, ohne Code. **Muss vor dem Code laufen** —
`createRow<TenantRow>` verlangt alle Spalten (siehe CLAUDE.md).

**Schritt 2 — der Webhook schreibt zusätzlich `tenants.plan`.** Das ist der
Schritt, der die Zahlung ankommen lässt, und er ist allein schon wertvoll: ab
hier wirkt ein Kauf, auch wenn alles andere noch beim Alten bleibt. Der
bestehende Cross-Sub-Guard (`workspace.stripeSubscriptionId`, OPEN-ITEMS #6b)
muss dabei mitwandern, sonst kann ein zweites Abo ein erstes überschreiben.

**Schritt 3 — Kauf und Portal wandern in die Community.** Neue Routen in
`apps/platform` (der Owner kauft in seinem Dashboard bzw. im Kundenbereich),
`packages/billing` kommt dafür in die extends von platform. Die alten
Workspace-Routen bleiben zunächst und antworten weiter.

**Schritt 4 — Bestand übernehmen.** Produktiv ist es eine Zeile
(`workspaces: 1 = „test"`, `workspace_members: 0`), lokal ein Testkonto. Also
kein Migrationsskript, sondern ein protokollierter Einzelvorgang.

**Schritt 5 — verengen.** Workspace-Routen, `/workspace`-Seiten und die
Menüpunkte raus; Tabellen `workspaces`, `workspace_members`,
`workspace_invites` zuletzt löschen, nach einer Nacht ohne Auffälligkeiten.
**Erst hier ist der Weg zurück versperrt.**

**Schritt 6 — Dashboard neu einsortieren** (Studio / Plattform / Betreiber).
Wird jetzt billig, weil das Objekt weg ist, das in keine Gruppe passte.

## Was dabei nicht kaputtgehen darf

- **Der Webhook bleibt idempotent** und wirft bei transienten Fehlern, statt
  still zu returnen (Regel aus dem Cross-Sub-Fix, Memory
  `cross-sub-guard-teilfix`). Ein verschluckter Webhook ist ein verlorener Kauf.
- **`lastStripeEventAt`** schützt vor Ereignissen, die verdreht ankommen — beim
  Umbau nicht verlieren.
- **Die Testphase** (`trialEndsAt` + `trialSweep`) und ein bezahltes Abo dürfen
  sich nicht widersprechen: der Sweep muss bezahlte Communities auslassen (tut
  er heute für Workspaces — die Regel muss mitwandern).
- **Der GDPR-Contributor** von workspaces (M9-T4) muss vor dem Löschen der
  Tabellen umgehängt sein, sonst fehlt ein Stück Konto-Löschung.
- **`site_members` ist produktiv leer** — der Owner der Demo-Community hat keine
  Zeile. Wer „der Owner kauft" baut, muss vorher entscheiden, woher die
  Owner-Eigenschaft kommt (heute: Betreiber-Label, nicht Site-Rolle).

## Entschieden (2026-07-30, David)

1. **Das Abo hängt an der COMMUNITY** (`communities.stripeCustomerId/
   stripeSubscriptionId/billingStatus`), mit **gesperrter Besitz-Übergabe**,
   solange ein Abo läuft und der neue Owner keine Zahlungsmethode hat. Ein Owner
   mit zwei Communities hat zwei Abos — das passt zur Preisgestaltung pro
   Community.
2. **Gekauft wird im Dashboard der Community.** Dort steht der Owner, wenn er an
   ein Limit stößt; `my.pukalani.app` zeigt Rechnungen und Zahlungsmethode.
3. **Die `entitlements`-Mechanik bleibt stehen** und verschwindet nur aus dem
   Menü (Claudes Entscheidung, angekündigt): sie ist die Lizenz-Mechanik der
   Studio-Seite, nicht Teil der Abrechnung, und heute kostenlos.

## Ein zweiter Geldfluss ist benannt, aber nicht Teil von A6

David will mittelfristig, dass ein Community-Owner **von seinen Mitgliedern**
Geld nehmen kann (monatliche Beiträge). Das ist Geldfluss 2, ein eigenes Produkt
mit eigener Mechanik (Stripe Connect) und eigenen rechtlichen Fragen — geparkt
als OPEN-ITEMS **F7**, nach dem Go-Live.

**Was das für A6 heißt:** die Spalten dieses Plans beschreiben ausdrücklich
Geldfluss 1 (Community zahlt an Pukalani). Namen entsprechend eindeutig halten
(`billingStatus`, nicht `paymentStatus`), damit Geldfluss 2 später daneben passt
statt hineingemischt zu werden. Eine eigene Tabelle für Mitgliedsbeiträge, nicht
dieselbe.

