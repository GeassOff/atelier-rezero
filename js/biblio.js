// La bibliothèque : tous les assets, rangés par catégorie, triables, avec leur fiche à droite.
import { etat, CATEGORIES, nomCategorie, nomDe, catDe, sousCatDe, estRetouche, urlImage, urlOriginal, membresGroupe, enregistrer, retirerVersion, toast, quand, telecharger, marquerPourLeJeu, marquerAFaire, envoyable, verrouille } from './etat.js';
import * as depot from './depot.js';
import * as px from './pixels.js';

// Les listes du haut (pas des catégories)
const SPECIALES = ['tout', 'afaire', 'creations-toutes', 'retouches', 'disparus', 'prets'];

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const x of enfants.flat()) if (x !== null && x !== undefined && x !== false) e.append(x);
  return e;
};

const ajout = (parent, ...xs) => parent.append(...xs.flat().filter((x) => x !== null && x !== undefined && x !== false));

// Ce qui reste d'une visite à l'autre (dans ce navigateur)
const memoire = (() => { try { return JSON.parse(localStorage.getItem('atelier-biblio') || '{}'); } catch { return {}; } })();
const garder = () => { try { localStorage.setItem('atelier-biblio', JSON.stringify(vue)); } catch {} };
const vue = {
  cat: 'tout', sous: null, recherche: '', tri: 'ordre', groupes: true, modifies: false, favoris: false, taille: 96, fond: 'damier', tags: [],
  ...memoire,
};
let choisi = null;      // id de l'asset dont on voit la fiche
let visibles = [];      // la liste affichée, dans l'ordre (pour les flèches)
let rappels = {};

export function initBiblio(r) {
  rappels = r;
  $('#f-recherche').value = vue.recherche;
  $('#f-tri').value = vue.tri;
  $('#f-groupes').checked = vue.groupes;
  $('#f-modifies').checked = vue.modifies;
  $('#f-favoris').checked = vue.favoris;
  $('#f-taille').value = vue.taille;
  $('#f-fond').value = vue.fond;
  $('#f-recherche').addEventListener('input', (e) => { vue.recherche = e.target.value; rendreGrille(); });
  for (const [sel, cle, prop] of [['#f-tri', 'tri', 'value'], ['#f-groupes', 'groupes', 'checked'], ['#f-modifies', 'modifies', 'checked'], ['#f-favoris', 'favoris', 'checked'], ['#f-fond', 'fond', 'value']]) {
    $(sel).addEventListener('change', (e) => { vue[cle] = e.target[prop]; rendreGrille(); });
  }
  $('#f-taille').addEventListener('input', (e) => { vue.taille = +e.target.value; rendreGrille(); });
  document.addEventListener('biblio-change', () => rafraichir());
  document.addEventListener('keydown', clavier);
}

export function rafraichir() {
  rendreCats();
  rendreGrille();
  rendreFiche();
}
export function choisir(id) {
  choisi = id;
  document.querySelectorAll('.carte.choisie').forEach((c) => c.classList.remove('choisie'));
  const c = document.querySelector(`.carte[data-id="${CSS.escape(id)}"]`);
  if (c) { c.classList.add('choisie'); c.scrollIntoView({ block: 'nearest' }); }
  rendreFiche();
}

const tous = () => Object.values(etat.biblio.assets);

