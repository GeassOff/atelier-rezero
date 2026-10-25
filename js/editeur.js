// L'atelier : l'éditeur de pixel art. Une image à la fois, en vrais pixels (1 pixel = 1 gros pixel du jeu).
import * as px from './pixels.js?v=20261025235747';
import { etat, nomDe, catDe, urlImage, urlOriginal, membresGroupe, enregistrer, enregistrerPlusieurs, retirerVersion, enregistrerPalettes, idLibre, slug, toast, telecharger, verrouille, versionDe, Conflit, quand } from './etat.js?v=20261025235747';
import { session } from './depot.js?v=20261025235747';
import { initACote, basculer as basculerACote, estOuvert as aCoteOuvert } from './acote.js?v=20261025235747';
import { demanderFiche, demanderToile, demanderAjustement } from './dialogues.js?v=20261025235747';

const $ = (s) => document.querySelector(s);
const TRANSPARENT = [0, 0, 0, 0];

// ---------- Les outils (icônes dessinées en pixels, 12 × 12) ----------
const ICONES = {
  crayon: ['.........##.', '........#..#', '.......#.#.#', '......#.#.#.', '.....#.#.#..', '....#.#.#...', '...#.#.#....', '..#.#.#.....', '.#.#.#......', '.##.#.......', '.###........', '............'],
  gomme: ['............', '......###...', '.....#####..', '....#######.', '...#.#####.#', '..#...###.#.', '.#.....#.#..', '#.......#...', '.#.....#....', '..#####.....', '............', '############'],
  pot: ['....##......', '...#..#.....', '..#....#....', '.#..##..#...', '#..#..#..#..', '.#..##..###.', '..#....####.', '...#..#.####', '....##..###.', '.........#..', '.........#..', '........###.'],
  pipette: ['.........##.', '........####', '.......#####', '......####..', '.......##...', '......#.#...', '.....#.#....', '....#.#.....', '...#.#......', '..#.#.......', '.##.........', '#...........'],
  ligne: ['..........##', '.........##.', '........##..', '.......##...', '......##....', '.....##.....', '....##......', '...##.......', '..##........', '.##.........', '##..........', '#...........'],
  rect: ['............', '############', '#..........#', '#..........#', '#..........#', '#..........#', '#..........#', '#..........#', '#..........#', '############', '............', '............'],
  ellipse: ['............', '....####....', '..##....##..', '.#........#.', '#..........#', '#..........#', '#..........#', '.#........#.', '..##....##..', '....####....', '............', '............'],
  selection: ['##.##.##.##.', '#..........#', '............', '#..........#', '#..........#', '............', '#..........#', '#..........#', '............', '#..........#', '##.##.##.##.', '............'],
  deplacer: ['.....##.....', '....####....', '.....##.....', '.....##.....', '.#...##...#.', '############', '############', '.#...##...#.', '.....##.....', '.....##.....', '....####....', '.....##.....'],
  main: ['....#.#.....', '...#.#.#.#..', '...#.#.#.#.#', '...#.#.#.#.#', '.#.#.#.#.#.#', '#.##.......#', '#.#........#', '#..........#', '.#.........#', '..#.......#.', '...#......#.', '...#######..'],
};
const svgIcone = (lignes) => `<svg viewBox="0 0 12 12" fill="currentColor">${lignes.map((l, y) => [...l].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')).join('')).join('')}</svg>`;
const OUTILS = [
  { id: 'crayon', nom: 'Crayon', touche: 'B' },
  { id: 'gomme', nom: 'Gomme', touche: 'E' },
  { id: 'pot', nom: 'Pot de peinture', touche: 'R' },
  { id: 'pipette', nom: 'Pipette (ou Alt + clic)', touche: 'I' },
  null,
  { id: 'ligne', nom: 'Ligne (Maj : angles droits et diagonales)', touche: 'L' },
  { id: 'rect', nom: 'Rectangle (Maj : carré)', touche: 'U' },
  { id: 'ellipse', nom: 'Ellipse (Maj : cercle)', touche: 'O' },
  null,
  { id: 'selection', nom: 'Sélection (glisse dedans pour déplacer)', touche: 'M' },
  { id: 'deplacer', nom: 'Déplacer le dessin ou la sélection', touche: 'V' },
  { id: 'main', nom: 'Main : bouger la vue (ou Espace, ou clic molette)', touche: 'H' },
];

// ---------- L'état de l'atelier ----------
const prefs = (() => { try { return JSON.parse(localStorage.getItem('atelier-editeur') || '{}'); } catch { return {}; } })();
const o = {
  outil: 'crayon', taille: 1, pixelParfait: true, symX: false, symY: false, trame: false, plein: false, contigu: true, grille: true, fond: 'damier',
  prim: [26, 20, 40, 255], sec: [255, 255, 255, 255], palette: 'jeu:Le dessin de Tiago', fps: 6, fondApercu: 'bureau', pelureOpacite: 35, enregistrerAuto: true,
  ...prefs,
};
const garderPrefs = () => { try { const { outil, ...p } = o; localStorage.setItem('atelier-editeur', JSON.stringify({ ...p, outil })); } catch {} };

let doc = null;          // { asset, id, img, original, sale }
let histoire = [], futur = [];
let sel = null;          // { x, y, l, h, flottant: img|null }
let pressePapier = null;
let apercuPixels = null; // Map "x,y" → couleur, pendant qu'on trace une forme
let pelure = { ref: '', img: null, toile: null };
let comparer = false;
const v = { zoom: 8, ox: 0, oy: 0 };
let survol = null;       // [x, y] du pixel sous la souris
let espace = false, altTenu = false;
let toileImage = document.createElement('canvas'), toileImageSale = true;

const ecran = () => $('#ecran');

// ================== Ouvrir / enregistrer ==================
export function aDesChangements() { return Boolean(doc && doc.sale); }
export function docOuvert() { return doc; }

// Avant de quitter un dessin pas enregistré : on l'enregistre (si la case est cochée), sinon on demande
async function quitterDoc() {
  if (!doc || !doc.sale) return true;
  if (o.enregistrerAuto && doc.id && !verrouille(doc.asset)) return enregistrerDoc();
  if (!confirm(`« ${doc.nom} » a des changements pas enregistrés. Les abandonner ?`)) return false;
  oublierBrouillon();
  return true;
}
export async function ouvrirAsset(a) {
  if (doc && doc.id === a.id) return true;
  if (!(await quitterDoc())) return false;
  let img = px.deImage(await px.charger(urlImage(a)));
  const original = a.source === 'jeu' ? px.deImage(await px.charger(urlOriginal(a))) : null;
  let sale = false;
  // un brouillon laissé là la dernière fois (onglet fermé avant d'enregistrer) ?
  const b = lireBrouillon(a.id);
  if (b) {
    const vieux = b.version !== versionDe(a);
    if (confirm(`Tu as un brouillon pas enregistré de « ${nomDe(a)} » (${quand(b.quand)}).` + (vieux ? `\nAttention : le dessin a été enregistré depuis${a.modifiePar ? ' par ' + a.modifiePar : ''}.` : '') + '\n\nLe reprendre ?')) {
      img = px.deImage(await px.charger(b.png)); sale = true;
    } else localStorage.removeItem(CLE_BROUILLON + a.id);
  }
  chargerDoc({ asset: a, id: a.id, nom: nomDe(a), img, original, sale, version: versionDe(a) });
  return true;
}
export async function ouvrirNeuf({ nom, categorie, groupe, l, h, img }) {
  if (!(await quitterDoc())) return false;
  chargerDoc({ asset: null, id: null, nom, categorie, groupe, img: img || px.creer(l, h), original: null, sale: true });
  return true;
}

