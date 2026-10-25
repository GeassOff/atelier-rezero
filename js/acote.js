// L'image à côté : une référence affichée à côté de la toile pendant qu'on dessine (une image de la
// bibliothèque, ou une image de son PC). On y zoome et on s'y déplace sans toucher à la toile, et un clic
// y prend la couleur (clic droit : couleur secondaire). Ce qu'on y met reste dans ce navigateur.
import * as px from './pixels.js?v=20261025235747';
import { etat, CATEGORIES, nomDe, catDe, sousCatDe, urlImage, verrouille } from './etat.js?v=20261025235747';

const $ = (s) => document.querySelector(s);
const MEMOIRE = 'atelier-acote', MEMOIRE_IMAGE = 'atelier-acote-image';
const m = (() => { try { return JSON.parse(localStorage.getItem(MEMOIRE) || '{}'); } catch { return {}; } })();
const a = { ouvert: false, largeur: 340, cle: null, ...m, img: null, toile: null, nom: '', zoom: 1, ox: 0, oy: 0 };
const garder = () => { try { localStorage.setItem(MEMOIRE, JSON.stringify({ ouvert: a.ouvert, largeur: a.largeur, cle: a.cle })); } catch {} };
let prendre = () => {};
let survol = null;

export const estOuvert = () => a.ouvert;
export function basculer(ouvert = !a.ouvert) {
  a.ouvert = ouvert;
  $('#acote').hidden = !ouvert;
  garder();
  document.dispatchEvent(new CustomEvent('acote-change'));
  if (ouvert) requestAnimationFrame(() => { if (a.img && !a.vueFaite) ajuster(); dessiner(); });
}

// ---------- Mettre une image ----------
function montrer(img, nom, cle) {
  a.img = img; a.nom = nom; a.cle = cle;
  a.toile = px.versToile(img);
  a.vueFaite = false;
  garder();
  $('#acote-nom').textContent = nom;
  $('#acote').classList.add('pleine');
  if (!a.ouvert) basculer(true);
  ajuster();
}
export async function montrerAsset(asset) {
  montrer(px.deImage(await px.charger(urlImage(asset))), nomDe(asset), 'asset:' + asset.id);
}
async function montrerFichier(f) {
  if (!f || !f.type.startsWith('image/')) return;
  const url = URL.createObjectURL(f);
  try {
    let im = await px.charger(url);
    // une grande photo est ramenée à 2048 px de côté (assez pour s'en servir, et ça tient en mémoire)
    const k = Math.min(1, 2048 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    const img = px.echelleNative(px.deToile(c)); // un pixel art agrandi revient à ses vrais pixels
    montrer(img, f.name.replace(/\.[^.]+$/, ''), 'pc');
    try { localStorage.setItem(MEMOIRE_IMAGE, JSON.stringify({ nom: a.nom, png: px.versPng(img) })); } catch { /* trop grande pour être gardée : tant pis */ }
  } finally { URL.revokeObjectURL(url); }
}
// Au démarrage (une fois la bibliothèque lue) : on remet l'image de la dernière fois
export async function restaurer() {
  try {
    if (a.cle?.startsWith('asset:') && etat.biblio.assets[a.cle.slice(6)]) await montrerAsset(etat.biblio.assets[a.cle.slice(6)]);
    else if (a.cle === 'pc') {
      const g = JSON.parse(localStorage.getItem(MEMOIRE_IMAGE) || 'null');
      if (g) montrer(px.deImage(await px.charger(g.png)), g.nom, 'pc');
    }
  } catch {}
  if (!a.ouvert) $('#acote').hidden = true;
}

// ---------- La vue ----------
function ajuster() {
  const z = $('#acote-vue').getBoundingClientRect();
  if (!a.img || !z.width) return;
  a.vueFaite = true;
  let k = Math.min((z.width - 16) / a.img.l, (z.height - 16) / a.img.h);
  if (k >= 1) k = Math.floor(k);
  a.zoom = Math.max(0.05, Math.min(64, k));
  a.ox = Math.round((z.width - a.img.l * a.zoom) / 2);
  a.oy = Math.round((z.height - a.img.h * a.zoom) / 2);
  dessiner();
}
function zoomer(k, cx, cy) {
  const n = Math.max(0.05, Math.min(64, a.zoom * k));
  const ix = (cx - a.ox) / a.zoom, iy = (cy - a.oy) / a.zoom;
  a.zoom = n >= 1 ? Math.round(n) || 1 : n;
  a.ox = cx - ix * a.zoom; a.oy = cy - iy * a.zoom;
  dessiner();
}
function dessiner() {
  const c = $('#acote-toile'), z = $('#acote-vue');
  const dpr = window.devicePixelRatio || 1, W = z.clientWidth, H = z.clientHeight;
  if (!W) return;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!a.toile) return;
  g.imageSmoothingEnabled = a.zoom < 1;
  g.drawImage(a.toile, a.ox, a.oy, a.img.l * a.zoom, a.img.h * a.zoom);
  g.strokeStyle = 'rgba(163,168,207,.35)';
  g.strokeRect(Math.round(a.ox) - 0.5, Math.round(a.oy) - 0.5, a.img.l * a.zoom + 1, a.img.h * a.zoom + 1);
  majInfos();
}
const pixelSous = (e) => {
  const r = $('#acote-toile').getBoundingClientRect();
  return [Math.floor((e.clientX - r.left - a.ox) / a.zoom), Math.floor((e.clientY - r.top - a.oy) / a.zoom)];
};
function majInfos() {
  const z = $('#acote-infos');
  if (!a.img) { z.textContent = ''; return; }
  let t = `${a.img.l} × ${a.img.h} · ×${a.zoom < 1 ? a.zoom.toFixed(2) : a.zoom}`;
  if (survol && px.dedans(a.img, ...survol)) {
    const c = px.lire(a.img, ...survol);
    t += c[3] ? ` · ${px.versHex(c)}` : ' · transparent';
  }
  z.textContent = t;
}

