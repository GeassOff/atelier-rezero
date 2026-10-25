// L'Atelier Re:Zero : la bibliothèque des sprites du jeu et l'éditeur, réunis, partagés par un dépôt GitHub.
import { etat, chargerBiblio, enregistrer, nomDe, catDe, idLibre, slug, toast, quand, urlImage, versionDe } from './etat.js?v=20261025235747';
import * as depot from './depot.js?v=20261025235747';
import { initBiblio, rafraichir, choisir } from './biblio.js?v=20261025235747';
import { initEditeur, ouvrirAsset, ouvrirNeuf, surAffichage, docOuvert } from './editeur.js?v=20261025235747';
import { montrerAsset, restaurer as restaurerACote } from './acote.js?v=20261025235747';
import { demanderFiche } from './dialogues.js?v=20261025235747';
import * as px from './pixels.js?v=20261025235747';

const $ = (s) => document.querySelector(s);

// ---------- Les deux vues ----------
function montrer(nom) {
  for (const b of document.querySelectorAll('.onglets button')) b.classList.toggle('actif', b.dataset.vue === nom);
  $('#vue-biblio').hidden = nom !== 'biblio';
  $('#vue-atelier').hidden = nom !== 'atelier';
  try { localStorage.setItem('atelier-vue', nom); } catch {}
  if (nom === 'atelier') requestAnimationFrame(surAffichage);
  if (nom === 'biblio') document.title = 'Atelier Re:Zero';
}
document.querySelectorAll('.onglets button').forEach((b) => (b.onclick = () => montrer(b.dataset.vue)));
document.querySelectorAll('[data-vue-lien]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); montrer(a.dataset.vueLien); }));

async function ouvrir(a) {
  montrer('atelier');
  await ouvrirAsset(a);
  surAffichage();
}

// ---------- Nouveau dessin, copie ----------
async function nouveau() {
  const r = await demanderFiche({ titre: 'Nouveau dessin', avecTaille: true });
  if (!r) return;
  montrer('atelier');
  await ouvrirNeuf(r);
  surAffichage();
}
// Une image de la bibliothèque à côté de la toile
async function aCote(a) {
  montrer('atelier');
  await montrerAsset(a);
}
async function dupliquer(a) {
  const r = await demanderFiche({ titre: 'Dupliquer', bouton: 'Dupliquer', nom: nomDe(a) + ' (copie)', categorie: catDe(a), groupe: a.groupe });
  if (!r) return;
  const img = px.deImage(await px.charger(urlImage(a)));
  const id = idLibre('creations/' + slug(r.nom));
  try {
    const nouveau = await enregistrer(id, px.versPng(img), {
      nom: r.nom, categorie: r.categorie, groupe: r.groupe, sousCategorie: a.sousCategorie || 'Créations de ' + depot.session.pseudo,
      tags: [...new Set([...(a.tags || []).filter((t) => t !== 'référence'), 'variante'])], l: img.l, h: img.h, couleurs: a.couleurs,
    });
    choisir(id);
    ouvrir(nouveau);
  } catch (e) { toast('Pas dupliqué : ' + e.message, 'ko'); }
}
$('#b-nouveau').onclick = nouveau;
$('#lien-nouveau').onclick = (e) => { e.preventDefault(); nouveau(); };

// ---------- Ajouter des PNG de son PC (bouton ou glisser-déposer) ----------
async function importerFichiers(fichiers) {
  let n = 0, dernier = null;
  for (const f of fichiers) {
    if (!f.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(f);
    try {
      // un PNG agrandi (×2, ×4…) est ramené à ses vrais pixels
      const img = px.echelleNative(px.deImage(await px.charger(url)));
      const nom = f.name.replace(/\.[^.]+$/, '');
      const id = idLibre('creations/' + slug(nom));
      await enregistrer(id, px.versPng(img), { nom, categorie: 'creations', sousCategorie: 'Ajoutés par ' + depot.session.pseudo, tags: ['importé'], l: img.l, h: img.h, couleurs: px.couleurs(img).length });
      n++; dernier = id;
    } catch (e) { toast(`${f.name} : ${e.message || 'illisible'}`, 'ko'); }
    finally { URL.revokeObjectURL(url); }
  }
  if (n) { toast(`${n} image${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} aux « Créations »`, 'ok'); choisir(dernier); }
}
$('#b-importer-png').onclick = () => $('#fichiers-png').click();
$('#fichiers-png').onchange = (e) => { importerFichiers([...e.target.files]); e.target.value = ''; };
let profondeur = 0;
const avecFichiers = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (!avecFichiers(e)) return; profondeur++; $('#depot').classList.add('visible'); });
window.addEventListener('dragleave', () => { if (--profondeur <= 0) { profondeur = 0; $('#depot').classList.remove('visible'); } });
window.addEventListener('dragover', (e) => { if (avecFichiers(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!avecFichiers(e)) return;
  e.preventDefault();
  profondeur = 0; $('#depot').classList.remove('visible');
  importerFichiers([...e.dataTransfer.files]);
});

// ---------- Les nouveautés des autres ----------
// On regarde régulièrement si quelqu'un a enregistré ; si oui, on relit le dépôt (seules les images
// qui ont changé sont téléchargées).
let lecture = null;
async function relire(silencieux = false) {
  if (lecture) return lecture;
  lecture = (async () => {
    const avant = depot.tete.commit;
    try {
      await chargerBiblio((fait, total) => { if (total > 3) $('#etat').textContent = `Nouvelles images : ${fait} / ${total}`; });
      rafraichir();
      majEtat();
      if (avant && avant !== depot.tete.commit && depot.tete.auteur && depot.tete.auteur !== depot.session.pseudo) toast(`${depot.tete.auteur} : ${depot.tete.message}`, 'ok');
      // le dessin ouvert dans l'atelier vient d'être enregistré par quelqu'un d'autre
      const d = docOuvert(), a = d && d.id && etat.biblio.assets[d.id];
      if (a && d.version && versionDe(a) !== d.version && a.modifiePar !== depot.session.pseudo) toast(`Attention : ${a.modifiePar || 'quelqu’un'} vient d’enregistrer « ${nomDe(a)} », que tu as ouvert. En enregistrant, l’atelier te demandera quoi garder.`, 'ko');
      else if (!silencieux) toast('À jour', 'ok');
    } catch (e) { if (!silencieux) toast('Pas relu : ' + e.message, 'ko'); majEtat(); }
    finally { lecture = null; }
  })();
  return lecture;
}
async function coupDOeil() {
  if (document.hidden || !depot.tete.commit) return;
  try { if (await depot.aChange()) relire(true); } catch {}
}
setInterval(coupDOeil, 30000);
document.addEventListener('visibilitychange', coupDOeil);
$('#b-actualiser').onclick = () => relire();

function majEtat() {
  const as = Object.values(etat.biblio.assets);
  const retouches = as.filter((a) => a.modifie).length, crees = as.filter((a) => a.source === 'atelier').length, prets = as.filter((a) => a.pourLeJeu).length;
  $('#etat').textContent = `${as.length} dessins · ${retouches} retouché${retouches > 1 ? 's' : ''} · ${crees} création${crees > 1 ? 's' : ''}` + (prets ? ` · ${prets} prêt${prets > 1 ? 's' : ''} pour le jeu` : '') + (depot.tete.quand ? ` · dernier enregistrement : ${depot.tete.auteur || '?'}, le ${quand(depot.tete.quand)}` : '');
  $('#b-pseudo').textContent = '☺ ' + (depot.session.pseudo || '?');
}
document.addEventListener('biblio-change', majEtat);

// ---------- Connexion : une clé (en ligne) et un pseudo (pour signer ses dessins) ----------
function connexion(raison = '') {
  const dlg = $('#dlg-connexion'), f = dlg.querySelector('form');
  f.pseudo.value = depot.session.pseudo;
  f.cle.value = '';
  $('#connexion-cle').hidden = depot.local;
  f.cle.required = !depot.local && !depot.session.cle;
  $('#connexion-raison').textContent = raison;
  $('#connexion-raison').hidden = !raison;
  return new Promise((ok) => {
    // Échap ferme la fenêtre seulement si on a déjà de quoi entrer
    dlg.oncancel = (e) => { if (!depot.session.pseudo || (!depot.local && !depot.session.cle)) e.preventDefault(); else ok(false); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const cle = f.cle.value.trim();
      $('#connexion-raison').hidden = true;
      try {
        if (cle) { await depot.essayerCle(cle); depot.session.cle = cle; }
        depot.session.pseudo = f.pseudo.value.trim().slice(0, 30);
        dlg.close();
        majEtat();
        ok(true);
      } catch (err) {
        $('#connexion-raison').textContent = 'Ça ne marche pas : ' + err.message + '.';
        $('#connexion-raison').hidden = false;
      }
    };
    dlg.showModal();
  });
}
$('#b-pseudo').onclick = () => connexion();

// ---------- L'aide ----------
const aide = () => { if (!$('#dlg-aide').open) $('#dlg-aide').showModal(); };
$('#b-aide').onclick = aide;
document.addEventListener('keydown', (e) => {
  if (e.key !== '?' || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  e.preventDefault(); aide();
});

// ---------- Démarrage ----------
(async () => {
  initEditeur();
  initBiblio({ ouvrir, dupliquer, aCote });
  montrer('biblio'); // (on arrive toujours sur la bibliothèque : rien n'est ouvert dans l'atelier)
  if (!depot.session.pseudo || (!depot.local && !depot.session.cle)) await connexion();
  for (;;) {
    try {
      $('#etat').textContent = 'Lecture du dépôt…';
      await chargerBiblio((fait, total) => { $('#etat').textContent = `Chargement des images : ${fait} / ${total}`; });
      break;
    } catch (e) {
      if (depot.local || ![401, 403, 404].includes(e.status)) { $('#etat').textContent = ''; toast('Le dépôt est injoignable : ' + e.message, 'ko'); return; }
      await connexion('GitHub refuse la clé (' + e.message + ') : demande-en une nouvelle à Tiago.');
    }
  }
  rafraichir();
  majEtat();
  restaurerACote();
  // la première visite : le mode d'emploi
  try { if (!localStorage.getItem('atelier-rezero-aide-vue')) { localStorage.setItem('atelier-rezero-aide-vue', '1'); aide(); } } catch {}
})();

