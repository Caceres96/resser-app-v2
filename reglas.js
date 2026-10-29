// Vocabulaires et règles du Test A.
// Les identifiants suivent la taxonomie d'Open Food Facts (packagings : shape, material).
// Un identifiant inconnu est conservé tel quel et rattaché à une famille par familiaDe().
// Les identifiants internes (catégories, sources, causes) restent stables pour garder la compatibilité des sauvegardes.

// Rayons du magasin (alignés sur la feuille « data base » de l'équipe).
export const CATEGORIAS = [
  { id: 'cremerie', label: 'Crèmerie' },
  { id: 'fromagerie', label: 'Fromagerie' },
  { id: 'charcuterie', label: 'Charcuterie / traiteur' },
  { id: 'boucherie', label: 'Boucherie / poissonnerie' },
  { id: 'fruits_legumes', label: 'Fruits et légumes' },
  { id: 'boulangerie', label: 'Boulangerie / viennoiserie' },
  { id: 'epicerie_salee', label: 'Épicerie salée' },
  { id: 'epicerie_sucree', label: 'Épicerie sucrée' },
  { id: 'boissons', label: 'Boissons' },
  { id: 'surgeles', label: 'Surgelés' },
  { id: 'hygiene', label: 'Hygiène / beauté' },
  { id: 'entretien', label: 'Entretien / maison' },
  { id: 'animaux', label: 'Animaux' },
  { id: 'autre', label: 'Autre' },
];
// Catégories des versions ≤ 0.3 → rayon équivalent.
export const ALIAS_CATEGORIAS = {
  bebidas: 'boissons', lacteos: 'cremerie', snacks: 'epicerie_sucree', conservas: 'epicerie_salee', otros: 'autre',
};

export const COMMUNES = [
  'Art-sur-Meurthe', 'Dommartemont', 'Essey-lès-Nancy', 'Fléville-devant-Nancy', 'Heillecourt', 'Houdemont',
  'Jarville-la-Malgrange', 'Laneuveville-devant-Nancy', 'Laxou', 'Ludres', 'Malzéville', 'Maxéville', 'Nancy',
  'Pulnoy', 'Saint-Max', 'Saulxures-lès-Nancy', 'Seichamps', 'Tomblaine', 'Vandœuvre-lès-Nancy', 'Villers-lès-Nancy',
];
export const ENSEIGNES = [
  'Carrefour', 'Carrefour Market', 'Carrefour City', 'E.Leclerc', 'Auchan', 'Intermarché', 'Super U', 'Cora',
  'Lidl', 'Aldi', 'Monoprix', 'Franprix', 'Biocoop', 'Marché',
];

// Bases Open Facts interrogées dans l'ordre (même API v3).
export const BASES = [
  { id: 'off', label: 'Open Food Facts', host: 'world.openfoodfacts.org' },
  { id: 'obf', label: 'Open Beauty Facts', host: 'world.openbeautyfacts.org' },
  { id: 'opf', label: 'Open Products Facts', host: 'world.openproductsfacts.org' },
];

export const FAMILIAS = {
  plastico: { label: 'Plastique', color: '#d9822b' },
  vidrio: { label: 'Verre', color: '#2f8f6b' },
  papel_carton: { label: 'Papier / carton', color: '#a07a4a' },
  metal: { label: 'Métal', color: '#6b7c93' },
  compuesto: { label: 'Composite (brique…)', color: '#8a5cc2' },
  madera: { label: 'Bois', color: '#7a5a2f' },
  otro: { label: 'Autre', color: '#888888' },
  desconocido: { label: 'Sans matériau', color: '#c0392b' },
};

export const MATERIALES = [
  { id: 'en:pet-1-polyethylene-terephthalate', label: 'PET (1)', familia: 'plastico' },
  { id: 'en:hdpe-2-high-density-polyethylene', label: 'PEHD (2)', familia: 'plastico' },
  { id: 'en:pvc-3-polyvinyl-chloride', label: 'PVC (3)', familia: 'plastico' },
  { id: 'en:ldpe-4-low-density-polyethylene', label: 'PEBD (4)', familia: 'plastico' },
  { id: 'en:pp-5-polypropylene', label: 'PP (5)', familia: 'plastico' },
  { id: 'en:ps-6-polystyrene', label: 'PS (6)', familia: 'plastico' },
  { id: 'en:o-7-other-plastics', label: 'Autres plastiques (7)', familia: 'plastico' },
  { id: 'en:plastic', label: 'Plastique (non précisé)', familia: 'plastico' },
  { id: 'en:glass', label: 'Verre', familia: 'vidrio' },
  { id: 'en:paper', label: 'Papier', familia: 'papel_carton' },
  { id: 'en:cardboard', label: 'Carton', familia: 'papel_carton' },
  { id: 'en:non-corrugated-cardboard', label: 'Carton plat', familia: 'papel_carton' },
  { id: 'en:corrugated-cardboard', label: 'Carton ondulé', familia: 'papel_carton' },
  { id: 'en:aluminium', label: 'Aluminium', familia: 'metal' },
  { id: 'en:steel', label: 'Acier', familia: 'metal' },
  { id: 'en:metal', label: 'Métal (non précisé)', familia: 'metal' },
  { id: 'en:tetra-pak', label: 'Brique / Tetra Pak', familia: 'compuesto' },
  { id: 'en:composite', label: 'Composite multimatériau', familia: 'compuesto' },
  { id: 'en:wood', label: 'Bois', familia: 'madera' },
];

