/**
 * Die Emoji-Auswahl hinter `:` im Beitrags-Editor (`UEditorEmojiMenu`).
 *
 * WARUM EINE EIGENE LISTE: `UEditorEmojiMenu` bringt KEINEN Datensatz mit —
 * `items` ist Pflicht, sonst ist das Menü leer (nachgesehen in
 * @nuxt/ui 4.10, EditorEmojiMenu.vue). Die Alternative wäre ein vollständiger
 * Unicode-Datensatz (@emoji-mart/data & Co., ~500 KB); der stünde in keinem
 * Verhältnis zu einem Composer, in dem Emoji Beiwerk sind. Diese Auswahl ist
 * bewusst KLEIN und deckt ab, was in einem Community-Beitrag tatsächlich
 * vorkommt. Sie ist ADDITIV erweiterbar.
 *
 * WARUM DIE NAMEN NICHT ÜBER i18n LAUFEN: `name` ist der Shortcode, also ein
 * EIGENNAME (`:thumbsup:`) — dieselbe Regel wie bei den Theme-Namen. Gesucht
 * wird ohnehin nicht über den Namen allein: `filterFields` umfasst auch `tags`,
 * und dort steht je ein deutsches UND ein englisches Wort. Wer `:dank` tippt,
 * findet 🙏 genauso wie mit `:thanks`.
 *
 * Emoji sind reiner TEXT — sie durchlaufen den Markdown-Serialisierer als
 * gewöhnliche Zeichen und brauchen im Renderer keine Entsprechung. Genau
 * deshalb ist dieses Menü unbedenklich, während das Erwähnungs-Menü
 * (`UEditorMentionMenu`) draußen bleibt: das erzeugt eine eigene
 * Klammer-Syntax, die unser Parser roh durchreichen würde
 * (Messung: docs/plans/COMPOSER-UEDITOR.md).
 */
export interface PostEmojiItem {
  name: string
  emoji: string
  shortcodes: string[]
  tags: string[]
}

function item(name: string, emoji: string, ...tags: string[]): PostEmojiItem {
  return { name, emoji, shortcodes: [name], tags }
}

