const MAX_PLAY_MS = 30_000; // vangnet: een fragment dat blijft hangen blokkeert de wachtrij niet
const RESUME_WAIT_MS = 300; // zo lang wachten we op een geblokkeerde AudioContext voordat we opgeven
const KEEP_ALIVE_GAIN = 0.0005; // onhoorbaar, maar genoeg om de audio-uitvoer wakker te houden

let ctx;
const buffers = new Map(); // url -> Promise<AudioBuffer | null>
let foreground = 0; // aantal lopende alertgeluiden/TTS; achtergrondgeluid (chat) wacht daarop niet

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Eén gedeelde AudioContext. Een zachte, constante toon (20 Hz, onhoorbaar) houdt de uitvoer
// wakker, anders mist het begin van een geluid na een stilte soms de eerste milliseconden.
function getContext() {
  if (ctx) return ctx;
  ctx = new AudioContext({ latencyHint: "interactive" });

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 20;
  gain.gain.value = KEEP_ALIVE_GAIN;
  osc.connect(gain).connect(ctx.destination);
  osc.start();

  const resume = () => ctx.resume().catch(() => {});
  ctx.addEventListener("statechange", () => ctx.state !== "running" && resume());
  // Gewone browsers starten de context pas na een klik of toets (OBS niet).
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, resume, { once: true });
  return ctx;
}

// Haalt een geluid één keer op en decodeert het, daarna is afspelen direct.
// Geeft null bij een fout; playFile valt dan terug op een gewoon Audio-element.
function loadBuffer(url) {
  if (!buffers.has(url)) {
    const promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => getContext().decodeAudioData(data))
      .catch((err) => {
        console.warn(`[audio] kan niet laden: ${url} (${err.message})`);
        buffers.delete(url); // volgende keer opnieuw proberen
        return null;
      });
    buffers.set(url, promise);
  }
  return buffers.get(url);
}

// Start de audio-uitvoer en laadt de geluiden alvast. Aanroepen bij het opstarten.
export function initAudio(urls = []) {
  getContext();
  return Promise.all(urls.map(loadBuffer));
}

async function playBuffered(url, volume) {
  const buffer = await loadBuffer(url);
  if (!buffer) return playStream(url, volume);

  const context = getContext();
  if (context.state !== "running") {
    await Promise.race([context.resume().catch(() => {}), sleep(RESUME_WAIT_MS)]);
  }
  if (context.state !== "running") {
    console.warn(`[audio] afspelen geblokkeerd (${url}): AudioContext staat ${context.state}`);
    return false;
  }

  return new Promise((resolve) => {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);

    const timer = setTimeout(() => {
      source.stop();
      resolve(false);
    }, MAX_PLAY_MS);
    source.onended = () => {
      clearTimeout(timer);
      resolve(true);
    };
    source.start();
  });
}

// Voor bronnen die we niet kunnen decoderen (bijvoorbeeld de TTS-stream van een ander domein,
// zonder CORS): een gewoon Audio-element.
function playStream(url, volume = 1) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.volume = volume;

    let timer;
    const finish = (ok) => {
      clearTimeout(timer);
      resolve(ok);
    };

    audio.addEventListener("ended", () => finish(true));
    audio.addEventListener("error", () => {
      console.warn(`[audio] kan niet afspelen: ${url}`);
      finish(false);
    });
    timer = setTimeout(() => {
      audio.pause();
      finish(false);
    }, MAX_PLAY_MS);

    audio.play().catch((err) => {
      console.warn(`[audio] afspelen geblokkeerd (${url}): ${err.message}`);
      finish(false);
    });
  });
}

// Achtergrondgeluid wordt overgeslagen zolang er een ander geluid speelt, zodat chat een alert niet overstemt.
async function track(background, play) {
  if (background && foreground > 0) return false;
  if (!background) foreground++;
  try {
    return await play();
  } finally {
    if (!background) foreground--;
  }
}

// Speelt een geluid uit assets af. De belofte lost op zodra het klaar is en gooit nooit een fout.
// Geeft true terug als het fragment helemaal is afgespeeld.
export function playFile(url, volume = 1, { background = false } = {}) {
  return track(background, () => playBuffered(url, volume));
}

// Speelt een stream van een extern adres af (TTS). Zelfde belofte als playFile.
export function playExternal(url, volume = 1) {
  return track(false, () => playStream(url, volume));
}