export const FORMAS = [
  { id: 'en:bottle', label: 'Bouteille' },
  { id: 'en:bottle-cap', label: 'Bouchon' },
  { id: 'en:lid', label: 'Couvercle' },
  { id: 'en:jar', label: 'Bocal' },
  { id: 'en:pot', label: 'Pot' },
  { id: 'en:tub', label: 'Pot à couvercle (barquette)' },
  { id: 'en:can', label: 'Canette / boîte de conserve' },
  { id: 'en:brick', label: 'Brique' },
  { id: 'en:box', label: 'Boîte / étui' },
  { id: 'en:tray', label: 'Barquette' },
  { id: 'en:bag', label: 'Sac' },
  { id: 'en:sachet', label: 'Sachet' },
  { id: 'en:film', label: 'Film' },
  { id: 'en:wrapper', label: 'Suremballage' },
  { id: 'en:seal', label: 'Opercule' },
  { id: 'en:sleeve', label: 'Manchon' },
  { id: 'en:label', label: 'Étiquette' },
  { id: 'en:blister', label: 'Blister' },
  { id: 'en:drink-can', label: 'Canette' },
  { id: 'en:packet', label: 'Paquet' },
  { id: 'en:cup', label: 'Gobelet' },
  { id: 'en:capsule', label: 'Capsule' },
  { id: 'en:tube', label: 'Tube' },
  { id: 'en:net', label: 'Filet' },
  { id: 'en:aerosol-can', label: 'Aérosol' },
  { id: 'en:individual-dose', label: 'Dose individuelle' },
];

// Identifiant Open Facts sans libellé connu : « en:drink-can » → « drink can ».
const lisible = (id) => String(id || '').replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');

export const PESO_FUENTES = [
  { id: '', label: 'Sans poids' },
  { id: 'medido_resser', label: 'Pesé par nous (balance)' },
  { id: 'declarado', label: 'Déclaré par le fabricant' },
  { id: 'off_medido', label: 'OFF · mesuré' },
  { id: 'off_especificado', label: 'OFF · spécifié' },
  { id: 'off_estimado', label: 'OFF · estimé' },
  { id: 'estimado_resser', label: 'Estimé par nous (produit comparable)' },
];

export const EXACTITUD = [
  { id: '', label: '— non évalué —' },
  { id: 'correcto', label: 'Corrects' },
  { id: 'parcial', label: 'Partiellement corrects' },
  { id: 'incorrecto', label: 'Incorrects' },
  { id: 'sin_datos', label: "OFF n'avait pas d'emballages" },
];

export const CAUSAS = [
  { id: '', label: '— aucune —' },
  { id: 'no_encontrado', label: 'Produit introuvable dans OFF' },
  { id: 'sin_envases', label: "OFF sans composants d'emballage" },
  { id: 'material_faltante', label: 'Matériau manquant pour un composant' },
  { id: 'peso_faltante', label: 'Poids manquant pour un composant' },
  { id: 'datos_erroneos', label: 'Données OFF erronées' },
  { id: 'otra', label: 'Autre (voir observations)' },
];

export const ESTADOS_OFF = { encontrado: 'Trouvé', no_encontrado: 'Introuvable', sin_codigo: 'Sans code-barres' };

const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
const MAT = porId(MATERIALES);
const FOR = porId(FORMAS);

export function familiaDe(material) {
  if (!material) return 'desconocido';
  if (MAT[material]) return MAT[material].familia;
  const m = material.toLowerCase();
  if (/plastic|pet\b|pet-|hdpe|ldpe|pp-|ps-|pvc|poly/.test(m)) return 'plastico';
  if (/glass/.test(m)) return 'vidrio';
  if (/paper|cardboard|carton/.test(m)) return 'papel_carton';
  if (/alumin|steel|metal|tin/.test(m)) return 'metal';
  if (/tetra|composite|multilayer|multi-layer/.test(m)) return 'compuesto';
  if (/wood/.test(m)) return 'madera';
  return 'otro';
}

export const labelDe = (lista, id) => lista.find((x) => x.id === (id || ''))?.label || id || '';
export const labelMaterial = (id) => MAT[id]?.label || lisible(id) || '—';
export const labelForma = (id) => FOR[id]?.label || lisible(id) || '—';

// Consigne de tri par famille de matériau.
// Statut : règle nationale générale (extension des consignes de tri, généralisée en France en 2023).
// À FAIRE : comparer avec le Guide du tri du Grand Nancy et ajouter les exceptions locales.
export const FUENTE_TRI =
  'Règle nationale générale (extension des consignes de tri, 2023). À vérifier avec le Guide du tri du Grand Nancy.';

export function consignaTri(familia) {
  switch (familia) {
    case 'vidrio':
      return { id: 'verre', label: 'Conteneur à verre' };
    case 'plastico':
    case 'papel_carton':
    case 'metal':
    case 'compuesto':
      return { id: 'jaune', label: 'Bac jaune (emballages)' };
    case 'madera':
    case 'otro':
      return { id: 'om', label: 'Ordures ménagères (à confirmer)' };
    default:
      return { id: 'nd', label: 'À déterminer' };
  }
}
