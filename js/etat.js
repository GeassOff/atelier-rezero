// Ce que la bibliothèque et l'atelier se partagent : l'index des assets, et quelques outils.
import * as depot from './depot.js?v=20261025235747';
import { urlDe } from './depot.js?v=20261025235747';

export const etat = {
  biblio: { assets: {}, palettes: {}, palettesJeu: {} },
};

export const CATEGORIES = [
  { id: 'heros', nom: 'Héros', icone: 'persos/subaru/repos01' },
  { id: 'ennemis', nom: 'Ennemis & boss', icone: 'persos/elsa/repos01' },
  { id: 'attaques', nom: 'Attaques & projectiles', icone: 'persos/cristal/repos01' },
  { id: 'interface', nom: 'Interface', icone: 'interface/coeur' },
  { id: 'decor', nom: 'Décor', icone: 'decor/arbre-a' },
  { id: 'proto', nom: 'Placeholders', icone: 'proto/subaru' },
  { id: 'refs', nom: 'Références', icone: 'refs/dessin-tiago' },
  { id: 'creations', nom: 'Créations', icone: null },
  { id: 'divers', nom: 'Divers (à ranger)', icone: null },
];
export const nomCategorie = (id) => CATEGORIES.find((c) => c.id === id)?.nom || id;

export const nomDe = (a) => a.nomPerso || a.nom || a.id;
export const catDe = (a) => a.categoriePerso || a.categorie || 'creations';
export const sousCatDe = (a) => a.sousCategorie || (a.source === 'atelier' ? 'Créations' : 'Autres');
export const estRetouche = (a) => Boolean(a.modifie);

// L'image à afficher : la retouche s'il y en a une, sinon l'original du jeu
export const urlOriginal = (a) => urlDe(`jeu/${a.id}.png`);
export const urlImage = (a) => (a.modifie || a.source === 'atelier' ? urlDe(`atelier/${a.id}.png`) : urlOriginal(a));
// Les références (le dessin de Tiago, les refs) se regardent : on en fait une copie pour les retoucher
export const verrouille = (a) => Boolean(a && a.source === 'jeu' && a.categorie === 'refs');

export const membresGroupe = (a) => {
  if (!a || !a.groupe) return [a].filter(Boolean);
  return Object.values(etat.biblio.assets).filter((x) => x.groupe === a.groupe).sort((x, y) => (x.ordre ?? 1e9) - (y.ordre ?? 1e9) || nomDe(x).localeCompare(nomDe(y), 'fr', { numeric: true }));
};

export const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dessin';
export function idLibre(base) {
  let id = base, n = 2;
  while (etat.biblio.assets[id]) id = `${base}-${n++}`;
  return id;
}

// ---------- Le dépôt (GitHub) ----------
function prendre(idx) {
  etat.biblio = idx;
  etat.biblio.assets ||= {};
  etat.biblio.palettes ||= {};
  etat.biblio.palettesJeu ||= {};
  return etat.biblio;
}
export async function chargerBiblio(progres) {
  return prendre(await depot.charger(progres));
}
const maintenant = () => new Date().toISOString();
const signaler = (ids) => { for (const id of ids) document.dispatchEvent(new CustomEvent('biblio-change', { detail: { id } })); };

// Ce qu'on garde quand on modifie la fiche d'un asset
const CHAMPS_FICHE = ['nomPerso', 'categoriePerso', 'groupe', 'tags', 'favori', 'note', 'l', 'h', 'nom', 'categorie', 'sousCategorie', 'ordre', 'couleurs', 'aFaire'];

// La « version » de l'image d'un asset : elle change quand quelqu'un enregistre l'image, ou quand la synchro la met dans le jeu
export const versionDe = (a) => (a ? `${a.modifie || ''}|${a.envoye || ''}` : 'neuf');
// Quelqu'un d'autre a enregistré ce dessin depuis qu'on l'a ouvert
export class Conflit extends Error {
  constructor(a) { super(`${a.modifiePar || 'Quelqu’un'} a enregistré « ${nomDe(a)} » pendant que tu le modifiais`); this.asset = a; }
}