// ---------- Les catégories à gauche ----------
function rendreCats() {
  const z = $('#cats');
  z.innerHTML = '';
  const liste = tous();
  const nb = (f) => liste.filter(f).length;
  const bouton = (id, nom, n, icone, sous = null) => {
    const actif = vue.cat === id && (sous ? vue.sous === sous : !vue.sous);
    const a = icone && etat.biblio.assets[icone];
    return el('button', {
      class: 'cat' + (actif ? ' actif' : '') + (sous ? ' sous' : ''),
      onclick: () => { vue.cat = id; vue.sous = sous; vue.tags = []; rafraichir(); },
    }, sous ? null : el('span', { class: 'ic' }, a ? el('img', { src: urlImage(a), alt: '' }) : ''), el('span', { class: 'nom' }, nom), el('span', { class: 'nb' }, n));
  };
  const afaire = nb((a) => a.aFaire);
  z.append(
    bouton('tout', 'Tout', liste.length, null),
    afaire ? bouton('afaire', '📌 À faire', afaire, null) : '',
    bouton('creations-toutes', 'Créations', nb((a) => a.source === 'atelier'), null),
    bouton('retouches', 'Retouchés', nb(estRetouche), null),
  );
  const prets = nb((a) => a.pourLeJeu);
  if (prets) z.append(bouton('prets', 'Prêts pour le jeu', prets, null));
  const disparus = nb((a) => a.disparu);
  if (disparus) z.append(bouton('disparus', 'Disparus du jeu', disparus, null));
  z.append(el('h4', {}, 'Catégories'));
  for (const c of CATEGORIES) {
    const n = nb((a) => catDe(a) === c.id);
    if (!n && c.id !== 'creations') continue;
    z.append(bouton(c.id, c.nom, n, c.icone));
    if (vue.cat === c.id) {
      const sous = new Map();
      for (const a of liste) if (catDe(a) === c.id) sous.set(sousCatDe(a), (sous.get(sousCatDe(a)) || 0) + 1);
      if (sous.size > 1) for (const [s, n2] of sous) z.append(bouton(c.id, s, n2, null, s));
    }
  }
  if (etat.biblio.dernierImport) z.append(el('p', { class: 'nb', style: 'margin:16px 8px;color:var(--pale);font-size:11px' }, 'Images du jeu relues le ' + quand(etat.biblio.dernierImport)
));
}

// ---------- Le filtre, le tri ----------
function filtrer() {
  const mots = vue.recherche.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return tous().filter((a) => {
    if (vue.cat === 'creations-toutes' && a.source !== 'atelier') return false;
    if (vue.cat === 'retouches' && !estRetouche(a)) return false;
    if (vue.cat === 'disparus' && !a.disparu) return false;
    if (vue.cat === 'prets' && !a.pourLeJeu) return false;
    if (vue.cat === 'afaire' && !a.aFaire) return false;
    if (!SPECIALES.includes(vue.cat) && catDe(a) !== vue.cat) return false;
    if (vue.sous && sousCatDe(a) !== vue.sous) return false;
    if (vue.modifies && !estRetouche(a) && a.source !== 'atelier') return false;
    if (vue.favoris && !a.favori) return false;
    if (vue.tags.length && !vue.tags.every((t) => (a.tags || []).includes(t))) return false;
    if (mots.length) {
      const texte = norm([nomDe(a), a.id, sousCatDe(a), nomCategorie(catDe(a)), a.fichier, a.note, a.desc, a.creePar, a.modifiePar, ...(a.tags || [])].join(' '));
      if (!mots.every((m) => texte.includes(m))) return false;
    }
    return true;
  });
}
const TRIS = {
  ordre: (a, b) => (a.source === 'atelier') - (b.source === 'atelier') || (a.ordre ?? 1e9) - (b.ordre ?? 1e9) || (a.cree || '').localeCompare(b.cree || ''),
  nom: (a, b) => nomDe(a).localeCompare(nomDe(b), 'fr', { numeric: true }),
  grand: (a, b) => b.l * b.h - a.l * a.h,
  petit: (a, b) => a.l * a.h - b.l * b.h,
  couleurs: (a, b) => (b.couleurs || 0) - (a.couleurs || 0),
  recent: (a, b) => (b.modifie || b.cree || '').localeCompare(a.modifie || a.cree || ''),
};

// ---------- La grille ----------
function rendreGrille() {
  garder();
  const z = $('#grille');
  z.style.setProperty('--carte', vue.taille + 'px');
  const liste = filtrer().sort((a, b) => TRIS[vue.tri](a, b) || TRIS.ordre(a, b));
  rendreTagsFiltre(liste);
  z.innerHTML = '';
  if (!liste.length) {
    z.append(el('div', { class: 'vide-grille' }, tous().length ? 'Rien ne correspond. Essaie d’enlever un filtre.' : 'La bibliothèque est vide : Tiago doit lancer la synchro une première fois.'));
    visibles = [];
    return;
  }
  // par groupes : une section par sous-catégorie (dans l'ordre où on les rencontre)
  const sections = new Map();
  const titre = (a) => (vue.groupes ? (SPECIALES.includes(vue.cat) ? nomCategorie(catDe(a)) + ' · ' : '') + sousCatDe(a) : '');
  for (const a of liste) {
    const t = titre(a);
    if (!sections.has(t)) sections.set(t, []);
    sections.get(t).push(a);
  }
  visibles = [...sections.values()].flat();
  const frag = document.createDocumentFragment();
  for (const [t, items] of sections) {
    if (t) frag.append(el('div', { class: 'groupe-titre' }, el('h3', {}, t), el('span', { class: 'nb' }, items.length)));
    frag.append(el('div', { class: 'cartes' }, items.map(carte)));
  }
  z.append(frag);
}

