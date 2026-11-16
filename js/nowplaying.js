import "./dance.js"; // tempo van de dans
import { watchNowPlaying } from "./ytm.js";

const SCROLL_PX_PER_SEC = 30;

const card = document.getElementById("np");
const textEl = document.getElementById("np-text");
const wrapEl = document.getElementById("np-wrap");

let current = null;

export function hideSong() {
  current = null;
  card.classList.remove("show");
  document.body.classList.remove("music"); // het logo bij de webcam stopt met dansen
}

// Toont "artiest - titel". Is de tekst te breed, dan schuift hij heen en weer.
export function showSong(artist, title) {
  const text = artist ? `${artist} - ${title}` : title;
  if (text !== current) {
    current = text;
    textEl.textContent = text;
    textEl.classList.remove("scroll");
    requestAnimationFrame(() => {
      const overflow = textEl.scrollWidth - wrapEl.clientWidth;
      if (overflow <= 0) return;
      textEl.style.setProperty("--shift", `-${overflow}px`);
      textEl.style.setProperty("--dur", `${4 + overflow / SCROLL_PX_PER_SEC}s`);
      textEl.classList.add("scroll");
    });
  }
  card.classList.add("show");
  document.body.classList.add("music");
}

export function startNowPlaying() {
  watchNowPlaying({ onSong: showSong, onHide: hideSong });
}
