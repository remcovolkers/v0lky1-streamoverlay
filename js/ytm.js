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

// Geeft { status: "playing", artist, title } of { status: "idle" | "unauthorized" | "offline", detail }.
// detail is alleen bedoeld voor de console, om te zien waarom er niets getoond wordt.
export async function fetchNowPlaying() {
  const token = getToken();
  if (!token) return { status: "unauthorized", detail: "geen token" };

  let res;
  try {
    res = await fetch(`${API}/state`, { headers: { Authorization: token } });
  } catch (err) {
    return { status: "offline", detail: err.message }; // app niet gestart of Companion Server uit
  }
  if (res.status === 401 || res.status === 403) return { status: "unauthorized", detail: `HTTP ${res.status}` };
  if (!res.ok) return { status: "offline", detail: `HTTP ${res.status}` };

  let state;
  try {
    state = await res.json();
  } catch (err) {
    return { status: "offline", detail: `ongeldig antwoord: ${err.message}` };
  }
  const { player, video } = state;
  const active = player?.trackState === TRACK_PLAYING || player?.trackState === TRACK_BUFFERING;
  if (!active || !video?.title) {
    return { status: "idle", detail: `trackState=${player?.trackState}, titel=${video?.title ?? "geen"}` };
  }
  return { status: "playing", artist: video.author ?? "", title: video.title };
}

const POLL_MS = 2000;
const HIDE_GRACE_MS = 10_000;

// Vraagt de app steeds om het huidige nummer en roept onSong(artist, title) of onHide() aan.
// onHide komt pas als het nummer HIDE_GRACE_MS achter elkaar niet speelt, zodat een korte
// haperende status (buffering, een mislukte aanvraag) de weergave niet laat flikkeren.
export function watchNowPlaying({ onSong, onHide }) {
  let hideTimer = null;
  let lastLogged = "";

  async function refresh() {
    const song = await fetchNowPlaying();

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

  refresh();
  setInterval(refresh, POLL_MS);
}
