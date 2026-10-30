import {
  CATEGORIAS, SECCIONES, normalizarRayon, seccionDe, labelRayon, sugerirRayon, COMMUNES, ENSEIGNES, BASES, FAMILIAS, MATERIALES, FORMAS, PESO_FUENTES, EXACTITUD,
  CAUSAS, ESTADOS_OFF, familiaDe, labelDe, labelMaterial, labelForma, consignaTri, FUENTE_TRI,
} from './reglas.js';
import { lireTicket, lireTicketPdf, apparier, ajouterLibelle, libellesDe, detecterDate, detecterEnseigne, detecterTotal, requeteRecherche } from './ticket.js';

const APP_VERSION = '1.3.1-beta';
// Version bêta : stockage séparé de l'application stable (même origine github.io, autre clé),
// pour qu'une erreur ici ne touche jamais l'inventaire de la version stable.
const KEY = 'resser.v2';
const KEY_STABLE = 'resser.pruebaA.v1';
const OFF_FIELDS = 'code,product_name,product_name_fr,brands,quantity,packagings,packagings_complete,image_front_small_url,categories_tags';
// Lecteur de secours (zxing-cpp en WebAssembly) quand le navigateur n'a pas de BarcodeDetector natif (iPhone, Firefox…).
const LIB_LECTOR = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.0/dist/iife/ponyfill.js';
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
// Seuils exploratoires du plan de faisabilité (section 06).
const METAS = { producto: 0.85, material: 0.70, masa: 0.50 };

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Accepte la virgule décimale (clavier français) comme le point.
const num = (v) => {
  const t = v == null ? '' : String(v).trim().replace(',', '.');
  return t === '' || isNaN(Number(t)) ? null : Number(t);
};
const decimal = (n) => (n == null || n === '' ? '' : String(n).replace('.', ','));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const g1 = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ahora = () => new Date().toISOString();
const hoy = () => new Date().toISOString().slice(0, 10);

// ---------- Stockage (dans le navigateur ; la feuille Google sert de copie partagée) ----------

function cargar() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function guardar() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { toast("Impossible d'enregistrer dans le navigateur. Exportez une sauvegarde JSON."); }
}
const db = cargar();
db.refs ??= {};
db.prefs ??= {};
db.tickets ??= [];
// Premier lancement : reprendre (en lecture seule) le nom, la clé et le contexte de la version stable.
if (!db.prefs.reprisStable) {
  try {
    const p = JSON.parse(localStorage.getItem(KEY_STABLE))?.prefs || {};
    for (const k of ['nombre', 'sync_cle', 'contexto']) if (p[k] && !db.prefs[k]) db.prefs[k] = p[k];
  } catch { /* rien à reprendre */ }
  db.prefs.reprisStable = true;
}

// Feuille de l'équipe (Apps Script « Resser Test A - synchronisation »). L'URL seule ne permet
// rien : chaque lecture ou écriture exige la clé de l'équipe, saisie sur le téléphone et jamais
// écrite dans ce dépôt public.
const FEUILLE = {
  url: 'https://script.google.com/macros/s/AKfycbwanRuGOF3gCYAw-alVU-no0VYf4XNkm6YDEMSeZD4ODirJtG-MUOlHV_fzwVYBHLf4pw/exec',
  get cle() { return db.prefs.sync_cle; },
};
const conectado = () => !!db.prefs.sync_cle;
// Migration des anciens rayons vers section › sous-section ('' = à choisir).
for (const r of Object.values(db.refs)) r.categoria = normalizarRayon(r.categoria);
delete db.prefs.categoria;

// ---------- Utilitaires ----------

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
function estado(msg) { $('#estado').textContent = msg || ''; }

function gtinValido(code) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const d = code.split('').map(Number);
  const control = d.pop();
  const suma = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === control;
}

function opciones(lista, valor) {
  const conocido = lista.some((o) => o.id === (valor || ''));
  const extra = !conocido && valor ? `<option value="${esc(valor)}" selected>${esc(valor)} (OFF)</option>` : '';
  return extra + lista.map((o) => `<option value="${esc(o.id)}"${o.id === (valor || '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
}

function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ---------- Bases Open Facts (alimentaire, beauté, autres produits) ----------

async function consultarBase(base, gtin) {
  const url = `https://${base.host}/api/v3/product/${gtin}?fields=${OFF_FIELDS}`;
  let r;
  try { r = await fetch(url); } catch { throw new Error(`Pas de connexion avec ${base.label}.`); }
  if (r.status === 429) throw new Error(`Limite ${base.label} atteinte (15 requêtes/min). Patientez une minute.`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${base.label} a répondu ${r.status}.`);
  const j = await r.json();
  return j.product || null;
}

async function consultarOFF(gtin) {
  for (const base of BASES) {
    const product = await consultarBase(base, gtin);
    if (product) return { estado: 'encontrado', product, base: base.id };
  }
  return { estado: 'no_encontrado' };
}

function componentesDesdeOFF(packagings = []) {
  return packagings.map((k) => {
    let peso_g = null, peso_fuente = '';
    if (num(k.weight_measured) != null) { peso_g = num(k.weight_measured); peso_fuente = 'off_medido'; }
    else if (num(k.weight_specified) != null) { peso_g = num(k.weight_specified); peso_fuente = 'off_especificado'; }
    else if (num(k.weight_estimated) != null) { peso_g = num(k.weight_estimated); peso_fuente = 'off_estimado'; }
    return {
      forma: k.shape?.id || '',
      material: k.material?.id || '',
      unidades: num(k.number_of_units) ?? 1,
      peso_g,
      peso_fuente,
      reciclaje_off: k.recycling?.id || '',
      origen: 'off',
    };
  });
}

function nuevoRegistro(gtin, res) {
  const p = res.product || {};
  const ctx = db.prefs.contexto || {};
  return {
    gtin,
    categoria: sugerirRayon(p, res.base),
    _rayon_sug: !!sugerirRayon(p, res.base),
    libelle_ticket: '',
    nombre: p.product_name_fr || p.product_name || '',
    marca: p.brands || '',
    cantidad: p.quantity || '',
    imagen: p.image_front_small_url || '',
    enseigne: ctx.enseigne || '',
    commune: ctx.commune || '',
    date_achat: ctx.fecha || '',
    sin_envase: false,
    off: {
      estado: res.estado,
      base: res.base || '',
      packagings_complete: p.packagings_complete ?? null,
      packagings: p.packagings || [],
      consultado: ahora(),
    },
    componentes: componentesDesdeOFF(p.packagings),
    verificado: false,
    exactitud_off: res.estado === 'encontrado' && !(p.packagings || []).length ? 'sin_datos' : '',
    clase_manual: '',
    causa: res.estado === 'no_encontrado' ? 'no_encontrado' : '',
    obs: '',
    saisi_par: '',
    creado: ahora(),
    actualizado: ahora(),
    version_app: APP_VERSION,
  };
}

// ---------- Règles de qualité (classes A/B/C/D du plan) ----------

function componentesRelevantes(r) {
  const plas = r.componentes.filter((c) => familiaDe(c.material) === 'plastico');
  return plas.length ? plas : r.componentes;
}

function claseSugerida(r) {
  // Sans emballage : rien à peser, la masse plastique est connue (0 g) une fois vérifiée.
  if (r.sin_envase) return r.verificado ? 'A' : 'C';
  const c = r.componentes || [];
  if (!c.length || c.some((x) => !x.material)) return 'D';
  const rel = componentesRelevantes(r);
  if (!rel.every((x) => num(x.peso_g) != null && x.peso_fuente)) return 'C';
  if (r.verificado && !rel.some((x) => /estimado/.test(x.peso_fuente))) return 'A';
  return 'B';
}
const claseFinal = (r) => r.clase_manual || claseSugerida(r);

// Masse plastique par unité de vente : Σ (unités × poids) des composants plastiques.
// Renseignée uniquement pour les classes A et B ; en C et D aucun gramme n'est attribué.
function masaPlastico(r) {
  if (!['A', 'B'].includes(claseFinal(r))) return null;
  if (r.sin_envase) return 0;
  return r.componentes
    .filter((c) => familiaDe(c.material) === 'plastico')
    .reduce((s, c) => s + (num(c.unidades) ?? 1) * (num(c.peso_g) ?? 0), 0);
}

// ---------- Lignes partagées par l'export CSV et la feuille Google ----------

const COLS_REF = [
  'mis_a_jour', 'saisi_par', 'gtin', 'libelle_ticket', 'nom', 'marque', 'quantite', 'rayon',
  'enseigne', 'commune', 'date_achat', 'sans_emballage', 'base_produits', 'statut_off',
  'off_emballages_complets', 'nb_composants', 'materiaux', 'formes', 'masse_plastique_g',
  'classe_suggeree', 'classe_finale', 'verifie', 'donnees_off', 'cause', 'observations', 'version_app', 'photo',
];
const COLS_COMP = [
  'mis_a_jour', 'saisi_par', 'gtin', 'nom', 'rayon', 'composant', 'forme', 'materiau', 'famille',
  'unites', 'poids_g', 'source_poids', 'consigne_tri', 'recyclage_off', 'origine',
];
const ORIGENES = { off: 'OFF', off_corregido: 'OFF corrigé', manual: 'Saisie manuelle' };
const ouiNon = (b) => (b ? 'oui' : 'non');

function filaRef(r) {
  const m = masaPlastico(r);
  return {
    mis_a_jour: r.actualizado,
    saisi_par: r.saisi_par || '',
    gtin: r.gtin,
    libelle_ticket: r.libelle_ticket || '',
    nom: r.nombre,
    marque: r.marca,
    quantite: r.cantidad,
    rayon: labelRayon(r.categoria),
    enseigne: r.enseigne || '',
    commune: r.commune || '',
    date_achat: r.date_achat || '',
    sans_emballage: ouiNon(r.sin_envase),
    base_produits: labelDe(BASES, r.off.base),
    statut_off: ESTADOS_OFF[r.off.estado] || r.off.estado,
    off_emballages_complets: r.off.packagings_complete == null ? '' : ouiNon(r.off.packagings_complete),
    nb_composants: r.componentes.length,
    materiaux: r.componentes.map((c) => labelMaterial(c.material)).join(' + '),
    formes: r.componentes.map((c) => labelForma(c.forma)).join(' + '),
    masse_plastique_g: m == null ? '' : Math.round(m * 10) / 10,
    classe_suggeree: claseSugerida(r),
    classe_finale: claseFinal(r),
    verifie: ouiNon(r.verificado),
    donnees_off: r.exactitud_off ? labelDe(EXACTITUD, r.exactitud_off) : '',
    cause: r.causa ? labelDe(CAUSAS, r.causa) : '',
    observations: r.obs,
    version_app: r.version_app,
    photo: r.photo || r.photo_en_feuille ? 'oui' : '',
    // Fiche complète pour pré-remplir le produit chez les autres membres (non exportée en CSV).
    donnees_app: JSON.stringify(r, (k, v) => (['sync', 'photo', 'achat_pendiente'].includes(k) || k.startsWith('_') ? undefined : v)),
  };
}

function filasComp(r) {
  return r.componentes.map((c, i) => {
    const fam = familiaDe(c.material);
    return {
      mis_a_jour: r.actualizado,
      saisi_par: r.saisi_par || '',
      gtin: r.gtin,
      nom: r.nombre,
      rayon: labelRayon(r.categoria),
      composant: i + 1,
      forme: labelForma(c.forma),
      materiau: labelMaterial(c.material),
      famille: FAMILIAS[fam].label,
      unites: num(c.unidades) ?? '',
      poids_g: num(c.peso_g) ?? '',
      source_poids: c.peso_fuente ? labelDe(PESO_FUENTES, c.peso_fuente) : '',
      consigne_tri: consignaTri(fam).label,
      recyclage_off: c.reciclaje_off,
      origine: ORIGENES[c.origen] || c.origen,
    };
  });
}

// ---------- Onglets ----------

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => mostrarTab(b.dataset.tab)));
function mostrarTab(id) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${id}`));
  if (id === 'inventario') pintarLista();
  if (id === 'resumen') pintarResumen();
  if (id === 'ticket') pintarTicket();
  if (id !== 'escanear') cerrarCamara();
}