// Enregistre une image (dataURL PNG) et/ou la fiche d'un asset : un commit dans le dépôt.
// attendu : la version ouverte dans l'atelier (si une autre a été enregistrée entre-temps : Conflit)
export async function enregistrer(id, png, meta = {}, attendu) {
  const avant = etat.biblio.assets[id];
  const nom = meta.nom || (avant && nomDe(avant)) || id;
  const message = png ? (avant ? `Retouche : ${nom}` : `Nouveau dessin : ${nom}`) : `Fiche : ${nom}`;
  await enregistrerPlusieurs(message, [{ id, png, meta, attendu }]);
  return etat.biblio.assets[id];
}
// Plusieurs dessins en un seul commit : [{ id, png?, meta?, attendu? }]
export async function enregistrerPlusieurs(message, liste) {
  const { idx } = await depot.valider(message, (idx) => {
    const fichiers = {};
    for (const { id, png, meta = {}, attendu } of liste) {
      const a = idx.assets[id];
      if (!a && !png) throw new Error('ce dessin n’existe plus');
      if (png && attendu !== undefined && versionDe(a) !== attendu) throw new Conflit(a);
      const base = a || { id, source: 'atelier', cree: maintenant(), creePar: depot.session.pseudo, tags: [] };
      if (png) {
        fichiers[`atelier/${id}.png`] = png;
        base.modifie = maintenant(); base.modifiePar = depot.session.pseudo; base.jeuChange = false;
        delete base.refus;
      }
      for (const k of CHAMPS_FICHE) if (k in meta) base[k] = meta[k];
      idx.assets[id] = base;
    }
    return fichiers;
  });
  prendre(idx);
  signaler(liste.map((x) => x.id));
}
// « À faire » : une demande posée sur un ou plusieurs dessins (texte), ou retirée (null)
export async function marquerAFaire(ids, texte) {
  const aFaire = texte === null ? null : { texte, par: depot.session.pseudo, quand: maintenant() };
  const noms = ids.map((id) => nomDe(etat.biblio.assets[id] || { id }));
  await enregistrerPlusieurs((aFaire ? 'À faire : ' : 'Fait : ') + (noms.length > 3 ? `${noms[0]} et ${noms.length - 1} autres` : noms.join(', ')) + (aFaire && texte ? ` (${texte})` : ''),
    ids.map((id) => ({ id, meta: { aFaire } })));
}

// Revenir à l'original (une retouche) ou supprimer (une création). Rien n'est perdu : l'historique du dépôt garde tout.
export async function retirerVersion(id) {
  const a0 = etat.biblio.assets[id];
  const { idx } = await depot.valider((a0?.source === 'jeu' ? 'Retour à l’original : ' : 'Supprimé : ') + (a0 ? nomDe(a0) : id), (idx) => {
    const a = idx.assets[id];
    if (!a) return {};
    if (a.source === 'jeu') { delete a.modifie; delete a.modifiePar; delete a.pourLeJeu; a.jeuChange = false; }
    else delete idx.assets[id];
    return { [`atelier/${id}.png`]: null };
  });
  prendre(idx);
  signaler([id]);
  return etat.biblio.assets[id];
}
// « Prêt pour le jeu » : la prochaine synchro le met dans Unity (une retouche remplace l'image du jeu,
// une création part dans « A integrer » pour être branchée)
export const envoyable = (a) => Boolean(a && !verrouille(a) && ((a.source === 'jeu' && a.modifie && a.fichier) || a.source === 'atelier'));
export async function marquerPourLeJeu(ids, oui = true) {
  const { idx } = await depot.valider((oui ? 'Prêt pour le jeu : ' : 'Plus prêt pour le jeu : ') + ids.map((id) => nomDe(etat.biblio.assets[id] || { id })).join(', '), (idx) => {
    for (const id of ids) {
      const a = idx.assets[id];
      if (!a) continue;
      if (oui) { a.pourLeJeu = maintenant(); a.pourLeJeuPar = depot.session.pseudo; delete a.refus; }
      else { delete a.pourLeJeu; delete a.pourLeJeuPar; }
    }
    return {};
  });
  prendre(idx);
  signaler(ids);
}
let attentePalettes = 0;
export function enregistrerPalettes() {
  // (on attend un peu : plusieurs couleurs ajoutées d'affilée font un seul commit)
  clearTimeout(attentePalettes);
  const palettes = structuredClone(etat.biblio.palettes);
  attentePalettes = setTimeout(() => {
    depot.valider('Palettes', (idx) => { idx.palettes = palettes; return {}; })
      .then(({ idx }) => { idx.palettes = etat.biblio.palettes; prendre(idx); })
      .catch((e) => toast('Palettes pas enregistrées : ' + e.message, 'ko'));
  }, 1500);
}
export function toast(texte, genre = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + genre;
  t.textContent = texte;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), genre === 'ko' ? 6000 : 3200);
}
export const quand = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};
export function telecharger(nomFichier, url) {
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier;
  document.body.appendChild(a); a.click(); a.remove();
}
