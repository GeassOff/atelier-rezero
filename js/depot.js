// Le dépôt GitHub des sprites : on y lit l'index et les images, et chaque enregistrement y fait un commit.
// En ligne, l'atelier parle à api.github.com avec la clé collée à la connexion. Sur le PC de Tiago
// (localhost), il passe par le petit serveur, qui ajoute lui-même la connexion GitHub de git.
export const DEPOT = { proprio: 'GeassOff', nom: 'atelier-rezero-sprites', branche: 'main' };
export const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const BASE = local ? '/gh' : 'https://api.github.com';
const REPO = `/repos/${DEPOT.proprio}/${DEPOT.nom}`;

const lire = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const ecrire = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
export const session = {
  get cle() { return lire('atelier-rezero-cle'); },
  set cle(v) { ecrire('atelier-rezero-cle', v); },
  get pseudo() { return lire('atelier-rezero-pseudo') || (local ? 'Tiago' : ''); },
  set pseudo(v) { ecrire('atelier-rezero-pseudo', v); },
};

async function gh(chemin, { method = 'GET', body, brut = false, cle = session.cle } = {}) {
  const h = { Accept: brut ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (!local) h.Authorization = 'Bearer ' + cle;
  if (body) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + chemin, { method, headers: h, body: body && JSON.stringify(body), cache: 'no-cache' });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const e = new Error(r.status === 401 ? 'clé refusée par GitHub' : r.status === 404 ? 'dépôt introuvable (ou la clé n’y a pas accès)' : j.message || r.statusText);
    e.status = r.status;
    throw e;
  }
  return brut ? r : r.json();
}

// Vérifie une clé avant de la garder : elle doit pouvoir écrire dans le dépôt des sprites
export async function essayerCle(cle) {
  const r = await gh(REPO, { cle });
  if (r.permissions && !r.permissions.push) throw new Error('cette clé peut lire mais pas enregistrer');
  return r;
}

// ---------- Les images ----------
// Une image du dépôt ne change jamais pour un même sha : on les garde dans le cache du navigateur,
// et seules les nouvelles sont téléchargées.
const shas = new Map();   // chemin → sha du fichier dans le dépôt
const urls = new Map();   // chemin → URL de l'image (blob:)
const VIDE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
export const urlDe = (chemin) => urls.get(chemin) || VIDE;

let cache = null;
async function blob(sha) {
  cache ??= await caches.open('atelier-rezero').catch(() => false);
  const cleCache = '/__blob/' + sha;
  const garde = cache && (await cache.match(cleCache));
  if (garde) return garde.blob();
  const r = await gh(`${REPO}/git/blobs/${sha}`, { brut: true });
  const b = await r.blob();
  if (cache) cache.put(cleCache, new Response(b)).catch(() => {});
  return b;
}
function poser(chemin, sha, b) {
  if (urls.has(chemin)) URL.revokeObjectURL(urls.get(chemin));
  shas.set(chemin, sha);
  urls.set(chemin, URL.createObjectURL(b));
}
function oublier(chemin) {
  if (urls.has(chemin)) URL.revokeObjectURL(urls.get(chemin));
  urls.delete(chemin); shas.delete(chemin);
}

// ---------- Lire le dépôt ----------
export const tete = { commit: null, quand: null, auteur: null, message: null };

