// Gedeeld script voor de scenes (starting-soon, brb, ending) van alle spellen.
//
// Opties via de URL, bijvoorbeeld retail/scenes/starting-soon.html?at=20:15&title=Almost%20there
//   at        starttijd van de stream (alleen starting-soon, standaard 19:45): de klok telt hier naartoe
//   min       als de starttijd al geweest is (of bereikt wordt) is de stream te laat: de scène wordt
//             boos en de klok telt dit aantal minuten af (standaard 10)
//   late      forceert de boze scène, om hem te bekijken
//   title     vervangt de hoofdtitel
//   subtitle  vervangt de ondertitel
//   chat=off  verbergt de chat (bijvoorbeeld als je de overlay er al overheen legt)
//   debug     toont de gereserveerde zones, nepberichten in de chat en de muzieknoten, zonder Twitch-verbinding
//
// De druid danst en de muzieknoten verschijnen alleen als de muziekspeler een nummer afspeelt.
import "./dance.js"; // tempo van de dans
import { watchNowPlaying } from "./ytm.js";
import { getSession } from "./auth.js";
import { TwitchHub } from "./hub.js";
import { addChatMessage, addSystemLine } from "./chat.js";
import { startViewerCount } from "./viewers.js";

const DEFAULT_START = "19:45";
const DEFAULT_MINUTES = 10;
const TICK_MS = 250;

const params = new URLSearchParams(location.search);
const pad = (n) => String(n).padStart(2, "0");

document.body.classList.toggle("debug", params.has("debug"));

for (const id of ["title", "subtitle"]) {
  const text = params.get(id);
  if (text) document.getElementById(id).textContent = text;
}

// Aftelklok naar de starttijd (?at=, standaard 19:45). Is die al geweest als de pagina laadt, dan
// is de streamer te laat: de scène wordt boos en de klok telt ?min= minuten af vanaf het laden.
// In OBS: zet bij de bron "Browser verversen wanneer scène actief wordt" aan, dan klopt dit elke keer.
const countdownEl = document.getElementById("countdown");
let late = false;

function parseClock(text) {
  const match = /^(\d{1,2})[:.]?(\d{2})$/.exec((text ?? "").trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return [Number(match[1]), Number(match[2])];
}

// Boze scène: kleuren, tekst en beweging komen uit body.late (scenes.css)
function enterLate() {
  late = true;
  document.body.classList.add("late");
  const texts = {
    title: "He's late!",
    subtitle: "Grab your pitchforks, the druid is not here yet",
  };
  for (const id of Object.keys(texts)) {
    if (!params.get(id)) document.getElementById(id).textContent = texts[id];
  }
  document.querySelector(".kicker").textContent = "The druid is late";
}

if (countdownEl) {
  const [hours, minutes] = parseClock(params.get("at")) ?? parseClock(DEFAULT_START);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  if (params.has("late") || Date.now() >= target.getTime()) enterLate();
  const fallbackMinutes = Number(params.get("min"));
  const fallbackMs = (fallbackMinutes > 0 ? fallbackMinutes : DEFAULT_MINUTES) * 60_000;
  const end = late ? Date.now() + fallbackMs : target.getTime();

  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    const h = Math.floor(left / 3600);
    const clock = `${pad(Math.floor(left / 60) % 60)}:${pad(left % 60)}`;
    countdownEl.textContent = h ? `${h}:${clock}` : clock;
    if (!left && !late) {
      enterLate();
      angryChat();
    }
  };
  tick();
  setInterval(tick, TICK_MS);
}

