/**
 * Resser · Test A — réception des données de l'application dans Google Sheets.
 *
 * Installation (une seule fois) :
 *  1. Créer un projet Apps Script, coller ce fichier, remplacer ID_FEUILLE par l'identifiant
 *     de la feuille de départ (la partie de l'URL entre /d/ et /edit), enregistrer.
 *  2. Exécuter « creerClasseur » et autoriser l'accès : crée une feuille à votre nom avec les
 *     onglets Références, Composants, Synthèse et Dictionnaire, et écrit son URL et la clé de
 *     l'application dans le journal d'exécution.
 *  3. Déployer > Nouveau déploiement > Application Web :
 *     « Exécuter en tant que : moi », « Accès : tout le monde ». Copier l'URL /exec.
 *  4. Dans l'app (Inventaire > Synchronisation) : coller l'URL et la clé.
 *
 * Les onglets existants (« Hoja 1 ») ne sont jamais modifiés.
 */

// Feuille de départ de l'équipe (lecture seule) ; la feuille de travail est celle créée par creerClasseur().
const ID_FEUILLE = 'COLLER_ICI_L_ID_DE_LA_FEUILLE';
const classeur_ = () => SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('ID_CLASSEUR') || ID_FEUILLE);

// Crée une feuille appartenant à la personne qui exécute le script, y copie le premier onglet
// de la feuille de départ (saisies manuelles du premier ticket), puis installe la structure.
function creerClasseur() {
  const ss = SpreadsheetApp.create('Resser · Test A · données emballages');
  const vierge = ss.getSheets()[0];
  PropertiesService.getScriptProperties().setProperty('ID_CLASSEUR', ss.getId());
  copierFeuilleDepart();
  configurer();
  ss.deleteSheet(vierge);
  ss.setActiveSheet(ss.getSheetByName(ONGLETS.ref));
  ss.moveActiveSheet(1);
  Logger.log(`Nouvelle feuille : ${ss.getUrl()}`);
}

// Copie (texte affiché uniquement : les images dans les cellules ne se recopient pas)
// du premier onglet de la feuille de départ dans la feuille de travail.
function copierFeuilleDepart() {
  const nom = 'Ticket test (saisie manuelle)';
  try {
    const src = SpreadsheetApp.openById(ID_FEUILLE).getSheets()[0];
    const n = src.getLastRow(), m = src.getLastColumn();
    const valeurs = src.getRange(1, 1, n, m).getDisplayValues();
    const ss = classeur_();
    const dest = ss.getSheetByName(nom) || ss.insertSheet(nom);
    dest.clear();
    dest.getRange(1, 1, n, m).setValues(valeurs);
    dest.getRange(1, 1, 1, m).setFontWeight('bold');
    dest.setFrozenRows(1);
    Logger.log(`Feuille de départ copiée : ${n} lignes.`);
  } catch (err) {
    Logger.log(`Feuille de départ non copiée : ${err}`);
  }
}

const ONGLETS = {
  ref: 'Références', comp: 'Composants', syn: 'Synthèse', dic: 'Dictionnaire', photo: 'Photos',
  journal: 'Journal des achats', tdb: 'Tableau de bord',
};

// Ordre des colonnes ; l'application envoie des objets avec ces mêmes noms.
const COL_REF = [
  'mis_a_jour', 'saisi_par', 'gtin', 'libelle_ticket', 'nom', 'marque', 'quantite', 'rayon',
  'enseigne', 'commune', 'date_achat', 'sans_emballage', 'base_produits', 'statut_off',
  'off_emballages_complets', 'nb_composants', 'materiaux', 'formes', 'masse_plastique_g',
  'classe_suggeree', 'classe_finale', 'verifie', 'donnees_off', 'cause', 'observations', 'version_app',
  'photo', 'donnees_app',
];
const COL_COMP = [
  'mis_a_jour', 'saisi_par', 'gtin', 'nom', 'rayon', 'composant', 'forme', 'materiau', 'famille',
  'unites', 'poids_g', 'source_poids', 'consigne_tri', 'recyclage_off', 'origine',
];
// Photo réduite (JPEG en data URL, < 50 000 caractères : limite d'une cellule).
const COL_PHOTO = ['gtin', 'mis_a_jour', 'saisi_par', 'photo'];
// Une ligne par composant d'emballage et par achat enregistré (un nouveau scan = un nouvel achat ;
// une correction depuis l'inventaire n'en crée pas). Sert aux fréquences du Tableau de bord.
const COL_JOURNAL = [
  'id_achat', 'date_achat', 'horodatage', 'saisi_par', 'gtin', 'nom', 'rayon', 'enseigne', 'commune',
  'emballage', 'forme', 'materiau', 'famille', 'unites', 'poids_g', 'masse_g', 'consigne_tri',
];

