/**
 * WELCHE ZAHLUNGSARTEN BIETET EIN CHECKOUT AN? (F20, Davids Entscheidung
 * 2026-08-03: „nur Karte, SEPA und Rechnung abschalten".)
 *
 * Ohne dieses Feld entscheidet allein das Stripe-DASHBOARD, was im Checkout
 * erscheint. Das ist der Zustand, aus dem F20 entstand: ein einziger Klick
 * dort — auch versehentlich, auch von Stripe als Empfehlung vorgeschlagen —
 * hätte SEPA-Lastschrift oder Kauf-auf-Rechnung eingeschaltet, und damit eine
 * ganze Klasse von Fällen scharf gemacht, die es vorher nicht gab.
 *
 * WARUM NUR KARTE. Verzögerte Zahlungsarten trennen „durch den Checkout" von
 * „bezahlt": `checkout.session.completed` feuert dann mit
 * `payment_status: 'unpaid'`, die Belastung passiert Tage später und kann
 * scheitern. Für ein ABO wäre das verkraftbar (der Webhook zieht das Abo
 * nach), für ein EVENT-TICKET nicht: der Käufer stünde ohne Ticket da und
 * verstünde nicht, warum — er hat ja bezahlt. Karte ist sofort entschieden.
 *
 * DIESE ZEILE ERSETZT DIE PRÜFUNG NICHT. `mayFulfillCheckout` bleibt genau
 * wie sie ist (server/utils/webhookMapping.ts): Erfüllung hängt weiter am
 * `payment_status`, nicht am Event-Namen. Zwei Gründe — Karten-Zahlungen
 * können über 3-D-Secure ebenfalls in `unpaid` landen, und wer diese Liste
 * eines Tages erweitert, soll dabei keine stille Lücke aufreißen.
 *
 * ERWEITERN: hier, nicht an den vier Aufrufstellen. Wer eine Methode
 * aufnimmt, muss vorher wissen, ob sie verzögert abrechnet — und wenn ja, was
 * der Käufer in der Zwischenzeit sieht.
 */
export const CHECKOUT_PAYMENT_METHOD_TYPES: readonly ['card'] = ['card']

/**
 * Verzögert abrechnende Methoden — die, die F20 ausschließt. Reine
 * Dokumentation für den Tag, an dem jemand die Liste oben anfassen will;
 * bewusst KEINE Deny-List im Code: Stripe kennt Dutzende Methoden, eine
 * Ablehnungsliste wäre nie vollständig und damit eine falsche Sicherheit.
 */
export const DEFERRED_PAYMENT_METHODS: readonly string[] = [
  'sepa_debit',
  'customer_balance',
  'sofort',
  'bancontact',
  'ideal',
  'klarna',
]
