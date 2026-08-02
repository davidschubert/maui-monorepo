import { randomInt } from 'node:crypto'

/**
 * DIE ATTRAPPEN-SICHERHEITSPHRASE — für den OTP-Pfad, in dem bewusst NICHTS
 * passiert (siehe server/api/auth/otp.post.ts).
 *
 * ── Der Befund (Nacht-Audit 2026-08-02, F35) ──────────────────────────────
 * Die Attrappe stammte aus einer SELBST ausgedachten Wortliste. Der alte
 * Kommentar nannte das eine „ehrliche Grenze" („wer beide Listen kennt, könnte
 * an EINEM Wort erkennen …"). Nachgemessen ist es viel schlimmer als das:
 * Appwrite baut die Phrase in `src/Appwrite/Auth/Phrase.php` aus einem
 * GROSSgeschriebenen Adjektiv und einem KLEINgeschriebenen Substantiv
 * („Radiant zebra"), unsere Attrappe schrieb BEIDE Wörter groß („Amber
 * Anchor"). Die Unterscheidung brauchte also gar keine Wortliste — die
 * Groß-/Kleinschreibung des zweiten Wortes verriet in 100 % der Fälle, dass
 * keine Mail unterwegs ist. Genau die Konten-Enumeration, die der
 * Attrappen-Pfad verhindern sollte, war damit weiterhin möglich.
 * Obendrein lagen nur 6 von 16 Adjektiven und 1 von 16 Substantiven
 * überhaupt in Appwrites Listen.
 *
 * ── Die Lösung: Appwrites Liste, VERBATIM ─────────────────────────────────
 * Quelle: `/usr/src/code/src/Appwrite/Auth/Phrase.php`, Appwrite **1.9.6**
 * (aus dem laufenden Container ausgelesen, nicht abgetippt). Buchstabengetreu
 * übernommen, EINSCHLIESSLICH der Dubletten in der Substantivliste
 * („umbrella", „globe", „xylograph" stehen dort je zweimal) — Appwrite zieht
 * mit `array_rand`, eine Dublette hat also die doppelte Wahrscheinlichkeit.
 * Wer die Dubletten „aufräumt", baut genau den statistischen Unterschied
 * wieder ein, den diese Datei beseitigen soll. Nicht sortieren, nicht kürzen,
 * nicht deduplizieren.
 *
 * ── Die abgewogene Rest-Gefahr: DRIFT ─────────────────────────────────────
 * Der alte Kommentar lehnte die Kopie ab, weil sie beim nächsten
 * Appwrite-Update auseinanderlaufen könnte. Das stimmt — aber es ist die
 * ungleich kleinere Gefahr: Drift entsteht nur, wenn Appwrite die Liste
 * ÄNDERT, und sie verrät dann höchstens die hinzugekommenen Wörter. Der
 * bisherige Zustand verriet jede einzelne Attrappe sofort. Bei einem
 * Appwrite-Upgrade gehört diese Datei deshalb auf die Prüfliste; der
 * Vergleich ist ein Einzeiler:
 *
 *   docker exec appwrite cat /usr/src/code/src/Appwrite/Auth/Phrase.php
 *
 * (`packages/core/tests/securityPhrase.test.ts` nagelt Form und Umfang fest,
 * damit ein unbedachtes „Aufhübschen" der Listen auffällt.)
 */

