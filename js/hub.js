import { TwitchEvents } from "./twitch.js";

// Twitch staat maar 3 gelijktijdige verbindingen toe, terwijl de overlay en elk scherm
// events willen. TwitchHub zorgt dat alle pagina's op dezelfde host samen één verbinding delen:
//   - één pagina is de "leider" (via een Web Lock) en praat met Twitch;
//   - de leider stuurt elk event via een BroadcastChannel door naar de andere pagina's;
//   - sluit de leider, dan neemt een wachtende pagina automatisch het over.
// Delen de pagina's geen opslag (bijvoorbeeld in aparte browsers), dan wordt elke pagina
// zijn eigen leider en werkt het zoals zonder hub.
//
// Zelfde gebruik als TwitchEvents: on("status" | "autherror" | "event" | <eventtype>, handler), start(), stop().
const LOCK_NAME = "v0lky1-twitch-connection";
const CHANNEL_NAME = "v0lky1-twitch-events";

export class TwitchHub extends EventTarget {
  #session;
  #channel = null;
  #connection = null;
  #lastStatus = null;
  #stopped = false;

  constructor(session) {
    super();
    this.#session = session;
  }

  on(type, handler) {
    this.addEventListener(type, (e) => handler(e.detail));
  }

  start() {
    this.#channel = new BroadcastChannel(CHANNEL_NAME);
    this.#channel.onmessage = ({ data }) => this.#receive(data);

    this.#emit("status", { state: "connecting" });
    this.#post({ kind: "hello" }); // vraagt de leider om zijn huidige status

    if (!navigator.locks) {
      this.#lead();
      return;
    }
    // De lock blijft vast tot deze pagina sluit; daarna is de volgende wachtende pagina aan de beurt.
    navigator.locks.request(LOCK_NAME, () => {
      if (this.#stopped) return undefined;
      this.#lead();
      return new Promise(() => {});
    });
  }

  stop() {
    this.#stopped = true;
    this.#connection?.stop();
    this.#channel?.close();
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  #post(message) {
    if (!this.#stopped) this.#channel.postMessage(message);
  }

  // Een event aan de eigen luisteraars geven, zowel onder zijn eigen type als als "event".
  #dispatch(type, event) {
    this.#emit(type, event);
    this.#emit("event", { type, event });
  }

  // Berichten van de leider (of een hello van een nieuwe pagina)
  #receive(message) {
    switch (message.kind) {
      case "hello":
        if (this.#connection && this.#lastStatus) this.#post({ kind: "status", detail: this.#lastStatus });
        break;
      case "status":
        this.#emit("status", { ...message.detail, shared: true });
        break;
      case "autherror":
        this.#emit("autherror");
        break;
      case "event":
        this.#dispatch(message.type, message.event);
        break;
    }
  }

  // Deze pagina is de leider: de echte verbinding maken en alles doorsturen.
  #lead() {
    const connection = new TwitchEvents(this.#session);
    this.#connection = connection;

    connection.on("status", (status) => {
      this.#lastStatus = status;
      this.#emit("status", status);
      this.#post({ kind: "status", detail: status });
    });
    connection.on("autherror", () => {
      this.#emit("autherror");
      this.#post({ kind: "autherror" });
    });
    connection.on("event", ({ type, event }) => {
      this.#dispatch(type, event);
      this.#post({ kind: "event", type, event });
    });

    connection.start();
  }
}
