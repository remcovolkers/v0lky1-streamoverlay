// Entry point van de overlay: sessie controleren, Twitch verbinden, events doorgeven.
import { getSession } from "./auth.js";
import { TwitchHub } from "./hub.js";
import { bindEvents } from "./events.js";
import { startNowPlaying } from "./nowplaying.js";
import { startViewerCount } from "./viewers.js";

// ?preview toont een nep-achtergrond en testknoppen. Gebruik dat nooit in OBS.
// Preview maakt standaard geen Twitch-verbinding, zodat OBS de enige verbinding heeft.
// Met ?preview&live verbindt de preview wel (let op: telt mee voor de limiet van 3).
const params = new URLSearchParams(location.search);
const PREVIEW = params.has("preview");
const CONNECT = !PREVIEW || params.has("live");
document.body.classList.toggle("preview", PREVIEW);
// ?layout=cam zet de chat naast de webcam (zie css/layouts.css)
const layout = params.get("layout");
if (layout) document.body.classList.add(`layout-${layout}`);

const statusEl = document.getElementById("status");

const SESSION_CHECK_MS = 60 * 60 * 1000; // Twitch vraagt om elk uur te valideren
const STATUS_VISIBLE_MS = 5000;

let statusTimer;

// Fouten blijven in beeld; een gewone melding verdwijnt na een paar seconden (behalve in preview).
function setStatus(text, isError = false) {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
  statusEl.classList.add("show");
  if (!isError && !PREVIEW) {
    statusTimer = setTimeout(() => statusEl.classList.remove("show"), STATUS_VISIBLE_MS);
  }
}

const AUTH_MESSAGES = {
  "not-logged-in": "Niet ingelogd, open auth.html",
  "expired": "Token verlopen, open auth.html",
  "missing-scopes": "Rechten ontbreken, open auth.html",
  "network": "Twitch niet bereikbaar",
};

function startTwitch(session) {
  const twitch = new TwitchHub(session);

  twitch.on("status", ({ state, ok, failed, limit, shared }) => {
    if (state === "connecting") return setStatus("Verbinden met Twitch…");
    if (state === "reconnecting") return setStatus("Verbinding verbroken, opnieuw verbinden…", true);
    if (limit) return setStatus("Te veel open overlays, sluit andere tabs/bronnen en ververs", true);
    if (failed) return setStatus(`Verbonden, maar ${failed} abonnement(en) mislukt (zie console)`, true);
    setStatus(`Verbonden als ${session.login} (${ok} events${shared ? ", gedeeld" : ""})`);
  });

  twitch.on("autherror", () => {
    twitch.stop();
    setStatus("Token ongeldig, open auth.html", true);
  });

  twitch.on("event", ({ type, event }) => console.log(`[twitch] ${type}`, event));
  bindEvents(twitch);

  twitch.start();

  setInterval(async () => {
    const result = await getSession();
    if (result.error && result.error !== "network") {
      twitch.stop();
      setStatus(AUTH_MESSAGES[result.error], true);
    }
  }, SESSION_CHECK_MS);
}

async function init() {
  if (PREVIEW) await import("./debug.js");
  if (!CONNECT) return setStatus("Preview: niet verbonden met Twitch");

  startNowPlaying(); // praat alleen met je eigen app op localhost, los van de Twitch-login

  const result = await getSession();
  if (result.error) {
    setStatus(AUTH_MESSAGES[result.error], true);
    return;
  }

  startViewerCount(result.session);
  startTwitch(result.session);
}

init();
