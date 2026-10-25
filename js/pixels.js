// Les outils de base sur une image en pixels : { l, h, d } où d est un Uint8ClampedArray RGBA.
// Rien ici ne touche à l'écran : l'éditeur et la bibliothèque s'en servent tous les deux.

export const creer = (l, h) => ({ l, h, d: new Uint8ClampedArray(l * h * 4) });
export const copier = (img) => ({ l: img.l, h: img.h, d: new Uint8ClampedArray(img.d) });
export const dedans = (img, x, y) => x >= 0 && y >= 0 && x < img.l && y < img.h;

// Une couleur = [r, g, b, a] (0..255)
export function lire(img, x, y) {
  const i = (y * img.l + x) * 4;
  return [img.d[i], img.d[i + 1], img.d[i + 2], img.d[i + 3]];
}
export function ecrire(img, x, y, c) {
  if (!dedans(img, x, y)) return;
  const i = (y * img.l + x) * 4;
  img.d[i] = c[0]; img.d[i + 1] = c[1]; img.d[i + 2] = c[2]; img.d[i + 3] = c[3];
}
export const memeCouleur = (a, b) => (a[3] === 0 && b[3] === 0) || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);
export const cle = (c) => (c[3] === 0 ? 0 : ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0);
export const deCle = (k) => [(k >>> 24) & 255, (k >>> 16) & 255, (k >>> 8) & 255, k & 255];

export function versHex(c) {
  return '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function deHex(h, a = 255) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((x) => x + x).join('') : s.slice(0, 6), 16);
  const alpha = s.length === 8 ? parseInt(s.slice(6), 16) : a;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}
