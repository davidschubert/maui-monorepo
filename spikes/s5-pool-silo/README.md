# Spike S5 — Pool + Silo Mandanten-Kern (Wegwerf)

Begleitet [docs/plans/HORIZONT-3-POOL-SILO-BLUEPRINT.md](../../docs/plans/HORIZONT-3-POOL-SILO-BLUEPRINT.md).
Beweist den **Kern** von Davids Zwei-Tier-Entscheidung (gepoolte Standard-Kunden
+ Silo für Spezialkunden) an reiner Logik, **ohne** echtes Appwrite. Kein
Produkt-Code — validiert die Isolations-Garantie, bevor der Produktions-Umbau
(S3/L5/S4) beginnt.

## Was getestet wird (`node test.mjs` → 15/15)

| Naht | Vertrag |
|---|---|
| 1 | `resolveTenant(host)` → `pool` \| `silo` \| `null` (**keine** Default-Site) |
| 3 | `scopeQuery`/`scopeRow` erzwingen `tenantId` im Pool, No-Op im Silo |
| 4 | `FakeTablesDB` mit Row-Permissions als **zweite** Verteidigungslinie |

## Die entscheidende Aussage (T5)

Der Pool teilt *eine* DB über alle Standard-Kunden. Die naheliegende Sorge
(Circle-Stil-Risiko): ein vergessener `tenantId`-Filter leakt Fremdkunden-Daten.
**T5 beweist, dass das nicht passiert** — selbst mit leerer Query (Scope
vergessen) gibt die Permission-Ebene nur Zeilen des eigenen Tenants heraus,
weil jede Zeile `read`-Labels des Tenants trägt und der Session-Client nur seine
eigenen Labels hat. Der `scopeQuery`-Filter ist Performance/Klarheit; die **harte
Grenze** sind die Row-Permissions. Genau das rechtfertigt, bei der bestehenden
Appwrite-Row-Permission-Architektur zu bleiben statt „shared-DB nackt".

## Was der Spike NICHT abdeckt (bewusst)

- Echte Appwrite-Row-Permissions (Label-Rollen, Performance bei vielen Tenants)
  — das klärt der spätere Pool-Datenpfad an *einer* echten Tabelle.
- Custom-Domain-TLS + Cookie-Modell pro Silo — das ist der S3-Browser-PoC.
- Realtime-Filterung im Pool — offener Punkt aus dem Blueprint (§6).

Diese stehen im Blueprint als nächste Bausteine; S5 sichert nur, dass das
Daten-/Isolationsmodell selbst trägt.
