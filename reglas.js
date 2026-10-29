// Vocabulaires et règles du Test A.
// Les identifiants suivent la taxonomie d'Open Food Facts (packagings : shape, material).
// Un identifiant inconnu est conservé tel quel et rattaché à une famille par familiaDe().
// Les identifiants internes (catégories, sources, causes) restent stables pour garder la compatibilité des sauvegardes.

// Rayons : section principale → sous-section. r.categoria garde l'identifiant de la sous-section.
export const SECCIONES = [
  { id: 'alimentation', label: 'Alimentation et boissons', subs: [
    ['fruits_legumes', 'Fruits et légumes'],
    ['viandes_poissons', 'Viandes, poissons et charcuterie'],
    ['laitiers', 'Produits laitiers, œufs et alternatives'],
    ['pain_petitdej', 'Pain, pâtisserie et petit-déjeuner'],
    ['epicerie_salee', 'Épicerie salée'],
    ['epicerie_sucree', 'Épicerie sucrée'],
    ['plats_surgeles', 'Plats préparés et surgelés'],
    ['boissons', 'Boissons'],
  ] },
  { id: 'hygiene', label: 'Hygiène, beauté et santé', subs: [
    ['hygiene_corporelle', 'Hygiène corporelle et intime'],
    ['beaute', 'Beauté et cosmétiques'],
    ['sante', 'Santé et parapharmacie'],
  ] },
  { id: 'maison', label: 'Maison et entretien', subs: [
    ['nettoyage', 'Nettoyage, lessive et vaisselle'],
    ['papier_menager', 'Papier et consommables ménagers'],
    ['cuisine_table', 'Cuisine, table et rangement'],
    ['linge_deco', 'Linge, décoration et mobilier'],
    ['electromenager', 'Électroménager et confort domestique'],
  ] },
  { id: 'bebe', label: 'Bébé et enfant', subs: [
    ['bebe_alim_hygiene', 'Alimentation et hygiène bébé'],
    ['puericulture', 'Puériculture et équipement enfant'],
    ['jouets', 'Jouets et éveil'],
  ] },
  { id: 'animaux_vegetal', label: 'Animaux et végétal', subs: [
    ['animaux_alim', 'Alimentation animale'],
    ['animaux_soins', 'Soins et accessoires animaux'],
    ['fleurs_plantes', 'Fleurs et plantes'],
  ] },
  { id: 'mode', label: 'Mode et accessoires', subs: [
    ['vetements', 'Vêtements'],
    ['chaussures_bijoux', 'Chaussures, bijoux et accessoires'],
    ['bagagerie', 'Bagagerie et voyage'],
  ] },
  { id: 'equipement', label: 'Équipement, mobilité et loisirs', subs: [
    ['high_tech', 'High-tech et multimédia'],
    ['bricolage', 'Bricolage et outillage'],
    ['jardin', 'Jardin et extérieur'],
    ['auto_moto', 'Auto, moto et mobilité'],
    ['sport', 'Sport, camping et plein air'],
    ['culture_papeterie', 'Culture, papeterie et jeux'],
  ] },
];
// Liste plate des sous-sections, chacune avec sa section.
export const CATEGORIAS = SECCIONES.flatMap((s) => s.subs.map(([id, label]) => ({ id, label, seccion: s.id })));
// Anciens rayons (versions ≤ 1.1) → sous-section ; '' = à choisir.
export const ALIAS_CATEGORIAS = {
  bebidas: 'boissons', lacteos: 'laitiers', snacks: 'epicerie_sucree', conservas: 'epicerie_salee', otros: '',
  cremerie: 'laitiers', fromagerie: 'laitiers', charcuterie: 'viandes_poissons', boucherie: 'viandes_poissons',
  boulangerie: 'pain_petitdej', surgeles: 'plats_surgeles', hygiene: 'hygiene_corporelle', entretien: 'nettoyage',
  animaux: 'animaux_alim', autre: '',
};
export const normalizarRayon = (id) => (Object.hasOwn(ALIAS_CATEGORIAS, id || '') ? ALIAS_CATEGORIAS[id]
  : CATEGORIAS.some((c) => c.id === id) ? id : '');
export const seccionDe = (id) => CATEGORIAS.find((c) => c.id === id)?.seccion || '';
export const labelRayon = (id) => {
  const c = CATEGORIAS.find((x) => x.id === id);
  return c ? `${SECCIONES.find((s) => s.id === c.seccion).label} › ${c.label}` : '';
};

// Catégories Open Facts → sous-section. On parcourt les catégories du produit de la plus précise
// (fin de la liste) à la plus générale ; « surgelé » l'emporte car c'est un rayon à part en magasin.
const RAYON_DE_CATEGORIE = Object.fromEntries(Object.entries({
  fruits_legumes: 'fruits vegetables fresh-fruits fresh-vegetables potatoes salads',
  viandes_poissons: 'meats poultries fishes seafood prepared-meats hams sausages smoked-fishes',
  laitiers: 'dairies cheeses yogurts milks butters creams eggs fermented-milk-products dairy-substitutes plant-based-milk-alternatives dairy-desserts',
  pain_petitdej: 'breads viennoiseries pastries brioches breakfasts breakfast-cereals spreads sweet-spreads honeys jams coffees teas herbal-teas',
  epicerie_salee: 'pastas rices condiments sauces canned-foods salty-snacks appetizers crisps soups vegetable-oils spices dried-legumes flours',
  epicerie_sucree: 'sweet-snacks biscuits-and-cakes biscuits cakes chocolates confectioneries candies sugars desserts cocoa-and-its-products',
  plats_surgeles: 'frozen-foods meals pizzas ice-creams frozen-desserts',
  boissons: 'beverages waters fruit-juices juices sodas carbonated-drinks alcoholic-beverages wines beers syrups',
  bebe_alim_hygiene: 'baby-foods baby-milks',
  animaux_alim: 'pet-food dog-food cat-food',
  hygiene_corporelle: 'shampoos shower-gels soaps toothpastes deodorants',
  nettoyage: 'cleaning-products detergents dishwashing-products laundry-detergents',
}).flatMap(([sub, tags]) => tags.split(' ').map((t) => [`en:${t}`, sub])));

export function sugerirRayon(product, base) {
  const tags = product?.categories_tags || [];
  if (tags.includes('en:frozen-foods')) return 'plats_surgeles';
  for (let i = tags.length - 1; i >= 0; i--) if (RAYON_DE_CATEGORIE[tags[i]]) return RAYON_DE_CATEGORIE[tags[i]];
  if (base === 'obf') return 'beaute';
  return '';
}

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