// ---------- Contexte d'achat et rayon (mémorisés entre deux scans) ----------

$('#enseignes').innerHTML = ENSEIGNES.map((e) => `<option value="${esc(e)}">`).join('');
$('#communes').innerHTML = COMMUNES.map((c) => `<option value="${esc(c)}">`).join('');

db.prefs.contexto ??= { enseigne: '', commune: '', fecha: hoy() };
const CTX = { enseigne: '#ctx-enseigne', commune: '#ctx-commune', fecha: '#ctx-fecha' };
for (const [k, sel] of Object.entries(CTX)) {
  $(sel).value = db.prefs.contexto[k] || '';
  $(sel).addEventListener('change', () => { db.prefs.contexto[k] = $(sel).value.trim(); guardar(); resumirContexto(); });
}
function resumirContexto() {
  const c = db.prefs.contexto;
  const partes = [db.prefs.nombre, c.enseigne, c.commune, c.fecha].filter(Boolean);
  $('#contexto-resumen').textContent = partes.length ? `· ${partes.join(' · ')}` : '· à renseigner';
}
resumirContexto();
if (!db.prefs.contexto.enseigne || !db.prefs.nombre || !db.prefs.sync_cle) $('#contexto').open = true;

// ---------- Recherche ----------

$('#ver-manual').addEventListener('click', () => {
  $('#manual').hidden = !$('#manual').hidden;
  if (!$('#manual').hidden) $('#gtin').focus();
});
$('#buscar').addEventListener('click', () => buscar($('#gtin').value));
$('#gtin').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(e.target.value); });

// UPC-A (12 chiffres) → EAN-13 avec un 0 initial, la forme utilisée par Open Food Facts.
const normalizar = (texto) => {
  const d = String(texto || '').replace(/\D/g, '');
  return d.length === 12 ? `0${d}` : d;
};

let buscando = false;
let viaCamara = false; // dernier code lu par la caméra en direct : on la rouvre après l'enregistrement
async function buscar(valor, { reconsultar = false, camara = false } = {}) {
  const gtin = normalizar(valor);
  if (!gtin) return estado('Saisissez ou scannez un code.');
  if (buscando) return;
  if (!gtinValido(gtin)) toast('La clé de contrôle ne correspond pas : vérifiez le code.');
  $('#gtin').value = gtin;
  if (!reconsultar) viaCamara = camara;

  if (db.refs[gtin] && !reconsultar) {
    estado('');
    abrirEditor(structuredClone(db.refs[gtin]));
    verificarEquipo(gtin);
    return;
  }
  buscando = true;
  $('#buscar').disabled = true;
  try {
    // Ordre : téléphone (ci-dessus) → feuille de l'équipe → bases Open Facts → création.
    let avisoHoja = '';
    if (!reconsultar) {
      estado("Recherche dans la feuille de l'équipe…");
      const eq = await consultarEquipo(gtin);
      if (eq.estado === 'existe') {
        estado('');
        if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
        abrirEditor(desdeEquipo(eq.ref, eq.photo));
        return;
      }
      if (eq.estado === 'error') {
        avisoHoja = conectado()
          ? " Attention : la feuille de l'équipe n'a pas pu être vérifiée (connexion ?), le produit existe peut-être déjà."
          : " Attention : saisissez la clé de l'équipe dans « Contexte d'achat » pour vérifier la feuille de l'équipe.";
      }
    }
    estado('Interrogation des bases Open Facts…');
    const res = await consultarOFF(gtin);
    if (reconsultar && db.refs[gtin]) {
      const r = structuredClone(db.refs[gtin]);
      const p = res.product || {};
      r.off = { estado: res.estado, base: res.base || '', packagings_complete: p.packagings_complete ?? null, packagings: p.packagings || [], consultado: ahora() };
      r.componentes = componentesDesdeOFF(p.packagings);
      if (!r.categoria) r.categoria = sugerirRayon(p, res.base);
      r.verificado = false;
      estado('Données mises à jour. Vérifiez à nouveau puis enregistrez.');
      abrirEditor(r, actual?._origen || 'scan');
    } else {
      estado((res.estado === 'encontrado' ? '' : 'Produit inconnu : décrivez son emballage.') + avisoHoja);
      abrirEditor(nuevoRegistro(gtin, res));
    }
  } catch (e) {
    estado(e.message);
  } finally {
    buscando = false;
    $('#buscar').disabled = false;
  }
}

// ---------- Catalogue partagé de l'équipe (feuille Google) ----------

// Résultat : { estado: 'existe', ref, photo } | { estado: 'absent' } | { estado: 'error' }.
async function consultarEquipo(gtin) {
  if (!conectado() || !navigator.onLine) return { estado: 'error' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const url = `${FEUILLE.url}?cle=${encodeURIComponent(FEUILLE.cle)}&gtin=${encodeURIComponent(gtin)}`;
    const j = await (await fetch(url, { signal: ctrl.signal })).json();
    if (!j.ok) return { estado: 'error' };
    const valido = j.ref && j.ref.gtin === gtin && Array.isArray(j.ref.componentes);
    return valido ? { estado: 'existe', ref: j.ref, photo: j.photo || null } : { estado: 'absent' };
  } catch {
    return { estado: 'error' }; // hors connexion ou feuille injoignable
  } finally {
    clearTimeout(t);
  }
}

const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '');

// Fiche de l'équipe → brouillon local : le contexte d'achat devient celui du scan en cours.
function desdeEquipo(ref, photo) {
  const r = structuredClone(ref);
  delete r.photo;
  r.photo_en_feuille = !!photo;
  r._photo = photo || null;
  r.categoria = normalizarRayon(r.categoria);
  const ctx = db.prefs.contexto || {};
  if (ctx.enseigne) r.enseigne = ctx.enseigne;
  if (ctx.commune) r.commune = ctx.commune;
  if (ctx.fecha) r.date_achat = ctx.fecha;
  r._equipo = { por: ref.saisi_par || 'un membre de l’équipe', fecha: ref.actualizado, clase: claseFinal(ref), verificado: !!ref.verificado };
  return r;
}

// Référence déjà sur ce téléphone : signaler si la feuille en a une version plus récente.
async function verificarEquipo(gtin) {
  if (gtin.startsWith('SC-')) return;
  const res = await consultarEquipo(gtin);
  const local = db.refs[gtin];
  if (res.estado !== 'existe' || !local || !actual || actual.gtin !== gtin) return;
  let repintar = false;
  if (!actual.photo && res.photo) { actual._photo = res.photo; repintar = true; }
  if ((res.ref.actualizado || '') > (local.actualizado || '')) {
    actual._nuevo = res.ref;
    actual._nuevoPhoto = res.photo;
    repintar = true;
    toast("Une version plus récente existe dans la feuille de l'équipe.");
  }
  if (repintar) pintarEditor();
}

// Produits sans code-barres (vrac, fruits et légumes, pain…) : identifiant interne « SC-… ».
$('#sin-codigo').addEventListener('click', () => {
  cerrarCamara();
  const r = nuevoRegistro(`SC-${Date.now().toString(36).toUpperCase()}`, { estado: 'sin_codigo' });
  $('#gtin').value = '';
  estado('Produit sans code-barres : saisissez le nom et décrivez les emballages (ou cochez « sans emballage »).');
  abrirEditor(r);
});

// ---------- Lecture du code-barres (caméra en direct ou photo) ----------

let detector = null;
let motor = '';

function cargarScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error('Impossible de charger le lecteur de codes (hors connexion ?).'));
    document.head.append(s);
  });
}