export const POST_EMOJI_ITEMS: PostEmojiItem[] = [
  item('smile', '🙂', 'laecheln', 'smile', 'freundlich'),
  item('grin', '😀', 'lachen', 'grin', 'freude'),
  item('joy', '😂', 'traenen', 'joy', 'lustig'),
  item('wink', '😉', 'zwinkern', 'wink'),
  item('sweat_smile', '😅', 'schwitzen', 'sweat', 'knapp'),
  item('thinking', '🤔', 'nachdenken', 'thinking', 'frage'),
  item('neutral', '😐', 'neutral', 'egal'),
  item('confused', '😕', 'verwirrt', 'confused'),
  item('sad', '😢', 'traurig', 'sad', 'weinen'),
  item('sob', '😭', 'heulen', 'sob'),
  item('angry', '😠', 'wuetend', 'angry', 'aerger'),
  item('scream', '😱', 'schock', 'scream', 'erschrocken'),
  item('sleepy', '😴', 'muede', 'sleepy', 'schlafen'),
  item('sunglasses', '😎', 'cool', 'sonnenbrille', 'sunglasses'),
  item('nerd', '🤓', 'nerd', 'brille'),
  item('blush', '😊', 'freuen', 'blush', 'schuechtern'),
  item('heart_eyes', '😍', 'verliebt', 'heart'),
  item('kiss', '😘', 'kuss', 'kiss'),
  item('tongue', '😛', 'zunge', 'tongue'),
  item('shush', '🤫', 'psst', 'leise', 'shush'),
  item('facepalm', '🤦', 'facepalm', 'kopf'),
  item('shrug', '🤷', 'schulterzucken', 'shrug', 'keineahnung'),
  item('wave', '👋', 'winken', 'wave', 'hallo'),
  item('thumbsup', '👍', 'daumen', 'thumbsup', 'gut', 'zustimmung'),
  item('thumbsdown', '👎', 'daumenrunter', 'thumbsdown', 'schlecht'),
  item('clap', '👏', 'applaus', 'clap', 'klatschen'),
  item('pray', '🙏', 'danke', 'thanks', 'bitte', 'pray'),
  item('muscle', '💪', 'stark', 'muscle', 'kraft'),
  item('ok_hand', '👌', 'okay', 'ok', 'passt'),
  item('point_right', '👉', 'zeigen', 'point', 'hinweis'),
  item('raised_hands', '🙌', 'jubel', 'hurra', 'raised'),
  item('handshake', '🤝', 'handschlag', 'handshake', 'einig'),
  item('heart', '❤️', 'herz', 'heart', 'liebe'),
  item('sparkling_heart', '💖', 'herzchen', 'sparkling'),
  item('broken_heart', '💔', 'herzschmerz', 'broken'),
  item('fire', '🔥', 'feuer', 'fire', 'stark'),
  item('star', '⭐', 'stern', 'star', 'favorit'),
  item('sparkles', '✨', 'funkeln', 'sparkles', 'neu'),
  item('tada', '🎉', 'party', 'tada', 'feiern'),
  item('gift', '🎁', 'geschenk', 'gift'),
  item('cake', '🎂', 'kuchen', 'cake', 'geburtstag'),
  item('coffee', '☕', 'kaffee', 'coffee', 'pause'),
  item('beer', '🍻', 'bier', 'beer', 'prost'),
  item('pizza', '🍕', 'pizza', 'essen'),
  item('check', '✅', 'haken', 'check', 'erledigt'),
  item('cross', '❌', 'kreuz', 'cross', 'falsch'),
  item('warning', '⚠️', 'warnung', 'warning', 'achtung'),
  item('question', '❓', 'frage', 'question'),
  item('exclamation', '❗', 'ausrufezeichen', 'exclamation'),
  item('bulb', '💡', 'idee', 'bulb', 'einfall'),
  item('bell', '🔔', 'glocke', 'bell', 'hinweis'),
  item('pin', '📌', 'pinnwand', 'pin', 'angeheftet'),
  item('memo', '📝', 'notiz', 'memo', 'schreiben'),
  item('book', '📚', 'buch', 'book', 'lesen'),
  item('mag', '🔍', 'lupe', 'suche', 'mag'),
  item('chart', '📈', 'diagramm', 'chart', 'wachstum'),
  item('calendar', '📅', 'kalender', 'calendar', 'termin'),
  item('clock', '⏰', 'uhr', 'clock', 'zeit'),
  item('rocket', '🚀', 'rakete', 'rocket', 'start'),
  item('bug', '🐛', 'fehler', 'bug', 'kaefer'),
  item('wrench', '🔧', 'werkzeug', 'wrench', 'reparatur'),
  item('lock', '🔒', 'schloss', 'lock', 'sicher'),
  item('link', '🔗', 'kette', 'link', 'verweis'),
  item('mail', '✉️', 'brief', 'mail', 'post'),
  item('phone', '📱', 'handy', 'phone', 'telefon'),
  item('computer', '💻', 'rechner', 'computer', 'laptop'),
  item('house', '🏠', 'haus', 'house', 'zuhause'),
  item('sun', '☀️', 'sonne', 'sun', 'wetter'),
  item('rain', '🌧️', 'regen', 'rain', 'wetter'),
  item('snow', '❄️', 'schnee', 'snow', 'kalt'),
  item('plant', '🌱', 'pflanze', 'plant', 'wachsen'),
  item('dog', '🐶', 'hund', 'dog'),
  item('cat', '🐱', 'katze', 'cat'),
  item('wave_ocean', '🌊', 'welle', 'wave', 'meer'),
  item('globe', '🌍', 'welt', 'globe', 'erde'),
]
