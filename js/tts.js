import { CONFIG } from "./config.js";
import { playFile } from "./audio.js";

// Onofficiële Google Translate TTS: geeft een mp3 terug, zonder account. Kan zonder
// waarschuwing veranderen of stoppen; dan valt speak() terug op de browserstem.
const GOOGLE_TTS_URL = "https://translate.google.com/translate_tts";

// Maakt tekst van kijkers geschikt om voor te lezen: geen links, geen rare tekens, niet te lang.
function sanitize(text) {
  const clean = text
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/[<>]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= CONFIG.tts.maxChars) return clean;
  const cut = clean.slice(0, CONFIG.tts.maxChars);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trim();
}

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve(false);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = CONFIG.tts.volume;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    speechSynthesis.speak(utterance);
  });
}

// Leest tekst voor. De belofte lost op zodra het klaar is en gooit nooit een fout.
export async function speak(text) {
  const clean = sanitize(text ?? "");
  if (!clean) return;

  const url = new URL(GOOGLE_TTS_URL);
  url.search = new URLSearchParams({ ie: "UTF-8", client: "tw-ob", tl: CONFIG.tts.language, q: clean });

  const ok = await playFile(url.href, CONFIG.tts.volume);
  if (!ok) {
    console.warn("[tts] online stem mislukt, probeer de browserstem");
    await speakWithBrowser(clean);
  }
}