// Détecteur natif s'il lit l'EAN-13 (Chrome Android), sinon zxing-cpp en WebAssembly.
async function obtenerDetector() {
  if (detector) return detector;
  if ('BarcodeDetector' in window) {
    try {
      const soportados = await window.BarcodeDetector.getSupportedFormats();
      if (soportados.includes('ean_13')) {
        detector = new window.BarcodeDetector({ formats: FORMATOS.filter((f) => soportados.includes(f)) });
        motor = 'natif';
        return detector;
      }
    } catch { /* on passe au lecteur de secours */ }
  }
  if (!window.BarcodeDetectionAPI) await cargarScript(LIB_LECTOR);
  detector = new window.BarcodeDetectionAPI.BarcodeDetector({ formats: FORMATOS });
  motor = 'zxing';
  return detector;
}

const codigoLeido = (resultados) => resultados.map((r) => normalizar(r.rawValue)).find(gtinValido);

function mensajeCamara(e) {
  const n = e?.name || '';
  if (!navigator.mediaDevices?.getUserMedia) return 'La caméra exige une page en HTTPS. Utilisez « Photo du code » ou saisissez le code.';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, ou utilisez « Photo du code ».';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Aucune caméra disponible. Utilisez « Photo du code » ou saisissez le code.';
  if (n === 'NotReadableError') return 'La caméra est utilisée par une autre application. Fermez-la puis réessayez.';
  return e?.message || String(e);
}

let flujo = null;
let ciclo = 0;
let linterna = false;

$('#camara').addEventListener('click', abrirCamara);
$('#cerrar-camara').addEventListener('click', cerrarCamara);

async function abrirCamara() {
  const id = ++ciclo;
  try {
    estado('Préparation du lecteur…');
    const det = await obtenerDetector();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    if (id !== ciclo) { stream.getTracks().forEach((t) => t.stop()); return; }
    flujo = stream;
    const video = $('#video');
    video.srcObject = flujo;
    await video.play();
    $('#lector').hidden = false;
    $('#botones-scan').hidden = true;

    const pista = flujo.getVideoTracks()[0];
    const cap = pista.getCapabilities?.() || {};
    if (cap.focusMode?.includes('continuous')) pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    linterna = false;
    $('#linterna').hidden = !cap.torch;
    estado(`Placez le code-barres dans le cadre, à 10–20 cm, bien éclairé. (lecteur ${motor})`);

    // Deux lectures identiques de suite avant d'accepter un code, pour écarter les lectures erronées.
    let ultimo = '', repeticiones = 0;
    const paso = async () => {
      if (id !== ciclo) return;
      if (video.readyState >= 2) {
        try {
          const code = codigoLeido(await det.detect(video));
          if (id !== ciclo) return;
          if (code) {
            repeticiones = code === ultimo ? repeticiones + 1 : 1;
            ultimo = code;
            if (repeticiones >= 2) {
              if (navigator.vibrate) navigator.vibrate(80);
              cerrarCamara();
              buscar(code, { camara: true });
              return;
            }
          }
        } catch { /* image non exploitable : on continue */ }
      }
      setTimeout(paso, 120);
    };
    paso();
  } catch (e) {
    cerrarCamara();
    estado(mensajeCamara(e));
  }
}

function cerrarCamara() {
  ciclo++;
  if (flujo) { flujo.getTracks().forEach((t) => t.stop()); flujo = null; }
  $('#video').srcObject = null;
  $('#lector').hidden = true;
  $('#botones-scan').hidden = false;
}

$('#linterna').addEventListener('click', async () => {
  const pista = flujo?.getVideoTracks()[0];
  if (!pista) return;
  linterna = !linterna;
  try { await pista.applyConstraints({ advanced: [{ torch: linterna }] }); } catch { linterna = false; }
});

// Photo prise avec l'appareil photo du téléphone : autofocus et pleine résolution, souvent plus fiable en magasin.
$('#foto').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  estado('Lecture de la photo…');
  try {
    const det = await obtenerDetector();
    const img = await createImageBitmap(f);
    const code = codigoLeido(await det.detect(img));
    img.close?.();
    if (code) buscar(code);
    else estado('Aucun code-barres détecté. Reprenez la photo plus près, nette, le code bien à plat et éclairé.');
  } catch (err) {
    estado(`Impossible de lire la photo : ${err?.message || err}`);
  }
});

// ---------- Éditeur d'une référence ----------

let actual = null;