// ================== Brouillons ==================
// À chaque changement, le dessin est gardé dans ce navigateur : si l'onglet se ferme avant
// d'enregistrer, on le retrouve en rouvrant le dessin.
const CLE_BROUILLON = 'atelier-brouillon:';
const cleBrouillon = () => CLE_BROUILLON + (doc.id || 'neuf');
function lireBrouillon(id) { try { return JSON.parse(localStorage.getItem(CLE_BROUILLON + id) || 'null'); } catch { return null; } }
let attenteBrouillon = 0;
function garderBrouillon() {
  clearTimeout(attenteBrouillon);
  attenteBrouillon = setTimeout(() => {
    if (!doc || !doc.sale) return;
    try {
      localStorage.setItem(cleBrouillon(), JSON.stringify({ png: px.versPng(doc.img), quand: new Date().toISOString(), version: doc.version, nom: doc.nom, categorie: doc.categorie, groupe: doc.groupe }));
    } catch {}
  }, 800);
}
function oublierBrouillon() {
  clearTimeout(attenteBrouillon);
  if (doc) try { localStorage.removeItem(cleBrouillon()); } catch {}
}
// Un nouveau dessin jamais enregistré : on le propose quand rien n'est ouvert
function proposerBrouillonNeuf() {
  const z = $('#reprendre-neuf'), b = lireBrouillon('neuf');
  z.hidden = !b;
  if (!b) return;
  z.innerHTML = '';
  const lien = document.createElement('a');
  lien.href = '#';
  lien.textContent = `↺ Reprendre « ${b.nom} », pas enregistré (${quand(b.quand)})`;
  lien.onclick = async (e) => {
    e.preventDefault();
    const img = px.deImage(await px.charger(b.png));
    chargerDoc({ asset: null, id: null, nom: b.nom, categorie: b.categorie, groupe: b.groupe, img, original: null, sale: true });
  };
  z.append(lien);
}
function chargerDoc(d) {
  doc = d;
  histoire = []; futur = [];
  sel = null; apercuPixels = null;
  toileImageSale = true;
  $('#atelier-vide').hidden = true;
  ajusterVue();
  remplirPelure();
  majPanneau();
}

// → vrai si c'est enregistré
async function enregistrerDoc(forcer = false) {
  if (!doc) return false;
  validerFlottant();
  if (!doc.id) return enregistrerSous();
  const a = etat.biblio.assets[doc.id];
  if (verrouille(a)) { toast('Une référence ne se retouche pas : enregistre ta version comme un nouveau dessin'); return enregistrerSous(); }
  const d = doc;
  try {
    if (a && a.source === 'jeu' && d.original && px.egales(d.img, d.original)) {
      if (a.modifie) await retirerVersion(d.id); // identique à l'original : pas besoin d'une copie
      toast('Identique à l’original du jeu : rien à garder', 'ok');
    } else {
      d.asset = await enregistrer(d.id, px.versPng(d.img), { l: d.img.l, h: d.img.h, couleurs: px.couleurs(d.img).length }, forcer ? undefined : d.version);
      toast('Enregistré : ' + d.nom + ' (les autres le voient dans la minute)', 'ok');
    }
    d.version = versionDe(etat.biblio.assets[d.id]);
    if (doc === d) { oublierBrouillon(); doc.sale = false; majPanneau(); }
    return true;
  } catch (e) {
    if (e instanceof Conflit) {
      // quelqu'un d'autre a enregistré ce dessin entre-temps : on ne l'écrase pas sans demander
      if (confirm(`${e.message}.\n\nOK : remplacer sa version par la tienne (la sienne reste dans « 🕘 Versions »).\nAnnuler : enregistrer la tienne comme un nouveau dessin.`)) return enregistrerDoc(true);
      return enregistrerSous();
    }
    toast('Pas enregistré : ' + e.message, 'ko');
    return false;
  }
}
async function enregistrerSous() {
  if (!doc) return false;
  validerFlottant();
  const a = doc.asset;
  const r = await demanderFiche({
    titre: doc.id ? 'Enregistrer comme nouveau' : 'Enregistrer le dessin', bouton: 'Enregistrer',
    nom: doc.id ? nomDe(a) + ' (variante)' : doc.nom, categorie: a ? catDe(a) : doc.categorie || 'creations', groupe: a ? a.groupe : doc.groupe,
  });
  if (!r) return false;
  const id = idLibre('creations/' + slug(r.nom));
  try {
    const nouveau = await enregistrer(id, px.versPng(doc.img), {
      nom: r.nom, categorie: r.categorie, groupe: r.groupe, sousCategorie: a ? a.sousCategorie : 'Créations de ' + (session.pseudo || '?'),
      tags: a ? [...new Set([...(a.tags || []).filter((t) => t !== 'calque' && t !== 'référence'), 'variante'])] : [],
      l: doc.img.l, h: doc.img.h, couleurs: px.couleurs(doc.img).length,
    });
    oublierBrouillon();
    doc = { ...doc, asset: nouveau, id, nom: r.nom, original: null, sale: false, version: versionDe(nouveau) };
    toast('Nouveau dessin enregistré : ' + r.nom, 'ok');
    remplirPelure();
    majPanneau();
    return true;
  } catch (e) { toast('Pas enregistré : ' + e.message, 'ko'); return false; }
}

// ================== Une couleur, dans toutes les images du groupe ==================
let modeGroupe = false;
async function recolorerGroupe(de) {
  modeGroupe = false; majCouleursImage();
  if (!doc || !doc.asset) return;
  const membres = membresGroupe(doc.asset).filter((m) => !verrouille(m));
  if (membres.length < 2) return toast('Ce dessin n’est pas dans un groupe (une animation) : Maj+clic suffit');
  if (px.memeCouleur(de, o.prim)) return toast('Choisis d’abord la nouvelle couleur (couleur principale)');
  if (!confirm(`Remplacer ${px.versHex(de)} par ${px.versHex(o.prim)} dans les ${membres.length} images de « ${doc.asset.groupe} » ?\nTout part en un seul enregistrement.`)) return;
  validerFlottant();
  const liste = [];
  let nouvelleOuverte = null;
  for (const m of membres) {
    const avant = m.id === doc.id ? doc.img : px.deImage(await px.charger(urlImage(m)));
    const apres = px.remplacer(avant, de, o.prim);
    if (px.egales(avant, apres) && !(m.id === doc.id && doc.sale)) continue;
    if (m.id === doc.id) nouvelleOuverte = apres;
    liste.push({ id: m.id, png: px.versPng(apres), meta: { l: apres.l, h: apres.h, couleurs: px.couleurs(apres).length }, attendu: m.id === doc.id ? doc.version : versionDe(m) });
  }
  if (!liste.length) return toast('Cette couleur n’est dans aucune image du groupe');
  try {
    await enregistrerPlusieurs(`Couleur ${px.versHex(de)} → ${px.versHex(o.prim)} dans ${doc.asset.groupe} (${liste.length} images)`, liste);
    if (nouvelleOuverte) { memoriser(); doc.img = nouvelleOuverte; }
    oublierBrouillon();
    doc.sale = false; doc.version = versionDe(etat.biblio.assets[doc.id]);
    toileImageSale = true;
    majPanneau();
    toast(`Couleur remplacée dans ${liste.length} image${liste.length > 1 ? 's' : ''}`, 'ok');
  } catch (e) { toast('Pas fait : ' + e.message, 'ko'); }
}

// ================== Historique ==================
const instantane = () => ({ img: px.copier(doc.img), sel: sel && { ...sel, flottant: sel.flottant && px.copier(sel.flottant) } });
function memoriser() {
  histoire.push(instantane());
  if (histoire.length > 300) histoire.shift();
  futur = [];
}
function changement() {
  doc.sale = true;
  garderBrouillon();
  toileImageSale = true;
  majCouleursImage();
  majInfos();
  majApercus();
  dessiner();
}
function annuler() {
  if (!doc || !histoire.length) return;
  futur.push(instantane());
  const e = histoire.pop();
  doc.img = e.img; sel = e.sel;
  changement();
}
function refaire() {
  if (!doc || !futur.length) return;
  histoire.push(instantane());
  const e = futur.pop();
  doc.img = e.img; sel = e.sel;
  changement();
}