function carte(a) {
  const cote = vue.taille - 14;
  const k = Math.max(1, Math.floor(cote / Math.max(a.l || 1, a.h || 1)));
  const tropGrand = Math.max(a.l, a.h) > cote;
  const img = el('img', { src: urlImage(a), alt: '', loading: 'lazy', draggable: 'false' });
  if (tropGrand) { img.style.maxWidth = cote + 'px'; img.style.maxHeight = cote + 'px'; }
  else { img.style.width = a.l * k + 'px'; img.style.height = a.h * k + 'px'; }
  const badges = el('div', { class: 'badges' },
    a.aFaire ? el('span', { class: 'badge afaire', title: 'À faire' + (a.aFaire.texte ? ' : ' + a.aFaire.texte : '') + (a.aFaire.par ? ` (${a.aFaire.par})` : '') }, '📌') : null,
    a.favori ? el('span', { class: 'badge fav', title: 'Favori' }, '★') : null,
    a.source === 'atelier' ? el('span', { class: 'badge nouv', title: 'Création' + (a.creePar ? ' de ' + a.creePar : '') }, a.creePar || 'créa') : null,
    estRetouche(a) ? el('span', { class: 'badge modif', title: 'Retouché le ' + quand(a.modifie) + (a.modifiePar ? ' par ' + a.modifiePar : '') }, '✎') : null,
    a.pourLeJeu ? el('span', { class: 'badge fav', title: 'Prêt pour le jeu : arrive dans Unity à la prochaine synchro' }, '⇢') : null,
    a.jeuChange ? el('span', { class: 'badge alerte', title: 'L’original a changé dans le jeu depuis ta retouche' }, '!') : null,
    a.disparu ? el('span', { class: 'badge alerte', title: 'N’existe plus dans le jeu' }, '∅') : null,
  );
  return el('button', {
    class: 'carte' + (a.id === choisi ? ' choisie' : ''), 'data-id': a.id, title: nomDe(a),
    onclick: () => choisir(a.id),
    ondblclick: () => rappels.ouvrir(a),
  }, el('div', { class: 'vignette f-' + vue.fond }, img), badges,
  el('div', { class: 'legende' }, el('b', {}, nomDe(a)), el('span', {}, `${a.l}×${a.h}`)));
}

function rendreTagsFiltre(liste) {
  const z = $('#tags-filtre');
  z.innerHTML = '';
  const n = new Map();
  for (const a of liste) for (const t of a.tags || []) n.set(t, (n.get(t) || 0) + 1);
  const tags = [...n.entries()].filter(([t]) => !vue.tags.includes(t)).sort((x, y) => y[1] - x[1]).slice(0, 18);
  if (!vue.tags.length && tags.length < 2) return;
  for (const t of vue.tags) z.append(el('button', { class: 'puce actif', onclick: () => { vue.tags = vue.tags.filter((x) => x !== t); rendreGrille(); } }, t, el('span', { class: 'x' }, '×')));
  for (const [t, nb] of tags) if (nb < liste.length) z.append(el('button', { class: 'puce', onclick: () => { vue.tags.push(t); rendreGrille(); } }, `${t} · ${nb}`));
}