// origen : 'scan' (un achat de plus au Journal à l'enregistrement) ou 'liste' (simple correction).
function abrirEditor(r, origen = 'scan') {
  actual = r;
  actual._origen = origen;
  // Produit scanné depuis une ligne de ticket : on mémorise le libellé et le contexte du ticket.
  const e = enlaceActivo();
  if (e && origen === 'scan') {
    actual.libelle_ticket = ajouterLibelle(actual.libelle_ticket, e.libelle);
    if (e.ticket.date) actual.date_achat = e.ticket.date;
    if (e.ticket.enseigne) actual.enseigne = e.ticket.enseigne;
    // Produit choisi parmi les suggestions par nom : la variante et l'emballage restent à confirmer.
    const NOTE_NOM = 'Produit choisi d’après le libellé du ticket (suggestion Open Food Facts) : vérifier la variante et l’emballage.';
    if (e.viaNom && !String(actual.obs || '').includes(NOTE_NOM)) actual.obs = [actual.obs, NOTE_NOM].filter(Boolean).join(' ');
  }
  // Après un scan, vue rapide s'il y a déjà un emballage décrit ; sinon on passe directement à la saisie.
  const describe = actual.sin_envase || actual.componentes.length > 0;
  actual._modo = origen === 'scan' && describe ? 'rapido' : 'edicion';
  // Saisie depuis un scan : la personne a le produit en main.
  if (actual._modo === 'edicion' && origen === 'scan') actual.verificado = true;
  pintarEditor();
  $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Niveau de certitude de la fiche affichée : d'où viennent les emballages et s'ils ont été vérifiés.
function certeza(r) {
  const local = db.refs[r.gtin];
  const eq = r._equipo;
  if (eq) {
    return eq.verificado
      ? { tono: 'good', txt: `Vérifié par ${eq.por} le ${fechaCorta(eq.fecha)}` }
      : { tono: 'warn', txt: `Décrit par ${eq.por}, pas encore vérifié : comparez avec le produit` };
  }
  if (local) {
    return local.verificado
      ? { tono: 'good', txt: `Déjà vérifié (${fechaCorta(local.actualizado)})` }
      : { tono: 'warn', txt: 'Déjà enregistré, pas encore vérifié : comparez avec le produit' };
  }
  if (r.off.estado === 'encontrado') {
    const base = BASES.find((b) => b.id === r.off.base) || BASES[0];
    return { tono: 'warn', txt: `D'après ${base.label} : comparez avec le produit` };
  }
  if (r.off.estado === 'sin_codigo') return { tono: 'muted', txt: 'Produit sans code-barres' };
  return { tono: 'bad', txt: 'Produit inconnu : décrivez son emballage' };
}

function cabecera(r) {
  const c = certeza(r);
  const titulo = [r.nombre || 'Produit sans nom', r.marca && `(${r.marca})`].filter(Boolean).join(' ');
  return `
    <div class="prod">
      ${r.imagen ? `<img src="${esc(r.imagen)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <div class="meta">
        <strong>${esc(titulo)}</strong>
        <div class="note">${esc([r.cantidad, r.off.estado === 'sin_codigo' ? '' : r.gtin].filter(Boolean).join(' · '))}</div>
        <div class="certeza ${c.tono}">${esc(c.txt)}</div>
      </div>
    </div>`;
}

// Informations encore nécessaires sur l'emballage et le rayon. Le poids sert à calculer les déchets générés.
function faltantes(r) {
  const f = [];
  if (!r.sin_envase) {
    if (!r.componentes.length) f.push('emballage');
    if (r.componentes.some((c) => !c.forma || !c.material)) f.push('forme ou matériau');
    if (r.componentes.some((c) => c.peso_g == null || c.peso_g === '')) f.push('poids');
  }
  if (!r.categoria) f.push('rayon');
  return f;
}

const TRI_CORTO = { jaune: 'Bac jaune', verre: 'Verre', om: 'Ordures ménagères', nd: 'À déterminer' };

function filaEnvase(c) {
  const fam = familiaDe(c.material);
  const tri = consignaTri(fam);
  const forma = c.forma ? labelForma(c.forma) : 'Emballage';
  const mat = c.material ? labelMaterial(c.material) : 'matériau ?';
  const n = Number(c.unidades) > 1 ? ` ×${c.unidades}` : '';
  const peso = c.peso_g == null || c.peso_g === '' ? '<span class="sin-peso">poids ?</span>' : `${esc(String(c.peso_g).replace('.', ','))} g`;
  return `<li><span><span class="dot" style="background:${FAMILIAS[fam].color}"></span><strong>${esc(forma)}${n}</strong> · ${esc(mat)} · ${peso}</span>
    <span class="tri tri-${tri.id}">${esc(TRI_CORTO[tri.id] || tri.label)}</span></li>`;
}

function avisoVersionNueva(r) {
  const nv = r._nuevo;
  return nv ? `
    <div class="card aviso"><strong>Version plus récente dans la feuille</strong> : ${esc(nv.saisi_par || "l'équipe")}, le ${esc(fechaCorta(nv.actualizado))}, classe ${esc(claseFinal(nv))}${nv.verificado ? ', vérifiée' : ''}.
      <div class="actions"><button type="button" id="usar-equipo" class="secondary">Charger cette version</button></div></div>` : '';
}

function pintarEditor() {
  const r = actual;
  const ed = $('#editor');
  if (!r) { ed.innerHTML = ''; return; }
  if (r._modo === 'rapido') return pintarRapido(r, ed);
  const enOFF = r.off.estado === 'encontrado';
  const sinCodigo = r.off.estado === 'sin_codigo';
  const base = BASES.find((b) => b.id === r.off.base) || BASES[0];
  const yaGuardado = !!db.refs[r.gtin];
  const foto = r.photo || r._photo;
  const nuevo = !yaGuardado && !r._equipo;
  const sec = seccionDe(r.categoria) || r._seccion || '';

  ed.innerHTML = `${avisoVersionNueva(r)}
    <div class="card">
      ${cabecera(r)}
      ${sinCodigo ? `<label class="field" style="margin-top:10px">Nom du produit<input data-k="nombre" value="${esc(r.nombre)}" placeholder="ex. Pommes Golden"></label>` : ''}
    </div>

    <div class="card">
      <h3>Emballage</h3>
      <label class="check"><input type="checkbox" data-k="sin_envase" ${r.sin_envase ? 'checked' : ''}> Vendu sans emballage (vrac)</label>
      <div id="bloque-comps" ${r.sin_envase ? 'hidden' : ''}>
        <div id="comps">${r.componentes.map(pintarComponente).join('') || '<p class="vacio">Ajoutez chaque élément de l’emballage : bouteille, bouchon, étiquette…</p>'}</div>
        <button type="button" id="add-comp" class="secondary wide">Ajouter un élément</button>
      </div>
      ${foto ? `<img class="foto" src="${esc(foto)}" alt="Photo du produit">` : ''}
      <label class="button ${foto ? 'ghost' : 'secondary'} wide">${foto ? 'Reprendre la photo' : nuevo ? 'Prendre une photo (produit nouveau)' : 'Prendre une photo'}<input id="foto-producto" type="file" accept="image/*" capture="environment" hidden></label>
    </div>

    <details class="card" id="det" ${r._det ? 'open' : ''}>
      <summary><strong>Plus de détails</strong> <span class="note" id="det-resumen">rayon, produit, achat, qualité</span></summary>
      <div class="grid" style="margin-top:10px">
        <label class="field">Section<select data-sec="1">${opciones([{ id: '', label: '— à choisir —' }, ...SECCIONES], sec)}</select></label>
        <label class="field">Sous-section${r._rayon_sug && r.categoria ? ' <span class="badge">suggérée</span>' : ''}<select data-k="categoria">${opciones([{ id: '', label: '— à choisir —' }, ...CATEGORIAS.filter((c) => c.seccion === sec)], r.categoria)}</select></label>
      </div>
      <div class="grid">
        ${sinCodigo ? '' : `<label class="field">Nom / variante<input data-k="nombre" value="${esc(r.nombre)}"></label>`}
        <label class="field">Marque<input data-k="marca" value="${esc(r.marca)}"></label>
        <label class="field">Quantité<input data-k="cantidad" value="${esc(r.cantidad)}" placeholder="ex. 1,5 L"></label>
      </div>
      <label class="field">Libellé sur le ticket<input data-k="libelle_ticket" value="${esc(r.libelle_ticket)}" placeholder="ex. FROM BIL MOZZA CRF"></label>
      <div class="grid">
        <label class="field">Enseigne<input data-k="enseigne" list="enseignes" value="${esc(r.enseigne)}"></label>
        <label class="field">Commune<input data-k="commune" list="communes" value="${esc(r.commune)}"></label>
        <label class="field">Date d'achat<input data-k="date_achat" type="date" value="${esc(r.date_achat)}"></label>
      </div>
      ${enOFF ? `<p class="note"><a href="https://${base.host}/product/${esc(r.gtin)}" target="_blank" rel="noopener">Voir la fiche ${esc(base.label)}</a> · ${r.off.packagings.length} élément(s) dans la base${r.off.packagings_complete ? ', marqués complets' : ''}</p>` : ''}
      <label class="check"><input type="checkbox" data-k="verificado" ${r.verificado ? 'checked' : ''}> Emballages vérifiés sur le produit physique</label>
      <div class="grid">
        <label class="field">Données de la base sur les emballages<select data-k="exactitud_off">${opciones(EXACTITUD, r.exactitud_off)}</select></label>
        <label class="field">Cause d'absence / problème<select data-k="causa">${opciones(CAUSAS, r.causa)}</select></label>
      </div>
      <div class="row" style="align-items:center;margin-bottom:10px">
        <span>Classe suggérée</span> <span id="clase-sug"></span>
        <label class="field" style="flex:1;margin:0">
          <select data-k="clase_manual">${opciones([
            { id: '', label: 'Utiliser la classe suggérée' },
            { id: 'A', label: 'A · masse mesurée ou déclarée et vérifiée' },
            { id: 'B', label: 'B · masse estimée' },
            { id: 'C', label: 'C · forme et matériau, sans poids' },
            { id: 'D', label: 'D · non caractérisable' },
          ], r.clase_manual)}</select>
        </label>
      </div>
      <p class="note" id="masa"></p>
      ${r._origen === 'liste' ? '<p class="note">Correction d’une fiche : n’ajoute pas d’achat au tableau de bord. Pour un nouvel achat, scannez le produit.</p>' : ''}
      <label class="field">Observations<textarea data-k="obs" placeholder="Ce qui ne correspondait pas, méthode de pesée, photo prise…">${esc(r.obs)}</textarea></label>
      <p class="note">Consignes de tri : ${esc(FUENTE_TRI)}</p>
      ${(yaGuardado || r._equipo) && enOFF ? '<button type="button" id="reconsultar" class="secondary">Réinterroger la base</button>' : ''}
    </details>

    <div class="actions">
      <button type="button" id="guardar" class="primary grande" style="flex:1">Enregistrer</button>
      <button type="button" id="descartar" class="ghost">${yaGuardado ? 'Fermer' : 'Annuler'}</button>
    </div>`;
  refrescarDerivados();
}

// Vue rapide après un scan : le produit, la certitude, les emballages et leur bac ; un geste pour confirmer.
function pintarRapido(r, ed) {
  const foto = r.photo || r._photo;
  const falta = faltantes(r);
  const nuevo = !db.refs[r.gtin] && !r._equipo;
  const envases = r.sin_envase
    ? '<li><span><strong>Vendu sans emballage</strong></span></li>'
    : r.componentes.map(filaEnvase).join('');
  ed.innerHTML = `${avisoVersionNueva(r)}
    <div class="card rapido">
      ${cabecera(r)}
      <ul class="envases">${envases}</ul>
      ${r.categoria ? `<p class="note">Rayon : ${esc(labelRayon(r.categoria))}${r._rayon_sug ? ' (suggéré)' : ''}</p>` : ''}
      ${foto || !nuevo ? '' : '<label class="lnk">Ajouter une photo (produit nouveau pour l’équipe)<input id="foto-producto" type="file" accept="image/*" capture="environment" hidden></label>'}
      <button type="button" id="confirmar" class="primary grande wide">C'est bien ça</button>
      <button type="button" id="corregir" class="secondary wide ${falta.length ? 'alerta' : ''}">Plus de détails${falta.length ? ` · à compléter : ${esc(falta.join(', '))}` : ''}</button>
      <div class="enlaces"><button type="button" id="descartar" class="lnk">Annuler</button></div>
    </div>`;
}

function pintarComponente(c, i) {
  return `
    <div class="comp" data-i="${i}">
      <div class="comp-head"><span>Élément ${i + 1}${c.origen === 'off' ? ' <span class="badge">OFF</span>' : ''}</span>
        <button type="button" class="ghost" data-del="${i}" aria-label="Supprimer l'élément">Supprimer</button></div>
      <div class="grid">
        <label class="field">Forme<select data-c="forma">${opciones([{ id: '', label: '— sans forme —' }, ...FORMAS], c.forma)}</select></label>
        <label class="field">Matériau<select data-c="material">${opciones([{ id: '', label: '— sans matériau —' }, ...MATERIALES], c.material)}</select></label>
        <label class="field">Nombre<input data-c="unidades" type="number" min="0" step="1" inputmode="numeric" value="${esc(c.unidades)}"></label>
        <label class="field">Poids par unité (g)<input data-c="peso_g" type="text" inputmode="decimal" autocomplete="off" placeholder="ex. 14,5" value="${esc(decimal(c.peso_g))}"></label>
      </div>
      <details class="mini"><summary>Source du poids${c.peso_fuente ? ` : ${esc(labelDe(PESO_FUENTES, c.peso_fuente))}` : ''}</summary>
        <label class="field">Source du poids<select data-c="peso_fuente">${opciones(PESO_FUENTES, c.peso_fuente)}</select></label>
      </details>
      <div class="comp-foot" data-foot></div>
    </div>`;
}

function refrescarDerivados() {
  const r = actual;
  if (!r) return;
  $('#bloque-comps').hidden = !!r.sin_envase;
  document.querySelectorAll('#comps .comp').forEach((el) => {
    const c = r.componentes[Number(el.dataset.i)];
    const fam = familiaDe(c.material);
    const tri = consignaTri(fam);
    el.querySelector('[data-foot]').innerHTML = `
      <span><span class="dot" style="background:${FAMILIAS[fam].color}"></span>${esc(FAMILIAS[fam].label)}</span>
      <span class="badge ${tri.id === 'nd' ? 'bad' : ''}">${esc(tri.label)}</span>
      ${c.reciclaje_off ? `<span class="note">OFF : ${esc(c.reciclaje_off.replace('en:', ''))}</span>` : ''}`;
  });
  // Champs d'emballage vides en rouge ; « Plus de détails » clignote tant qu'il manque une information.
  document.querySelectorAll('#comps [data-c="forma"], #comps [data-c="material"], #comps [data-c="peso_g"]')
    .forEach((el) => el.classList.toggle('falta', el.dataset.c === 'peso_g' ? num(el.value) == null : el.value === ''));
  const falta = faltantes(r);
  const det = $('#det');
  if (det) {
    det.classList.toggle('alerta', falta.length > 0);
    $('#det-resumen').textContent = falta.length ? `à compléter : ${falta.join(', ')}` : 'rayon, produit, achat, qualité';
  }
  const sug = claseSugerida(r);
  $('#clase-sug').innerHTML = `<span class="clase clase-${sug}">${sug}</span>`;
  const m = masaPlastico(r);
  $('#masa').textContent = m == null
    ? `Classe finale ${claseFinal(r)} : aucun gramme de plastique attribué.`
    : `Classe finale ${claseFinal(r)} : ${g1(m)} g de plastique par unité de vente.`;
}

// Photo réduite à 480 px en JPEG pour tenir dans une cellule de la feuille (< 50 000 caractères).
async function reducirFoto(file) {
  const img = await createImageBitmap(file);
  const escala = Math.min(1, 480 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  for (const q of [0.7, 0.55, 0.4, 0.3]) {
    const url = c.toDataURL('image/jpeg', q);
    if (url.length < 45000) return url;
  }
  throw new Error('photo trop lourde');
}

$('#editor').addEventListener('change', async (e) => {
  if (e.target.id !== 'foto-producto' || !actual) return;
  const f = e.target.files[0];
  if (!f) return;
  try {
    actual.photo = await reducirFoto(f);
    delete actual._photo;
    pintarEditor();
  } catch (err) {
    toast(`Photo non utilisable : ${err.message || err}`);
  }
});

// 'change' couvre les navigateurs qui n'émettent pas 'input' sur select/checkbox ; mettre à jour deux fois est sans effet.
['input', 'change'].forEach((ev) => $('#editor').addEventListener(ev, alEditar));
// Garder « Plus de détails » ouvert ou fermé quand la fiche se redessine ('toggle' ne remonte pas : capture).
$('#editor').addEventListener('toggle', (e) => { if (e.target.id === 'det' && actual) actual._det = e.target.open; }, true);
function alEditar(e) {
  const t = e.target;
  if (!actual || t.id === 'foto-producto') return;
  if (t.dataset.k) {
    actual[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.k === 'categoria') actual._rayon_sug = false;
  } else if (t.dataset.sec) {
    // Nouvelle section : la sous-section est à choisir dans sa liste.
    if (seccionDe(actual.categoria) !== t.value) actual.categoria = '';
    actual._seccion = t.value;
    actual._rayon_sug = false;
    return pintarEditor();
  } else if (t.dataset.c) {
    const i = Number(t.closest('.comp').dataset.i);
    const comp = actual.componentes[i];
    comp[t.dataset.c] = ['unidades', 'peso_g'].includes(t.dataset.c) ? num(t.value) : t.value;
    // Un poids saisi à la main sans source est considéré comme pesé par l'équipe.
    if (t.dataset.c === 'peso_g' && comp.peso_g != null && !comp.peso_fuente) {
      comp.peso_fuente = 'medido_resser';
      t.closest('.comp').querySelector('[data-c="peso_fuente"]').value = 'medido_resser';
    }
    if (comp.origen === 'off') comp.origen = 'off_corregido';
  }
  refrescarDerivados();
}

$('#editor').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || !actual) return;
  if (t.id === 'add-comp') {
    actual.componentes.push({ forma: '', material: '', unidades: 1, peso_g: null, peso_fuente: '', reciclaje_off: '', origen: 'manual' });
    pintarEditor();
  } else if (t.dataset.del != null) {
    actual.componentes.splice(Number(t.dataset.del), 1);
    pintarEditor();
  } else if (t.id === 'confirmar') {
    actual.verificado = true;
    guardarActual();
  } else if (t.id === 'corregir') {
    actual._modo = 'edicion';
    if (!actual.categoria) actual._det = true;
    if (actual._origen === 'scan') actual.verificado = true;
    pintarEditor();
  } else if (t.id === 'guardar') {
    guardarActual();
  } else if (t.id === 'usar-equipo') {
    abrirEditor(desdeEquipo(actual._nuevo, actual._nuevoPhoto), actual._origen);
  } else if (t.id === 'reconsultar') {
    buscar(actual.gtin, { reconsultar: true });
  } else if (t.id === 'descartar') {
    actual = null;
    pintarEditor();
    estado('');
  }
});

// Les emballages venus de la base ont-ils été modifiés ? Sert à remplir « Données de la base » sans le demander.
function exactitudDeducida(r) {
  if (r.off.estado !== 'encontrado' || !r.verificado || r.exactitud_off) return r.exactitud_off;
  if (!r.off.packagings.length) return 'sin_datos';
  const intactos = r.componentes.length === r.off.packagings.length && r.componentes.every((c) => c.origen === 'off');
  return intactos ? 'correcto' : 'parcial';
}

function guardarActual() {
  if (!db.prefs.nombre) {
    $('#contexto').open = true;
    $('#cfg-nombre').focus();
    $('#contexto').scrollIntoView({ behavior: 'smooth' });
    return toast('Indiquez votre nom dans « Contexte d’achat » avant d’enregistrer.');
  }
  if (actual.off.estado === 'sin_codigo' && !actual.nombre.trim()) return toast('Donnez un nom au produit sans code-barres.');
  if (actual.sin_envase) actual.componentes = [];
  if (actual._origen === 'scan') actual.achat_pendiente = true;
  actual.exactitud_off = exactitudDeducida(actual);
  const origenGuardado = actual._origen;
  for (const k of Object.keys(actual)) if (k.startsWith('_')) delete actual[k];
  actual.actualizado = ahora();
  actual.version_app = APP_VERSION;
  // saisi_par = dernière personne à avoir enregistré la fiche.
  actual.saisi_par = db.prefs.nombre || actual.saisi_par || '';
  actual.sync = 'pendiente';
  const gtin = actual.gtin;
  db.refs[gtin] = actual;
  guardar();
  contar();
  toast(`Enregistré · ${actual.nombre || gtin}`);
  const lie = enlaceActivo();
  if (lie && origenGuardado === 'scan') cerrarEnlace(gtin, actual.nombre);
  actual = null;
  pintarEditor();
  $('#gtin').value = '';
  $('#manual').hidden = true;
  estado('');
  sincronizar([gtin]);
  if (lie && db.refs[gtin]) return mostrarTab('ticket');
  // Enchaîner : la caméra se rouvre pour le produit suivant.
  if (viaCamara && origenGuardado === 'scan') abrirCamara();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Tickets de caisse ----------

// Catalogue pour le rapprochement : produits du téléphone + feuille de l'équipe (si accessible).
let catalogo = { liste: [], charge: 0, equipe: false };
const fusionnerLibelles = (a, b) => libellesDe(b).reduce((acc, l) => ajouterLibelle(acc, l), a || '');
async function cargarCatalogo(forcer = false) {
  if (!forcer && Date.now() - catalogo.charge < 5 * 60000) return catalogo;
  const par = new Map();
  Object.values(db.refs).forEach((r) => par.set(String(r.gtin), { gtin: String(r.gtin), nom: r.nombre, marque: r.marca, libelle: r.libelle_ticket || '' }));
  let equipe = false;
  if (conectado() && navigator.onLine) {
    try {
      const j = await (await fetch(`${FEUILLE.url}?cle=${encodeURIComponent(FEUILLE.cle)}&accion=lista`)).json();
      if (j.ok && Array.isArray(j.produits)) {
        equipe = true;
        j.produits.forEach((p) => {
          const local = par.get(String(p.gtin));
          par.set(String(p.gtin), { gtin: String(p.gtin), nom: local?.nom || p.nom, marque: local?.marque || p.marque, libelle: fusionnerLibelles(local?.libelle, p.libelle) });
        });
      }
    } catch { /* hors ligne : catalogue du téléphone seulement */ }
  }
  catalogo = { liste: [...par.values()], charge: Date.now(), equipe };
  return catalogo;
}

const estadoTicket = (m) => { $('#ticket-estado').textContent = m || ''; };

// lector(onProgress) → { brut, articles, source } ; même traitement pour une photo ou un PDF.
async function procesarTicket(lector, mensaje, sinArticulos) {
  $('#ticket-progreso').hidden = false;
  $('#ticket-barra').style.flex = '0';
  estadoTicket(mensaje);
  try {
    const [{ brut, articles, source }, cat] = await Promise.all([
      lector((v) => { $('#ticket-barra').style.flex = String(v); }),
      cargarCatalogo(true),
    ]);
    if (!articles.length) { estadoTicket(sinArticulos); return; }
    const ctx = db.prefs.contexto || {};
    const ticket = {
      id: `T${Date.now().toString(36).toUpperCase()}`,
      creado: ahora(),
      source,
      date: detecterDate(brut) || ctx.fecha || hoy(),
      enseigne: detecterEnseigne(brut, ENSEIGNES) || ctx.enseigne || '',
      commune: ctx.commune || '',
      total: detecterTotal(brut),
      lignes: articles.map((a) => {
        const r = apparier(a.libelle, cat.liste);
        const top = r.niveau === 'aucun' ? null : r.cands[0];
        return { libelle: a.libelle, prix: a.prix, qte: a.qte, etat: r.niveau, gtin: top?.p.gtin || '', nom: top?.p.nom || '', score: top ? Math.round(top.score * 100) : 0 };
      }),
    };
    db.tickets.unshift(ticket);
    db.tickets = db.tickets.slice(0, 30);
    ticketVu = ticket.id;
    guardar();
    const n = (k) => ticket.lignes.filter((l) => l.etat === k).length;
    const origen = { 'pdf-texte': ' (PDF lu directement)', 'pdf-ocr': ' (PDF scanné, lu par OCR)' }[source] || '';
    estadoTicket(`${ticket.lignes.length} articles lus${origen} : ${n('sur')} reconnus, ${n('probable')} à confirmer, ${n('aucun')} à scanner.`
      + (cat.equipe ? '' : ' Catalogue de l’équipe indisponible : seuls les produits de ce téléphone sont reconnus.'));
    pintarTicket();
  } catch (err) {
    const motDePasse = /password/i.test(String(err?.name) + String(err?.message));
    estadoTicket(motDePasse ? 'Ce PDF est protégé par un mot de passe : impossible de le lire.' : `Lecture impossible : ${err.message || err}`);
  } finally {
    $('#ticket-progreso').hidden = true;
  }
}

// « Photographier » ouvre l'appareil photo ; « Galerie ou PDF » ouvre la galerie ou les fichiers.
function leerArchivoTicket(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    procesarTicket((p) => lireTicketPdf(f, p), 'Lecture du ticket PDF…',
      'Aucune ligne d’article trouvée dans ce PDF. Est-ce bien un ticket de caisse ?');
    return;
  }
  procesarTicket(async (p) => {
    const img = await createImageBitmap(f);
    try { return await lireTicket(img, p); } finally { img.close?.(); }
  }, 'Lecture du ticket… La première fois, le moteur de lecture et le français se téléchargent (≈ 15 Mo).',
  'Aucune ligne d’article lue. Reprenez la photo : ticket à plat, bien éclairé, sans reflet, en entier.');
}
$('#ticket-foto').addEventListener('change', leerArchivoTicket);
$('#ticket-archivo').addEventListener('change', leerArchivoTicket);

let ticketVu = null;
// Somme des articles lus comparée au total imprimé : un écart signale une ligne mal lue ou oubliée.
function controlTotal(t) {
  if (t.total == null) return '';
  const somme = t.lignes.reduce((s, l) => s + (l.prix || 0), 0);
  const ecart = Math.round((t.total - somme) * 100) / 100;
  return Math.abs(ecart) < 0.02
    ? `<p class="note ok-sync">✓ Somme des articles = total du ticket (${euros(t.total)}) : toutes les lignes ont été lues.</p>`
    : `<p class="note pend-sync">Somme des articles ${euros(somme)} ≠ total du ticket ${euros(t.total)} (écart ${euros(ecart)}) : une ligne a peut-être été mal lue ou oubliée.</p>`;
}
const boton = (accion, texto, clase) => `<button type="button" class="${clase}" data-a="${accion}">${texto}</button>`;
const euros = (p) => (p == null ? '' : `${p.toFixed(2).replace('.', ',')} €`);

// Groupes de lignes, dans l'ordre où elles demandent une action. Les groupes ouverts restent ouverts d'un rendu à l'autre.
const GRUPOS = [
  { etat: 'probable', titre: 'À confirmer', ouvert: true },
  { etat: 'aucun', titre: 'À identifier', ouvert: true },
  { etat: 'sur', titre: 'Reconnus', ouvert: false },
  { etat: 'achat', titre: 'Achats ajoutés', ouvert: false },
  { etat: 'ignore', titre: 'Ignorées', ouvert: false },
];
const gruposAbiertos = new Set(GRUPOS.filter((g) => g.ouvert).map((g) => g.etat));

// Libellé modifiable tant que l'achat n'est pas ajouté : corrige une erreur de lecture avant qu'elle soit apprise.
const libEditable = (l, i) => `<input class="lib lib-edit" data-li="${i}" value="${esc(l.libelle)}" aria-label="Libellé lu sur le ticket (modifiable)" spellcheck="false">`;
const precio = (l) => `<span class="prix">${l.qte > 1 ? `${l.qte} × ` : ''}${euros(l.prix)}</span>`;

function pintarLinea(l, i) {
  if (l.etat === 'probable') {
    return `<div class="linea" data-i="${i}"><div class="cab">${libEditable(l, i)}${precio(l)}</div>
      <div class="que">C'est <strong>${esc(l.nom)}</strong> ?</div>
      <div class="actions">${boton('oui', 'Oui', 'primary')}${boton('non', 'Non', 'ghost')}</div></div>`;
  }
  if (l.etat === 'aucun') {
    return `<div class="linea" data-i="${i}"><div class="cab">${libEditable(l, i)}${precio(l)}</div>
      ${pintarSugerencias(l)}
      <div class="actions">${boton('scanner', 'Scanner', 'primary')}${boton('sugerir', 'Chercher par le nom', 'secondary')}${boton('ignorer', 'Ignorer', 'ghost')}</div></div>`;
  }
  if (l.etat === 'sur') {
    return `<div class="fila" data-i="${i}"><span class="fila-txt"><strong>${esc(l.nom)}</strong><span class="lib">${esc(l.libelle)}</span></span>${precio(l)}${boton('non', 'Pas ça', 'lnk')}</div>`;
  }
  if (l.etat === 'achat') {
    return `<div class="fila" data-i="${i}"><span class="fila-txt"><strong>✓ ${esc(l.nom)}</strong><span class="lib">${esc(l.libelle)}</span></span>${precio(l)}</div>`;
  }
  return `<div class="fila" data-i="${i}"><span class="fila-txt"><span class="lib">${esc(l.libelle)}</span></span>${precio(l)}${boton('retablir', 'Rétablir', 'lnk')}</div>`;
}

function pintarTicket() {
  const vista = $('#ticket-vista');
  const t = db.tickets.find((x) => x.id === ticketVu) || db.tickets[0];
  if (!t) { vista.innerHTML = '<div class="card vacio">Aucun ticket pour l’instant.</div>'; return; }
  ticketVu = t.id;
  const n = (k) => t.lignes.filter((l) => l.etat === k).length;
  const reste = n('probable') + n('aucun') + n('sur');
  const fait = t.lignes.length - reste;
  const grupos = GRUPOS.map((g) => {
    const filas = t.lignes.map((l, i) => (l.etat === g.etat ? pintarLinea(l, i) : '')).join('');
    if (!filas) return '';
    return `<details class="card grupo" data-g="${g.etat}" ${gruposAbiertos.has(g.etat) ? 'open' : ''}>
      <summary><strong>${g.titre}</strong> <span class="pill">${n(g.etat)}</span></summary>${filas}</details>`;
  }).join('');
  const anteriores = db.tickets.length > 1
    ? `<label class="field">Autres tickets<select id="ticket-otro">${db.tickets.map((x) => `<option value="${x.id}"${x.id === t.id ? ' selected' : ''}>${esc(fechaCorta(x.date))} · ${esc(x.enseigne || '?')} · ${x.lignes.length} articles</option>`).join('')}</select></label>` : '';
  const lu = t.source !== 'pdf-texte';
  vista.innerHTML = `
    <div class="card">
      <h3>${esc(t.enseigne || 'Magasin ?')} · ${esc(fechaCorta(t.date))}</h3>
      <p class="note">${t.lignes.length} articles${t.total != null ? ` · ${euros(t.total)}` : ''} · ${reste ? `${reste} à traiter` : 'tout est traité'}</p>
      <div class="bar avance"><div style="flex:${fait};background:var(--good)"></div><div style="flex:${reste}"></div></div>
      ${n('sur') ? boton('todos', n('sur') === 1 ? 'Ajouter l’achat reconnu' : `Ajouter les ${n('sur')} achats reconnus`, 'primary grande wide') : ''}
      <details class="mini">
        <summary>${lu ? 'Vérifier la date et le magasin (lus sur une image)' : 'Modifier la date et le magasin'}</summary>
        <div class="grid">
          <label class="field">Date d'achat<input type="date" data-tk="date" value="${esc(t.date)}"></label>
          <label class="field">Enseigne<input data-tk="enseigne" list="enseignes" value="${esc(t.enseigne)}"></label>
          <label class="field">Commune<input data-tk="commune" list="communes" value="${esc(t.commune)}"></label>
        </div>
      </details>
      ${/pend-sync/.test(controlTotal(t)) ? controlTotal(t) : ''}
    </div>
    ${grupos}
    <div class="card">
      ${anteriores}
      ${boton('supprimer-ticket', 'Supprimer ce ticket', 'ghost danger wide')}
    </div>`;
}

$('#ticket-vista').addEventListener('change', (e) => {
  const t = db.tickets.find((x) => x.id === ticketVu);
  if (e.target.id === 'ticket-otro') { ticketVu = e.target.value; pintarTicket(); return; }
  if (t && e.target.dataset.tk) { t[e.target.dataset.tk] = e.target.value.trim(); guardar(); }
  // Libellé corrigé à la main : on relance le rapprochement de cette ligne avec le catalogue.
  if (t && e.target.dataset.li != null) {
    const l = t.lignes[Number(e.target.dataset.li)];
    const nuevo = e.target.value.replace(/\s+/g, ' ').trim();
    if (!nuevo || nuevo === l.libelle) return;
    l.libelle = nuevo;
    l.corrige = true;
    if (l.etat !== 'ignore') {
      const r = apparier(nuevo, catalogo.liste);
      const top = r.niveau === 'aucun' ? null : r.cands[0];
      Object.assign(l, { etat: r.niveau, gtin: top?.p.gtin || '', nom: top?.p.nom || '', score: top ? Math.round(top.score * 100) : 0 });
    }
    guardar();
    pintarTicket();
  }
});

$('#ticket-vista').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-a]');
  const t = db.tickets.find((x) => x.id === ticketVu);
  if (!b || !t) return;
  if (b.dataset.a === 'todos') {
    const hechos = [];
    for (let i = 0; i < t.lignes.length; i++) if (t.lignes[i].etat === 'sur' && await agregarCompra(t, i)) hechos.push(t.lignes[i].gtin);
    if (hechos.length) { toast(`${hechos.length} achat(s) ajouté(s)`); sincronizar(hechos); }
    pintarTicket();
    return;
  }
  if (b.dataset.a === 'supprimer-ticket') {
    const faits = t.lignes.filter((l) => l.etat === 'achat').length;
    const msg = `Supprimer le ticket ${t.enseigne || ''} du ${fechaCorta(t.date)} de ce téléphone ?`
      + (faits ? `
${faits === 1 ? 'L’achat déjà ajouté reste enregistré' : `Les ${faits} achats déjà ajoutés restent enregistrés`}.` : '');
    if (!confirm(msg)) return;
    if (db.prefs.enlace?.ticket === t.id) cerrarEnlace();
    db.tickets = db.tickets.filter((x) => x.id !== t.id);
    ticketVu = db.tickets[0]?.id || null;
    guardar();
    estadoTicket('');
    toast('Ticket supprimé');
    pintarTicket();
    return;
  }
  const i = Number(b.closest('[data-i]').dataset.i), l = t.lignes[i];
  if (b.dataset.a === 'achat' || b.dataset.a === 'oui') {
    if (await agregarCompra(t, i)) { toast(`Achat ajouté : ${l.nom}`); sincronizar([l.gtin]); }
  } else if (b.dataset.a === 'non' || b.dataset.a === 'retablir') {
    Object.assign(l, { etat: 'aucun', gtin: '', nom: '', score: 0 });
  } else if (b.dataset.a === 'ignorer') {
    l.etat = 'ignore';
  } else if (b.dataset.a === 'scanner') {
    abrirEnlace(t, i);
    return;
  } else if (b.dataset.a === 'sugerir') {
    await buscarSugerencias(t, i);
    return;
  } else if (b.dataset.a === 'elegir') {
    // Comme un scan du code-barres choisi : fiche pré-remplie (équipe ou Open Facts), libellé appris à l'enregistrement.
    abrirEnlace(t, i, { viaNom: true });
    buscar(b.dataset.code);
    return;
  }
  guardar();
  pintarTicket();
});

// Mémoriser les groupes ouverts ('toggle' ne remonte pas : capture).
$('#ticket-vista').addEventListener('toggle', (e) => {
  const g = e.target.dataset?.g;
  if (g) e.target.open ? gruposAbiertos.add(g) : gruposAbiertos.delete(g);
}, true);

// Ligne inconnue : suggestions Open Food Facts d'après le libellé (via le script, avec la clé de l'équipe).
// Rien n'est attribué automatiquement : un libellé abrégé correspond souvent à plusieurs variantes.
async function buscarSugerencias(t, i) {
  const l = t.lignes[i];
  if (!conectado()) { toast('Saisissez la clé de l’équipe dans « Contexte d’achat » pour chercher par le nom.'); return; }
  const q = requeteRecherche(l.libelle);
  l.sugerencias = { estado: 'cargando', q, produits: [] };
  pintarTicket();
  try {
    const j = await (await fetch(`${FEUILLE.url}?cle=${encodeURIComponent(FEUILLE.cle)}&accion=buscar&q=${encodeURIComponent(q)}`)).json();
    if (!j.ok || !Array.isArray(j.produits)) throw new Error(j.erreur || 'recherche indisponible');
    l.sugerencias = { estado: 'ok', q, produits: j.produits.slice(0, 3) };
  } catch (err) {
    l.sugerencias = { estado: 'error', q, produits: [], erreur: String(err.message || err) };
  }
  guardar();
  pintarTicket();
}

function pintarSugerencias(l) {
  const s = l.sugerencias;
  if (!s) return '';
  if (s.estado === 'cargando') return `<div class="note">Recherche « ${esc(s.q)} » dans Open Food Facts…</div>`;
  if (s.estado === 'error') return `<div class="note pend-sync">Recherche impossible (${esc(s.erreur)}). Scannez le produit.</div>`;
  if (!s.produits.length) return `<div class="note">Aucun produit trouvé pour « ${esc(s.q)} ». Scannez le produit.</div>`;
  return `<div class="sugs"><div class="note">Est-ce l’un de ces produits ? Vérifiez la variante et le format : l’emballage en dépend.</div>${s.produits.map((p) => `
    <div class="sug">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="sin-img"></span>'}
      <div class="sug-txt"><strong>${esc(p.nom || 'Sans nom')}</strong><span>${esc([p.marque, p.quantite].filter(Boolean).join(' · '))}</span><span class="gtin">${esc(p.code)}</span></div>
      <button type="button" class="secondary" data-a="elegir" data-code="${esc(p.code)}">C’est celui-ci</button></div>`).join('')}</div>`;
}

// Achat d'un produit déjà caractérisé : sa fiche est reprise telle quelle, avec la date et le
// magasin du ticket ; le libellé confirmé est mémorisé pour reconnaître les prochains tickets.
async function agregarCompra(t, i) {
  const l = t.lignes[i];
  if (!db.prefs.nombre) {
    mostrarTab('escanear');
    $('#contexto').open = true;
    toast('Indiquez votre nom dans « Contexte d’achat ».');
    return false;
  }
  let r = db.refs[l.gtin] ? structuredClone(db.refs[l.gtin]) : null;
  if (!r) {
    const eq = await consultarEquipo(l.gtin);
    if (eq.estado !== 'existe') {
      toast('Fiche introuvable dans la feuille de l’équipe : scannez le produit.');
      Object.assign(l, { etat: 'aucun', gtin: '', nom: '' });
      guardar();
      return false;
    }
    r = desdeEquipo(eq.ref, eq.photo);
  }
  for (const k of Object.keys(r)) if (k.startsWith('_')) delete r[k];
  r.libelle_ticket = ajouterLibelle(r.libelle_ticket, l.libelle);
  if (t.date) r.date_achat = t.date;
  if (t.enseigne) r.enseigne = t.enseigne;
  if (t.commune) r.commune = t.commune;
  r.actualizado = ahora();
  r.version_app = APP_VERSION;
  r.saisi_par = db.prefs.nombre;
  r.sync = 'pendiente';
  r.achat_pendiente = true;
  db.refs[r.gtin] = r;
  Object.assign(l, { etat: 'achat', nom: r.nombre });
  catalogo.charge = 0; // le libellé appris doit servir aux lignes suivantes
  guardar();
  contar();
  return true;
}

// Ligne inconnue : on scanne le produit ; à l'enregistrement, son libellé de ticket est mémorisé.
function enlaceActivo() {
  const e = db.prefs.enlace;
  const ticket = e && db.tickets.find((x) => x.id === e.ticket);
  return ticket && ticket.lignes[e.i] ? { ...e, ticket, libelle: ticket.lignes[e.i].libelle } : null;
}
function pintarEnlace() {
  const e = enlaceActivo();
  $('#enlace').hidden = !e;
  if (e) $('#enlace-libelle').textContent = e.libelle;
}
function abrirEnlace(t, i, extra = {}) {
  db.prefs.enlace = { ticket: t.id, i, ...extra };
  guardar();
  mostrarTab('escanear');
  pintarEnlace();
  estado(`Scannez le produit « ${t.lignes[i].libelle} » (ou « Produit sans code-barres »).`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function cerrarEnlace(gtin, nom) {
  const e = enlaceActivo();
  if (e && gtin) { Object.assign(e.ticket.lignes[e.i], { etat: 'achat', gtin, nom }); catalogo.charge = 0; }
  delete db.prefs.enlace;
  guardar();
  pintarEnlace();
}
$('#enlace-annuler').addEventListener('click', () => { cerrarEnlace(); estado(''); });

// ---------- Synchronisation avec Google Sheets (Apps Script) ----------

const pendientes = () => Object.values(db.refs).filter((r) => r.sync !== 'ok');

function resumirSync() {
  const n = pendientes().length;
  $('#sync-resumen').textContent = !conectado()
    ? "· non reliée : saisissez la clé de l'équipe dans « Contexte d'achat »"
    : n ? `· ${n} en attente d'envoi` : '· à jour';
}

$('#cfg-nombre').value = db.prefs.nombre || '';
$('#cfg-nombre').addEventListener('change', () => { db.prefs.nombre = $('#cfg-nombre').value.trim(); guardar(); resumirContexto(); });

$('#cfg-cle').value = db.prefs.sync_cle || '';
$('#cfg-cle').addEventListener('change', async () => {
  db.prefs.sync_cle = $('#cfg-cle').value.trim();
  guardar();
  resumirSync();
  if (!conectado()) return;
  $('#cle-estado').textContent = 'Vérification de la clé…';
  try {
    const j = await (await fetch(`${FEUILLE.url}?cle=${encodeURIComponent(FEUILLE.cle)}`)).json();
    if (!j.ok) throw new Error(j.erreur || 'refusée');
    $('#cle-estado').textContent = `Clé correcte : relié à « ${j.feuille} ».`;
    sincronizar();
  } catch (e) {
    $('#cle-estado').textContent = `Clé refusée ou feuille injoignable (${e.message}).`;
  }
});

$('#sync-todo').addEventListener('click', () => sincronizar());

let sincronizando = false;
let otraVez = false; // un envoi demandé pendant un autre envoi est relancé à la fin
async function sincronizar(gtins) {
  if (sincronizando) otraVez = true;
  if (!conectado() || sincronizando || !navigator.onLine) { resumirSync(); return; }
  const lista = (gtins ? gtins.map((g) => db.refs[g]).filter(Boolean) : pendientes());
  if (!lista.length) { resumirSync(); if (!gtins) $('#sync-estado').textContent = 'Tout est déjà dans la feuille.'; return; }
  sincronizando = true;
  let enviadas = 0;
  try {
    // Lots de 25 : une requête Apps Script reste sous quelques secondes.
    for (let i = 0; i < lista.length; i += 25) {
      const lote = lista.slice(i, i + 25);
      const r = await fetch(FEUILLE.url, {
        method: 'POST',
        body: JSON.stringify({ cle: FEUILLE.cle, refs: lote.map((x) => ({ ref: filaRef(x), composants: filasComp(x), photo: x.photo || null, achat: !!x.achat_pendiente })) }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || 'refusé');
      // Une fois dans la feuille, la photo n'est plus gardée sur le téléphone (place limitée).
      lote.forEach((x) => {
        if (db.refs[x.gtin] !== x) return;
        x.sync = 'ok';
        delete x.achat_pendiente;
        if (x.photo) { x.photo_en_feuille = true; delete x.photo; }
      });
      enviadas += lote.length;
      guardar();
    }
    $('#sync-estado').textContent = `${enviadas} référence(s) envoyée(s) à la feuille.`;
    if (gtins) toast('Envoyé à la feuille Google.');
  } catch (e) {
    $('#sync-estado').textContent = `Envoi interrompu (${e.message}). Les références restent en attente.`;
    if (gtins) toast('Pas envoyé à la feuille : la référence reste en attente.');
  } finally {
    sincronizando = false;
    resumirSync();
    if ($('#tab-inventario').classList.contains('active')) pintarLista();
    if (otraVez) { otraVez = false; setTimeout(() => sincronizar(), 0); }
  }
}
window.addEventListener('online', () => sincronizar());

// ---------- Inventaire ----------

function contar() { $('#count').textContent = Object.keys(db.refs).length; }

$('#filtro').addEventListener('input', pintarLista);
function pintarLista() {
  const q = $('#filtro').value.trim().toLowerCase();
  const refs = Object.values(db.refs)
    .filter((r) => !q || `${r.nombre} ${r.marca} ${r.gtin} ${r.libelle_ticket || ''}`.toLowerCase().includes(q))
    .sort((a, b) => b.actualizado.localeCompare(a.actualizado));
  const conSync = conectado();
  $('#lista').innerHTML = refs.length
    ? refs.map((r) => {
      const k = claseFinal(r);
      const s = !conSync ? '' : r.sync === 'ok' ? ' · <span class="ok-sync">dans la feuille</span>' : ' · <span class="pend-sync">en attente</span>';
      return `<li data-gtin="${esc(r.gtin)}">
        <span class="clase clase-${k}">${k}</span>
        <div class="info"><strong>${esc(r.nombre || 'Sans nom')}</strong>
          <span>${esc(r.marca)}${r.marca ? ' · ' : ''}${esc(labelDe(CATEGORIAS, r.categoria) || 'rayon à choisir')} · ${r.sin_envase ? 'vrac' : `${r.componentes.length} comp.`}${r.verificado ? ' · vérifié' : ''}${s}</span></div>
      </li>`;
    }).join('')
    : '<li class="vacio" style="cursor:default;display:block">Aucune référence pour l’instant. Scannez le premier produit.</li>';
  resumirSync();
}

$('#lista').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-gtin]');
  if (!li) return;
  mostrarTab('escanear');
  $('#gtin').value = li.dataset.gtin.startsWith('SC-') ? '' : li.dataset.gtin;
  abrirEditor(structuredClone(db.refs[li.dataset.gtin]), 'liste');
  verificarEquipo(li.dataset.gtin);
});