// ================== Peindre ==================
// Les pixels touchés par un coup de pinceau en (x, y) : taille, symétries, trame
function points(x, y, avecTaille = true) {
  const n = avecTaille ? o.taille : 1, a = -Math.floor((n - 1) / 2);
  const res = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const base = [x + a + i, y + a + j];
    const sym = [base];
    if (o.symX) sym.push([doc.img.l - 1 - base[0], base[1]]);
    if (o.symY) sym.push([base[0], doc.img.h - 1 - base[1]]);
    if (o.symX && o.symY) sym.push([doc.img.l - 1 - base[0], doc.img.h - 1 - base[1]]);
    for (const p of sym) if (!o.trame || (p[0] + p[1]) % 2 === 0) res.push(p);
  }
  return res;
}
// Un trait de crayon : on retient la couleur d'avant de chaque pixel (pour le « pixel parfait »)
let trait = null;
function debutTrait(couleur) {
  memoriser();
  trait = { couleur, avant: new Map(), pts: [], dernier: null };
}
function poserPoint(x, y) {
  const t = trait;
  for (const [i, j] of points(x, y)) {
    if (!px.dedans(doc.img, i, j)) continue;
    const k = i + ',' + j;
    if (!t.avant.has(k)) t.avant.set(k, px.lire(doc.img, i, j));
    px.ecrire(doc.img, i, j, t.couleur);
  }
  // Pixel parfait : pas de « coins en L » dans un trait d'un pixel d'épaisseur
  if (o.outil === 'crayon' && o.pixelParfait && o.taille === 1) {
    const p = t.pts;
    if (p.length >= 2) {
      const [a, b] = [p[p.length - 2], p[p.length - 1]];
      const coin = Math.abs(x - a[0]) === 1 && Math.abs(y - a[1]) === 1 && ((b[0] === a[0] && b[1] === y) || (b[1] === a[1] && b[0] === x));
      if (coin) {
        for (const [i, j] of points(b[0], b[1])) {
          const av = t.avant.get(i + ',' + j);
          if (av && !(i === x && j === y)) px.ecrire(doc.img, i, j, av);
        }
        p.pop();
      }
    }
    p.push([x, y]);
  }
}
function traitVers(x, y) {
  if (!trait.dernier) poserPoint(x, y);
  else for (const [i, j] of px.ligne(trait.dernier[0], trait.dernier[1], x, y).slice(1)) poserPoint(i, j);
  trait.dernier = [x, y];
  changement();
}

function formePoints(x0, y0, x1, y1, maj) {
  if (o.outil === 'ligne') {
    if (maj) { // à l'horizontale, à la verticale ou en diagonale parfaite
      const dx = x1 - x0, dy = y1 - y0;
      if (Math.abs(dx) > 2 * Math.abs(dy)) y1 = y0;
      else if (Math.abs(dy) > 2 * Math.abs(dx)) x1 = x0;
      else { const n = Math.max(Math.abs(dx), Math.abs(dy)); x1 = x0 + Math.sign(dx) * n; y1 = y0 + Math.sign(dy) * n; }
    }
    return px.ligne(x0, y0, x1, y1).flatMap(([x, y]) => points(x, y));
  }
  if (maj) { // carré, cercle
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    x1 = x0 + Math.sign(x1 - x0 || 1) * n; y1 = y0 + Math.sign(y1 - y0 || 1) * n;
  }
  const f = o.outil === 'rect' ? px.rectangle : px.ellipse;
  return f(x0, y0, x1, y1, o.plein).flatMap(([x, y]) => (o.taille > 1 && !o.plein ? points(x, y) : points(x, y, false)));
}

// ================== Sélection ==================
function lever(dansHistoire = true) { // la sélection devient un morceau « flottant » qu'on peut déplacer
  if (!sel || sel.flottant) return;
  if (dansHistoire) memoriser();
  sel.flottant = px.extraire(doc.img, sel.x, sel.y, sel.l, sel.h);
  for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.l; x++) px.ecrire(doc.img, sel.x + x, sel.y + y, TRANSPARENT);
  toileImageSale = true;
}
function validerFlottant() {
  if (!sel || !sel.flottant) return;
  px.coller(doc.img, sel.flottant, sel.x, sel.y, true);
  sel = { x: sel.x, y: sel.y, l: sel.l, h: sel.h, flottant: null };
  changement();
}
function deselectionner() {
  validerFlottant();
  sel = null;
  dessiner();
  majInfos();
}
function toutSelectionner() {
  validerFlottant();
  sel = { x: 0, y: 0, l: doc.img.l, h: doc.img.h, flottant: null };
  dessiner();
}
const dansSel = (x, y) => sel && x >= sel.x && y >= sel.y && x < sel.x + sel.l && y < sel.y + sel.h;
function copierSel() {
  if (!sel) return;
  pressePapier = sel.flottant ? px.copier(sel.flottant) : px.extraire(doc.img, sel.x, sel.y, sel.l, sel.h);
  // aussi dans le presse-papiers de Windows, en PNG (pour le coller ailleurs)
  try {
    px.versToile(pressePapier).toBlob((b) => navigator.clipboard?.write?.([new ClipboardItem({ 'image/png': b })]).catch(() => {}));
  } catch {}
  toast('Copié', 'ok');
}
function collerImage(img) {
  if (!doc) return;
  validerFlottant();
  memoriser();
  const x = survol ? Math.max(0, Math.min(doc.img.l - 1, survol[0])) : 0, y = survol ? Math.max(0, Math.min(doc.img.h - 1, survol[1])) : 0;
  sel = { x: sel ? sel.x : x, y: sel ? sel.y : y, l: img.l, h: img.h, flottant: px.copier(img) };
  if (img.l > doc.img.l || img.h > doc.img.h) toast('Le morceau collé est plus grand que la toile : agrandis-la (Transformer › Toile…)');
  choisirOutil('selection');
  changement();
}
function effacerSel() {
  if (!sel) return;
  if (sel.flottant) { sel.flottant = null; sel = null; changement(); return; }
  memoriser();
  for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.l; x++) px.ecrire(doc.img, sel.x + x, sel.y + y, TRANSPARENT);
  changement();
}
function decaler(dx, dy) {
  if (!sel) { sel = { x: 0, y: 0, l: doc.img.l, h: doc.img.h, flottant: null }; }
  lever();
  sel.x += dx; sel.y += dy;
  changement();
}

// ================== Transformations ==================
// sur le morceau sélectionné s'il y en a un, sinon sur tout le dessin
function transformer(f, changeTaille = false) {
  if (!doc) return;
  if (sel && !(sel.x === 0 && sel.y === 0 && sel.l === doc.img.l && sel.h === doc.img.h && !sel.flottant)) {
    lever();
    sel.flottant = f(sel.flottant);
    sel.l = sel.flottant.l; sel.h = sel.flottant.h;
  } else {
    if (sel) validerFlottant();
    memoriser();
    doc.img = f(doc.img);
    if (changeTaille) { sel = null; ajusterVue(); }
  }
  changement();
}
async function action(nom) {
  if (!doc) return;
  if (nom === 'miroirH') transformer((i) => px.miroir(i, true));
  if (nom === 'miroirV') transformer((i) => px.miroir(i, false));
  if (nom === 'tournerD') transformer((i) => px.tourner(i, true), true);
  if (nom === 'tournerG') transformer((i) => px.tourner(i, false), true);
  if (nom === 'contour') transformer((i) => px.contour(i, o.prim, true));
  if (nom === 'x2') transformer((i) => px.redimensionner(i, i.l * 2, i.h * 2), true);
  if (nom === 'd2') transformer((i) => px.redimensionner(i, Math.max(1, Math.round(i.l / 2)), Math.max(1, Math.round(i.h / 2))), true);
  if (nom === 'rogner') {
    validerFlottant(); sel = null;
    const c = px.cadreDuContenu(doc.img);
    if (!c) return toast('Le dessin est vide');
    memoriser();
    doc.img = px.extraire(doc.img, c.x, c.y, c.l, c.h);
    ajusterVue(); changement();
  }
  if (nom === 'taille') {
    validerFlottant(); sel = null;
    const r = await demanderToile(doc.img.l, doc.img.h);
    if (!r) return;
    memoriser();
    doc.img = px.toile(doc.img, r.l, r.h, r.ax, r.ay);
    ajusterVue(); changement();
  }
  if (nom === 'ajuster') {
    const avant = instantane();
    if (sel) lever(false);
    const cible = sel ? 'sel' : 'img';
    const source = cible === 'sel' ? px.copier(sel.flottant) : px.copier(doc.img);
    const sombre = (img) => (x, y) => px.tsl(px.lire(img, x, y))[2] > 0.16;
    const appliquer = ({ t, s, l, contours }) => {
      const r = px.ajuster(source, t, s, l, contours ? null : sombre(source));
      if (cible === 'sel') sel.flottant = r; else doc.img = r;
      toileImageSale = true; dessiner(); majApercus();
    };
    const r = await demanderAjustement(appliquer);
    if (!r) { doc.img = avant.img; sel = avant.sel; toileImageSale = true; dessiner(); majApercus(); return; }
    histoire.push(avant); futur = [];
    changement();
  }
}

