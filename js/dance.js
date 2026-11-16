// Tempo van de dans (css/dance.css): het door jou meegetikte tempo van de avatar (avatar/index.html),
// anders 120. Importeren is genoeg: dit zet alleen --bpm op de pagina.
try {
  const bpm = Number(localStorage.getItem("v0lky1.lionBpm"));
  if (bpm >= 40 && bpm <= 240) document.documentElement.style.setProperty("--bpm", bpm);
} catch {}