// ---------- Choisir dans la bibliothèque ----------
let filtreCat = 'refs';
function choisirDansBiblio() {
  const dlg = $('#dlg-choisir');
  const champ = $('#choisir-recherche'), grille = $('#choisir-grille'), puces = $('#choisir-cats');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rendre = () => {
    puces.innerHTML = '';
    for (const c of [{ id: 'tout', nom: 'Tout' }, ...CATEGORIES]) {
      if (c.id !== 'tout' && !Object.values(etat.biblio.assets).some((x) => catDe(x) === c.id)) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'puce' + (filtreCat === c.id ? ' actif' : ''); b.textContent = c.nom;
      b.onclick = () => { filtreCat = c.id; rendre(); };
      puces.append(b);
    }
    const mots = norm(champ.value).split(/\s+/).filter(Boolean);
    const liste = Object.values(etat.biblio.assets)
      .filter((x) => filtreCat === 'tout' || catDe(x) === filtreCat)
      .filter((x) => mots.every((w) => norm([nomDe(x), x.id, sousCatDe(x), ...(x.tags || [])].join(' ')).includes(w)))
      .sort((x, y) => verrouille(y) - verrouille(x) || (x.ordre ?? 1e9) - (y.ordre ?? 1e9))
      .slice(0, 150);
    grille.innerHTML = '';
    for (const x of liste) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'carte-mini'; b.title = nomDe(x);
      const im = document.createElement('img'); im.src = urlImage(x); im.alt = ''; im.loading = 'lazy';
      const n = document.createElement('span'); n.textContent = nomDe(x);
      b.append(im, n);
      b.onclick = () => { dlg.close(); montrerAsset(x); };
      grille.append(b);
    }
    if (!liste.length) grille.innerHTML = '<p class="vide-grille">Rien ne correspond.</p>';
  };
  champ.value = '';
  champ.oninput = rendre;
  rendre();
  dlg.showModal();
  champ.focus();
}

// ---------- Mise en place ----------
export function initACote(surCouleur) {
  prendre = surCouleur;
  const z = $('#acote'), vue = $('#acote-vue'), c = $('#acote-toile');
  a.largeur = Math.min(a.largeur, Math.round(window.innerWidth * 0.35));
  z.style.setProperty('--acote-l', a.largeur + 'px');
  $('#acote-biblio').onclick = choisirDansBiblio;
  $('#acote-pc').onclick = () => $('#acote-fichier').click();
  $('#acote-fichier').onchange = (e) => { montrerFichier(e.target.files[0]); e.target.value = ''; };
  $('#acote-fermer').onclick = () => basculer(false);
  $('#acote-ajuster').onclick = ajuster;
  // glisser une image dedans (sans qu'elle parte dans les créations)
  vue.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); vue.classList.add('survol'); });
  vue.addEventListener('dragleave', () => vue.classList.remove('survol'));
  vue.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); vue.classList.remove('survol');
    document.querySelector('#depot')?.classList.remove('visible');
    montrerFichier(e.dataTransfer.files[0]);
  }, true);
  // souris : glisser = bouger, clic = prendre la couleur, molette = zoom, double-clic = tout voir
  let geste = null;
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  c.addEventListener('pointerdown', (e) => {
    if (!a.img) return;
    c.setPointerCapture(e.pointerId);
    geste = { x0: e.clientX, y0: e.clientY, ox: a.ox, oy: a.oy, bouge: false, droit: e.button === 2 };
  });
  c.addEventListener('pointermove', (e) => {
    if (!a.img) return;
    if (geste) {
      if (Math.abs(e.clientX - geste.x0) + Math.abs(e.clientY - geste.y0) > 3) geste.bouge = true;
      if (geste.bouge) { a.ox = geste.ox + e.clientX - geste.x0; a.oy = geste.oy + e.clientY - geste.y0; c.classList.add('tient'); }
    }
    survol = pixelSous(e);
    dessiner();
  });
  c.addEventListener('pointerup', (e) => {
    if (geste && !geste.bouge) {
      const [x, y] = pixelSous(e);
      if (px.dedans(a.img, x, y)) { const col = px.lire(a.img, x, y); if (col[3]) prendre(col, geste.droit); }
    }
    geste = null; c.classList.remove('tient');
  });
  c.addEventListener('pointerleave', () => { survol = null; majInfos(); });
  c.addEventListener('dblclick', ajuster);
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = c.getBoundingClientRect();
    zoomer(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  // la poignée à gauche : élargir / rétrécir
  const poignee = $('#acote-poignee');
  poignee.addEventListener('pointerdown', (e) => {
    poignee.setPointerCapture(e.pointerId);
    const x0 = e.clientX, l0 = a.largeur;
    const bouger = (ev) => { a.largeur = Math.max(180, Math.min(window.innerWidth * 0.6, l0 + x0 - ev.clientX)); z.style.setProperty('--acote-l', a.largeur + 'px'); dessiner(); };
    const fin = () => { poignee.removeEventListener('pointermove', bouger); garder(); document.dispatchEvent(new CustomEvent('acote-change')); };
    poignee.addEventListener('pointermove', bouger);
    poignee.addEventListener('pointerup', fin, { once: true });
  });
  new ResizeObserver(() => dessiner()).observe(vue);
  $('#acote').hidden = !a.ouvert;
}