// ================== Vue : zoom, déplacement ==================
function ajusterVue() {
  if (!doc) return;
  const s = $('#scene').getBoundingClientRect();
  if (!s.width) { v.aAjuster = true; return; } // (l'atelier est caché : on le fera en l'affichant)
  const k = Math.max(1, Math.floor(Math.min((s.width - 40) / doc.img.l, (s.height - 40) / doc.img.h)));
  v.zoom = Math.min(k, 64);
  v.ox = Math.round((s.width - doc.img.l * v.zoom) / 2);
  v.oy = Math.round((s.height - doc.img.h * v.zoom) / 2);
  dessiner(); majInfos();
}
function zoomer(nouveau, cx, cy) {
  nouveau = Math.max(1, Math.min(64, Math.round(nouveau)));
  if (nouveau === v.zoom) return;
  const s = $('#scene').getBoundingClientRect();
  if (cx === undefined) { cx = s.width / 2; cy = s.height / 2; }
  const ix = (cx - v.ox) / v.zoom, iy = (cy - v.oy) / v.zoom;
  v.zoom = nouveau;
  v.ox = Math.round(cx - ix * v.zoom);
  v.oy = Math.round(cy - iy * v.zoom);
  dessiner(); majInfos();
}
const pixelSous = (e) => {
  const r = ecran().getBoundingClientRect();
  return [Math.floor((e.clientX - r.left - v.ox) / v.zoom), Math.floor((e.clientY - r.top - v.oy) / v.zoom)];
};

// ================== Dessin à l'écran ==================
let tirets = 0;
function dessiner() {
  const c = ecran(), s = $('#scene');
  const dpr = window.devicePixelRatio || 1;
  const W = s.clientWidth, H = s.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);
  if (!doc) return;
  const { zoom: z, ox, oy } = v;
  const L = doc.img.l * z, Ht = doc.img.h * z;

  // le fond du dessin
  g.save();
  g.beginPath(); g.rect(ox, oy, L, Ht); g.clip();
  if (o.fond === 'damier') {
    const t = Math.max(4, Math.min(16, z >= 8 ? z : 8));
    for (let y = 0; y * t < Ht; y++) for (let x = 0; x * t < L; x++) { g.fillStyle = (x + y) % 2 ? '#252a45' : '#1d2138'; g.fillRect(ox + x * t, oy + y * t, t, t); }
  } else {
    g.fillStyle = FONDS[o.fond] || FONDS.bureau;
    g.fillRect(ox, oy, L, Ht);
  }
  g.restore();

  const montrer = (toile, alpha = 1) => { g.globalAlpha = alpha; g.drawImage(toile, ox, oy, L, Ht); g.globalAlpha = 1; };
  if (pelure.toile && !o.pelureDessus) { g.globalAlpha = o.pelureOpacite / 100; g.drawImage(pelure.toile, ox, oy, pelure.toile.width * z, pelure.toile.height * z); g.globalAlpha = 1; }
  if (comparer && doc.original) montrer(px.versToile(doc.original));
  else {
    if (toileImageSale) { px.versToile(doc.img, toileImage); toileImageSale = false; }
    montrer(toileImage);
    if (sel && sel.flottant) g.drawImage(px.versToile(sel.flottant), ox + sel.x * z, oy + sel.y * z, sel.flottant.l * z, sel.flottant.h * z);
    if (apercuPixels) for (const [k, col] of apercuPixels) {
      const [x, y] = k.split(',').map(Number);
      if (!px.dedans(doc.img, x, y)) continue;
      if (col[3] === 0) { g.clearRect(ox + x * z, oy + y * z, z, z); g.fillStyle = 'rgba(255,255,255,.25)'; }
      else g.fillStyle = px.css(col);
      g.fillRect(ox + x * z, oy + y * z, z, z);
    }
  }
  if (pelure.toile && o.pelureDessus) { g.globalAlpha = o.pelureOpacite / 100; g.drawImage(pelure.toile, ox, oy, pelure.toile.width * z, pelure.toile.height * z); g.globalAlpha = 1; }

  // la grille
  if (o.grille && z >= 6) {
    g.beginPath();
    for (let x = 1; x < doc.img.l; x++) { g.moveTo(ox + x * z + 0.5, oy); g.lineTo(ox + x * z + 0.5, oy + Ht); }
    for (let y = 1; y < doc.img.h; y++) { g.moveTo(ox, oy + y * z + 0.5); g.lineTo(ox + L, oy + y * z + 0.5); }
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.stroke();
    // un trait plus marqué toutes les 8 cases
    g.beginPath();
    for (let x = 8; x < doc.img.l; x += 8) { g.moveTo(ox + x * z + 0.5, oy); g.lineTo(ox + x * z + 0.5, oy + Ht); }
    for (let y = 8; y < doc.img.h; y += 8) { g.moveTo(ox, oy + y * z + 0.5); g.lineTo(ox + L, oy + y * z + 0.5); }
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.stroke();
  }
  // les axes de symétrie
  g.setLineDash([6, 4]);
  g.strokeStyle = 'rgba(195,166,255,.75)';
  if (o.symX) { g.beginPath(); g.moveTo(ox + L / 2, oy - 10); g.lineTo(ox + L / 2, oy + Ht + 10); g.stroke(); }
  if (o.symY) { g.beginPath(); g.moveTo(ox - 10, oy + Ht / 2); g.lineTo(ox + L + 10, oy + Ht / 2); g.stroke(); }
  g.setLineDash([]);
  // le bord de la toile
  g.strokeStyle = 'rgba(166,158,198,.45)';
  g.strokeRect(ox - 0.5, oy - 0.5, L + 1, Ht + 1);

  // la sélection (tirets qui défilent)
  if (sel) {
    const r = [ox + sel.x * z + 0.5, oy + sel.y * z + 0.5, sel.l * z - 1, sel.h * z - 1];
    g.lineWidth = 1;
    g.setLineDash([4, 4]);
    g.strokeStyle = '#000'; g.lineDashOffset = -tirets; g.strokeRect(...r);
    g.strokeStyle = '#fff'; g.lineDashOffset = -tirets + 4; g.strokeRect(...r);
    g.setLineDash([]);
  }
  // le pinceau sous la souris
  if (survol && !espace && ['crayon', 'gomme', 'ligne', 'rect', 'ellipse', 'pot', 'pipette'].includes(o.outil)) {
    const n = ['crayon', 'gomme', 'ligne'].includes(o.outil) ? o.taille : 1, a = -Math.floor((n - 1) / 2);
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.strokeRect(ox + (survol[0] + a) * z + 0.5, oy + (survol[1] + a) * z + 0.5, n * z - 1, n * z - 1);
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.strokeRect(ox + (survol[0] + a) * z - 0.5, oy + (survol[1] + a) * z - 0.5, n * z + 1, n * z + 1);
  }
}
setInterval(() => { if (sel && !$('#vue-atelier').hidden) { tirets = (tirets + 1) % 8; dessiner(); } }, 120);