export const css = (c) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(3)})`;

// ---------- Entre images et toiles ----------
export function versToile(img, toile = document.createElement('canvas')) {
  toile.width = img.l; toile.height = img.h;
  if (img.l && img.h) toile.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.d), img.l, img.h), 0, 0);
  return toile;
}
export function deToile(c) {
  const g = c.getContext('2d', { willReadFrequently: true });
  return { l: c.width, h: c.height, d: new Uint8ClampedArray(g.getImageData(0, 0, c.width, c.height).data) };
}
export function deImage(im) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
  c.getContext('2d').drawImage(im, 0, 0);
  return deToile(c);
}
export const charger = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
export const versPng = (img) => versToile(img).toDataURL('image/png');
export function agrandie(img, k) {
  const src = versToile(img), c = document.createElement('canvas');
  c.width = img.l * k; c.height = img.h * k;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// Une image agrandie (blocs de k × k identiques) ramenée à 1 pixel par gros pixel
export function echelleNative(img) {
  for (let k = 32; k > 1; k--) {
    if (img.l % k || img.h % k) continue;
    let ok = true;
    for (let y = 0; y < img.h && ok; y++) for (let x = 0; x < img.l; x++) {
      if (!memeCouleur(lire(img, x, y), lire(img, x - (x % k), y - (y % k)))) { ok = false; break; }
    }
    if (ok) return redimensionner(img, img.l / k, img.h / k);
  }
  return img;
}

// ---------- Couleurs de l'image ----------
export function couleurs(img) {
  const n = new Map();
  for (let i = 0; i < img.d.length; i += 4) {
    if (!img.d[i + 3]) continue;
    const k = ((img.d[i] << 24) | (img.d[i + 1] << 16) | (img.d[i + 2] << 8) | img.d[i + 3]) >>> 0;
    n.set(k, (n.get(k) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k, nb]) => ({ c: deCle(k), nb }));
}
export function tsl(c) { // teinte 0..360, saturation et luminosité 0..1
  const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function deTsl(h, s, l, a = 255) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) { const v = Math.round(l * 255); return [v, v, v, a]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255), a];
}
export const trierParTeinte = (liste) => liste.slice().sort((a, b) => {
  const [ha, sa, la] = tsl(a), [hb, sb, lb] = tsl(b);
  const gris = (s) => s < 0.12;
  if (gris(sa) !== gris(sb)) return gris(sa) ? 1 : -1;
  if (gris(sa)) return la - lb;
  return Math.round(ha / 20) - Math.round(hb / 20) || la - lb;
});

// ---------- Tracés ----------
export function ligne(x0, y0, x1, y1) { // Bresenham
  const pts = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
  return pts;
}
export function rectangle(x0, y0, x1, y1, plein) {
  const [a, b, c, d] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  const pts = [];
  for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) if (plein || x === a || x === c || y === b || y === d) pts.push([x, y]);
  return pts;
}
// Ellipse inscrite dans le rectangle (x0,y0)-(x1,y1), au pixel près, sans trous dans le contour
export function ellipse(x0, y0, x1, y1, plein) {
  const [a, b, c, d] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  const cx = (a + c) / 2, cy = (b + d) / 2, rx = (c - a + 1) / 2, ry = (d - b + 1) / 2;
  const dans = (x, y) => ((x + 0.5 - cx - 0.5) / rx) ** 2 + ((y + 0.5 - cy - 0.5) / ry) ** 2 <= 1;
  const pts = [];
  for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) {
    if (!dans(x, y)) continue;
    if (plein || !dans(x - 1, y) || !dans(x + 1, y) || !dans(x, y - 1) || !dans(x, y + 1)) pts.push([x, y]);
  }
  return pts;
}
// Remplissage : les pixels de la même couleur reliés (contigu) ou toute l'image
export function zoneDeMeme(img, x, y, contigu = true) {
  if (!dedans(img, x, y)) return [];
  const cible = lire(img, x, y);
  const pts = [];
  if (!contigu) {
    for (let j = 0; j < img.h; j++) for (let i = 0; i < img.l; i++) if (memeCouleur(lire(img, i, j), cible)) pts.push([i, j]);
    return pts;
  }
  const vu = new Uint8Array(img.l * img.h);
  const pile = [[x, y]];
  while (pile.length) {
    const [i, j] = pile.pop();
    if (!dedans(img, i, j) || vu[j * img.l + i]) continue;
    vu[j * img.l + i] = 1;
    if (!memeCouleur(lire(img, i, j), cible)) continue;
    pts.push([i, j]);
    pile.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  return pts;
}

// ---------- Transformations ----------
export function miroir(img, horizontal = true) {
  const r = creer(img.l, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.l; x++) ecrire(r, horizontal ? img.l - 1 - x : x, horizontal ? y : img.h - 1 - y, lire(img, x, y));
  return r;
}
export function tourner(img, horaire = true) {
  const r = creer(img.h, img.l);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.l; x++) ecrire(r, horaire ? img.h - 1 - y : y, horaire ? x : img.l - 1 - x, lire(img, x, y));
  return r;
}
// Nouvelle taille de toile, l'image posée selon l'ancre (ax, ay ∈ 0, 0.5, 1)
export function toile(img, l, h, ax = 0.5, ay = 1) {
  const r = creer(l, h);
  const dx = Math.round((l - img.l) * ax), dy = Math.round((h - img.h) * ay);
  coller(r, img, dx, dy);
  return r;
}
export function coller(dest, src, dx, dy, fondu = false) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.l; x++) {
    const c = lire(src, x, y);
    if (fondu && !c[3]) continue;
    ecrire(dest, x + dx, y + dy, c);
  }
}
export function extraire(img, x0, y0, l, h) {
  const r = creer(l, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) if (dedans(img, x0 + x, y0 + y)) ecrire(r, x, y, lire(img, x0 + x, y0 + y));
  return r;
}
export function redimensionner(img, l, h) { // au plus proche voisin
  const r = creer(l, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) ecrire(r, x, y, lire(img, Math.floor(x * img.l / l), Math.floor(y * img.h / h)));
  return r;
}
export function cadreDuContenu(img) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.l; x++) if (img.d[(y * img.l + x) * 4 + 3]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x: x0, y: y0, l: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// Le contour d'un pixel autour de la forme (comme le fait le jeu), à l'extérieur ou à l'intérieur
export function contour(img, couleur, exterieur = true, diagonales = false) {
  const r = copier(img);
  const plein = (x, y) => dedans(img, x, y) && img.d[(y * img.l + x) * 4 + 3] > 0;
  const voisins = diagonales ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.l; x++) {
    if (exterieur && !plein(x, y) && voisins.some(([a, b]) => plein(x + a, y + b))) ecrire(r, x, y, couleur);
    if (!exterieur && plein(x, y) && voisins.some(([a, b]) => !plein(x + a, y + b))) ecrire(r, x, y, couleur);
  }
  return r;
}
// Teinte, saturation, luminosité décalées (pour faire une variante de couleur, un nouveau skin…)
export function ajuster(img, dTeinte, dSat, dLum, masque = null) {
  const r = copier(img);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.l; x++) {
    if (masque && !masque(x, y)) continue;
    const c = lire(img, x, y);
    if (!c[3]) continue;
    const [h, s, l] = tsl(c);
    ecrire(r, x, y, deTsl(h + dTeinte, Math.max(0, Math.min(1, s * (1 + dSat))), Math.max(0, Math.min(1, l + dLum)), c[3]));
  }
  return r;
}
export function remplacer(img, de, vers) {
  const r = copier(img);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.l; x++) if (memeCouleur(lire(img, x, y), de)) ecrire(r, x, y, vers);
  return r;
}
export function egales(a, b) {
  if (!a || !b || a.l !== b.l || a.h !== b.h) return false;
  for (let i = 0; i < a.d.length; i++) if (a.d[i] !== b.d[i]) return false;
  return true;
}