// ---------- La fiche ----------
let animFiche = null;
function rendreFiche() {
  const z = $('#fiche');
  clearInterval(animFiche);
  z.innerHTML = '';
  const a = choisi && etat.biblio.assets[choisi];
  if (!a) {
    z.append(el('div', { class: 'vide-fiche' }, el('p', {}, 'Clique sur un dessin pour voir sa fiche.'), el('p', {}, 'Double-clic pour l’ouvrir dans l’atelier.'),
      el('p', { style: 'margin-top:30px;font-size:12px' }, el('kbd', {}, '/'), ' chercher  ', el('kbd', {}, '←'), el('kbd', {}, '→'), ' parcourir  ', el('kbd', {}, 'Entrée'), ' ouvrir  ', el('kbd', {}, 'F'), ' favori')));
    return;
  }
  const membres = membresGroupe(a);
  let zoom = Math.max(1, Math.min(10, Math.floor(250 / Math.max(a.l, a.h))));
  const image = el('img', { src: urlImage(a), alt: '' });
  const taille = () => { image.style.width = a.l * zoom + 'px'; image.style.height = a.h * zoom + 'px'; };
  taille();
  let original = false;
  const grand = el('div', { class: 'grand f-' + vue.fond }, image,
    el('div', { class: 'zoom-fiche' },
      el('button', { class: 'mini', title: 'Plus petit', onclick: () => { zoom = Math.max(1, zoom - 1); taille(); } }, '−'),
      el('button', { class: 'mini', title: 'Plus grand', onclick: () => { zoom = Math.min(24, zoom + 1); taille(); } }, '+')));
  // l'animation de son groupe (marche, ailes…)
  if (membres.length > 1) {
    let i = membres.indexOf(a), joue = false;
    const btn = el('button', { class: 'mini lecture', title: 'Voir l’animation de son groupe' }, '▶ ' + membres.length + ' images');
    btn.onclick = () => {
      joue = !joue;
      clearInterval(animFiche);
      btn.textContent = joue ? '■ stop' : '▶ ' + membres.length + ' images';
      if (!joue) { image.src = urlImage(a); return; }
      animFiche = setInterval(() => { i = (i + 1) % membres.length; image.src = urlImage(membres[i]); }, 1000 / 6);
    };
    grand.append(btn);
  }
  if (estRetouche(a)) {
    const btn = el('button', { class: 'mini', style: 'position:absolute;top:6px;left:6px', title: 'Maintiens pour voir l’original du jeu' }, '◐ original');
    const montrer = (o) => { original = o; image.src = o ? urlOriginal(a) : urlImage(a); };
    btn.addEventListener('pointerdown', () => montrer(true));
    for (const ev of ['pointerup', 'pointerleave']) btn.addEventListener(ev, () => original && montrer(false));
    grand.append(btn);
  }

  const majFiche = (meta) => enregistrer(a.id, undefined, meta).catch((e) => toast('Pas enregistré : ' + e.message, 'ko'));
  const nom = el('input', { type: 'text', value: nomDe(a) });
  nom.addEventListener('change', () => majFiche({ nomPerso: nom.value.trim() || null }));
  const cat = el('select', {}, CATEGORIES.map((c) => el('option', { value: c.id, selected: catDe(a) === c.id }, c.nom)));
  cat.addEventListener('change', () => majFiche({ categoriePerso: cat.value === a.categorie ? null : cat.value }));
  const tags = el('div', { class: 'tags' });
  const rendreTags = () => {
    tags.innerHTML = '';
    for (const t of a.tags || []) tags.append(el('button', { class: 'puce', title: 'Retirer', onclick: () => { a.tags = a.tags.filter((x) => x !== t); majFiche({ tags: a.tags }); } }, t, el('span', { class: 'x' }, '×')));
  };
  rendreTags();
  const nouveauTag = el('input', { type: 'text', placeholder: '+ tag (Entrée)' });
  nouveauTag.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !nouveauTag.value.trim()) return;
    a.tags = [...new Set([...(a.tags || []), nouveauTag.value.trim().toLowerCase()])];
    majFiche({ tags: a.tags });
  });
  const note = el('textarea', { placeholder: 'Une idée, une chose à corriger…' }, a.note || '');
  note.addEventListener('change', () => majFiche({ note: note.value }));

  const groupe = membres.length > 1 ? `${a.groupe} (${membres.length})` : a.groupe || '—';
  ajout(z,
    grand,
    el('h2', {}, el('button', { class: 'mini', title: 'Favori (F)', style: 'margin-right:6px;color:' + (a.favori ? '#ffd84a' : 'var(--pale)'), onclick: () => majFiche({ favori: !a.favori }) }, a.favori ? '★' : '☆'), nomDe(a)),
    el('div', { class: 'id' }, a.id + '.png'),
    a.jeuChange ? el('div', { class: 'alerte-fiche' }, 'L’original a changé dans le jeu depuis ta retouche. Maintiens « ◐ original » pour comparer.') : null,
    a.disparu ? el('div', { class: 'alerte-fiche' }, 'Ce dessin n’existe plus dans le code du jeu (il a été retiré ou renommé).') : null,
    a.aFaire ? el('div', { class: 'afaire-fiche' }, el('b', {}, '📌 À faire'), a.aFaire.texte ? ' : ' + a.aFaire.texte : '', el('br'), el('small', {}, `demandé par ${a.aFaire.par || '?'}, le ${quand(a.aFaire.quand)}`)) : null,
    verrouille(a) ? el('div', { class: 'info-fiche' }, 'Une référence : elle se regarde (et la pipette y prend ses couleurs). Pour partir d’elle, « ⧉ Dupliquer » en fait une copie à retoucher.') : null,
    a.refus ? el('div', { class: 'alerte-fiche' }, 'Pas mis dans le jeu : ' + a.refus + '.') : null,
    a.pourLeJeu ? el('div', { class: 'info-fiche' }, 'Prêt pour le jeu depuis le ' + quand(a.pourLeJeu) + (a.pourLeJeuPar ? ' (' + a.pourLeJeuPar + ')' : '') + ' : ' + (a.source === 'jeu' ? 'il remplace l’image du jeu à la prochaine synchro.' : 'il part dans le projet Unity à la prochaine synchro, pour y être branché.')) : null,
    !a.pourLeJeu && a.source === 'jeu' && estRetouche(a) && a.fichier ? el('div', { class: 'info-fiche' }, 'Retouché le ' + quand(a.modifie) + (a.modifiePar ? ' par ' + a.modifiePar : '') + '. Le jeu a encore l’original : « ⇢ Prêt pour le jeu » quand c’est bon.') : null,
    a.envoye && !estRetouche(a) && !a.pourLeJeu ? el('div', { class: 'info-fiche' }, 'Mis dans le jeu le ' + quand(a.envoye) + '.') : null,
    el('dl', {},
      el('dt', {}, 'Taille'), el('dd', {}, `${a.l} × ${a.h} px` + (a.fichier ? '  (garde la même taille : le jeu cale ses images sur les pieds)' : '')),
      el('dt', {}, 'Couleurs'), el('dd', {}, a.couleurs ?? '?'),
      el('dt', {}, 'Rangé dans'), el('dd', {}, nomCategorie(catDe(a)) + ' › ' + sousCatDe(a)),
      el('dt', {}, 'Groupe'), el('dd', {}, groupe),
      a.fichier ? el('dt', {}, 'Dans le jeu') : null, a.fichier ? el('dd', {}, el('code', {}, 'Art/' + a.fichier)) : null,
      a.desc ? el('dt', {}, 'Description') : null, a.desc ? el('dd', {}, a.desc) : null,
      a.source === 'atelier' ? el('dt', {}, 'Créé') : null, a.source === 'atelier' ? el('dd', {}, quand(a.cree) + (a.creePar ? ' par ' + a.creePar : '')) : null,
    ),
    el('label', {}, 'Nom'), nom,
    el('label', {}, 'Catégorie'), cat,
    el('label', {}, 'Tags'), tags, nouveauTag,
    el('label', {}, 'Note'), note,
    el('div', { class: 'actions' },
      el('button', { class: 'bouton accent', onclick: () => rappels.ouvrir(a) }, verrouille(a) ? '◉ Regarder dans l’atelier' : '✎ Ouvrir dans l’atelier'),
      envoyable(a) ? el('button', { class: 'bouton' + (a.pourLeJeu ? '' : ' accent'), onclick: () => envoyer(a, !a.pourLeJeu), title: 'La prochaine synchro le met dans le projet Unity' }, a.pourLeJeu ? '✕ Pas encore prêt' : '⇢ Prêt pour le jeu') : null,
      groupePret(a, membres),
      el('button', { class: 'bouton', onclick: () => rappels.aCote(a), title: 'L’ouvrir à côté de la toile, comme référence (un clic dessus y prend la couleur)' }, '◫ À côté'),
      el('button', { class: 'bouton', onclick: () => rappels.dupliquer(a), title: 'Une copie à toi, pour faire une variante' }, '⧉ Dupliquer'),
      el('button', { class: 'bouton', onclick: () => versions(a), title: 'Toutes les versions enregistrées de ce dessin (et en reprendre une)' }, '🕘 Versions'),
      a.aFaire
        ? el('button', { class: 'bouton', onclick: () => aFaire([a.id], null), title: 'Retirer la demande' }, '✓ Fait')
        : el('button', { class: 'bouton', onclick: () => demanderAFaire(a, [a.id]), title: 'Le mettre dans la liste « À faire », avec ce qu’il faut faire' }, '📌 À faire…'),
      membres.length > 1 && !a.aFaire ? el('button', { class: 'bouton', onclick: () => demanderAFaire(a, membres.map((m) => m.id)), title: 'Toutes les images de l’animation dans « À faire »' }, `📌 Le groupe (${membres.length})…`) : null,
      el('button', { class: 'bouton', onclick: () => exporter(a, 1) }, '⇩ PNG'),
      el('button', { class: 'bouton', onclick: () => exporter(a, 4), title: 'Agrandi 4 fois, pour le montrer' }, '⇩ ×4'),
      membres.length > 1 ? el('button', { class: 'bouton', onclick: () => planche(membres), title: 'Toutes les images de l’animation côte à côte, ×4 (pour la montrer sur Discord)' }, '⇩ Planche') : null,
      a.source === 'jeu' && estRetouche(a) ? el('button', { class: 'bouton danger', onclick: () => revenir(a) }, '↺ Revenir à l’original') : null,
      a.source === 'atelier' ? el('button', { class: 'bouton danger', onclick: () => supprimer(a) }, '🗑 Supprimer') : null,
    ),
  );
}