// ================== Souris ==================
let geste = null; // ce qu'on est en train de faire avec la souris
function surAppui(e) {
  if (!doc) return;
  e.preventDefault();
  ecran().setPointerCapture(e.pointerId);
  const [x, y] = pixelSous(e);
  const droit = e.button === 2;
  const couleur = droit ? o.sec : o.prim;
  if (e.button === 1 || espace || o.outil === 'main') {
    geste = { type: 'main', x0: e.clientX, y0: e.clientY, ox: v.ox, oy: v.oy };
    $('#scene').classList.add('tient');
    return;
  }
  const outil = e.altKey ? 'pipette' : o.outil;
  if (outil === 'pipette') { pipette(x, y, droit); geste = { type: 'pipette', droit }; return; }
  if (outil === 'crayon' || outil === 'gomme') {
    debutTrait(outil === 'gomme' ? TRANSPARENT : couleur);
    geste = { type: 'trait' };
    traitVers(x, y);
    return;
  }
  if (outil === 'pot') {
    const zone = px.zoneDeMeme(doc.img, x, y, o.contigu);
    if (!zone.length) return;
    memoriser();
    for (const [i, j] of zone) if (!o.trame || (i + j) % 2 === 0) px.ecrire(doc.img, i, j, couleur);
    changement();
    return;
  }
  if (['ligne', 'rect', 'ellipse'].includes(outil)) {
    geste = { type: 'forme', x0: x, y0: y, couleur };
    apercuPixels = new Map(formePoints(x, y, x, y, e.shiftKey).map((p) => [p.join(','), couleur]));
    dessiner();
    return;
  }
  if (outil === 'selection' || outil === 'deplacer') {
    const auto = outil === 'deplacer' && !sel; // déplacer sans sélection : tout le dessin
    if (auto) sel = { x: 0, y: 0, l: doc.img.l, h: doc.img.h, flottant: null };
    if (outil === 'deplacer' || dansSel(x, y)) {
      lever();
      geste = { type: 'bouger', x0: x, y0: y, sx: sel.x, sy: sel.y, auto };
    } else {
      validerFlottant();
      geste = { type: 'selection', x0: x, y0: y };
      sel = null;
    }
    dessiner();
  }
}
function surMouvement(e) {
  if (!doc) return;
  const [x, y] = pixelSous(e);
  const avant = survol;
  survol = px.dedans(doc.img, x, y) || geste ? [x, y] : null;
  if (!geste) {
    if (String(avant) !== String(survol)) { dessiner(); majInfos(); }
    return;
  }
  if (geste.type === 'main') { v.ox = geste.ox + e.clientX - geste.x0; v.oy = geste.oy + e.clientY - geste.y0; dessiner(); return; }
  if (geste.type === 'pipette') { pipette(x, y, geste.droit); return; }
  if (geste.type === 'trait') { traitVers(x, y); return; }
  if (geste.type === 'forme') {
    apercuPixels = new Map(formePoints(geste.x0, geste.y0, x, y, e.shiftKey).map((p) => [p.join(','), geste.couleur]));
    geste.x1 = x; geste.y1 = y; geste.maj = e.shiftKey;
    dessiner(); majInfos();
    return;
  }
  if (geste.type === 'selection') {
    const cx = (n, max) => Math.max(0, Math.min(max - 1, n));
    const [a, b] = [cx(geste.x0, doc.img.l), cx(geste.y0, doc.img.h)], [c, d] = [cx(x, doc.img.l), cx(y, doc.img.h)];
    sel = { x: Math.min(a, c), y: Math.min(b, d), l: Math.abs(c - a) + 1, h: Math.abs(d - b) + 1, flottant: null };
    dessiner(); majInfos();
    return;
  }
  if (geste.type === 'bouger') {
    sel.x = geste.sx + x - geste.x0; sel.y = geste.sy + y - geste.y0;
    toileImageSale = true;
    dessiner(); majInfos();
  }
}
function surRelache() {
  if (!geste) return;
  if (geste.type === 'forme' && apercuPixels) {
    memoriser();
    for (const [k, col] of apercuPixels) { const [x, y] = k.split(',').map(Number); px.ecrire(doc.img, x, y, col); }
    apercuPixels = null;
    changement();
  }
  if (geste.type === 'trait') {
    // un trait qui n'a rien changé ne compte pas dans l'historique
    if ([...trait.avant].every(([k, c]) => { const [x, y] = k.split(',').map(Number); return px.memeCouleur(c, px.lire(doc.img, x, y)); })) { histoire.pop(); }
    trait = null;
  }
  if (geste.type === 'bouger') {
    if (geste.auto) { validerFlottant(); sel = null; }
    changement();
  }
  if (geste.type === 'selection' && sel && sel.l === 1 && sel.h === 1) { sel = null; dessiner(); }
  $('#scene').classList.remove('tient');
  geste = null;
}
function pipette(x, y, droit) {
  if (!px.dedans(doc.img, x, y)) return;
  const c = px.lire(doc.img, x, y);
  if (!c[3]) return;
  if (droit) o.sec = c; else o.prim = c;
  majCouleurs();
}

// ================== Clavier ==================
function clavier(e) {
  if ($('#vue-atelier').hidden || document.querySelector('dialog[open]')) return;
  const tape = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (ctrl && k === 's') { e.preventDefault(); if (e.shiftKey) enregistrerSous(); else enregistrerDoc(); return; }
  if (tape) return;
  if (ctrl && k === 'z') { e.preventDefault(); if (e.shiftKey) refaire(); else annuler(); return; }
  if (ctrl && k === 'y') { e.preventDefault(); refaire(); return; }
  if (!doc) return;
  if (ctrl && k === 'a') { e.preventDefault(); toutSelectionner(); return; }
  if (ctrl && k === 'c') { e.preventDefault(); copierSel(); return; }
  if (ctrl && k === 'x') { e.preventDefault(); copierSel(); effacerSel(); return; }
  if (ctrl && k === 'd') { e.preventDefault(); deselectionner(); return; }
  if (ctrl) return; // (Ctrl+V : voir l'évènement « paste »)
  if (e.key === ' ') { e.preventDefault(); if (!espace) { espace = true; $('#scene').classList.add('main'); } return; }
  if (e.key === 'Alt') { e.preventDefault(); altTenu = true; return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); effacerSel(); return; }
  if (e.key === 'Escape') { if (modeGroupe) { modeGroupe = false; majCouleursImage(); } deselectionner(); return; }

  if (e.key === 'Enter') { validerFlottant(); return; }
  if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); imageVoisine(e.key === 'PageDown' ? 1 : -1); return; }
  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    const n = e.shiftKey ? 8 : 1;
    decaler(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0);
    return;
  }
  const outil = OUTILS.find((x) => x && x.touche.toLowerCase() === k);
  if (outil) { choisirOutil(outil.id); return; }
  if (k === 'x') { [o.prim, o.sec] = [o.sec, o.prim]; majCouleurs(); return; }
  if (k === 'g') { o.grille = !o.grille; majOptions(); dessiner(); return; }
  if (['1', '2', '3', '4'].includes(e.key)) { o.taille = +e.key; majOptions(); dessiner(); return; }
  if (e.key === '+' || e.key === '=') { zoomer(v.zoom * 1.25 + 1); return; }
  if (e.key === '-') { zoomer(v.zoom / 1.25); return; }
  if (e.key === '0') { ajusterVue(); return; }
  if (k === 'a') { basculerACote(); majOptions(); return; }
}
function clavierRelache(e) {
  if (e.key === ' ') { espace = false; $('#scene').classList.remove('main'); }
  if (e.key === 'Alt') altTenu = false;
}

// ================== Panneaux ==================
function choisirOutil(id) {
  const garde = ['selection', 'deplacer'];
  if (garde.includes(o.outil) && !garde.includes(id)) validerFlottant();
  o.outil = id;
  garderPrefs();
  document.querySelectorAll('.outil').forEach((b) => b.classList.toggle('actif', b.dataset.outil === id));
  $('#scene').classList.toggle('main', id === 'main');
  majOptions();
  dessiner();
}

