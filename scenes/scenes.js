// Gedeeld script voor de scenes (starting-soon, brb, ending).
//
// Opties via de URL, bijvoorbeeld scenes/starting-soon.html?min=10&title=Almost%20there
//   min       aantal minuten voor de aftelklok (alleen starting-soon, standaard 10); een duur die je
//             zelf via het invoerveld onder de klok instelt gaat hier boven
//   title     vervangt de hoofdtitel
//   subtitle  vervangt de ondertitel
//   chat=off  verbergt de chat (bijvoorbeeld als je de overlay er al overheen legt)
//   debug     toont de gereserveerde zones en nepberichten in de chat, zonder Twitch-verbinding
import { watchNowPlaying } from "../js/ytm.js";
import { getSession } from "../js/auth.js";
import { TwitchHub } from "../js/hub.js";
import { addChatMessage, addSystemLine } from "../js/chat.js";
import { startViewerCount } from "../js/viewers.js";

const DEFAULT_MINUTES = 10;
const TICK_MS = 250;

const params = new URLSearchParams(location.search);
const pad = (n) => String(n).padStart(2, "0");

document.body.classList.toggle("debug", params.has("debug"));

for (const id of ["title", "subtitle"]) {
  const text = params.get(id);
  if (text) document.getElementById(id).textContent = text;
}

// Aftelklok: telt vanaf het laden van de pagina. In OBS betekent dat: zet bij de bron
// "Browser verversen wanneer scène actief wordt" aan, dan start hij elke keer opnieuw.
// De duur is in te stellen via het invoerveld onder de klok (verschijnt als je er met de muis
// overheen gaat; in OBS: rechtermuisknop op de bron > Interact). De laatst ingevoerde duur wordt
// onthouden en geldt bij elke volgende start; zonder onthouden duur gelden ?min= en daarna 10.
const countdownEl = document.getElementById("countdown");
if (countdownEl) {
  const STORAGE_KEY = "startingSoonSeconds";
  const form = document.getElementById("timer-set");
  const input = document.getElementById("timer-input");

  const loadSeconds = () => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved > 0) return saved;
    } catch {}
    const minutes = Number(params.get("min"));
    return Math.round((minutes > 0 ? minutes : DEFAULT_MINUTES) * 60);
  };

  // "10" = 10 minuten, "2:30" = 2 minuten en 30 seconden, "1,5" = anderhalve minuut
  const parseDuration = (text) => {
    const value = text.trim().replace(",", ".");
    const clock = value.match(/^(\d+):([0-5]?\d)$/);
    const seconds = clock ? Number(clock[1]) * 60 + Number(clock[2]) : Number(value) * 60;
    return seconds > 0 && Number.isFinite(seconds) ? Math.round(seconds) : 0;
  };

  let end;
  const start = (seconds) => {
    end = Date.now() + seconds * 1000;
    tick();
  };

  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    countdownEl.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const seconds = parseDuration(input.value);
    if (!seconds) {
      form.classList.add("invalid");
      return;
    }
    form.classList.remove("invalid");
    try {
      localStorage.setItem(STORAGE_KEY, String(seconds));
    } catch {}
    input.value = "";
    input.blur();
    start(seconds);
  });
  input.addEventListener("input", () => form.classList.remove("invalid"));

  start(loadSeconds());
  setInterval(tick, TICK_MS);
}

// Now playing: alleen zichtbaar als er muziek speelt (zelfde koppeling als de overlay)
const nowPlaying = document.getElementById("nowplaying");
const songEl = nowPlaying.querySelector(".song");

if (params.has("debug")) {
  // Debug: vast kaartje met het voorbeeldnummer uit de HTML, zonder de app te vragen
  nowPlaying.classList.add("show");
} else {
  watchNowPlaying({
    onSong: (artist, title) => {
      songEl.textContent = artist ? `${artist} - ${title}` : title;
      nowPlaying.classList.add("show");
    },
    onHide: () => nowPlaying.classList.remove("show"),
  });
}

// Chat: de verbinding met Twitch wordt gedeeld met de overlay en andere schermen (js/hub.js),
// dus extra schermen kosten geen extra verbinding.
const FAKE_LINES = [
  "that rip uptime is insane", "POUNCE OPENER LETS GO", "how are you not oom rn", "shift shift shift",
  "bear form cancel was clean", "what talents are you running?", "feral is so back", "gg that pull was nuts",
];
const FAKE_USERS = ["MoonkinMike", "BearFormBrad", "Catweaver", "ShredTheTank", "Rakeqween", "LeafyLarry"];

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
  FAKE_LINES.forEach((text, i) =>
    addChatMessage({
      chatter_user_name: FAKE_USERS[i % FAKE_USERS.length],
      color: "",
      message_type: "text",
      message: { text, fragments: [{ type: "text", text }] },
    }),
  );
} else {
  startChat();
}
