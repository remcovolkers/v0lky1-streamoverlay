import { CONFIG } from "./config.js";

const WS_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const API_URL = "https://api.twitch.tv/helix/eventsub/subscriptions";
const MAX_BACKOFF_MS = 30_000;

// Verbindt met Twitch EventSub (WebSocket) en zendt events uit.
//
//   const twitch = new TwitchEvents(session);
//   twitch.on("channel.follow", (event) => ...);
//   twitch.on("event", ({ type, event }) => ...);   // alle events
//   twitch.on("status", ({ state, ok, failed }) => ...);
//   twitch.on("autherror", () => ...);               // token niet meer geldig
//   twitch.start();
export class TwitchEvents extends EventTarget {
  #session;
  #ws = null;
  #stopped = true;
  #attempt = 0;
  #reconnectTimer = null;
  #seen = new Set();

  constructor(session) {
    super();
    this.#session = session;
  }

  on(type, handler) {
    this.addEventListener(type, (e) => handler(e.detail));
  }

  start() {
    this.#stopped = false;
    this.#emit("status", { state: "connecting" });
    this.#open(WS_URL);
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#reconnectTimer);
    this.#ws?.close();
    this.#ws = null;
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // De events waarop we ons abonneren (broadcaster = de ingelogde gebruiker).
  #subscriptions() {
    const id = this.#session.userId;
    return [
      { type: "channel.follow", version: "2", condition: { broadcaster_user_id: id, moderator_user_id: id } },
      { type: "channel.subscribe", version: "1", condition: { broadcaster_user_id: id } },
      { type: "channel.subscription.message", version: "1", condition: { broadcaster_user_id: id } },
      { type: "channel.subscription.gift", version: "1", condition: { broadcaster_user_id: id } },
      { type: "channel.cheer", version: "1", condition: { broadcaster_user_id: id } },
      { type: "channel.raid", version: "1", condition: { to_broadcaster_user_id: id } },
      { type: "channel.channel_points_custom_reward_redemption.add", version: "1", condition: { broadcaster_user_id: id } },
      { type: "channel.chat.message", version: "1", condition: { broadcaster_user_id: id, user_id: id } },
    ];
  }

  #open(url, migrating = false) {
    const ws = new WebSocket(url);
    let timeoutMs = 15_000;
    let watchdog;
    let gone = false;

    // Verliest de verbinding stilletjes? Dan sluiten we hem zelf (keepalive-bewaking).
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        ws.close();
        onGone();
      }, timeoutMs);
    };

    const onGone = () => {
      if (gone) return;
      gone = true;
      clearTimeout(watchdog);
      // Een oude of mislukte migratie-socket negeren we, alleen de actieve telt.
      if (this.#ws !== ws || this.#stopped) return;
      this.#scheduleReconnect();
    };

    if (!migrating) this.#ws = ws;

    ws.onopen = arm;
    ws.onclose = onGone;
    ws.onerror = () => console.warn("[twitch] websocket fout");

    ws.onmessage = (msg) => {
      arm();
      const { metadata, payload } = JSON.parse(msg.data);

      switch (metadata.message_type) {
        case "session_welcome": {
          timeoutMs = (payload.session.keepalive_timeout_seconds + 5) * 1000;
          arm();
          this.#attempt = 0;
          if (migrating) {
            // Abonnementen blijven bij een reconnect behouden, de oude socket kan dicht.
            const old = this.#ws;
            this.#ws = ws;
            old?.close();
          } else {
            this.#subscribe(payload.session.id);
          }
          break;
        }
        case "session_reconnect":
          this.#open(payload.session.reconnect_url, true);
          break;
        case "notification":
          this.#handleNotification(metadata, payload);
          break;
        case "revocation":
          console.warn("[twitch] abonnement ingetrokken:", payload.subscription.type, payload.subscription.status);
          if (payload.subscription.status === "authorization_revoked") this.#emit("autherror");
          break;
        // session_keepalive: alleen de watchdog resetten (hierboven al gedaan)
      }
    };
  }

  #handleNotification(metadata, payload) {
    // Twitch kan hetzelfde bericht dubbel sturen; filter op message_id.
    if (this.#seen.has(metadata.message_id)) return;
    this.#seen.add(metadata.message_id);
    if (this.#seen.size > 200) this.#seen.delete(this.#seen.values().next().value);

    const type = payload.subscription.type;
    this.#emit(type, payload.event);
    this.#emit("event", { type, event: payload.event });
  }

  #headers() {
    return { Authorization: `Bearer ${this.#session.token}`, "Client-Id": CONFIG.clientId };
  }

  // Twitch schakelt abonnementen van gesloten WebSockets alleen uit en laat ze minstens een
  // minuut staan. Bij veel herladen (Live Server) lopen we daardoor tegen de limiet van
  // 3 abonnementen per type aan, dus ruimen we onze eigen uitgeschakelde abonnementen op.
  async #removeStaleSubscriptions() {
    try {
      const stale = [];
      let after;
      do {
        const url = new URL(API_URL);
        if (after) url.searchParams.set("after", after);
        const res = await fetch(url, { headers: this.#headers() });
        if (!res.ok) throw new Error(res.statusText);
        const body = await res.json();
        for (const sub of body.data) {
          if (sub.transport.method === "websocket" && sub.status !== "enabled") stale.push(sub.id);
        }
        after = body.pagination?.cursor;
      } while (after);

      await Promise.allSettled(
        stale.map((id) => fetch(`${API_URL}?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: this.#headers() })),
      );
      if (stale.length) console.log(`[twitch] ${stale.length} oude abonnementen opgeruimd`);
    } catch (err) {
      console.warn("[twitch] opruimen oude abonnementen mislukt:", err.message);
    }
  }

  async #subscribe(sessionId) {
    await this.#removeStaleSubscriptions();

    const subs = this.#subscriptions();
    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { ...this.#headers(), "Content-Type": "application/json" },
          body: JSON.stringify({ ...sub, transport: { method: "websocket", session_id: sessionId } }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw Object.assign(new Error(body.message ?? res.statusText), { status: res.status, type: sub.type });
        }
        return sub.type;
      }),
    );

    const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason);
    failed.forEach((err) => console.warn(`[twitch] abonneren mislukt (${err.type}): ${err.message}`));

    if (failed.some((err) => err.status === 401)) {
      this.#emit("autherror");
      return;
    }
    this.#emit("status", {
      state: "connected",
      ok: subs.length - failed.length,
      failed: failed.length,
      limit: failed.some((err) => err.status === 429),
    });
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer) return;
    this.#attempt++;
    const delay = Math.min(1000 * 2 ** (this.#attempt - 1), MAX_BACKOFF_MS);
    this.#emit("status", { state: "reconnecting" });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (!this.#stopped) this.#open(WS_URL);
    }, delay);
  }
}