function majOptions() {
  const z = $('#options-outil');
  z.innerHTML = '';
  const seg = (titre, valeurs, cle) => {
    const g = document.createElement('span'); g.className = 'groupe';
    g.append(titre);
    const s = document.createElement('span'); s.className = 'seg';
    for (const [val, lib, aide] of valeurs) {
      const b = document.createElement('button');
      b.textContent = lib; b.title = aide || '';
      if (o[cle] === val) b.className = 'actif';
      b.onclick = () => { o[cle] = val; garderPrefs(); majOptions(); dessiner(); };
      s.append(b);
    }
    g.append(s); z.append(g);
  };
  const caseO = (cle, lib, aide) => {
    const l = document.createElement('label'); l.className = 'case'; l.title = aide || '';
    const i = document.createElement('input'); i.type = 'checkbox'; i.checked = o[cle];
    i.onchange = () => { o[cle] = i.checked; garderPrefs(); dessiner(); };
    l.append(i, lib); z.append(l);
  };
  const texte = (t) => { const s = document.createElement('span'); s.className = 'groupe'; s.textContent = t; z.append(s); };
  const sep = () => { const s = document.createElement('span'); s.className = 'sep'; z.append(s); };
  const t = o.outil;
  if (['crayon', 'gomme', 'ligne'].includes(t) || (['rect', 'ellipse'].includes(t) && !o.plein)) seg('Taille', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], 'taille');
  if (t === 'crayon') caseO('pixelParfait', 'pixel parfait', 'Évite les petits coins en « L » dans les traits d’un pixel');
  if (['rect', 'ellipse'].includes(t)) seg('', [[false, 'contour'], [true, 'plein']], 'plein');
  if (t === 'pot') seg('', [[true, 'zone reliée'], [false, 'toute l’image', 'Remplace la couleur partout : pratique pour recolorer']], 'contigu');
  if (['crayon', 'gomme', 'ligne', 'rect', 'ellipse', 'pot'].includes(t)) {
    caseO('trame', 'trame', 'Un pixel sur deux, en damier (dithering)');
  }
  if (['crayon', 'gomme', 'ligne', 'rect', 'ellipse'].includes(t)) { caseO('symX', 'symétrie ⇋', 'Dessine aussi en miroir gauche/droite'); caseO('symY', 'symétrie ⇵', 'Dessine aussi en miroir haut/bas'); }
  if (t === 'selection') texte('Glisse dedans pour déplacer · Ctrl+C / X / V · Suppr · Entrée valide');
  if (t === 'deplacer') texte('Glisse pour décaler · flèches : 1 px, Maj : 8 px');
  if (t === 'pipette') texte('Clic : couleur principale. Clic droit : secondaire.');
  if (t === 'main') texte('Glisse pour bouger la vue. Molette : zoom.');
  const droite = document.createElement('span'); droite.className = 'espace'; droite.style.flex = '1'; z.append(droite);
  caseO('enregistrerAuto', 'enregistrer en changeant d’image', 'Pg↑ / Pg↓ ou un clic sur une autre image du groupe enregistrent celle-ci d’abord');
  caseO('grille', 'grille', 'G');
  const fond = document.createElement('select');
  fond.title = 'Fond de la toile';
  fond.innerHTML = '<option value="damier">damier</option><option value="bureau">herbe</option><option value="barre">pavés</option><option value="clair">clair</option><option value="noir">noir</option>';
  fond.value = o.fond;
  fond.onchange = () => { o.fond = fond.value; garderPrefs(); dessiner(); };
  z.append(fond);
  sep();
  const bz = (lib, f, aide) => { const b = document.createElement('button'); b.className = 'mini'; b.textContent = lib; b.title = aide; b.onclick = f; z.append(b); };
  bz('−', () => zoomer(v.zoom / 1.25), 'Dézoomer (-)');
  const zz = document.createElement('span'); zz.className = 'groupe'; zz.id = 'zoom-v'; zz.textContent = '×' + v.zoom; z.append(zz);
  bz('+', () => zoomer(v.zoom * 1.25 + 1), 'Zoomer (+)');
  bz('ajuster', ajusterVue, 'Tout voir (0)');
  sep();
  const ac = document.createElement('button');
  ac.className = 'bouton petit bascule' + (aCoteOuvert() ? ' actif' : '');
  ac.textContent = '◫ Image à côté';
  ac.title = 'Une référence à côté de la toile : un clic dessus prend sa couleur (A)';
  ac.onclick = () => { basculerACote(); majOptions(); };
  z.append(ac);
}

function majCouleurs() {
  $('#c-prim').style.setProperty('--c', px.css(o.prim));
  $('#c-sec').style.setProperty('--c', px.css(o.sec));
  $('#c-choix').value = px.versHex(o.prim);
  $('#c-hex').value = px.versHex(o.prim) + (o.prim[3] < 255 ? o.prim[3].toString(16).padStart(2, '0') : '');
  $('#c-alpha').value = o.prim[3];
  $('#c-alpha-v').value = Math.round(o.prim[3] / 2.55) + '%';
  document.querySelectorAll('#nuancier .pastille, #couleurs-image .pastille').forEach((p) => p.classList.toggle('choisie', p.dataset.c === String(o.prim)));
  garderPrefs();
}

// Une pastille : clic = principale, clic droit = secondaire
function pastille(c, titre, extra = {}) {
  const b = document.createElement('button');
  b.className = 'pastille';
  b.style.setProperty('--c', px.css(c));
  b.dataset.c = String(c);
  b.title = titre;
  b.onclick = (e) => { if (extra.onclick && extra.onclick(e)) return; o.prim = [...c]; majCouleurs(); };
  b.oncontextmenu = (e) => { e.preventDefault(); o.sec = [...c]; majCouleurs(); };
  return b;
}

let couleursDuJeu = null;
async function toutesLesCouleursDuJeu() {
  if (couleursDuJeu) return couleursDuJeu;
  const n = new Map();
  const assets = Object.values(etat.biblio.assets).filter((a) => a.source === 'jeu' && a.categorie !== 'refs');
  await Promise.all(assets.map(async (a) => {
    try {
      for (const { c, nb } of px.couleurs(px.deImage(await px.charger(urlOriginal(a))))) n.set(String(c), (n.get(String(c)) || 0) + nb);
    } catch {}
  }));
  const liste = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([k]) => k.split(',').map(Number));
  couleursDuJeu = px.trierParTeinte(liste);
  return couleursDuJeu;
}
async function couleursDuGroupe() {
  if (!doc || !doc.asset) return [];
  const n = new Map();
  for (const a of membresGroupe(doc.asset).length > 1 ? membresGroupe(doc.asset) : Object.values(etat.biblio.assets).filter((x) => x.sousCategorie && x.sousCategorie === doc.asset.sousCategorie)) {
    try { for (const { c, nb } of px.couleurs(px.deImage(await px.charger(urlImage(a))))) n.set(String(c), (n.get(String(c)) || 0) + nb); } catch {}
  }
  return px.trierParTeinte([...n.keys()].map((k) => k.split(',').map(Number)));
}

