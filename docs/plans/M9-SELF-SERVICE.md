# M9 — Workspace-Self-Service (Kundenbereich im Studio)

Status: **IN UMSETZUNG mit den Empfehlungs-Antworten** (2026-07-19 —
David: „baue alles nacheinander ab"; die drei Check-in-Fragen unten sind
mit ihren Empfehlungen beantwortet, Veto jederzeit möglich: OTP-Einladung ·
Kundenbereich `/workspace` in der Studio-App · Kündigung übers
Stripe-Portal). Baut auf M8 auf
(Workspaces, Plan-Katalog, Checkout+Fulfillment+Grant-Sync sind FERTIG und
Test-Mode-abgenommen). M9 macht aus `ownerEmail` einen echten Studio-User:
Kunden sehen ihren Workspace, zahlen selbst und verwalten ihr Abo — der
Betreiber hört auf, Checkout-Stellvertreter zu sein. Horizont-2-Schritt
der [Plattform-Strategie](MULTI-SITE-PLATFORM-STRATEGIE.md) (D0), noch
KEIN Horizont-3-SaaS (keine Self-Service-Registrierung, keine
Site-Provisionierung aus Kundenhand).

## Leitidee: kleinster Schnitt, der Kunden zahlungsfähig macht

M8 hat bewiesen: Zahlung → Grants funktioniert. Der einzige strukturelle
Mangel ist die Identität — der Stripe-Customer hängt am Betreiber-Login
statt am Kunden. M9 behebt genau das plus die minimale UI dafür:

1. **workspace_members** (Migration studio-007): `workspaceId`, `userId`,
   `role` (`owner`, v1 nur dieser Wert), Unique auf (workspaceId, userId).
   Damit wird der GDPR-Contributor endlich möglich (userId-keyed) — der
   M8-Aufschub wird eingelöst.
2. **Einladung statt Registrierung:** der Betreiber legt den Workspace an
   (wie heute) und lädt den Owner per E-Mail ein. Die Einladung nutzt den
   BESTEHENDEN Core-OTP-Flow (kein neues Auth-Verfahren): Mail mit Link auf
   `/login/code`, vorausgefüllte E-Mail; beim ersten Login wird der User
   angelegt (das tut der OTP-Flow heute schon) und über einen
   Invitation-Token (Table `workspace_invites`, einmalig, 7 Tage) an den
   Workspace gebunden.
3. **Kundenbereich `/workspace`** (studio-App, NICHT unter /dashboard —
   das bleibt Betreiber-Terrain): Plan + Status, „Plan ändern" (dieselbe
   Checkout-Route, aber Customer = eingeloggter Owner), „Abrechnung
   verwalten" (billing-Portal-Session — Kündigung/Zahlungsmethode/Rechnungen
   laufen über Stripe, Portal ist seit M8 konfiguriert), Sites read-only
   (Name, URL, Health-Badge, aktive Features).
4. **Zugriffsmodell:** keine neuen Labels/Capabilities — Membership IST die
   Berechtigung. Server-Routen unter `/api/workspace/*` prüfen die
   workspace_members-Row des eingeloggten Users (Guard-Util
   `requireWorkspaceMember(event, workspaceId)`). Betreiber (`sites.manage`)
   behält alle M8-Wege unverändert.
5. **Billing-Identität:** neue Checkouts/Portal-Sessions laufen über
   `ensureCustomer(owner)`. Bestehende Workspace-Subscriptions des
   Betreibers bleiben gültig (metadata.workspaceId entscheidet, nicht der
   Customer) — kein Migrationszwang, Auslauf natürlich.

## Bewusst NICHT in M9 (Abgrenzung)

- Keine Self-Service-Registrierung („Workspace kaufen ohne Einladung") —
  Horizont 3.
- Keine Site-Provisionierung durch Kunden (create-site bleibt Betreiber +
  Runner, § 8).
- Keine Mehr-Member-Rollenverwaltung (Table ist vorbereitet, UI nicht).
- Kein Entitlement-Editing durch Kunden — Features kommen NUR aus dem Plan.

## Pakete (je mit Check-in)

- **T1** Migrationen studio-007/008 (workspace_members, workspace_invites)
  + Typen + GDPR-Contributor (Export: Memberships; Löschung: Rows löschen,
  Workspace selbst bleibt — kaufmännische Daten).
- **T2** Einladungs-Flow: Betreiber-UI („Owner einladen" am Workspace),
  Invite-Mail (Core-Mailer), Accept-Route bindet userId, Status-Badge
  (eingeladen/aktiv).
- **T3** Kundenbereich /workspace: Guard, Übersichtsseite, Checkout mit
  Owner-Customer, Portal-Button (billing createPortalSession
  wiederverwenden).
- **T4** E2E im Test-Mode (zweiter Browser als Kunde), Doku, Memory.

## Offene Fragen an David (Check-in)

1. **Einladung per OTP-Login ok?** (Empfehlung: ja — nutzt den bewiesenen
   Core-Flow, kein Passwort-Setup nötig. Alternative: Passwort-Registrierung
   über Invite-Link.)
2. **Wo lebt der Kundenbereich?** (Empfehlung: gleiche Studio-App unter
   `/workspace` — ein Deployment, ein Auth. Alternative: eigene
   Kunden-Domain später in Horizont 3.)
3. **Dürfen Owner den Portal-Weg zum Kündigen nutzen** (Empfehlung: ja —
   Stripe-Portal macht Kündigung/Zahlungsmethode/Rechnungen, wir bauen
   nichts nach) **oder soll Kündigen nur der Betreiber können?**