function dateAchat_(v) {
  if (v instanceof Date) return v;
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

// ref et composants : objets aux colonnes COL_REF / COL_COMP.
function lignesJournal_(ref, composants) {
  const base = {
    id_achat: `${ref.gtin}@${ref.mis_a_jour}`,
    date_achat: dateAchat_(ref.date_achat || ref.mis_a_jour),
    horodatage: ref.mis_a_jour, saisi_par: ref.saisi_par, gtin: String(ref.gtin), nom: ref.nom,
    rayon: ref.rayon, enseigne: ref.enseigne, commune: ref.commune,
  };
  const ligne = (o) => COL_JOURNAL.map((c) => (o[c] == null ? '' : o[c]));
  if (!composants.length) {
    const emballage = ref.sans_emballage === 'oui' ? 'Sans emballage (vrac)' : 'Non caractérisé';
    return [ligne({ ...base, emballage, unites: 0 })];
  }
  return composants.map((c) => {
    const u = Number(c.unites) || 0;
    const p = c.poids_g === '' || c.poids_g == null ? '' : Number(c.poids_g);
    return ligne({
      ...base, emballage: `${c.famille} · ${c.forme}`, forme: c.forme, materiau: c.materiau, famille: c.famille,
      unites: u, poids_g: p, masse_g: p === '' ? '' : u * p, consigne_tri: c.consigne_tri,
    });
  });
}

// Premier remplissage : un achat par référence déjà présente dans la feuille.
function journalDepuisReferences_(ss) {
  const shJ = onglet_(ss, ONGLETS.journal, COL_JOURNAL);
  const shR = ss.getSheetByName(ONGLETS.ref), shC = ss.getSheetByName(ONGLETS.comp);
  if (shJ.getLastRow() > 1 || !shR || shR.getLastRow() < 2) return;
  const objets = (sh, cols) => sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues()
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  const refs = objets(shR, COL_REF).filter((r) => r.gtin);
  const comps = shC && shC.getLastRow() > 1 ? objets(shC, COL_COMP) : [];
  const lignes = [];
  refs.forEach((r) => lignes.push(...lignesJournal_(r, comps.filter((c) => String(c.gtin) === String(r.gtin)))));
  if (lignes.length) shJ.getRange(2, 1, lignes.length, COL_JOURNAL.length).setValues(lignes);
}

function cle_() {
  const props = PropertiesService.getScriptProperties();
  let cle = props.getProperty('CLE');
  if (!cle) {
    cle = Utilities.getUuid().slice(0, 8);
    props.setProperty('CLE', cle);
  }
  return cle;
}

// À exécuter depuis l'éditeur pour retrouver la clé (journal d'exécution).
function afficherCle() {
  Logger.log(`Clé à saisir dans l'application : ${cle_()}`);
}

const lettre_ = (cols, nom) => {
  let n = cols.indexOf(nom) + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

function onglet_(ss, nom, entetes) {
  let sh = ss.getSheetByName(nom);
  if (!sh) sh = ss.insertSheet(nom);
  if (entetes) {
    sh.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold').setBackground('#e6f1ee');
    sh.setFrozenRows(1);
    sh.getRange(2, entetes.indexOf('gtin') + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return sh;
}

function configurer() {
  const ss = classeur_();
  onglet_(ss, ONGLETS.ref, COL_REF);
  onglet_(ss, ONGLETS.comp, COL_COMP);
  onglet_(ss, ONGLETS.photo, COL_PHOTO).hideSheet();
  const shJ = onglet_(ss, ONGLETS.journal, COL_JOURNAL);
  shJ.getRange(2, COL_JOURNAL.indexOf('date_achat') + 1, shJ.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  journalDepuisReferences_(ss);
  synthese_(onglet_(ss, ONGLETS.syn));
  dictionnaire_(onglet_(ss, ONGLETS.dic));
  const tdb = onglet_(ss, ONGLETS.tdb);
  tableauDeBord_(tdb);
  ss.setActiveSheet(tdb);
  ss.moveActiveSheet(1);
  Logger.log(`Clé de l'application : ${cle_()}`);
}

// Tableau de bord : formules sur le Journal des achats (périodes glissantes) + graphiques.
function tableauDeBord_(sh) {
  sh.getCharts().forEach((g) => sh.removeChart(g));
  sh.clear();
  const J = `'${ONGLETS.journal}'!`;
  const col = (n) => { const l = lettre_(COL_JOURNAL, n); return `${J}${l}2:${l}`; };
  const D = col('date_achat'), U = col('unites'), F = col('famille'), E = col('emballage'), ID = col('id_achat'), M = col('masse_g');
  const VERT = '#e6f1ee';
  const titre = (a1, texte) => sh.getRange(a1).setValue(texte).setFontWeight('bold').setFontSize(12);
  const entete = (a1) => sh.getRange(a1).setFontWeight('bold').setBackground(VERT);

  sh.getRange('A1').setValue('Tableau de bord · emballages des achats enregistrés').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Se met à jour à chaque achat enregistré dans l’application. Périodes glissantes jusqu’à aujourd’hui.').setFontColor('#5f6b67');

  // Chiffres clés sur 7 jours, 30 jours, 365 jours et au total.
  titre('A4', 'Chiffres clés');
  const periodes = [7, 30, 365, null];
  const depuis = (j) => (j == null ? '' : `, ${D}, ">="&(TODAY()-${j})`);
  sh.getRange('A5:E5').setValues([['', '7 jours', '30 jours', '365 jours', 'Total']]);
  entete('A5:E5');
  const cols = ['B', 'C', 'D', 'E'];
  sh.getRange('A6:A10').setValues([['Achats enregistrés'], ["Unités d'emballage"], ['dont plastique'], ['Part de plastique'], ['Masse plastique connue (g)']]);
  periodes.forEach((j, i) => {
    const c = cols[i];
    sh.getRange(`${c}6`).setFormula(`=IFERROR(COUNTUNIQUEIFS(${ID}, ${ID}, "<>"${depuis(j)}), 0)`);
    sh.getRange(`${c}7`).setFormula(`=SUMIFS(${U}, ${ID}, "<>"${depuis(j)})`);
    sh.getRange(`${c}8`).setFormula(`=SUMIFS(${U}, ${F}, "Plastique"${depuis(j)})`);
    sh.getRange(`${c}9`).setFormula(`=IFERROR(${c}8/${c}7, 0)`);
    sh.getRange(`${c}10`).setFormula(`=SUMIFS(${M}, ${F}, "Plastique"${depuis(j)})`);
  });
  sh.getRange('B9:E9').setNumberFormat('0%');
  sh.getRange('B10:E10').setNumberFormat('#,##0');

  // Emballages les plus fréquents (15 premiers sur toute la période).
  titre('A12', 'Emballages les plus fréquents (unités)');
  sh.getRange('A13:E13').setValues([['Emballage', '7 jours', '30 jours', '365 jours', 'Total']]);
  entete('A13:E13');
  sh.getRange('A14').setFormula(`=IFERROR(ARRAY_CONSTRAIN(QUERY({${E}, ${U}}, "select Col1, sum(Col2) where Col1 is not null and Col1 <> '' group by Col1 order by sum(Col2) desc label sum(Col2) ''", 0), 15, 1), "")`);
  periodes.forEach((j, i) => {
    sh.getRange(`${cols[i]}14`).setFormula(`=MAP(A14:A28, LAMBDA(e, IF(e="", "", SUMIFS(${U}, ${E}, e${depuis(j)}))))`);
  });

  // Évolution : 12 dernières semaines, 12 derniers mois, 3 dernières années.
  const serie = (ligneTitre, texte, premiere, n, debut, fin, format) => {
    titre(`A${ligneTitre}`, texte);
    const h = ligneTitre + 1, d = h + 1, f = h + n;
    sh.getRange(`A${h}:D${h}`).setValues([['Période', 'Achats', "Unités d'emballage", 'dont plastique']]);
    entete(`A${h}:D${h}`);
    sh.getRange(`A${d}`).setFormula(premiere);
    const entre = (p) => `, ${D}, ">="&${debut(p)}, ${D}, "<"&${fin(p)}`;
    sh.getRange(`B${d}`).setFormula(`=MAP(A${d}:A${f}, LAMBDA(p, IFERROR(COUNTUNIQUEIFS(${ID}, ${ID}, "<>"${entre('p')}), 0)))`);
    sh.getRange(`C${d}`).setFormula(`=MAP(A${d}:A${f}, LAMBDA(p, SUMIFS(${U}, ${ID}, "<>"${entre('p')})))`);
    sh.getRange(`D${d}`).setFormula(`=MAP(A${d}:A${f}, LAMBDA(p, SUMIFS(${U}, ${F}, "Plastique"${entre('p')})))`);
    sh.getRange(`A${d}:A${f}`).setNumberFormat(format);
    return sh.getRange(`A${h}:D${f}`);
  };
  const semaines = serie(31, 'Par semaine (12 dernières, semaines du lundi)',
    '=ARRAYFORMULA(TODAY()-WEEKDAY(TODAY(), 2)+1-7*SEQUENCE(12, 1, 11, -1))', 12, (p) => p, (p) => `(${p}+7)`, 'dd/mm');
  const mois = serie(47, 'Par mois (12 derniers)',
    '=ARRAYFORMULA(EDATE(EOMONTH(TODAY(), -1)+1, SEQUENCE(12, 1, -11, 1)))', 12, (p) => p, (p) => `EDATE(${p}, 1)`, 'mmm yyyy');
  const annees = serie(63, 'Par année',
    '=SEQUENCE(3, 1, YEAR(TODAY())-2, 1)', 3, (p) => `DATE(${p}, 1, 1)`, (p) => `DATE(${p}+1, 1, 1)`, '0');

  // Répartition par famille de matériau (toute la période).
  titre('A70', 'Répartition par famille de matériau (unités, total)');
  sh.getRange('A71:B71').setValues([['Famille', 'Unités']]);
  entete('A71:B71');
  sh.getRange('A72').setFormula(`=IFERROR(QUERY({${F}, ${U}}, "select Col1, sum(Col2) where Col1 is not null and Col1 <> '' group by Col1 order by sum(Col2) desc label sum(Col2) ''", 0), "")`);

  sh.setColumnWidth(1, 260);
  [2, 3, 4, 5].forEach((c) => sh.setColumnWidth(c, 95));

  const COULEURS = ['#1f6f5c', '#f2b544', '#d9822b', '#6b7c93'];
  const graphique = (type, plage, ligne, titreG, options) => {
    let b = sh.newChart().setChartType(type).addRange(plage).setNumHeaders(1).setPosition(ligne, 7, 0, 0)
      .setOption('title', titreG).setOption('width', 620).setOption('height', 340)
      .setOption('legend', { position: 'bottom' }).setOption('colors', COULEURS);
    Object.entries(options || {}).forEach(([k, v]) => { b = b.setOption(k, v); });
    sh.insertChart(b.build());
  };
  graphique(Charts.ChartType.BAR, sh.getRange('A13:D28'), 2, 'Emballages les plus fréquents — 7 / 30 / 365 jours', { hAxis: { title: 'Unités' } });
  graphique(Charts.ChartType.COLUMN, semaines, 20, 'Par semaine — achats et unités d’emballage');
  graphique(Charts.ChartType.COLUMN, mois, 38, 'Par mois — achats et unités d’emballage');
  graphique(Charts.ChartType.COLUMN, annees, 56, 'Par année — achats et unités d’emballage');
  graphique(Charts.ChartType.PIE, sh.getRange('A71:B85'), 74, 'Familles de matériau (unités, total)', { pieHole: 0.4 });
}

function synthese_(sh) {
  sh.clear();
  const R = `'${ONGLETS.ref}'!`, C = `'${ONGLETS.comp}'!`;
  const col = (n) => `${R}${lettre_(COL_REF, n)}2:${lettre_(COL_REF, n)}`;
  const classe = col('classe_finale');
  const lignes = [
    ['Synthèse du Test A', '', 'Objectif', 'Statut'],
    ['Références enregistrées', `=COUNTA(${col('gtin')})`, '', ''],
    ['Trouvées dans une base Open Facts', `=COUNTIF(${col('statut_off')},"Trouvé*")`, '', ''],
    ['Couverture produit', '=IFERROR(B3/B2,0)', 0.85, '=IF(B2=0,"",IF(B4>=C4,"atteint","non atteint"))'],
    ['Classes A–C (matériau identifié)', `=COUNTIF(${classe},"A")+COUNTIF(${classe},"B")+COUNTIF(${classe},"C")`, '', ''],
    ['Couverture matériau', '=IFERROR(B5/B2,0)', 0.70, '=IF(B2=0,"",IF(B6>=C6,"atteint","non atteint"))'],
    ['Classes A–B (masse disponible)', `=COUNTIF(${classe},"A")+COUNTIF(${classe},"B")`, '', ''],
    ['Couverture masse', '=IFERROR(B7/B2,0)', 0.50, '=IF(B2=0,"",IF(B8>=C8,"atteint","non atteint"))'],
    ['Vérifiées physiquement', `=COUNTIF(${col('verifie')},"oui")`, '', ''],
    ['Masse plastique moyenne, classes A–B (g)', `=IFERROR(AVERAGE(${col('masse_plastique_g')}),"")`, '', ''],
    ['Produits sans emballage (vrac)', `=COUNTIF(${col('sans_emballage')},"oui")`, '', ''],
  ];
  sh.getRange(1, 1, lignes.length, 4).setValues(lignes);
  sh.getRange('A1:D1').setFontWeight('bold').setBackground('#e6f1ee');
  ['B4', 'B6', 'B8', 'C4', 'C6', 'C8'].forEach((a) => sh.getRange(a).setNumberFormat('0%'));
  sh.getRange('B10').setNumberFormat('0.0');

  const L = (n) => lettre_(COL_REF, n);
  sh.getRange('F1').setValue('Par rayon').setFontWeight('bold');
  sh.getRange('F2').setFormula(
    `=IFERROR(QUERY(${R}A1:${lettre_(COL_REF, COL_REF[COL_REF.length - 1])},` +
    `"select ${L('rayon')}, count(${L('gtin')}) where ${L('gtin')} is not null group by ${L('rayon')} ` +
    `label ${L('rayon')} 'Rayon', count(${L('gtin')}) 'Références'",1),"")`);
  sh.getRange('F20').setValue('Par classe').setFontWeight('bold');
  sh.getRange('F21').setFormula(
    `=IFERROR(QUERY(${R}A1:${lettre_(COL_REF, COL_REF[COL_REF.length - 1])},` +
    `"select ${L('classe_finale')}, count(${L('gtin')}) where ${L('gtin')} is not null group by ${L('classe_finale')} ` +
    `label ${L('classe_finale')} 'Classe', count(${L('gtin')}) 'Références'",1),"")`);

  const K = (n) => lettre_(COL_COMP, n);
  sh.getRange('I1').setValue('Unités de composant par famille de matériau').setFontWeight('bold');
  sh.getRange('I2').setFormula(
    `=IFERROR(QUERY(${C}A1:${lettre_(COL_COMP, COL_COMP[COL_COMP.length - 1])},` +
    `"select ${K('famille')}, sum(${K('unites')}) where ${K('gtin')} is not null group by ${K('famille')} ` +
    `order by sum(${K('unites')}) desc label ${K('famille')} 'Famille', sum(${K('unites')}) 'Unités'",1),"")`);
  sh.getRange('I20').setValue('Unités par consigne de tri').setFontWeight('bold');
  sh.getRange('I21').setFormula(
    `=IFERROR(QUERY(${C}A1:${lettre_(COL_COMP, COL_COMP[COL_COMP.length - 1])},` +
    `"select ${K('consigne_tri')}, sum(${K('unites')}) where ${K('gtin')} is not null group by ${K('consigne_tri')} ` +
    `label ${K('consigne_tri')} 'Consigne', sum(${K('unites')}) 'Unités'",1),"")`);
  sh.setColumnWidth(1, 300);
}

function dictionnaire_(sh) {
  sh.clear();
  const d = [
    ['Onglet', 'Colonne', 'Description'],
    ['Références', 'mis_a_jour', "Date et heure du dernier enregistrement dans l'application"],
    ['Références', 'saisi_par', 'Personne qui a saisi la référence (réglage de l’app)'],
    ['Références', 'gtin', 'Code-barres (EAN-13/8). « SC-… » = produit sans code-barres (vrac, fruits et légumes)'],
    ['Références', 'libelle_ticket', 'Libellé tel qu’imprimé sur le ticket de caisse (utile pour le Test B : ticket → produit)'],
    ['Références', 'nom / marque / quantite', 'Identification du produit (Open Facts ou saisie manuelle)'],
    ['Références', 'rayon', 'Rayon du magasin (liste ci-dessous)'],
    ['Références', 'enseigne / commune / date_achat', "Contexte d'achat, mémorisé dans l'app entre deux scans"],
    ['Références', 'sans_emballage', 'oui = produit vendu sans emballage (vrac) : 0 composant, ce n’est pas une donnée manquante'],
    ['Références', 'base_produits', 'Base où le produit a été trouvé : Open Food / Beauty / Products Facts'],
    ['Références', 'statut_off', 'Trouvé, Introuvable ou Sans code-barres'],
    ['Références', 'off_emballages_complets', 'La base marque-t-elle la description des emballages comme complète ?'],
    ['Références', 'materiaux / formes', 'Liste des composants, séparés par « + »'],
    ['Références', 'masse_plastique_g', 'Σ unités × poids des composants plastiques, par unité de vente. Vide si classe C ou D'],
    ['Références', 'classe_suggeree / classe_finale', 'A : masse mesurée ou déclarée et vérifiée · B : masse estimée ou non vérifiée · C : forme et matériau sans poids · D : non caractérisable'],
    ['Références', 'verifie', 'Emballages contrôlés sur le produit physique'],
    ['Références', 'donnees_off', 'Les emballages décrits par la base étaient-ils corrects ?'],
    ['Références', 'cause', "Raison principale d'une donnée manquante ou erronée"],
    ['Références', 'photo', 'oui = une photo du produit existe (onglet masqué « Photos », affichée dans l’application)'],
    ['Références', 'donnees_app', "Fiche complète au format de l'application (JSON) : sert à pré-remplir le produit quand un autre membre le scanne. Ne pas modifier à la main"],
    ['Composants', 'composant', "Numéro du composant dans l'emballage (bouteille, bouchon, étiquette…)"],
    ['Composants', 'forme / materiau / famille', 'Taxonomie Open Food Facts, regroupée en familles (plastique, verre, papier/carton, métal, composite…)'],
    ['Composants', 'unites / poids_g', 'Nombre de ce composant par unité de vente ; poids d’une unité en grammes'],
    ['Composants', 'source_poids', 'Pesé par nous, déclaré par le fabricant, Open Facts (mesuré/spécifié/estimé) ou estimé par nous'],
    ['Composants', 'consigne_tri', 'Règle nationale générale (extension des consignes de tri, 2023) — à vérifier avec le Guide du tri du Grand Nancy'],
    ['Composants', 'origine', 'OFF, OFF corrigé ou saisie manuelle'],
    ['Journal des achats', '(une ligne par composant)', "Chaque fiche enregistrée après un scan = un achat ; une correction depuis l'inventaire n'ajoute rien. date_achat = date du ticket. emballage = famille · forme"],
    ['Tableau de bord', '', 'Chiffres clés et graphiques sur 7 / 30 / 365 jours, par semaine, mois et année, calculés à partir du Journal des achats'],
    ['', '', ''],
    ['Liste', 'Rayons', 'Crèmerie · Fromagerie · Charcuterie / traiteur · Boucherie / poissonnerie · Fruits et légumes · Boulangerie / viennoiserie · Épicerie salée · Épicerie sucrée · Boissons · Surgelés · Hygiène / beauté · Entretien / maison · Animaux · Autre'],
  ];
  sh.getRange(1, 1, d.length, 3).setValues(d);
  sh.getRange('A1:C1').setFontWeight('bold').setBackground('#e6f1ee');
  sh.setFrozenRows(1);
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(3, 700);
  sh.getRange(1, 3, d.length, 1).setWrap(true);
}

const json_ = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

// ?cle=XXXX : test de connexion. ?cle=XXXX&gtin=… : fiche déjà saisie par l'équipe (ou null),
// pour pré-remplir l'application quand quelqu'un d'autre a déjà caractérisé le produit.
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.cle !== cle_()) return json_({ ok: false, erreur: 'Clé invalide' });
  const ss = classeur_();
  // Maintenance : ?cle=…&accion=configurer recrée Synthèse et Dictionnaire (données intactes).
  if (p.accion === 'configurer') { configurer(); return json_({ ok: true, configure: true }); }
  // Suggestions Open Food Facts pour un libellé de ticket (?accion=buscar&q=…). Le moteur de recherche
  // d'Open Food Facts n'accepte pas les appels directs du navigateur : le script sert de relais.
  // Résultats gardés 6 h en cache pour ménager l'API (un même libellé revient souvent).
  if (p.accion === 'buscar') {
    const q = String(p.q || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!q) return json_({ ok: true, produits: [] });
    const cache = CacheService.getScriptCache(), cleCache = `off:${q.toLowerCase()}`;
    const enCache = cache.get(cleCache);
    if (enCache) return json_({ ok: true, produits: JSON.parse(enCache) });
    const url = 'https://search.openfoodfacts.org/search?' + [
      `q=${encodeURIComponent(q)}`, 'page_size=5', 'langs=fr',
      `fields=${encodeURIComponent('code,product_name,product_name_fr,brands,quantity,image_front_small_url')}`,
    ].join('&');
    const rep = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Resser/1.0 (etude de faisabilite emballages, Grand Nancy)' } });
    if (rep.getResponseCode() !== 200) return json_({ ok: false, erreur: `Open Food Facts a répondu ${rep.getResponseCode()}` });
    const produits = (JSON.parse(rep.getContentText()).hits || []).filter((h) => h.code).map((h) => ({
      code: String(h.code), nom: h.product_name_fr || h.product_name || '',
      marque: Array.isArray(h.brands) ? h.brands.join(', ') : (h.brands || ''),
      quantite: h.quantity || '', image: h.image_front_small_url || '',
    }));
    cache.put(cleCache, JSON.stringify(produits), 21600);
    return json_({ ok: true, produits });
  }
  // Catalogue léger (sans photos ni fiches complètes) : sert à rapprocher les libellés de ticket.
  if (p.accion === 'lista') {
    const shR = ss.getSheetByName(ONGLETS.ref);
    const nR = shR ? shR.getLastRow() - 1 : 0;
    if (nR < 1) return json_({ ok: true, produits: [] });
    const c = (nom) => COL_REF.indexOf(nom);
    const produits = shR.getRange(2, 1, nR, COL_REF.length).getValues()
      .filter((r) => r[c('gtin')])
      .map((r) => ({
        gtin: String(r[c('gtin')]), nom: r[c('nom')], marque: r[c('marque')], libelle: r[c('libelle_ticket')],
        rayon: r[c('rayon')], classe: r[c('classe_finale')], verifie: r[c('verifie')],
      }));
    return json_({ ok: true, produits });
  }
  if (!p.gtin) return json_({ ok: true, feuille: ss.getName() });
  const sh = ss.getSheetByName(ONGLETS.ref);
  const n = sh ? sh.getLastRow() - 1 : 0;
  if (n < 1) return json_({ ok: true, ref: null });
  const iG = COL_REF.indexOf('gtin'), iJ = COL_REF.indexOf('donnees_app');
  const lignes = sh.getRange(2, 1, n, COL_REF.length).getValues();
  const ligne = lignes.find((r) => String(r[iG]) === String(p.gtin));
  let ref = null;
  try { ref = ligne && ligne[iJ] ? JSON.parse(ligne[iJ]) : null; } catch (err) { ref = null; }
  return json_({ ok: true, ref, photo: ref ? photo_(ss, p.gtin) : null });
}

function photo_(ss, gtin) {
  const sh = ss.getSheetByName(ONGLETS.photo);
  const n = sh ? sh.getLastRow() - 1 : 0;
  if (n < 1) return null;
  const ligne = sh.getRange(2, 1, n, COL_PHOTO.length).getValues().find((r) => String(r[0]) === String(gtin));
  return ligne ? ligne[3] : null;
}

// Corps attendu : { cle, refs: [ { ref: {colonne: valeur…}, composants: [ {colonne: valeur…} ] } ] }
// Une référence déjà présente (même gtin) est remplacée, ainsi que tous ses composants.
function doPost(e) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const corps = JSON.parse(e.postData.contents);
    if (corps.cle !== cle_()) return json_({ ok: false, erreur: 'Clé invalide' });
    const lots = (corps.refs || []).filter((x) => x && x.ref && x.ref.gtin);
    if (!lots.length) return json_({ ok: true, n: 0 });
    const ss = classeur_();
    const shR = onglet_(ss, ONGLETS.ref, COL_REF);
    const shC = onglet_(ss, ONGLETS.comp, COL_COMP);
    const ligneR = (o) => COL_REF.map((c) => (o[c] == null ? '' : o[c]));
    const ligneC = (o) => COL_COMP.map((c) => (o[c] == null ? '' : o[c]));

    // Photos : une par gtin, remplacée si une nouvelle arrive.
    const avecPhoto = lots.filter((x) => typeof x.photo === 'string' && x.photo.startsWith('data:image/') && x.photo.length < 50000);
    if (avecPhoto.length) {
      const shP = onglet_(ss, ONGLETS.photo, COL_PHOTO);
      const nP = shP.getLastRow() - 1;
      const gP = nP > 0 ? shP.getRange(2, 1, nP, 1).getValues().map((r) => String(r[0])) : [];
      avecPhoto.forEach((x) => {
        const ligne = [String(x.ref.gtin), x.ref.mis_a_jour || '', x.ref.saisi_par || '', x.photo];
        const i = gP.indexOf(String(x.ref.gtin));
        if (i >= 0) shP.getRange(i + 2, 1, 1, COL_PHOTO.length).setValues([ligne]);
        else { shP.appendRow(ligne); gP.push(String(x.ref.gtin)); }
        x.ref.photo = 'oui';
      });
    }

    // Références : mise à jour sur place ou ajout. Une photo déjà enregistrée reste signalée.
    const iG = COL_REF.indexOf('gtin'), iP = COL_REF.indexOf('photo');
    const nR = shR.getLastRow() - 1;
    const existantes = nR > 0 ? shR.getRange(2, 1, nR, COL_REF.length).getValues() : [];
    const gtins = existantes.map((r) => String(r[iG]));
    const nouvelles = [];
    lots.forEach((x) => {
      const i = gtins.indexOf(String(x.ref.gtin));
      if (i >= 0) {
        if (!x.ref.photo && existantes[i][iP] === 'oui') x.ref.photo = 'oui';
        shR.getRange(i + 2, 1, 1, COL_REF.length).setValues([ligneR(x.ref)]);
      } else nouvelles.push(ligneR(x.ref));
    });
    if (nouvelles.length) shR.getRange(shR.getLastRow() + 1, 1, nouvelles.length, COL_REF.length).setValues(nouvelles);

    // Composants : on retire ceux des références reçues, puis on ajoute les nouveaux.
    const recus = new Set(lots.map((x) => String(x.ref.gtin)));
    const jG = COL_COMP.indexOf('gtin');
    const nC = shC.getLastRow() - 1;
    const gardes = nC > 0
      ? shC.getRange(2, 1, nC, COL_COMP.length).getValues().filter((r) => !recus.has(String(r[jG])))
      : [];
    const ajout = [];
    lots.forEach((x) => (x.composants || []).forEach((c) => ajout.push(ligneC(c))));
    const toutes = gardes.concat(ajout);
    if (nC > 0) shC.getRange(2, 1, nC, COL_COMP.length).clearContent();
    if (toutes.length) shC.getRange(2, 1, toutes.length, COL_COMP.length).setValues(toutes);

    // Journal : un nouvel achat pour chaque fiche enregistrée après un scan.
    const journal = [];
    lots.filter((x) => x.achat).forEach((x) => journal.push(...lignesJournal_(x.ref, x.composants || [])));
    if (journal.length) {
      const shJ = onglet_(ss, ONGLETS.journal, COL_JOURNAL);
      shJ.getRange(shJ.getLastRow() + 1, 1, journal.length, COL_JOURNAL.length).setValues(journal);
    }

    return json_({ ok: true, n: lots.length });
  } catch (err) {
    return json_({ ok: false, erreur: String(err) });
  } finally {
    verrou.releaseLock();
  }
}