async function exporter(a, k) {
  const img = px.deImage(await px.charger(urlImage(a)));
  telecharger(`${a.id.replace(/\//g, '_')}${k > 1 ? '@' + k + 'x' : ''}.png`, px.agrandie(img, k).toDataURL());
}
// « Prêt pour le jeu » pour toutes les retouches d'une animation d'un coup
function groupePret(a, membres) {
  const restent = membres.filter((m) => envoyable(m) && !m.pourLeJeu);
  if (membres.length < 2 || restent.length < 2) return null;
  return el('button', { class: 'bouton', title: 'Toutes les retouches de cette animation', onclick: async () => {
    try { await marquerPourLeJeu(restent.map((m) => m.id), true); toast(`${restent.length} images prêtes pour le jeu`, 'ok'); }
    catch (e) { toast('Pas enregistré : ' + e.message, 'ko'); }
  } }, `⇢ Le groupe prêt (${restent.length})`);
}
async function demanderAFaire(a, ids) {
  const texte = prompt(ids.length > 1 ? `Qu’est-ce qu’il faut faire sur les ${ids.length} images de « ${a.groupe} » ?` : `Qu’est-ce qu’il faut faire sur « ${nomDe(a)} » ?`, '');
  if (texte === null) return;
  aFaire(ids, texte.trim());
}
async function aFaire(ids, texte) {
  try { await marquerAFaire(ids, texte); toast(texte === null ? 'Retiré des « À faire »' : `Dans « À faire »${ids.length > 1 ? ' : ' + ids.length + ' images' : ''}`, 'ok'); }
  catch (e) { toast('Pas enregistré : ' + e.message, 'ko'); }
}
// Les images d'une animation côte à côte, ×4, sur fond transparent
async function planche(membres) {
  const imgs = await Promise.all(membres.map(async (m) => px.deImage(await px.charger(urlImage(m)))));
  const k = 4, ecart = 2;
  const H = Math.max(...imgs.map((i) => i.h)), L = imgs.reduce((s, i) => s + i.l, 0) + ecart * (imgs.length - 1);
  const c = document.createElement('canvas');
  c.width = L * k; c.height = H * k;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  let x = 0;
  for (const i of imgs) { g.drawImage(px.versToile(i), x * k, (H - i.h) * k, i.l * k, i.h * k); x += i.l + ecart; }
  telecharger(`${(membres[0].groupe || 'groupe').replace(/\//g, '_')}@4x.png`, c.toDataURL());
}
// Toutes les versions d'un dessin : celles du jeu (relues par la synchro) et les retouches
async function versions(a) {
  const dlg = $('#dlg-versions'), z = $('#versions-liste');
  $('#versions-titre').textContent = 'Les versions de « ' + nomDe(a) + ' »';
  z.innerHTML = '<p class="vide-grille">Lecture de l’historique…</p>';
  dlg.showModal();
  let liste;
  try { liste = await depot.historique([`atelier/${a.id}.png`, ...(a.source === 'jeu' ? [`jeu/${a.id}.png`] : [])]); }
  catch (e) { z.innerHTML = ''; z.append(el('p', { class: 'vide-grille' }, 'Historique illisible : ' + e.message)); return; }
  z.innerHTML = '';
  if (!liste.length) { z.append(el('p', { class: 'vide-grille' }, 'Pas encore d’autre version.')); return; }
  liste.forEach((v, i) => {
    const vignette = el('div', { class: 'vignette f-' + vue.fond }, '…');
    const reprendre = el('button', { class: 'bouton petit', type: 'button', disabled: true }, i === 0 ? 'Version actuelle' : 'Reprendre');
    const original = v.chemin.startsWith('jeu/');
    z.append(el('div', { class: 'version' + (i === 0 ? ' actuelle' : '') }, vignette,
      el('b', {}, v.auteur || '?'), el('span', {}, quand(v.quand)), el('span', {}, (original ? '[jeu] ' : '') + v.message.split('\n')[0]), reprendre));
    depot.fichierA(v.chemin, v.sha).then(async (b) => {
      vignette.innerHTML = '';
      if (!b) { vignette.append(el('small', {}, original ? '(pas encore dans le jeu)' : '(retour à l’original)')); return; }
      const url = URL.createObjectURL(b);
      vignette.append(el('img', { src: url, alt: '' }));
      if (i === 0 || verrouille(a)) return;
      reprendre.disabled = false;
      reprendre.onclick = async (e) => {
        e.preventDefault();
        if (!confirm(`Reprendre la version du ${quand(v.quand)} (${v.auteur}) ? Elle devient la retouche actuelle.`)) return;
        try {
          const img = px.deImage(await px.charger(url));
          await enregistrer(a.id, px.versPng(img), { l: img.l, h: img.h, couleurs: px.couleurs(img).length });
          dlg.close();
          toast('Version reprise', 'ok');
        } catch (err) { toast('Pas repris : ' + err.message, 'ko'); }
      };
    }).catch(() => { vignette.textContent = '?'; });
  });
}
async function envoyer(a, oui) {

  try {
    await marquerPourLeJeu([a.id], oui);
    toast(oui ? 'Prêt pour le jeu : il arrive dans Unity à la prochaine synchro' : 'Retiré des prêts pour le jeu', 'ok');
  } catch (e) { toast('Pas enregistré : ' + e.message, 'ko'); }
}
async function revenir(a) {
  if (!confirm(`Revenir à l’original du jeu pour « ${nomDe(a)} » ? La retouche reste dans l’historique du dépôt.`)) return;
  await retirerVersion(a.id);
  toast('Revenu à l’original', 'ok');
}
async function supprimer(a) {
  if (!confirm(`Supprimer « ${nomDe(a)} » ? Il reste dans l’historique du dépôt (récupérable).`)) return;
  await retirerVersion(a.id);
  choisi = null;
  toast('Supprimé', 'ok');
}

function clavier(e) {
  if ($('#vue-biblio').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const tape = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
  if (e.key === '/' && !tape) { e.preventDefault(); $('#f-recherche').focus(); return; }
  if (e.key === 'Escape' && document.activeElement === $('#f-recherche')) { $('#f-recherche').blur(); return; }
  if (tape) return;
  const i = visibles.findIndex((a) => a.id === choisi);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const j = Math.max(0, Math.min(visibles.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowRight' ? 1 : -1)));
    if (visibles[j]) choisir(visibles[j].id);
  }
  const a = choisi && etat.biblio.assets[choisi];
  if (!a) return;
  if (e.key === 'Enter') rappels.ouvrir(a);
  if (e.key === 'f' || e.key === 'F') enregistrer(a.id, undefined, { favori: !a.favori });
}