function majChoixPalettes() {
  const s = $('#p-choix');
  const opts = [['jeu:tout', 'Le jeu : toutes les couleurs'], ['groupe', 'Ce groupe / cette série']];
  for (const n of Object.keys(etat.biblio.palettesJeu || {})) opts.push(['jeu:' + n, 'Le jeu : ' + n]);
  for (const n of Object.keys(etat.biblio.palettes || {})) opts.push(['mien:' + n, '★ ' + n]);
  s.innerHTML = opts.map(([v2, l]) => `<option value="${v2.replace(/"/g, '&quot;')}">${l}</option>`).join('');
  if (!opts.some(([v2]) => v2 === o.palette)) o.palette = 'jeu:Le dessin de Tiago';
  s.value = o.palette;
}
async function majNuancier() {
  const z = $('#nuancier'), act = $('#p-actions');
  const choix = o.palette;
  z.innerHTML = '<span class="vide-nuancier">…</span>';
  let liste = [];
  const mienne = choix.startsWith('mien:');
  if (choix === 'jeu:tout') liste = await toutesLesCouleursDuJeu();
  else if (choix === 'groupe') liste = await couleursDuGroupe();
  else if (choix.startsWith('jeu:')) liste = (etat.biblio.palettesJeu[choix.slice(4)] || []).map((h) => px.deHex(h));
  else liste = (etat.biblio.palettes[choix.slice(5)] || []).map((h) => px.deHex(h));
  if (o.palette !== choix) return; // (on a changé de palette pendant le chargement)
  z.innerHTML = '';
  for (const c of liste) {
    const hex = px.versHex(c) + (c[3] < 255 ? c[3].toString(16).padStart(2, '0') : '');
    z.append(pastille(c, hex + (mienne ? '  (Ctrl+clic : retirer)' : ''), {
      onclick: (e) => {
        if (!(mienne && (e.ctrlKey || e.metaKey))) return false;
        const p = etat.biblio.palettes[choix.slice(5)];
        p.splice(p.indexOf(hex), 1);
        enregistrerPalettes(); majNuancier();
        return true;
      },
    }));
  }
  if (!liste.length) z.innerHTML = `<span class="vide-nuancier">${mienne ? 'Vide : ajoute la couleur principale avec « + couleur ».' : 'Rien ici.'}</span>`;
  act.innerHTML = '';
  const b = (lib, aide, f) => { const x = document.createElement('button'); x.className = 'bouton petit'; x.textContent = lib; x.title = aide; x.onclick = f; act.append(x); };
  b('+ couleur', 'Ajoute la couleur principale à ta palette', () => {
    let nom = mienne ? choix.slice(5) : Object.keys(etat.biblio.palettes)[0];
    if (!nom) { nom = 'Ma palette'; etat.biblio.palettes[nom] = []; }
    const hex = px.versHex(o.prim) + (o.prim[3] < 255 ? o.prim[3].toString(16).padStart(2, '0') : '');
    if (!etat.biblio.palettes[nom].includes(hex)) etat.biblio.palettes[nom].push(hex);
    o.palette = 'mien:' + nom;
    enregistrerPalettes(); majChoixPalettes(); majNuancier();
  });
  b('+ palette', 'Nouvelle palette (vide, ou avec les couleurs du dessin)', () => {
    const nom = prompt('Nom de la nouvelle palette ?', 'Palette ' + (Object.keys(etat.biblio.palettes).length + 1));
    if (!nom) return;
    const avec = doc && confirm('La remplir avec les couleurs du dessin ouvert ?');
    etat.biblio.palettes[nom] = avec ? px.couleurs(doc.img).map(({ c }) => px.versHex(c) + (c[3] < 255 ? c[3].toString(16).padStart(2, '0') : '')) : [];
    o.palette = 'mien:' + nom;
    enregistrerPalettes(); majChoixPalettes(); majNuancier();
  });
  if (mienne) b('Supprimer', 'Supprimer cette palette', () => {
    if (!confirm(`Supprimer la palette « ${choix.slice(5)} » ?`)) return;
    delete etat.biblio.palettes[choix.slice(5)];
    o.palette = 'jeu:Le dessin de Tiago';
    enregistrerPalettes(); majChoixPalettes(); majNuancier();
  });
  majCouleurs();
}

let attenteCouleurs = 0;
function majCouleursImage() {
  clearTimeout(attenteCouleurs);
  attenteCouleurs = setTimeout(() => {
    const z = $('#couleurs-image');
    z.innerHTML = '';
    if (!doc) return;
    const cs = px.couleurs(doc.img);
    $('#nb-couleurs').textContent = cs.length + ' couleur' + (cs.length > 1 ? 's' : '');
    z.classList.toggle('mode-groupe', modeGroupe);
    for (const { c, nb } of cs) {
      z.append(pastille(c, modeGroupe ? `${px.versHex(c)} : clic pour la remplacer par la couleur principale dans tout le groupe` : `${px.versHex(c)}${c[3] < 255 ? ' α' + c[3] : ''} · ${nb} px\nMaj+clic : la remplacer partout par la couleur principale`, {
        onclick: (e) => {
          if (modeGroupe) { recolorerGroupe(c); return true; }
          if (!e.shiftKey) return false;
          memoriser(); doc.img = px.remplacer(doc.img, c, o.prim); changement();
          return true;
        },
      }));
    }
    const bg = $('#b-groupe-couleur');
    const enGroupe = doc.asset && membresGroupe(doc.asset).length > 1;
    bg.hidden = !enGroupe;
    bg.classList.toggle('actif', modeGroupe);
    bg.textContent = modeGroupe ? 'Clique la couleur à remplacer… (Échap)' : '↻ Remplacer une couleur dans tout le groupe';
    majCouleurs();
  }, 60);
}

// Les aperçus : taille réelle, ×3, et l'animation du groupe (fonds : l'herbe et les pavés du jeu)
const FONDS = { bureau: '#5f7a4f', barre: '#4a4b52', clair: '#e9e4f2', noir: '#000' };
let imagesGroupe = [], animIndex = 0, animMinuteur = 0;
function majApercus() {
  if (!doc) return;
  const src = sel && sel.flottant ? (() => { const c = px.copier(doc.img); px.coller(c, sel.flottant, sel.x, sel.y, true); return c; })() : doc.img;
  const t = px.versToile(src);
  const z = $('#apercus');
  z.className = 'apercus f-' + o.fondApercu;
  for (const [id, k] of [['#a-x1', 1], ['#a-x3', 3]]) {
    const c = $(id);
    const max = k === 3 ? 180 : 60;
    const kk = Math.max(1, Math.min(k, Math.floor(max / Math.max(src.l, src.h)) || 1));
    c.width = src.l * kk; c.height = src.h * kk;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(t, 0, 0, c.width, c.height);
    c.title = kk === 3 ? 'Comme dans le jeu (×3)' : kk === 1 ? 'Taille réelle' : '×' + kk;
  }
}
async function chargerGroupe() {
  clearInterval(animMinuteur);
  imagesGroupe = [];
  const membres = doc && doc.asset ? membresGroupe(doc.asset) : [];
  $('#bloc-anim').hidden = membres.length < 2;
  majImagesGroupe(membres);
  if (membres.length < 2) return;
  imagesGroupe = await Promise.all(membres.map(async (a) => ({ id: a.id, img: px.deImage(await px.charger(urlImage(a))) })));
  animIndex = 0;
  const c = $('#a-anim');
  const L = Math.max(...imagesGroupe.map((x) => x.img.l)), H = Math.max(...imagesGroupe.map((x) => x.img.h));
  const k = Math.max(1, Math.min(4, Math.floor(260 / L)));
  c.width = L * k; c.height = H * k;
  animMinuteur = setInterval(() => {
    if ($('#vue-atelier').hidden || !imagesGroupe.length) return;
    animIndex = (animIndex + 1) % imagesGroupe.length;
    const im = imagesGroupe[animIndex];
    const img = doc && im.id === doc.id ? doc.img : im.img; // l'image ouverte : avec tes changements en cours
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = FONDS[o.fondApercu] || '#211d33';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(px.versToile(img), Math.round((L - img.l) / 2) * k, (H - img.h) * k, img.l * k, img.h * k);
  }, 1000 / o.fps);
}

// Les vignettes des images du groupe : un clic ouvre celle-là (la pelure d'oignon reste sur la même référence si elle existe encore)
function majImagesGroupe(membres) {
  const z = $('#images-groupe');
  z.innerHTML = '';
  $('#bloc-images').hidden = membres.length < 2;
  membres.forEach((a, i) => {
    const b = document.createElement('button');
    b.className = 'f-' + o.fondApercu + (doc && a.id === doc.id ? ' actif' : '');
    b.title = nomDe(a);
    const img = document.createElement('img');
    img.src = urlImage(a); img.alt = '';
    const n = document.createElement('span'); n.textContent = i + 1;
    b.append(img, n);
    b.onclick = () => ouvrirAutre(a);
    z.append(b);
  });
}
async function ouvrirAutre(a) {
  if (!doc || a.id === doc.id) return;
  const pelureAvant = $('#o-ref').value;
  if (!(await ouvrirAsset(a))) return;
  // on garde la pelure sur la même image si elle fait toujours partie des choix
  if (pelureAvant && [...$('#o-ref').options].some((x) => x.value === pelureAvant)) { $('#o-ref').value = pelureAvant; choisirPelure(pelureAvant); }
}
function imageVoisine(sens) {
  if (!doc || !doc.asset) return;
  const membres = membresGroupe(doc.asset);
  if (membres.length < 2) return;
  const i = membres.findIndex((a) => a.id === doc.id);
  ouvrirAutre(membres[(i + sens + membres.length) % membres.length]);
}

