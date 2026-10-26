// Les petites fenêtres : nouveau dessin / enregistrer comme nouveau, taille de la toile, couleurs.
import { etat, CATEGORIES } from './etat.js?v=20261026193620';

const $ = (s) => document.querySelector(s);

// Quelques tailles du jeu, pour partir juste
const MODELES = [
  ['Subaru', 33, 66], ['Emilia', 51, 61], ['Ram / Rem', 54, 59], ['Reinhard', 44, 66], ['Puck', 28, 36],
  ['Elsa', 59, 60], ['Wolgarm', 40, 27], ['Projectile', 15, 15], ['Icône d’interface', 9, 9],
  ['Objet du décor', 22, 30], ['Texture', 16, 16], ['Placeholder', 16, 24],
];

function ouvrir(dlg, valider) {
  return new Promise((ok) => {
    const fin = () => {
      dlg.removeEventListener('close', fin);
      ok(dlg.returnValue === 'ok' ? valider() : null);
    };
    dlg.returnValue = '';
    dlg.addEventListener('close', fin);
    dlg.showModal();
  });
}

// { titre, nom, categorie, groupe, avecTaille, l, h } → { nom, categorie, groupe, l, h } ou null
export function demanderFiche(o = {}) {
  const dlg = $('#dlg-nouveau'), f = dlg.querySelector('form');
  $('#dlg-nouveau-titre').textContent = o.titre || 'Nouveau dessin';
  f.querySelector('button[value=ok]').textContent = o.bouton || 'Créer';
  f.nom.value = o.nom || '';
  f.categorie.innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.nom}</option>`).join('');
  f.categorie.value = o.categorie && o.categorie !== 'refs' ? o.categorie : 'creations';

  f.groupe.value = o.groupe || '';
  $('#groupes-connus').innerHTML = [...new Set(Object.values(etat.biblio.assets).map((a) => a.groupe).filter(Boolean))].sort().map((g) => `<option value="${g}">`).join('');
  $('#taille-nouveau').hidden = !o.avecTaille;
  $('#modeles').hidden = !o.avecTaille;
  f.l.value = o.l || 16; f.h.value = o.h || 16;
  const m = $('#modeles');
  m.innerHTML = '';
  for (const [n, l, h] of MODELES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'puce'; b.textContent = `${n} ${l}×${h}`;
    b.onclick = () => { f.l.value = l; f.h.value = h; };
    m.append(b);
  }
  return ouvrir(dlg, () => ({
    nom: f.nom.value.trim() || 'Sans nom', categorie: f.categorie.value, groupe: f.groupe.value.trim() || null,
    l: Math.max(1, Math.min(512, +f.l.value || 16)), h: Math.max(1, Math.min(512, +f.h.value || 16)),
  }));
}

// → { l, h, ax, ay } ou null
export function demanderToile(l, h) {
  const dlg = $('#dlg-toile'), f = dlg.querySelector('form');
  f.l.value = l; f.h.value = h;
  let ax = 0.5, ay = 1; // par défaut : centré, posé en bas (comme les sprites du jeu, posés sur leur base)
  const z = $('#ancres');
  z.innerHTML = '';
  for (const y of [0, 0.5, 1]) for (const x of [0, 0.5, 1]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = x === ax && y === ay ? 'actif' : '';
    b.onclick = () => { ax = x; ay = y; z.querySelectorAll('button').forEach((e) => e.classList.remove('actif')); b.classList.add('actif'); };
    z.append(b);
  }
  return ouvrir(dlg, () => ({ l: Math.max(1, Math.min(512, +f.l.value || l)), h: Math.max(1, Math.min(512, +f.h.value || h)), ax, ay }));
}

// Teinte / saturation / luminosité, avec un aperçu en direct : apercu({ t, s, l, contours }) est appelé à chaque changement
export function demanderAjustement(apercu) {
  const dlg = $('#dlg-ajuster'), f = dlg.querySelector('form');
  f.t.value = 0; f.s.value = 0; f.l.value = 0; f.contours.checked = false;
  const lire = () => ({ t: +f.t.value, s: +f.s.value / 100, l: +f.l.value / 100, contours: f.contours.checked });
  const maj = () => {
    for (const n of ['t', 's', 'l']) f[n].nextElementSibling.value = f[n].value + (n === 't' ? '°' : '%');
    apercu(lire());
  };
  f.oninput = maj;
  maj();
  return ouvrir(dlg, lire);
}