// Muzieknoten die over het hele scherm opstijgen; ze zijn alleen zichtbaar met body.music (scenes.css)
const NOTE_GLYPHS = ["♪", "♫", "♩", "♬"];
const NOTE_COUNT = 26;
const notesEl = document.createElement("div");
notesEl.className = "notes";
for (let i = 0; i < NOTE_COUNT; i++) {
  const dur = 11 + Math.random() * 7;
  const note = document.createElement("span");
  note.className = "note";
  note.textContent = NOTE_GLYPHS[i % NOTE_GLYPHS.length];
  note.style.cssText = [
    `--x:${Math.round(20 + (i + Math.random() * 0.8) * ((1920 - 80) / NOTE_COUNT))}px`, // gelijkmatig over de breedte
    `--size:${Math.round(28 + Math.random() * 40)}px`,
    `--dur:${dur.toFixed(1)}s`,
    `--delay:-${(Math.random() * dur).toFixed(1)}s`, // negatief: het scherm is meteen gevuld
    `--tilt:${Math.round(8 + Math.random() * 18)}deg`,
    `--alpha:${(0.3 + Math.random() * 0.35).toFixed(2)}`,
  ].join(";");
  notesEl.append(note);
}
// Direct na de achtergrond, dus onder alle inhoud
document.querySelector(".bg").after(notesEl);

// Now playing: alleen zichtbaar als er muziek speelt (zelfde koppeling als de overlay).
// Dezelfde status zet de noten aan (body.music).
const nowPlaying = document.getElementById("nowplaying");
const songEl = nowPlaying.querySelector(".song");

if (params.has("debug")) {
  // Debug: vast kaartje met het voorbeeldnummer uit de HTML, zonder de app te vragen
  nowPlaying.classList.add("show");
  document.body.classList.add("music");
} else {
  watchNowPlaying({
    onSong: (artist, title) => {
      songEl.textContent = artist ? `${artist} - ${title}` : title;
      nowPlaying.classList.add("show");
      document.body.classList.add("music");
    },
    onHide: () => {
      nowPlaying.classList.remove("show");
      document.body.classList.remove("music");
    },
  });
}

// Chat: de verbinding met Twitch wordt gedeeld met de overlay en andere schermen (js/hub.js),
// dus extra schermen kosten geen extra verbinding.
const FAKE_LINES = [
  "that rip uptime is insane", "POUNCE OPENER LETS GO", "how are you not oom rn", "shift shift shift",
  "bear form cancel was clean", "what talents are you running?", "feral is so back", "gg that pull was nuts",
];
const FAKE_USERS = ["MoonkinMike", "BearFormBrad", "Catweaver", "ShredTheTank", "Rakeqween", "LeafyLarry"];

const ANGRY_LINES = [
  "WHERE IS HE", "its past 19:45 and no druid", "grab the pitchforks", "THE DRUID IS LATE",
  "my cat is angrier than me rn", "he forgot, didnt he", "pitchforks out chat", "ONE JOB",
];

// Boze chat: de scène is te laat, dus de chat laat dat de streamer weten
function angryChat(instant = false) {
  if (!document.getElementById("chat")) return;
  ANGRY_LINES.forEach((text, i) => {
    const say = () => addFakeMessage(text, i);
    if (instant) say();
    else setTimeout(say, i * 900);
  });
}

function addFakeMessage(text, i) {
  addChatMessage({
    chatter_user_name: FAKE_USERS[i % FAKE_USERS.length],
    color: "",
    message_type: "text",
    message: { text, fragments: [{ type: "text", text }] },
  });
}

async function startChat() {
  const result = await getSession();
  if (result.error) {
    addSystemLine("overlay", `chat niet verbonden (${result.error}), open auth.html`);
    return;
  }

  startViewerCount(result.session);
  const twitch = new TwitchHub(result.session);
  twitch.on("channel.chat.message", addChatMessage);
  twitch.on("autherror", () => {
    twitch.stop();
    addSystemLine("overlay", "token ongeldig, open auth.html");
  });
  twitch.start();
}

if (params.get("chat") === "off") {
  document.getElementById("chat").remove();
} else if (params.has("debug")) {
  if (late) angryChat(true);
  else FAKE_LINES.forEach(addFakeMessage);
} else {
  startChat();
  if (late) angryChat();
}
