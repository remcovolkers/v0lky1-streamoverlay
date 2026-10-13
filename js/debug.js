// Testpaneel met nep-events (alleen geladen met ?preview).
// Elke knop stuurt een event door dezelfde handlers als de echte Twitch-events.
import { HANDLERS } from "./events.js";
import { setViewerCount } from "./viewers.js";
import { showSong, hideSong } from "./nowplaying.js";

const USERS = ["MoonkinMike", "BearFormBrad", "Catweaver", "ShredTheTank", "Rakeqween", "Ferocious_Bite", "Tigersfury", "LeafyLarry"];
const LINES = [
  "that rip uptime is insane", "POUNCE OPENER LETS GO", "how are you not oom rn", "shift shift shift",
  "bear form cancel was clean", "what talents are you running?", "feral is so back", "druid diff tbh",
  "the bleed snapshotting 😮", "gg that pull was nuts",
];
const LONG_NAME = "ThisIsAnExtremelyLongUsername_99";
const SPAM_INTERVAL_MS = 700;

const rnd = (list) => list[Math.floor(Math.random() * list.length)];
const int = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const chat = (event) => HANDLERS["channel.chat.message"]({ color: "", message_type: "text", ...event });
const plainMessage = (text) => ({ text, fragments: [{ type: "text", text }] });

const follow = (name = rnd(USERS)) => HANDLERS["channel.follow"]({ user_name: name });
const sub = (name = rnd(USERS)) => HANDLERS["channel.subscribe"]({ user_name: name, is_gift: false });
const resub = (name = rnd(USERS), months = int(2, 24)) =>
  HANDLERS["channel.subscription.message"]({ user_name: name, cumulative_months: months, message: { text: "still here!" } });
const gift = (name = rnd(USERS), total = int(1, 10), anonymous = false) =>
  HANDLERS["channel.subscription.gift"]({ user_name: name, is_anonymous: anonymous, total });
const bits = (name = rnd(USERS), amount = int(1, 5) * 100) =>
  HANDLERS["channel.cheer"]({ user_name: name, is_anonymous: false, bits: amount, message: "Cheer100 great stream today!" });
const raid = (name = rnd(USERS), viewers = int(5, 300)) =>
  HANDLERS["channel.raid"]({ from_broadcaster_user_name: name, viewers });
const reward = (name = rnd(USERS)) =>
  HANDLERS["channel.channel_points_custom_reward_redemption.add"]({
    user_name: name,
    reward: { title: "Hydrate!" },
    user_input: "Take a sip of water, druid.",
  });

const say = () => {
  const text = rnd(LINES);
  chat({ chatter_user_name: rnd(USERS), message: plainMessage(text) });
};

// Nummers voor de now-playing-test; de laatste klik verbergt het kaartje weer
const SONGS = [
  ["Artist", "Short Title"],
  ["Some Very Long Artist Name", "A Really Long Song Title To Test The Scrolling (Remastered 2024)"],
];
let songIndex = -1;

let spamTimer = null;
function toggleSpam(button) {
  if (spamTimer) {
    clearInterval(spamTimer);
    spamTimer = null;
  } else {
    spamTimer = setInterval(say, SPAM_INTERVAL_MS);
  }
  button.classList.toggle("on", Boolean(spamTimer));
}

// Per knop: label en actie. De sneltoets is het volgnummer (1-9, daarna 0).
const TESTS = [
  ["Chat", say],
  ["Emote chat", () =>
    chat({
      chatter_user_name: rnd(USERS),
      message: {
        text: "Kappa nice Kappa",
        fragments: [
          { type: "emote", text: "Kappa", emote: { id: "25" } },
          { type: "text", text: " nice " },
          { type: "emote", text: "Kappa", emote: { id: "25" } },
        ],
      },
    })],
  ["Highlight chat", () =>
    chat({ chatter_user_name: rnd(USERS), message_type: "channel_points_highlighted", message: plainMessage("highlighted message!") })],
  ["Follow", () => follow()],
  ["Sub", () => sub()],
  ["Resub", () => resub()],
  ["Gift", () => gift()],
  ["Anon gift", () => gift("ANONYMOUS", 5, true)],
  ["Bits", () => bits()],
  ["Raid", () => raid()],
  ["Reward", () => reward()],
  ["Lange naam", () => {
    follow(LONG_NAME);
    raid(LONG_NAME, 1234);
  }],
  ["Alle alerts", () => {
    follow(); sub(); resub(); gift(); bits(); raid(); reward();
  }],
  ["Now playing", () => {
    songIndex = (songIndex + 1) % (SONGS.length + 1);
    const song = SONGS[songIndex];
    if (song) showSong(...song);
    else hideSong();
  }],
  ["Chat spam", null], // toggle, zie hieronder
];

const ctl = document.getElementById("ctl");
TESTS.forEach(([label, action], index) => {
  const key = String((index + 1) % 10);
  const run = (button) => (action ? action() : toggleSpam(button));

  const button = document.createElement("button");
  const hint = document.createElement("kbd");
  hint.textContent = index < 10 ? key : "";
  button.append(hint, label);
  button.addEventListener("click", () => run(button));
  ctl.append(button);

  if (index < 10) {
    document.addEventListener("keydown", (e) => {
      if (e.key === key && !e.ctrlKey && !e.metaKey && !e.altKey) run(button);
    });
  }
});

setViewerCount(int(20, 200));
for (let i = 0; i < 6; i++) say();
