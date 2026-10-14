// Gedeeld script voor de scenes (starting-soon, brb, ending).
//
// Opties via de URL, bijvoorbeeld scenes/starting-soon.html?min=10&title=Almost%20there
//   min       aantal minuten voor de aftelklok (alleen starting-soon, standaard 5)
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
const countdownEl = document.getElementById("countdown");
if (countdownEl) {
  const minutes = Number(params.get("min"));
  const end = Date.now() + (minutes > 0 ? minutes : DEFAULT_MINUTES) * 60_000;

  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    countdownEl.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
  };
  tick();
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
