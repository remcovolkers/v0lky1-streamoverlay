// Publieke instellingen. De Client ID is geen geheim (Public client, geen secret nodig).
// De pagina's staan per spel in een eigen map (retail/, forever/); gedeelde bestanden zoals geluiden
// en auth.html staan in de root. Daarom lossen we die op t.o.v. deze module, niet t.o.v. de pagina.
const ROOT = new URL("../", import.meta.url);
const fromRoot = (path) => new URL(path, ROOT).href;

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
    sub: { file: fromRoot("assets/audio/sub.wav"), volume: 0.8 }, // ook voor resubs
    follow: { file: fromRoot("assets/audio/follow.wav"), volume: 0.7 },
    raid: { file: fromRoot("assets/audio/raid.wav"), volume: 0.8 },
    gift: { file: fromRoot("assets/audio/gift.wav"), volume: 0.8 },
    chat: { file: fromRoot("assets/audio/chat.wav"), volume: 0.4, cooldownMs: 500 }, // cooldown: minimale tijd tussen twee chatgeluiden
  },

  // Tekst-naar-spraak voor bits en rewards
  tts: {
    language: "en", // taalcode van de stem, bijvoorbeeld "nl" of "en"
    maxChars: 200,
    volume: 0.85,
  },

  // auth.html staat in de root van de site, ook op GitHub Pages in een submap.
  // Dit adres moet exact in de Twitch Developer Console staan.
  redirectUri: fromRoot("auth.html"),
};