$('#borrar-todo').addEventListener('click', () => {
  const n = Object.keys(db.refs).length;
  if (!n) return;
  if (!confirm(`Effacer les ${n} références de ce téléphone ? La feuille Google n'est pas modifiée. Exportez d'abord une sauvegarde JSON si nécessaire.`)) return;
  db.refs = {};
  guardar();
  contar();
  pintarLista();
});

// ---------- Export (séparateur ';', virgule décimale et BOM pour Excel en français) ----------

function csv(filas) {
  const celda = (v) => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}

$('#exp-ref').addEventListener('click', () => {
  const filas = [COLS_REF, ...Object.values(db.refs).map((r) => { const o = filaRef(r); return COLS_REF.map((c) => o[c]); })];
  descargar(`resser_testA_references_${hoy()}.csv`, csv(filas), 'text/csv;charset=utf-8');
});

$('#exp-comp').addEventListener('click', () => {
  const filas = [COLS_COMP];
  Object.values(db.refs).forEach((r) => filasComp(r).forEach((o) => filas.push(COLS_COMP.map((c) => o[c]))));
  descargar(`resser_testA_composants_${hoy()}.csv`, csv(filas), 'text/csv;charset=utf-8');
});

$('#exp-json').addEventListener('click', () => {
  const datos = { app: 'resser-testA', version: APP_VERSION, exportado: ahora(), refs: db.refs };
  descargar(`resser_testA_sauvegarde_${hoy()}.json`, JSON.stringify(datos, null, 2), 'application/json');
});

