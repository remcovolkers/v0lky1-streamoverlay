const MAX_PLAY_MS = 30_000; // vangnet: een fragment dat blijft hangen blokkeert de wachtrij niet

// Speelt een audiobestand af. De belofte lost op zodra het klaar is en gooit nooit een fout.
// Geeft true terug als het fragment helemaal is afgespeeld.
export function playFile(url, volume = 1) {
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
