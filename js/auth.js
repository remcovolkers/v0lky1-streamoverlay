import { CONFIG } from "./config.js";

const STORAGE_KEY = "v0lky1.session";
const STATE_KEY = "v0lky1.oauthState";

// Stuurt de browser naar Twitch voor inloggen (implicit grant flow).
export function login() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);

  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    response_type: "token",
    scope: CONFIG.scopes.join(" "),
    state,
    force_verify: "true",
  });
  window.location.href = url.href;
}

// Leest het token uit de URL-hash na terugkeer van Twitch. Geeft true bij succes.
export async function handleCallback() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has("access_token")) return false;

  // Haal het token direct uit de adresbalk/history
  history.replaceState(null, "", window.location.pathname);

  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!expected || params.get("state") !== expected) {
    throw new Error("Ongeldige state, probeer opnieuw in te loggen.");
  }

  const session = await validate(params.get("access_token"));
  if (!session) throw new Error("Token is niet geldig.");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return true;
}

// Controleert het token bij Twitch en geeft { token, userId, login, scopes } of null.
async function validate(token) {
  const res = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    token,
    userId: data.user_id,
    login: data.login,
    scopes: data.scopes,
  };
}

// Geeft een geldige sessie terug, of { error } met de reden.
export async function getSession() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    stored = null;
  }
  if (!stored?.token) return { error: "not-logged-in" };

  let session;
  try {
    session = await validate(stored.token);
  } catch {
    return { error: "network" };
  }
  if (!session) {
    logout();
    return { error: "expired" };
  }

  const missing = CONFIG.scopes.filter((s) => !session.scopes.includes(s));
  if (missing.length) return { error: "missing-scopes", missing };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return { session };
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}