/** Appwrite 1.9.6, `Phrase::generate()` — verbatim. */
const PHRASE_ADJECTIVES = [
  'Abundant', 'Adaptable', 'Adventurous', 'Affectionate', 'Agile', 'Amiable', 'Amazing',
  'Ambitious', 'Amicable', 'Amusing', 'Astonishing', 'Attentive', 'Authentic', 'Awesome',
  'Balanced', 'Beautiful', 'Bold', 'Brave', 'Bright', 'Bubbly', 'Calm', 'Capable', 'Charismatic',
  'Charming', 'Cheerful', 'Clever', 'Colorful', 'Compassionate', 'Confident', 'Cooperative',
  'Courageous', 'Courteous', 'Creative', 'Curious', 'Dazzling', 'Dedicated', 'Delightful',
  'Determined', 'Diligent', 'Dynamic', 'Easygoing', 'Effervescent', 'Efficient', 'Elegant',
  'Empathetic', 'Energetic', 'Enthusiastic', 'Exuberant', 'Faithful', 'Fantastic', 'Fearless',
  'Flexible', 'Friendly', 'Fun-loving', 'Generous', 'Gentle', 'Genuine', 'Graceful', 'Gracious',
  'Happy', 'Hardworking', 'Harmonious', 'Helpful', 'Honest', 'Hopeful', 'Humble', 'Imaginative',
  'Impressive', 'Incredible', 'Inspiring', 'Intelligent', 'Joyful', 'Kind', 'Knowledgeable',
  'Lively', 'Lovable', 'Lovely', 'Loyal', 'Majestic', 'Magnificent', 'Mindful', 'Modest',
  'Passionate', 'Patient', 'Peaceful', 'Perseverant', 'Playful', 'Polite', 'Positive',
  'Powerful', 'Practical', 'Precious', 'Proactive', 'Productive', 'Punctual', 'Quick-witted',
  'Radiant', 'Reliable', 'Resilient', 'Resourceful', 'Respectful', 'Responsible', 'Sensitive',
  'Serene', 'Sincere', 'Skillful', 'Soothing', 'Spirited', 'Splendid', 'Steadfast', 'Strong',
  'Supportive', 'Sweet', 'Talented', 'Thankful', 'Thoughtful', 'Thriving', 'Tranquil',
  'Trustworthy', 'Upbeat', 'Versatile', 'Vibrant', 'Vigilant', 'Warmhearted', 'Welcoming',
  'Wholesome', 'Witty', 'Wonderful', 'Zealous',
] as const

/** Appwrite 1.9.6, `Phrase::generate()` — verbatim, Dubletten inklusive. */
const PHRASE_NOUNS = [
  'apple', 'banana', 'cat', 'dog', 'elephant', 'fish', 'guitar', 'hat', 'ice cream', 'jacket',
  'kangaroo', 'lemon', 'moon', 'notebook', 'orange', 'piano', 'quilt', 'rabbit', 'sun', 'tree',
  'umbrella', 'violin', 'watermelon', 'xylophone', 'yogurt', 'zebra', 'airplane', 'ball',
  'cloud', 'diamond', 'eagle', 'fire', 'giraffe', 'hammer', 'island', 'jellyfish', 'kiwi',
  'lamp', 'mango', 'needle', 'ocean', 'pear', 'quasar', 'rose', 'star', 'turtle', 'unicorn',
  'volcano', 'whale', 'xylograph', 'yarn', 'zephyr', 'ant', 'book', 'candle', 'door', 'envelope',
  'feather', 'globe', 'harp', 'insect', 'jar', 'kite', 'lighthouse', 'magnet', 'necklace', 'owl',
  'puzzle', 'queen', 'rainbow', 'sailboat', 'telescope', 'umbrella', 'vase', 'wallet',
  'xylograph', 'yacht', 'zeppelin', 'accordion', 'brush', 'chocolate', 'dolphin', 'easel',
  'fountain', 'globe', 'hairbrush', 'iceberg', 'jigsaw', 'kettle', 'leopard', 'marble', 'nutmeg',
  'obstacle', 'penguin', 'quiver', 'raccoon', 'sphinx', 'trampoline', 'utensil', 'velvet',
  'wagon', 'xerox', 'yodel', 'zipper',
] as const

/** Nur für den Test: die beiden Listen, so wie sie gezogen werden. */
export const APPWRITE_PHRASE_WORDS = {
  adjectives: PHRASE_ADJECTIVES as readonly string[],
  nouns: PHRASE_NOUNS as readonly string[],
}

/**
 * Eine Phrase, die aus derselben Verteilung stammt wie Appwrites echte.
 * `randomInt` statt `Math.random`, weil die Attrappe nicht vorhersagbar sein
 * darf — sonst wäre sie an ihrer Reihenfolge erkennbar.
 */
export function decoySecurityPhrase(): string {
  return `${PHRASE_ADJECTIVES[randomInt(PHRASE_ADJECTIVES.length)]} ${PHRASE_NOUNS[randomInt(PHRASE_NOUNS.length)]}`
}