// L'import fusionne par GTIN : la version mise à jour le plus récemment l'emporte.
$('#imp-json').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const datos = JSON.parse(await f.text());
    if (!datos.refs || typeof datos.refs !== 'object') throw new Error();
    let nuevas = 0, actualizadas = 0;
    for (const [gtin, r] of Object.entries(datos.refs)) {
      if (!r?.gtin || !Array.isArray(r.componentes) || !r.off) continue;
      r.categoria = normalizarRayon(r.categoria);
      const previa = db.refs[gtin];
      if (!previa) { db.refs[gtin] = r; nuevas++; }
      else if ((r.actualizado || '') > (previa.actualizado || '')) { db.refs[gtin] = r; actualizadas++; }
    }
    guardar();
    contar();
    pintarLista();
    toast(`Import : ${nuevas} nouvelle(s), ${actualizadas} mise(s) à jour.`);
  } catch {
    toast("Ce fichier n'est pas une sauvegarde valide du Test A.");
  }
});

// ---------- Synthèse des indicateurs ----------

function indicadores(refs) {
  const n = refs.length;
  const clases = { A: 0, B: 0, C: 0, D: 0 };
  refs.forEach((r) => clases[claseFinal(r)]++);
  const encontrados = refs.filter((r) => r.off.estado === 'encontrado').length;
  return {
    n, clases, encontrados,
    material: clases.A + clases.B + clases.C,
    masa: clases.A + clases.B,
    verificados: refs.filter((r) => r.verificado).length,
  };
}

