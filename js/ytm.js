// Praat met de Companion Server van de YouTube Music Desktop App (ytmdesktop v2).
const API = "http://localhost:9863/api/v1";
const STORAGE_KEY = "v0lky1.ytmToken";
const APP_NAME = "v0lky1 Stream Overlay";
const APP_VERSION = "1.0.0";

// player.trackState: -1 onbekend, 0 gepauzeerd, 1 speelt, 2 buffert
const TRACK_PLAYING = 1;
const TRACK_BUFFERING = 2;

export const getToken = () => localStorage.getItem(STORAGE_KEY);
export const unpair = () => localStorage.removeItem(STORAGE_KEY);

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? data.error ?? res.statusText);
  return data;
}

// Koppelt de overlay aan de app. De gebruiker moet dit in de app goedkeuren (binnen ~30 seconden).
// De app vervangt een eerder token met dezelfde appId. Daarom krijgt elke koppeling een eigen
// appId, zodat OBS en een gewone browser elkaars koppeling niet ongeldig maken.
export async function pair() {
  const appId = `v0lky1-${crypto.randomUUID().slice(0, 8)}`;
  const { code } = await post("/auth/requestcode", { appId, appName: APP_NAME, appVersion: APP_VERSION });
  const { token } = await post("/auth/request", { appId, code });
  localStorage.setItem(STORAGE_KEY, token);
}

// Zet de state van de app om naar { status: "playing", artist, title } of { status: "idle", detail }.
// detail is alleen bedoeld voor de console, om te zien waarom er niets getoond wordt.
function songFromState(state) {
  const { player, video } = state ?? {};
  const active = player?.trackState === TRACK_PLAYING || player?.trackState === TRACK_BUFFERING;
  if (!active || !video?.title) {
    return { status: "idle", detail: `trackState=${player?.trackState}, titel=${video?.title ?? "geen"}` };
  }
  return { status: "playing", artist: video.author ?? "", title: video.title };
}

// Eén aanvraag om de huidige state. Geeft naast songFromState ook { status: "unauthorized" | "offline" }
// en { status: "limited" } als de app zegt dat we te vaak vragen (429): dat is geen "stil", dus negeren.
export async function fetchNowPlaying() {
  const token = getToken();
  if (!token) return { status: "unauthorized", detail: "geen token" };

  let res;
  try {
    res = await fetch(`${API}/state`, { headers: { Authorization: token } });
  } catch (err) {
    return { status: "offline", detail: err.message }; // app niet gestart of Companion Server uit
  }
  if (res.status === 429) return { status: "limited", detail: "HTTP 429" };
  if (res.status === 401 || res.status === 403) return { status: "unauthorized", detail: `HTTP ${res.status}` };
  if (!res.ok) return { status: "offline", detail: `HTTP ${res.status}` };

  try {
    return songFromState(await res.json());
  } catch (err) {
    return { status: "offline", detail: `ongeldig antwoord: ${err.message}` };
  }
}

// Realtime verbinding van de app (Socket.IO): de app stuurt zelf een state-update bij elke wijziging.
// Dat is de aanbevolen manier, want /state is rate-limited en gaf bij meerdere pagina's HTTP 429.
const REALTIME = "http://127.0.0.1:9863/api/v1/realtime"; // de app wil een IPv4-adres
const FALLBACK_POLL_MS = 5000;
const LOCK_NAME = "v0lky1-ytm-connection";
const CHANNEL_NAME = "v0lky1-ytm-state";
const HIDE_GRACE_MS = 10_000;

// Praat met de app namens alle pagina's op dezelfde host. Eén pagina is de "leider" (Web Lock) en houdt
// de verbinding; hij stuurt elke wijziging via een BroadcastChannel door naar de andere pagina's, net als
// js/hub.js voor Twitch. Sluit de leider, dan neemt een wachtende pagina het over.
// Lukt de realtime verbinding niet, dan vraagt de leider om de FALLBACK_POLL_MS om /state.
// publish(song) wordt aangeroepen met elke nieuwe status.
function connectToApp(publish) {
  let socket = null;
  let pollTimer = null;

  async function poll() {
    const song = await fetchNowPlaying();
    if (song.status !== "limited") publish(song);
  }

  const startFallback = () => {
    if (!pollTimer) pollTimer = setInterval(poll, FALLBACK_POLL_MS);
  };
  const stopFallback = () => {
    clearInterval(pollTimer);
    pollTimer = null;
  };

  async function connect() {
    const token = getToken();
    if (!token) {
      // Nog niet gekoppeld: kijk elke paar seconden of dat inmiddels wel zo is (auth.html)
      publish({ status: "unauthorized", detail: "geen token" });
      setTimeout(connect, FALLBACK_POLL_MS);
      return;
    }
    const { io } = await import("./vendor/socket.io.esm.min.js");
    socket = io(REALTIME, { transports: ["websocket"], auth: { token }, reconnectionDelayMax: 5000 });
    socket.on("state-update", (state) => publish(songFromState(state)));
    socket.on("connect", () => {
      stopFallback();
      poll(); // één aanvraag voor de beginstand, voor het geval de app die niet zelf stuurt
    });
    socket.on("disconnect", startFallback);
    socket.on("connect_error", (err) => {
      publish({ status: "offline", detail: `realtime: ${err.message}` });
      startFallback(); // het echte antwoord (bijvoorbeeld 401) komt dan uit /state
    });
  }

  connect();
}

// Roept onSong(artist, title) aan zolang er een nummer speelt en onHide() als dat niet meer zo is.
// onHide komt pas als het nummer HIDE_GRACE_MS achter elkaar niet speelt, zodat een korte
// haperende status (buffering, een mislukte aanvraag) de weergave niet laat flikkeren.
export function watchNowPlaying({ onSong, onHide }) {
  let hideTimer = null;
  let lastLogged = "";
  let latest = null; // laatste status; de leider geeft die aan pagina's die net laden
  let leading = false;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL_NAME) : null;

  function apply(song) {
    const summary = song.status === "playing" ? `playing: ${song.artist} - ${song.title}` : `${song.status} (${song.detail})`;
    if (summary !== lastLogged) {
      lastLogged = summary;
      console.log(`[nowplaying] ${summary}`);
    }

    if (song.status === "playing") {
      clearTimeout(hideTimer);
      hideTimer = null;
      onSong(song.artist, song.title);
    } else if (!hideTimer) {
      hideTimer = setTimeout(() => {
        hideTimer = null;
        onHide();
      }, HIDE_GRACE_MS);
    }
  }

  function lead() {
    leading = true;
    connectToApp((song) => {
      latest = song;
      apply(song);
      channel?.postMessage({ kind: "song", song });
    });
  }

  if (channel) {
    channel.onmessage = ({ data }) => {
      if (data.kind === "song") apply(data.song);
      else if (data.kind === "hello" && leading && latest) channel.postMessage({ kind: "song", song: latest });
    };
    channel.postMessage({ kind: "hello" }); // vraagt de leider meteen om de huidige status
  }

  if (channel && navigator.locks) {
    // De lock blijft vast tot deze pagina sluit; daarna is de volgende wachtende pagina aan de beurt.
    navigator.locks.request(LOCK_NAME, () => {
      lead();
      return new Promise(() => {});
    });
  } else {
    lead();
  }
}
