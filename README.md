# Resser · bêta tickets de caisse

Version bêta de l'application Resser (Test A, étude de faisabilité Grand Nancy), séparée de la version stable (`Caceres96/resser-app`) pour pouvoir essayer la lecture des tickets sans risque.

- Bêta : https://caceres96.github.io/resser-app-v2/
- Stable : https://caceres96.github.io/resser-app/

## Ce qui change par rapport à la version stable

**Onglet « Ticket »** : photo du ticket, ou ticket PDF envoyé par l'enseigne → lecture locale → une carte par article. Un PDF avec texte est lu directement (pdf.js, exact) ; un PDF scanné ou une photo passe par l'OCR (Tesseract.js, français), et la date et l'enseigne détectées sont alors à vérifier.

- **Reconnu** (libellé déjà appris) → « Ajouter l'achat » : la fiche du produit est reprise telle quelle, avec la date et l'enseigne du ticket, et un achat est ajouté au Journal.
- **À confirmer** (nom proche) → « Oui, c'est ça » ajoute l'achat et mémorise le libellé.
- **Inconnu** → « Scanner ce produit » : à l'enregistrement de la fiche, le libellé du ticket est mémorisé ; le prochain ticket le reconnaîtra.

Un produit peut avoir plusieurs libellés (un par enseigne), séparés par « | » dans la colonne `libelle_ticket`. Date et enseigne sont détectées sur le ticket quand c'est possible et restent modifiables. La photo du ticket n'est ni conservée ni envoyée : seules les lignes d'articles le sont.

## Isolation de la version stable

Les deux versions partagent l'origine `caceres96.github.io` :

- stockage local séparé (`resser.v2` au lieu de `resser.pruebaA.v1`) ; au premier lancement, le nom, la clé et le contexte sont repris en lecture seule ;
- caches du service worker préfixés `resser-v2-`, jamais effacés par la bêta ;
- même feuille Google que la version stable (catalogue et libellés partagés) ; les fiches envoyées portent `version_app = 1.0.0-beta`.

Le catalogue de l'équipe utilisé pour reconnaître les lignes vient de `?accion=lista` (Apps Script, `google-apps-script/Code.gs`). Tant que cette version du script n'est pas déployée, seuls les produits présents sur le téléphone sont reconnus.

## Lancer en local

```bash
python -m http.server 8643 --bind 127.0.0.1
```

Le reste (scanner, fiche, synchronisation, tableau de bord) est identique à la version stable : voir son README.
