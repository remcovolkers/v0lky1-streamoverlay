// Koppelt Twitch-events aan chat, alerts en geluid.
import { CONFIG } from "./config.js";
import { addChatMessage, addSystemLine } from "./chat.js";
import { queueAlert } from "./alerts.js";
import { playFile } from "./audio.js";

const { sounds } = CONFIG;

// Chatgeluid met cooldown, zodat een drukke chat niet constant piept of geluiden over elkaar legt.
let lastChatSound = 0;
function playChatSound() {
  const { chat } = sounds;
  if (!chat || Date.now() - lastChatSound < chat.cooldownMs) return;
  lastChatSound = Date.now();
  playFile(chat.file, chat.volume);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const viewerName = (e) => (e.is_anonymous ? "Anonymous" : e.user_name);

// Haalt cheermotes zoals "Cheer100" uit een bitsbericht, zodat TTS ze niet voorleest.
const stripCheermotes = (text = "") => text.replace(/\b[a-z]+\d+\b/gi, " ");

// Per eventtype een handler. debug.js gebruikt dezelfde handlers met nep-events.
export const HANDLERS = {
  "channel.chat.message": (e) => {
    addChatMessage(e);
    playChatSound();
  },

  "channel.follow": (e) =>
    queueAlert({
      style: "calm",
      kicker: "New Follower",
      name: e.user_name,
      desc: ["is now prowling with the pack"],
      ms: 4000,
      sound: sounds.follow,
    }),

  "channel.subscribe": (e) => {
    // Ontvangers van gift subs komen hier ook langs; die horen bij channel.subscription.gift.
    if (e.is_gift) return;
    queueAlert({
      kicker: "New Subscriber",
      name: e.user_name,
      desc: ["Joined the pride"],
      sound: sounds.sub,
      onShow: () => addSystemLine(e.user_name, "subscribed! 🐾"),
    });
  },

  "channel.subscription.message": (e) => {
    const months = e.cumulative_months;
    const note = e.message?.text ? ` - ${e.message.text}` : "";
    queueAlert({
      kicker: "Resub",
      name: e.user_name,
      desc: ["Back in the pride for ", { hl: plural(months, "month") }],
      sound: sounds.sub,
      onShow: () => addSystemLine(e.user_name, `resubscribed for ${plural(months, "month")}! 🐾${note}`),
    });
  },

  "channel.subscription.gift": (e) =>
    queueAlert({
      kicker: "Gift Subs",
      name: viewerName(e),
      desc: ["Gifted ", { hl: plural(e.total, "sub") }, " to the pride"],
      sound: sounds.gift,
      onShow: () => addSystemLine(viewerName(e), `gifted ${plural(e.total, "sub")}! 🎁`),
    }),

  "channel.cheer": (e) =>
    queueAlert({
      kicker: "Bits",
      name: viewerName(e),
      desc: ["Cheered ", { hl: plural(e.bits, "bit") }],
      sound: sounds.bits,
      tts: `${viewerName(e)} cheered ${plural(e.bits, "bit")}. ${stripCheermotes(e.message)}`,
    }),

  "channel.raid": (e) =>
    queueAlert({
      kicker: "Incoming Raid",
      name: e.from_broadcaster_user_name,
      desc: [{ hl: plural(e.viewers, "viewer") }, " joined the hunt"],
      ms: 6500,
      sound: sounds.raid,
      onShow: () => addSystemLine(e.from_broadcaster_user_name, `is raiding with ${plural(e.viewers, "viewer")}!`),
    }),

  "channel.channel_points_custom_reward_redemption.add": (e) =>
    queueAlert({
      style: "calm",
      kicker: "Reward Redeemed",
      name: e.user_name,
      desc: [e.reward.title],
      ms: 4000,
      sound: sounds.reward,
      tts: `${e.user_name} redeemed ${e.reward.title}. ${e.user_input ?? ""}`,
    }),
};

export function bindEvents(twitch) {
  for (const [type, handler] of Object.entries(HANDLERS)) twitch.on(type, handler);
}
