const MAX_MESSAGES = 40; // genoeg voor het hoge chatpaneel in de scenes; oudere berichten vallen weg
// Groentinten passend bij het accent van de chat. Dit zijn de kleuren voor namen zonder
// (of met een te donkere) Twitch-kleur. Met USE_TWITCH_COLORS op false krijgt iedereen er een.
const NAME_COLORS = ["#29ffb9", "#6dffd0", "#8fffdc", "#4dffc4", "#b3ffe9", "#20e8a6", "#7affd4", "#a0ffe2"];
const USE_TWITCH_COLORS = true;
const emoteUrl = (id) => `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/1.0`;

const box = document.getElementById("msgs");
const counter = document.getElementById("mc");
let total = 0;

// Een naam krijgt altijd dezelfde kleur. Twitch-kleuren die te donker zijn slaan we over.
function nameColor(name, color) {
  if (USE_TWITCH_COLORS && /^#[0-9a-f]{6}$/i.test(color ?? "")) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    if (0.299 * r + 0.587 * g + 0.114 * b >= 90) return color;
  }
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return NAME_COLORS[hash % NAME_COLORS.length];
}

// content: lijst met strings en/of DOM-nodes. Strings worden als tekst ingevoegd, nooit als HTML.
function append(user, color, content, highlight) {
  const el = document.createElement("div");
  el.className = highlight ? "m hl" : "m";

  const nameEl = document.createElement("span");
  nameEl.className = "u";
  nameEl.style.color = color;
  nameEl.textContent = user;

  const textEl = document.createElement("span");
  textEl.className = "t";
  textEl.append(...content);

  el.append(nameEl, ": ", textEl);
  box.append(el);
  while (box.children.length > MAX_MESSAGES) box.firstChild.remove();
}

function fragmentToNode(fragment) {
  if (fragment.type === "emote" && fragment.emote) {
    const img = document.createElement("img");
    img.className = "emote";
    img.src = emoteUrl(fragment.emote.id);
    img.alt = fragment.text;
    return img;
  }
  return fragment.text;
}

// Handler voor channel.chat.message
export function addChatMessage(event) {
  counter.textContent = ++total;
  const fragments = event.message.fragments ?? [{ type: "text", text: event.message.text }];
  const user = event.chatter_user_name;
  append(
    user,
    nameColor(user, event.color),
    fragments.map(fragmentToNode),
    event.message_type === "channel_points_highlighted",
  );
}

// Regel in de accentkleur in de chat, bijvoorbeeld voor een nieuwe sub
export function addSystemLine(user, text) {
  append(user, nameColor(user), [text], true);
}