function kpi(titulo, a, b, meta) {
  const p = pct(a, b);
  const ok = b && a / b >= meta;
  return `<div class="kpi"><div class="l">${esc(titulo)}</div><div class="v">${b ? p + ' %' : '—'}</div>
    <div class="n">${a} / ${b} références${meta != null ? ` · objectif ≥ ${Math.round(meta * 100)} % <span class="badge ${ok ? 'good' : 'warn'}">${ok ? 'atteint' : 'non atteint'}</span>` : ''}</div></div>`;
}

function pintarResumen() {
  const refs = Object.values(db.refs);
  const el = $('#tab-resumen');
  if (!refs.length) { el.innerHTML = '<div class="card vacio">Pas encore de données. Enregistrez des références dans « Scanner ».</div>'; return; }
  const I = indicadores(refs);

  const evaluadas = refs.filter((r) => ['correcto', 'parcial', 'incorrecto'].includes(r.exactitud_off));
  const correctas = evaluadas.filter((r) => r.exactitud_off === 'correcto').length;

  const unidadesFam = {};
  const consignas = {};
  refs.forEach((r) => r.componentes.forEach((c) => {
    const fam = familiaDe(c.material);
    const u = num(c.unidades) ?? 1;
    unidadesFam[fam] = (unidadesFam[fam] || 0) + u;
    const t = consignaTri(fam).label;
    consignas[t] = (consignas[t] || 0) + u;
  }));
  const totalU = Object.values(unidadesFam).reduce((s, v) => s + v, 0);
  const vrac = refs.filter((r) => r.sin_envase).length;

  const masas = refs.map(masaPlastico).filter((m) => m != null);
  const media = masas.length ? masas.reduce((s, v) => s + v, 0) / masas.length : null;

  const colores = { A: '#2c7a4b', B: '#5d9c3a', C: '#c98a1c', D: '#b3362b' };
  const barraClases = ['A', 'B', 'C', 'D'].filter((k) => I.clases[k])
    .map((k) => `<div style="flex:${I.clases[k]};background:${colores[k]}" title="${k} : ${I.clases[k]}">${k} ${I.clases[k]}</div>`).join('');

  const filasCat = [...SECCIONES, { id: '', label: 'Rayon à choisir' }].map((c) => {
    const sub = indicadores(refs.filter((r) => seccionDe(r.categoria) === c.id));
    if (!sub.n) return '';
    return `<tr><td>${esc(c.label)}</td><td class="num">${sub.n}</td><td class="num">${pct(sub.encontrados, sub.n)} %</td>
      <td class="num">${pct(sub.material, sub.n)} %</td><td class="num">${pct(sub.masa, sub.n)} %</td></tr>`;
  }).join('');

  const filasFam = Object.entries(unidadesFam).sort((a, b) => b[1] - a[1])
    .map(([f, u]) => `<tr><td><span class="dot" style="background:${FAMILIAS[f].color}"></span>${esc(FAMILIAS[f].label)}</td><td class="num">${u}</td><td class="num">${pct(u, totalU)} %</td></tr>`).join('');
  const filasTri = Object.entries(consignas).sort((a, b) => b[1] - a[1])
    .map(([t, u]) => `<tr><td>${esc(t)}</td><td class="num">${u}</td><td class="num">${pct(u, totalU)} %</td></tr>`).join('');

  el.innerHTML = `
    ${I.n < 10 ? `<div class="card note">Seulement ${I.n} référence(s) : les pourcentages sont encore très instables. Le premier jalon du plan est de 10 produits.</div>` : ''}
    <div class="kpis">
      ${kpi('Couverture produit (trouvés dans une base)', I.encontrados, I.n, METAS.producto)}
      ${kpi('Couverture matériau (classes A–C)', I.material, I.n, METAS.material)}
      ${kpi('Couverture masse (classes A–B)', I.masa, I.n, METAS.masa)}
      ${kpi('Données de la base correctes (réf. évaluées)', correctas, evaluadas.length, null)}
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Classes de qualité</h3>
      <div class="bar">${barraClases}</div>
      <p class="note">${I.verificados} référence(s) sur ${I.n} vérifiée(s) physiquement · ${vrac} vendue(s) sans emballage.</p>
      <p class="note">${media == null ? 'Aucune référence avec une masse plastique quantifiée pour l’instant.' : `Masse plastique moyenne (classes A–B, n = ${masas.length}) : ${g1(media)} g par unité de vente.`}</p>
    </div>

    <div class="card">
      <h3>Par rayon</h3>
      <div class="tabla"><table>
        <thead><tr><th>Rayon</th><th class="num">n</th><th class="num">Produit</th><th class="num">Matériau</th><th class="num">Masse</th></tr></thead>
        <tbody>${filasCat}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>Composants par matériau</h3>
      <p class="note">Unités de composant cumulées sur une unité de vente de chaque référence (n = ${totalU}).</p>
      <div class="tabla"><table><thead><tr><th>Famille</th><th class="num">Unités</th><th class="num">%</th></tr></thead><tbody>${filasFam}</tbody></table></div>
    </div>

    <div class="card">
      <h3>Destination selon la consigne de tri</h3>
      <div class="tabla"><table><thead><tr><th>Contenant</th><th class="num">Unités</th><th class="num">%</th></tr></thead><tbody>${filasTri}</tbody></table></div>
      <p class="note">${esc(FUENTE_TRI)}</p>
    </div>`;
}

// ---------- Démarrage ----------

contar();
resumirSync();
pintarEnlace();
if (conectado() && pendientes().length) sincronizar();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
