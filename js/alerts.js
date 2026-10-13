import { playFile } from "./audio.js";
import { speak } from "./tts.js";

const LOGO = "assets/images/logo.png";
const SPARK_COLORS = ["#29ffb9", "#8fffdc", "#fff"];
const SPARK_COUNT = 28;
const OUT_MS = 500; // duur van de uitfade-animatie
const GAP_MS = 400; // pauze tussen twee alerts

const container = document.getElementById("alert");
const queue = [];
let busy = false;

// Zet een alert in de wachtrij. Alerts worden na elkaar getoond.
//   style:  "hype" (met krabbels en vonken) of "calm"
//   kicker: kleine titel boven de naam
//   name:   naam van de kijker
//   desc:   lijst met strings en { hl: "tekst" } voor accenten in de accentkleur
//   ms:     minimale tijd dat de alert zichtbaar blijft (hij wacht daarna op de audio)
//   sound:  { file, volume } audiofragment dat meteen start
//   tts:    tekst die na het fragment wordt voorgelezen
//   onShow: wordt aangeroepen zodra de alert verschijnt
export function queueAlert(alert) {
  queue.push(alert);
  if (!busy) next();
}

function next() {
  const alert = queue.shift();
  if (!alert) {
    busy = false;
    return;
  }
  busy = true;
  show(alert);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildCard({ style = "hype", kicker, name, desc = [] }) {
  const card = el("div", `card ${style}`);

  const logo = el("img");
  logo.src = LOGO;

  const descEl = el("div", "d");
  for (const part of desc) {
    descEl.append(typeof part === "string" ? part : el("span", "hl", part.hl));
  }

  const info = el("div");
  info.append(el("div", "k", kicker), el("div", "nm", name), descEl);
  card.append(logo, info);

  if (style === "hype") {
    const claws = el("div", "claws");
    claws.append(el("i"), el("i"), el("i"));
    card.append(claws);
  }
  return card;
}

function addSparks() {
  for (let i = 0; i < SPARK_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 160 + Math.random() * 220;
    const spark = el("i", "spark");
    spark.style.cssText = `left:50%;top:50%;background:${SPARK_COLORS[i % SPARK_COLORS.length]};` +
      `--x:${Math.cos(angle) * distance}px;--y:${Math.sin(angle) * distance * 0.6}px;` +
      `animation-delay:${Math.random() * 0.2}s`;
    container.append(spark);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Eerst het geluid, daarna de TTS (als die er is). Faalt een van beide, dan gaat de alert gewoon door.
async function playAlertAudio({ sound, tts }) {
  if (sound) await playFile(sound.file, sound.volume);
  if (tts) await speak(tts);
}

// De alert blijft minimaal `ms` staan en wacht daarna tot de audio klaar is.
async function show(alert) {
  const { style = "hype", ms = 5500, onShow } = alert;
  const card = buildCard(alert);
  container.replaceChildren(card);
  if (style === "hype") addSparks();
  onShow?.();

  await Promise.all([sleep(ms), playAlertAudio(alert)]);
  card.classList.add("out");
  await sleep(OUT_MS);
  container.replaceChildren();
  await sleep(GAP_MS);
  next();
}
