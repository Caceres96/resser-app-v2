// Lecture d'un ticket de caisse (OCR local, Tesseract) et rapprochement des lignes avec le catalogue.
// Tout se fait dans le navigateur : la photo du ticket ne quitte pas le téléphone et n'est pas conservée.
// Méthode validée dans le laboratoire de la version stable (labo.html, 29/10/2026).

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const TESS_LANGUES = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra@1.0.0/4.0.0_best_int';

// ---------- Rapprochement de libellés ----------

export const normaliser = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const simMot = (a, b) => {
  if (a === b) return 1;
  // « mozza » est le début de « mozzarella » : abréviation de caisse typique.
  if (a.length >= 3 && b.startsWith(a)) return 0.9;
  if (b.length >= 3 && a.startsWith(b)) return 0.9;
  return Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
};
function trigrammes(s) { const t = ` ${s} `; const r = new Set(); for (let i = 0; i < t.length - 2; i++) r.add(t.slice(i, i + 3)); return r; }
function dice(a, b) {
  const A = trigrammes(a), B = trigrammes(b); let c = 0;
  for (const x of A) if (B.has(x)) c++;
  return (2 * c) / (A.size + B.size || 1);
}
function simNorm(a, b) {
  const ta = a.split(' '), tb = b.split(' ');
  const meilleurs = (u, v) => u.reduce((s, m) => s + Math.max(...v.map((n) => simMot(m, n))), 0) / u.length;
  return 0.5 * ((meilleurs(ta, tb) + meilleurs(tb, ta)) / 2) + 0.5 * dice(a, b);
}
// Symétrique ; le texte le plus long (bruit d'OCR autour du nom) est aussi comparé par fenêtres de mots.
export function similarite(x, y) {
  const a = normaliser(x), b = normaliser(y);
  if (!a || !b) return 0;
  let meilleur = simNorm(a, b);
  const [long, court] = a.split(' ').length >= b.split(' ').length ? [a, b] : [b, a];
  const tl = long.split(' '), n = court.split(' ').length;
  if (tl.length > n) {
    for (let m = Math.max(1, n - 1); m <= n + 1 && m <= tl.length; m++) {
      for (let i = 0; i + m <= tl.length; i++) meilleur = Math.max(meilleur, simNorm(tl.slice(i, i + m).join(' '), court) - 0.02 * Math.abs(m - n));
    }
  }
  return meilleur;
}

// Un produit peut avoir plusieurs libellés (un par enseigne), séparés par « | ».
export const libellesDe = (texte) => String(texte || '').split('|').map((s) => s.trim()).filter(Boolean);
export function ajouterLibelle(texte, nouveau) {
  const liste = libellesDe(texte);
  if (nouveau && !liste.some((l) => normaliser(l) === normaliser(nouveau))) liste.push(nouveau.trim());
  return liste.join(' | ');
}

