import { CONFIG } from "./config.js";

const POLL_MS = 30_000;

const counter = document.getElementById("cc");

export function setViewerCount(count) {
  counter.textContent = count;
}

// Haalt het aantal kijkers op via de Helix API. Geen extra scope nodig.
// Twitch geeft geen stream terug als je offline bent, dan tonen we 0.
async function refresh(session) {
  try {
    const url = new URL("https://api.twitch.tv/helix/streams");
    url.searchParams.set("user_id", session.userId);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.token}`, "Client-Id": CONFIG.clientId },
    });
    if (!res.ok) throw new Error(res.statusText);
    const { data } = await res.json();
    setViewerCount(data[0]?.viewer_count ?? 0);
  } catch (err) {
    console.warn("[viewers] ophalen mislukt:", err.message);
  }
}

export function startViewerCount(session) {
  refresh(session);
  setInterval(() => refresh(session), POLL_MS);
}
