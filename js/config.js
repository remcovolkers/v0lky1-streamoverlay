// Publieke instellingen. De Client ID is geen geheim (Public client, geen secret nodig).
export const CONFIG = {
  clientId: "46uur8qra8e8ke5r69wx4s0bfypfe5",

  // Elke scope hoort bij een eventtype:
  scopes: [
    "moderator:read:followers",   // channel.follow
    "channel:read:subscriptions", // subscribe, resub, gift
    "bits:read",                  // channel.cheer
    "channel:read:redemptions",   // channel point redemptions
    "user:read:chat",             // chatberichten
    // raids (channel.raid) hebben geen scope nodig
  ],

  // Geluiden bij alerts. Zet je eigen bestanden in assets/audio/ en pas hier de naam aan.
  // Een alert zonder entry (bits, reward) speelt geen geluid maar alleen TTS.
  sounds: {
    sub: { file: "assets/audio/sub.wav", volume: 0.8 }, // ook voor resubs
    follow: { file: "assets/audio/follow.wav", volume: 0.7 },
    raid: { file: "assets/audio/raid.wav", volume: 0.8 },
    gift: { file: "assets/audio/gift.wav", volume: 0.8 },
    chat: { file: "assets/audio/chat.wav", volume: 0.4, cooldownMs: 800 }, // cooldown: minimale tijd tussen twee chatgeluiden
  },

  // Tekst-naar-spraak voor bits en rewards
  tts: {
    language: "en", // taalcode van de stem, bijvoorbeeld "nl" of "en"
    maxChars: 200,
    volume: 0.75,
  },

  // auth.html staat naast index.html, ook op GitHub Pages in een submap.
  // Dit adres moet exact in de Twitch Developer Console staan.
  redirectUri: new URL("auth.html", window.location.href).href,
};