export const SEUIL_SUR = 0.82;
export const SEUIL_PROBABLE = 0.6;
// catalogue : [{ gtin, nom, marque, libelle }]. « sûr » seulement via un libellé déjà appris.
export function apparier(libelle, catalogue) {
  const cands = catalogue.map((p) => {
    const sLib = Math.max(0, ...libellesDe(p.libelle).map((l) => similarite(libelle, l)));
    const sNom = similarite(libelle, `${p.nom || ''} ${p.marque || ''}`) * 0.85;
    return { p, score: Math.max(sLib, sNom), via: sLib >= sNom ? 'libellé' : 'nom' };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
  const top = cands[0];
  const niveau = !top ? 'aucun' : top.score >= SEUIL_SUR && top.via === 'libellé' ? 'sur' : top.score >= SEUIL_PROBABLE ? 'probable' : 'aucun';
  return { niveau, cands };
}

// ---------- Analyse des lignes ----------

const IGNORER = /\b(total|tva|carte|cb|especes?|monnaie|rendu|siret|merci|ticket|articles?|remise|fidelite|cagnotte|avoir|caisse|magasin|tel|www|date|heure|net|payer|paiement|visa|mastercard|contact|sous)\b/i;
export function analyserLigne(brut) {
  const t = String(brut || '').replace(/\s+/g, ' ').trim();
  if (t.length < 4 || !/[a-zA-Z]{3}/.test(t) || IGNORER.test(t)) return null;
  // Dernier prix de la ligne (l'OCR ajoute parfois du bruit après : « 8,82 Bit », « 6,41 E »).
  const prix = [...t.matchAll(/(\d{1,3}[.,]\d{2})(?!\d)/g)].at(-1);
  if (!prix) return null; // une ligne article porte un prix
  let libelle = t.slice(0, prix.index);
  let qte = 1;
  const q = libelle.match(/^\s*(\d{1,2})\s*[xX*]\s+/);
  if (q) { qte = Number(q[1]); libelle = libelle.slice(q[0].length); }
  libelle = libelle.replace(/^[\d\s\-.*#“”"'‘’]+/, '').replace(/[|_~=]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (libelle.replace(/[^a-zA-Z]/g, '').length < 3) return null;
  return { libelle, prix: Number(prix[1].replace(',', '.')), qte };
}

// Date du ticket (jj/mm/aa ou jj/mm/aaaa) → « aaaa-mm-jj », si elle est plausible.
export function detecterDate(lignes) {
  for (const l of lignes) {
    const m = l.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{2}|\d{4})\b/);
    if (!m) continue;
    const j = Number(m[1]), mo = Number(m[2]), a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(a, mo - 1, j);
    if (d.getMonth() === mo - 1 && d <= new Date() && a >= 2020) return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  }
  return '';
}
export function detecterEnseigne(lignes, enseignes) {
  const debut = lignes.slice(0, 8).map(normaliser).join(' ');
  return [...enseignes].sort((a, b) => b.length - a.length).find((e) => debut.includes(normaliser(e))) || '';
}

// ---------- OCR ----------

const charger = (src) => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Impossible de charger le lecteur de texte (hors connexion ?).')); document.head.append(s); });
let travailleur = null;
let suiviProgres = null;
async function ocr(canvas, onProgress) {
  if (!window.Tesseract) await charger(TESSERACT);
  travailleur ??= window.Tesseract.createWorker('fra', 1, {
    langPath: TESS_LANGUES,
    logger: (m) => { if (m.status === 'recognizing text' && suiviProgres) suiviProgres(m.progress); },
  });
  const w = await travailleur;
  suiviProgres = onProgress;
  const { data } = await w.recognize(canvas);
  return data.lines.map((l) => l.text.trim()).filter(Boolean);
}

// Niveaux de gris + étirement du contraste ; « binaire » ajoute un seuillage adaptatif (bruit, ombres).
function preparer(source, mode) {
  const sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
  const f = Math.max(1, Math.min(2.5, 1400 / sw));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * f); c.height = Math.round(sh * f);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  let min = 255, max = 0;
  for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = g; if (g < min) min = g; if (g > max) max = g; }
  const k = 255 / Math.max(1, max - min);
  for (let i = 0; i < p.length; i += 4) { const g = Math.max(0, Math.min(255, (p[i] - min) * k)); p[i] = p[i + 1] = p[i + 2] = g; }
  if (mode === 'binaire') binariser(p, c.width, c.height);
  x.putImageData(d, 0, 0);
  return c;
}
function binariser(p, w, h) {
  const fl = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let s = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && a < w && b >= 0 && b < h) { s += p[(b * w + a) * 4]; n++; } }
    fl[j * w + i] = s / n;
  }
  const W1 = w + 1, I = new Float64Array(W1 * (h + 1));
  for (let j = 0; j < h; j++) { let l = 0; for (let i = 0; i < w; i++) { l += fl[j * w + i]; I[(j + 1) * W1 + i + 1] = I[j * W1 + i + 1] + l; } }
  const r = Math.max(10, Math.round(Math.min(w, h) / 30));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x0 = Math.max(0, i - r), x1 = Math.min(w, i + r + 1), y0 = Math.max(0, j - r), y1 = Math.min(h, j + r + 1);
    const moy = (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
    const v = fl[j * w + i] < moy * 0.9 ? 0 : 255, k = (j * w + i) * 4;
    p[k] = p[k + 1] = p[k + 2] = v;
  }
}

// ---------- Tickets en PDF (tickets dématérialisés envoyés par l'enseigne) ----------

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
let pdfjs = null;
async function chargerPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(PDFJS);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return pdfjs;
}

// Regroupe les morceaux de texte d'une page en lignes (même ordonnée), lus de gauche à droite.
function lignesDePage(items) {
  const groupes = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 8;
    let g = groupes.find((v) => Math.abs(v.y - y) <= h * 0.5);
    if (!g) { g = { y, morceaux: [] }; groupes.push(g); }
    g.morceaux.push({ x, s: it.str });
  }
  return groupes.sort((a, b) => b.y - a.y)
    .map((g) => g.morceaux.sort((a, b) => a.x - b.x).map((m) => m.s).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// PDF avec texte : lecture directe, exacte. PDF scanné (image seule) : chaque page est lue par OCR.
export async function lireTicketPdf(fichier, onProgress) {
  const lib = await chargerPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
  const pages = Math.min(doc.numPages, 10);
  let brut = [];
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n);
    brut.push(...lignesDePage((await page.getTextContent()).items));
  }
  let articles = brut.map(analyserLigne).filter(Boolean);
  if (articles.length) { if (onProgress) onProgress(1); return { brut, articles, source: 'pdf-texte' }; }
  brut = []; articles = [];
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 2.5 });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvas: c, canvasContext: x, viewport: vp }).promise;
    const r = await lireTicket(c, (v) => onProgress && onProgress((n - 1 + v) / pages));
    brut.push(...r.brut); articles.push(...r.articles);
  }
  return { brut, articles, source: 'pdf-ocr' };
}

// Deux passages : gris, puis binarisé si moins de 8 lignes article ont été trouvées.
export async function lireTicket(source, onProgress) {
  let meilleur = { brut: [], articles: [] };
  for (const mode of ['gris', 'binaire']) {
    const brut = await ocr(preparer(source, mode), (v) => onProgress && onProgress((mode === 'gris' ? 0 : 0.5) + v / 2));
    const articles = brut.map(analyserLigne).filter(Boolean);
    if (articles.length > meilleur.articles.length) meilleur = { brut, articles };
    if (mode === 'gris' && articles.length >= 8) break;
  }
  return { ...meilleur, source: 'photo' };
}