async function teteActuelle() {
  return (await gh(`${REPO}/git/ref/heads/${DEPOT.branche}`)).object.sha;
}
// Tout relire : l'index, et les images qui ont changé. progres(fait, total) pendant le téléchargement.
export async function charger(progres = () => {}) {
  const sha = await teteActuelle();
  const commit = await gh(`${REPO}/git/commits/${sha}`);
  const arbre = await gh(`${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
  const fichiers = new Map(arbre.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
  const idx = fichiers.has('index.json') ? JSON.parse(await (await blob(fichiers.get('index.json'))).text()) : { assets: {} };
  for (const chemin of [...shas.keys()]) if (!fichiers.has(chemin)) oublier(chemin);
  const a_lire = [...fichiers].filter(([p, s]) => p.endsWith('.png') && shas.get(p) !== s);
  let fait = 0;
  progres(0, a_lire.length);
  const file = [...a_lire];
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (file.length) {
      const [p, s] = file.shift();
      poser(p, s, await blob(s));
      progres(++fait, a_lire.length);
    }
  }));
  Object.assign(tete, { commit: sha, quand: commit.author?.date, auteur: commit.author?.name, message: commit.message });
  return idx;
}

// Quelqu'un a-t-il enregistré depuis notre dernière lecture ? (une requête légère, que GitHub ne compte
// presque pas : le navigateur la revalide avec son ETag)
export async function aChange() {
  return (await teteActuelle()) !== tete.commit;
}

// ---------- Enregistrer ----------
// modifier(index) change l'index (le plus récent du dépôt) et rend les fichiers à écrire :
// { 'atelier/x.png': 'data:image/png;base64,…' | null (= supprimer) }. On fait un seul commit avec tout ;
// si quelqu'un a enregistré entre-temps, on recommence à partir de sa version (sans rien perdre).
let fileCommits = Promise.resolve();
export function valider(message, modifier) {
  const travail = fileCommits.then(() => validerMaintenant(message, modifier));
  fileCommits = travail.catch(() => {});
  return travail;
}
async function validerMaintenant(message, modifier) {
  for (let essai = 0; essai < 6; essai++) {
    const parent = await teteActuelle();
    const commit = await gh(`${REPO}/git/commits/${parent}`);
    const idx = await (await gh(`${REPO}/contents/index.json?ref=${parent}`, { brut: true })).json();
    idx.assets ||= {};
    const fichiers = modifier(idx) || {};
    const entrees = [], nouveaux = [];
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      if (contenu === null) { entrees.push({ path: chemin, mode: '100644', type: 'blob', sha: null }); continue; }
      const base64 = contenu.slice(contenu.indexOf(',') + 1);
      const b = await gh(`${REPO}/git/blobs`, { method: 'POST', body: { content: base64, encoding: 'base64' } });
      entrees.push({ path: chemin, mode: '100644', type: 'blob', sha: b.sha });
      nouveaux.push([chemin, b.sha, base64]);
    }
    const bIndex = await gh(`${REPO}/git/blobs`, { method: 'POST', body: { content: JSON.stringify(idx, null, 1), encoding: 'utf-8' } });
    entrees.push({ path: 'index.json', mode: '100644', type: 'blob', sha: bIndex.sha });
    const arbre = await gh(`${REPO}/git/trees`, { method: 'POST', body: { base_tree: commit.tree.sha, tree: entrees } });
    const pseudo = session.pseudo || 'Quelqu’un';
    const auteur = { name: pseudo, email: pseudo.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '@atelier-rezero', date: new Date().toISOString() };
    const nouveau = await gh(`${REPO}/git/commits`, { method: 'POST', body: { message, tree: arbre.sha, parents: [parent], author: auteur } });
    try {
      await gh(`${REPO}/git/refs/heads/${DEPOT.branche}`, { method: 'PATCH', body: { sha: nouveau.sha, force: false } });
    } catch (e) {
      if (e.status === 422 || e.status === 409) continue; // quelqu'un est passé avant : on recommence
      throw e;
    }
    for (const [chemin, contenu] of Object.entries(fichiers)) if (contenu === null) oublier(chemin);
    for (const [chemin, sha, base64] of nouveaux) {
      const octets = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      poser(chemin, sha, new Blob([octets], { type: 'image/png' }));
    }
    // si d'autres avaient enregistré avant nous, leurs images seront lues au prochain coup d'œil
    const autres = parent !== tete.commit;
    Object.assign(tete, { commit: autres ? tete.commit : nouveau.sha, quand: auteur.date, auteur: pseudo, message });
    return { idx, autres };
  }
  throw new Error('trop d’enregistrements en même temps, réessaie');
}

// ---------- L'historique d'un dessin ----------
// Les commits qui ont touché ces fichiers, du plus récent au plus ancien : [{ sha, quand, auteur, message, chemin }]
export async function historique(chemins) {
  const listes = await Promise.all(chemins.map(async (chemin) => {
    const r = await gh(`${REPO}/commits?path=${encodeURIComponent(chemin)}&per_page=40`);
    return r.map((c) => ({ sha: c.sha, quand: c.commit.author?.date, auteur: c.commit.author?.name, message: c.commit.message, chemin }));
  }));
  return listes.flat().sort((a, b) => (b.quand || '').localeCompare(a.quand || ''));
}
// Le fichier tel qu'il était à un commit (null s'il n'existait pas à ce moment-là)
export async function fichierA(chemin, sha) {
  try { return await (await gh(`${REPO}/contents/${chemin.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, { brut: true })).blob(); }
  catch (e) { if (e.status === 404) return null; throw e; }
}