function remplirPelure() {
  const s = $('#o-ref');
  const opts = [['', 'Aucune']];
  if (doc && doc.original) opts.push(['original', 'L’original du jeu']);
  if (doc && doc.asset) for (const a of membresGroupe(doc.asset)) if (a.id !== doc.id) opts.push([a.id, nomDe(a)]);
  s.innerHTML = opts.map(([v2, l]) => `<option value="${v2}">${l}</option>`).join('');
  pelure = { ref: '', img: null, toile: null };
  s.value = '';
}
async function choisirPelure(ref) {
  pelure.ref = ref;
  if (!ref) pelure = { ref: '', img: null, toile: null };
  else if (ref === 'original') pelure.img = doc.original;
  else pelure.img = px.deImage(await px.charger(urlImage(etat.biblio.assets[ref])));
  pelure.toile = pelure.img ? px.versToile(pelure.img) : null;
  dessiner();
}

function majInfos() {
  const z = $('#infos');
  if (!doc) { z.textContent = ''; return; }
  const morceaux = [`${doc.img.l} × ${doc.img.h}`, `zoom ×${v.zoom}`];
  if (survol && px.dedans(doc.img, survol[0], survol[1])) {
    const c = px.lire(doc.img, survol[0], survol[1]);
    morceaux.push(`x ${survol[0]}  y ${survol[1]}`, c[3] ? `${px.versHex(c)}${c[3] < 255 ? ' α' + c[3] : ''}` : 'transparent');
  }
  if (sel) morceaux.push(`sélection ${sel.l} × ${sel.h}${sel.flottant ? ' (flottante)' : ''}`);
  if (geste && geste.type === 'forme' && geste.x1 !== undefined) morceaux.push(`${Math.abs(geste.x1 - geste.x0) + 1} × ${Math.abs(geste.y1 - geste.y0) + 1}`);
  z.innerHTML = morceaux.map((m) => `<span>${m}</span>`).join('') + (doc.sale ? '<span class="modifie">● pas enregistré</span>' : '');
  const zz = $('#zoom-v'); if (zz) zz.textContent = '×' + v.zoom;
}

function majPanneau() {
  const t = $('#titre-doc');
  if (!doc) { t.innerHTML = '<small>rien d’ouvert</small>'; proposerBrouillonNeuf(); return; }
  const a = doc.asset;
  t.innerHTML = '';
  t.append(doc.nom);
  const s = document.createElement('small');
  s.textContent = doc.id ? doc.id + '.png' + (a && a.source === 'jeu' ? (verrouille(a) ? ' · référence (à regarder)' : a.modifie ? ' · retouché' : ' · original du jeu') : ' · création') : 'pas encore enregistré';
  t.append(s);
  $('#b-comparer').disabled = !doc.original;
  $('#b-enregistrer').textContent = doc.id ? 'Enregistrer' : 'Enregistrer…';
  majChoixPalettes();
  majNuancier();
  majCouleursImage();
  majApercus();
  chargerGroupe();
  majInfos();
  majOptions();
  dessiner();
  document.title = (doc.sale ? '● ' : '') + doc.nom + ' · Atelier Re:Zero';
}

// ================== Mise en place ==================
export function initEditeur() {
  // les outils
  const z = $('#outils');
  for (const t of OUTILS) {
    if (!t) { z.append(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.className = 'outil' + (o.outil === t.id ? ' actif' : '');
    b.dataset.outil = t.id;
    b.title = `${t.nom} (${t.touche})`;
    b.innerHTML = svgIcone(ICONES[t.id]) + `<span class="touche">${t.touche}</span>`;
    b.onclick = () => choisirOutil(t.id);
    z.append(b);
  }
  initACote((c, droit) => { if (droit) o.sec = [...c]; else o.prim = [...c]; majCouleurs(); });
  $('#b-groupe-couleur').onclick = () => { modeGroupe = !modeGroupe; majCouleursImage(); };
  const c = ecran();
  c.addEventListener('pointerdown', surAppui);
  c.addEventListener('pointermove', surMouvement);
  c.addEventListener('pointerup', surRelache);
  c.addEventListener('pointercancel', surRelache);
  c.addEventListener('pointerleave', () => { if (!geste) { survol = null; dessiner(); majInfos(); } });
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = c.getBoundingClientRect();
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomer(e.deltaY < 0 ? v.zoom * 1.25 + 1 : v.zoom / 1.25, e.clientX - r.left, e.clientY - r.top);
    else { v.ox -= e.deltaX; dessiner(); }
  }, { passive: false });
  new ResizeObserver(() => dessiner()).observe($('#scene'));
  // l'image à côté ouverte ou fermée : la toile se recale
  document.addEventListener('acote-change', () => requestAnimationFrame(ajusterVue));
  document.addEventListener('keydown', clavier);
  document.addEventListener('keyup', clavierRelache);
  document.addEventListener('paste', async (e) => {
    if ($('#vue-atelier').hidden || !doc || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const f = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
    if (f) {
      e.preventDefault();
      const url = URL.createObjectURL(f);
      try { collerImage(px.echelleNative(px.deImage(await px.charger(url)))); } finally { URL.revokeObjectURL(url); }
    } else if (pressePapier) { e.preventDefault(); collerImage(pressePapier); }
  });

  // couleurs
  $('#c-prim').onclick = () => $('#c-choix').click();
  $('#c-sec').onclick = () => { [o.prim, o.sec] = [o.sec, o.prim]; majCouleurs(); };
  $('#c-echanger').onclick = () => { [o.prim, o.sec] = [o.sec, o.prim]; majCouleurs(); };
  $('#c-choix').oninput = (e) => { o.prim = px.deHex(e.target.value, o.prim[3] || 255); majCouleurs(); };
  $('#c-hex').onchange = (e) => { if (/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(e.target.value.trim())) o.prim = px.deHex(e.target.value.trim()); majCouleurs(); };
  $('#c-alpha').oninput = (e) => { o.prim = [o.prim[0], o.prim[1], o.prim[2], +e.target.value]; majCouleurs(); };
  $('#p-choix').onchange = (e) => { o.palette = e.target.value; garderPrefs(); majNuancier(); };
  $('#a-fond').value = o.fondApercu;
  $('#a-fond').onchange = (e) => { o.fondApercu = e.target.value; garderPrefs(); majApercus(); };
  $('#a-fps').value = o.fps; $('#a-fps-v').value = o.fps;
  $('#a-fps').oninput = (e) => { o.fps = +e.target.value; $('#a-fps-v').value = o.fps; garderPrefs(); chargerGroupe(); };
  $('#o-ref').onchange = (e) => choisirPelure(e.target.value);
  $('#o-opacite').value = o.pelureOpacite;
  $('#o-opacite').oninput = (e) => { o.pelureOpacite = +e.target.value; garderPrefs(); dessiner(); };
  $('#o-dessus').checked = Boolean(o.pelureDessus);
  $('#o-dessus').onchange = (e) => { o.pelureDessus = e.target.checked; garderPrefs(); dessiner(); };
  document.querySelectorAll('[data-tr]').forEach((b) => (b.onclick = () => action(b.dataset.tr)));
  $('#b-enregistrer').onclick = enregistrerDoc;
  $('#b-enregistrer-sous').onclick = enregistrerSous;
  $('#b-exporter').onclick = () => { if (doc) { validerFlottant(); telecharger((doc.id || slug(doc.nom)).replace(/\//g, '_') + '.png', px.versPng(doc.img)); } };
  const cmp = $('#b-comparer');
  cmp.addEventListener('pointerdown', () => { comparer = true; dessiner(); });
  for (const ev of ['pointerup', 'pointerleave']) cmp.addEventListener(ev, () => { if (comparer) { comparer = false; dessiner(); } });
  window.addEventListener('beforeunload', (e) => { if (aDesChangements()) { e.preventDefault(); e.returnValue = ''; } });
  // quand une fiche change dans la bibliothèque (nom, groupe…), on suit
  document.addEventListener('biblio-change', (e) => {
    if (doc && doc.id && e.detail.id === doc.id && etat.biblio.assets[doc.id]) { doc.asset = etat.biblio.assets[doc.id]; doc.nom = nomDe(doc.asset); }
  });

  majOptions();
  majCouleurs();
  majPanneau();
  // le titre suit l'état « pas enregistré »
  setInterval(() => { if (doc) document.title = (doc.sale ? '● ' : '') + doc.nom + ' · Atelier Re:Zero'; }, 500);

}
export const surAffichage = () => { if (v.aAjuster) { v.aAjuster = false; ajusterVue(); } dessiner(); };
