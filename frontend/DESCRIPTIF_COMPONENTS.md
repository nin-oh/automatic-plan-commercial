# Descriptif des composants frontend

Ce document detaille chaque composant React du frontend Amafin, organise par niveau de granularite.

## Atoms

### `Button`

- Fichier : `packages/ui/src/atoms/Button/Button.tsx`
- Role : bouton reutilisable pour toutes les actions de l'application.
- Utilisation principale : soumission de formulaires, ajout de lignes, suppression, navigation.
- Props :
  - `variant` : style du bouton (`primary`, `secondary`, `success`, `danger`, `warning`, `info`, `ghost`).
  - `size` : taille (`xs`, `sm`, `md`, `lg`, `xl`).
  - `loading` : affiche un Spinner a la place du contenu.
  - `icon` : element affiche avant le texte.
  - `fullWidth` : etire le bouton sur toute la largeur.
  - `disabled` : desactive le bouton.
  - toutes les props HTML natives de `<button>`.

### `IconButton`

- Fichier : `packages/ui/src/atoms/IconButton/IconButton.tsx`
- Role : bouton contenant uniquement une icone.
- Utilisation principale : actions compactes dans la navbar et les tableaux.
- Props :
  - `icon` : element icone a afficher.
  - `variant` : style visuel (memes variantes que Button).
  - `size` : taille du bouton.
  - `aria-label` : libelle accessible (obligatoire).

### `Input`

- Fichier : `packages/ui/src/atoms/Input/Input.tsx`
- Role : champ de saisie standard avec icones et gestion d'erreur.
- Utilisation principale : tous les formulaires et l'edition inline des cellules.
- Props :
  - `size` : taille du champ (`sm`, `md`, `lg`).
  - `error` : active le style d'erreur (bordure rouge).
  - `iconLeft` : contenu affiche a gauche du champ.
  - `iconRight` : contenu affiche a droite du champ.
  - `fullWidth` : etire le champ sur toute la largeur.
  - toutes les props HTML natives de `<input>`.

### `Select`

- Fichier : `packages/ui/src/atoms/Select/Select.tsx`
- Role : liste deroulante avec options typees.
- Utilisation principale : selection de devise, societe, banque, type de document.
- Props :
  - `choices` : liste d'options au format `{value, label}`.
  - `size` : taille du select.
  - `error` : active le style d'erreur.
  - `placeholder` : texte de la premiere option vide.
  - `fullWidth` : etire sur toute la largeur.

### `Checkbox`

- Fichier : `packages/ui/src/atoms/Checkbox/Checkbox.tsx`
- Role : case a cocher avec label optionnel.
- Utilisation principale : champs booleen (debit, libere).
- Props :
  - `label` : texte affiche a cote de la case.
  - `size` : echelle de la case.

### `DatePicker`

- Fichier : `packages/ui/src/atoms/DatePicker/DatePicker.tsx`
- Role : champ de date base sur Input avec `type="date"`.
- Utilisation principale : selection de dates d'echeance, de debit, de paiement.
- Props :
  - `size`, `error`, `fullWidth` : memes props que Input.

### `Badge`

- Fichier : `packages/ui/src/atoms/Badge/Badge.tsx`
- Role : pastille coloree pour afficher un statut ou un compteur.
- Utilisation principale : nombre de resultats, statuts dans les tableaux.
- Props :
  - `children` : contenu du badge.
  - `variant` : tonalite visuelle (`primary`, `success`, `danger`, etc.).
  - `size` : taille du badge.

### `Tag`

- Fichier : `packages/ui/src/atoms/Tag/Tag.tsx`
- Role : chip colore avec bouton de suppression optionnel.
- Utilisation principale : affichage des devises (EUR, MAD, USD), priorites (P0, P1, P2).
- Props :
  - `children` : texte du tag.
  - `color` : couleur de fond.
  - `textColor` : couleur du texte.
  - `onRemove` : callback de suppression (affiche le bouton X).

### `Spinner`

- Fichier : `packages/ui/src/atoms/Spinner/Spinner.tsx`
- Role : indicateur de chargement anime.
- Utilisation principale : etat de chargement dans les boutons et les tableaux.
- Props :
  - `size` : taille de l'animation.

### `Text`

- Fichier : `packages/ui/src/atoms/Text/Text.tsx`
- Role : texte stylise avec controle precis du rendu.
- Utilisation principale : labels, descriptions, valeurs secondaires.
- Props :
  - `size` : taille du texte (`xs` a `xl`).
  - `weight` : graisse (`normal`, `medium`, `semibold`, `bold`).
  - `color` : couleur personnalisee.
  - `muted` : applique la couleur attenuee.
  - `as` : element HTML (`span`, `p`, `div`, `label`).

### `Heading`

- Fichier : `packages/ui/src/atoms/Heading/Heading.tsx`
- Role : titres h1 a h6 avec tailles automatiques.
- Utilisation principale : titres de pages, sections, cartes.
- Props :
  - `level` : niveau de titre (1 a 6).
  - `children` : contenu du titre.

### `Icon`

- Fichier : `packages/ui/src/atoms/Icon/Icon.tsx`
- Role : conteneur d'icone avec dimensionnement et couleur.
- Utilisation principale : encapsulation d'icones SVG ou Bootstrap Icons.
- Props :
  - `children` : element icone (SVG ou composant).
  - `size` : taille du conteneur.
  - `color` : couleur de l'icone.

### `CurrencyDisplay`

- Fichier : `packages/ui/src/atoms/CurrencyDisplay/CurrencyDisplay.tsx`
- Role : formate un nombre en format comptable avec separateurs de milliers.
- Utilisation principale : affichage des montants dans les tableaux et les cartes KPI.
- Props :
  - `value` : valeur numerique a formater.
  - `locale` : locale de formatage (defaut `fr-MA`).
  - `currency` : code devise pour le symbole.
  - `showCurrency` : affiche le symbole de devise.
  - `decimals` : nombre de decimales (defaut 2).
  - `colorize` : colore en vert (positif) ou rouge (negatif).

### `DateDisplay`

- Fichier : `packages/ui/src/atoms/DateDisplay/DateDisplay.tsx`
- Role : formate une date pour l'affichage.
- Utilisation principale : colonnes de date dans les tableaux.
- Props :
  - `value` : date (string ou objet Date).
  - `format` : mode d'affichage (`short`, `long`, `iso`).
  - `locale` : locale (defaut `fr-FR`).

### `PercentDisplay`

- Fichier : `packages/ui/src/atoms/PercentDisplay/PercentDisplay.tsx`
- Role : formate un nombre en pourcentage.
- Utilisation principale : taux d'interet, volatilite FX.
- Props :
  - `value` : valeur numerique.
  - `decimals` : nombre de decimales.
  - `colorize` : colore selon le signe.

### `ProgressBar`

- Fichier : `packages/ui/src/atoms/ProgressBar/ProgressBar.tsx`
- Role : barre de progression coloree.
- Utilisation principale : consommation des lignes Finex et Escompte.
- Props :
  - `value` : valeur actuelle.
  - `max` : valeur maximale (defaut 100).
  - `color` : couleur de la barre.
  - `height` : hauteur en pixels.
  - `showLabel` : affiche le pourcentage.

### `StatusDot`

- Fichier : `packages/ui/src/atoms/StatusDot/StatusDot.tsx`
- Role : point de statut colore avec label optionnel.
- Utilisation principale : indicateurs de statut en ligne.
- Props :
  - `status` : etat (`active`, `inactive`, `warning`, `error`).
  - `label` : texte a cote du point.

### `EmptyState`

- Fichier : `packages/ui/src/atoms/EmptyState/EmptyState.tsx`
- Role : message affiche quand un tableau n'a pas de donnees.
- Utilisation principale : SmartTable vide.
- Props :
  - `message` : texte affiche (defaut "Aucune donnee").
  - `icon` : icone optionnelle.
  - `action` : bouton ou lien d'action.

### `Skeleton`

- Fichier : `packages/ui/src/atoms/Skeleton/Skeleton.tsx`
- Role : placeholder de chargement avec animation pulse.
- Utilisation principale : remplacement temporaire pendant le chargement des donnees.
- Props :
  - `width`, `height` : dimensions.
  - `borderRadius` : arrondi.

### `Tooltip`

- Fichier : `packages/ui/src/atoms/Tooltip/Tooltip.tsx`
- Role : bulle d'information affichee au survol.
- Utilisation principale : aide contextuelle sur les icones et les boutons.
- Props :
  - `children` : element qui declenche le tooltip.
  - `content` : texte du tooltip.
  - `position` : placement (`top`, `bottom`, `left`, `right`).

### `Divider`

- Fichier : `packages/ui/src/atoms/Divider/Divider.tsx`
- Role : separateur visuel horizontal ou vertical.
- Props :
  - `vertical` : orientation verticale.
  - `color` : couleur du trait.
  - `spacing` : marge autour du separateur.

### `Avatar`

- Fichier : `packages/ui/src/atoms/Avatar/Avatar.tsx`
- Role : avatar utilisateur avec image ou initiales generees.
- Utilisation principale : identification visuelle dans la navbar.
- Props :
  - `name` : nom complet (les initiales sont extraites automatiquement).
  - `src` : URL d'image optionnelle.
  - `size` : taille de l'avatar.

## Molecules

### `FormField`

- Fichier : `packages/ui/src/molecules/FormField/FormField.tsx`
- Role : groupe un label, un champ et un message d'erreur ou d'aide.
- Utilisation principale : construction des formulaires d'ajout et d'edition.
- Props :
  - `label` : texte du label.
  - `htmlFor` : lien vers l'id du champ.
  - `error` : message d'erreur (rouge).
  - `helpText` : texte d'aide (gris).
  - `required` : affiche l'asterisque.
  - `children` : champ de formulaire.

### `SearchInput`

- Fichier : `packages/ui/src/molecules/SearchInput/SearchInput.tsx`
- Role : champ de recherche avec icone et bouton de nettoyage.
- Utilisation principale : barre de recherche dans le SmartTable.
- Props :
  - `value` : texte de recherche actuel.
  - `onChange` : callback a chaque modification.
  - `placeholder` : texte d'indication (defaut "Rechercher...").
  - `size`, `fullWidth`.

### `EditableCell`

- Fichier : `packages/ui/src/molecules/EditableCell/EditableCell.tsx`
- Role : cellule de tableau avec bascule lecture/edition au double-clic.
- Utilisation principale : edition inline dans le SmartTable.
- Props :
  - `value` : valeur actuelle.
  - `type` : type de champ (`text`, `number`, `date`, `select`, `checkbox`).
  - `choices` : options pour les champs select.
  - `editable` : autorise l'edition.
  - `format` : format d'affichage (`currency`, `percent`, `plain`).
  - `locale` : locale pour le formatage.
  - `onSave` : callback appelee a la sauvegarde.
- Comportement : double-clic pour editer, Entree pour sauvegarder, Echap pour annuler.

### `SortHeader`

- Fichier : `packages/ui/src/molecules/SortHeader/SortHeader.tsx`
- Role : entete de colonne cliquable avec indicateur de tri.
- Utilisation principale : tri des colonnes dans le SmartTable.
- Props :
  - `label` : nom de la colonne.
  - `active` : colonne actuellement triee.
  - `direction` : sens du tri (`asc`, `desc`, `null`).
  - `onClick` : callback au clic.

### `Pagination`

- Fichier : `packages/ui/src/molecules/Pagination/Pagination.tsx`
- Role : navigation entre les pages de resultats.
- Utilisation principale : pied de tableau du SmartTable.
- Props :
  - `page` : page actuelle.
  - `totalPages` : nombre total de pages.
  - `onChange` : callback de changement de page.

### `PageSizeSelector`

- Fichier : `packages/ui/src/molecules/PageSizeSelector/PageSizeSelector.tsx`
- Role : selecteur du nombre de lignes affichees par page.
- Utilisation principale : barre d'outils du SmartTable.
- Props :
  - `value` : taille actuelle.
  - `options` : choix disponibles (defaut [10, 25, 50, 100]).
  - `onChange` : callback de changement.

### `StatCard`

- Fichier : `packages/ui/src/molecules/StatCard/StatCard.tsx`
- Role : carte KPI avec fond colore, titre et valeur formatee.
- Utilisation principale : indicateurs du dashboard (Solde Courant, Gap P0, etc.).
- Props :
  - `title` : libelle de l'indicateur.
  - `value` : valeur numerique ou texte.
  - `format` : format d'affichage (`currency`, `percent`, `plain`).
  - `color` : couleur de fond (hex).
  - `icon` : icone optionnelle.
  - `trend` : tendance optionnelle avec direction et pourcentage.

### `StatCardGroup`

- Fichier : `packages/ui/src/molecules/StatCard/StatCard.tsx`
- Role : grille responsive de StatCards.
- Utilisation principale : rangee de KPIs en haut du dashboard.
- Props :
  - `children` : ensemble de StatCards.

### `Toast`

- Fichier : `packages/ui/src/molecules/Toast/Toast.tsx`
- Role : notification temporaire en bas a droite de l'ecran.
- Utilisation principale : retour utilisateur apres une action (ajout, modification, suppression).
- Props :
  - `message` : texte du message.
  - `type` : tonalite (`success`, `error`, `warning`, `info`).
  - `onClose` : callback de fermeture.
  - `duration` : duree d'affichage en millisecondes (defaut 3000).

## Organisms

### `SmartTable`

- Fichier : `packages/ui/src/organisms/SmartTable/SmartTable.tsx`
- Role : tableau generique complet remplacant `smart_table.js` et jQuery DataTables.
- Utilisation principale : toutes les pages de donnees (factures, paiements, incomes, etc.).
- Props :
  - `columns` : definitions des colonnes au format `ColumnDef[]`.
  - `data` : lignes de donnees.
  - `label` : titre du tableau.
  - `headerColor` : couleur de fond de l'entete.
  - `idField` : nom du champ identifiant (defaut "id").
  - `locale` : locale pour le formatage (defaut "fr-MA").
  - `onCellEdit` : callback d'edition d'une cellule.
  - `onRowAdd` : callback d'ajout d'une ligne.
  - `onRowDelete` : callback de suppression d'une ligne.
  - `searchable` : active la barre de recherche.
  - `sortable` : active le tri par colonne.
  - `paginated` : active la pagination.
  - `pageSize` : taille de page par defaut.
  - `loading` : affiche l'etat de chargement.
- Fonctionnalites integrees : recherche textuelle, tri multi-colonnes, pagination, selection du nombre de lignes, edition inline, ajout de ligne, suppression, colonnes editables (fond blanc) vs lecture seule (fond bleu clair), etat vide.

## Layouts

### `AppShell`

- Fichier : `packages/ui/src/layouts/AppShell/AppShell.tsx`
- Role : structure principale de l'application combinant sidebar, navbar et zone de contenu.
- Utilisation principale : enveloppe toutes les pages dans `App.tsx`.
- Props :
  - `sidebarSections` : sections et items de navigation.
  - `sidebarLogo` : element logo affiche en haut de la sidebar.
  - `navbarActions` : actions affichees dans la navbar.
  - `userName` : nom de l'utilisateur connecte.
  - `onLogout` : callback de deconnexion.
  - `activePath` : chemin actif pour la surbrillance sidebar.
  - `onNavigate` : callback de navigation.
  - `children` : contenu de la page.

### `Sidebar`

- Fichier : `packages/ui/src/layouts/Sidebar/Sidebar.tsx`
- Role : navigation laterale fixe avec collapse anime.
- Utilisation principale : menu principal de l'application.
- Props :
  - `sections` : liste de sections avec titre optionnel et items (`{label, path, icon}`).
  - `logo` : element logo.
  - `collapsed` : etat replie.
  - `onToggle` : callback du bouton de collapse.
  - `activePath` : chemin actif.
  - `onNavigate` : callback de navigation.
- Style : fond sombre avec gradient (#0f2027 → #142b38 → #1a3a4a), largeur 270px (70px replie), icones Bootstrap Icons, barre bleue laterale sur l'item actif.

### `Navbar`

- Fichier : `packages/ui/src/layouts/Navbar/Navbar.tsx`
- Role : barre superieure fixe avec navigation et actions.
- Utilisation principale : header de toutes les pages.
- Props :
  - `onLogout` : callback de deconnexion.
  - `sidebarCollapsed` : ajuste la marge gauche selon l'etat de la sidebar.
- Style : fond rouge avec gradient (#dc3545 → #c82333), ombre coloree, liens avec animation de soulignement au survol, bouton capture, date du jour, icones messages/notifications, bouton deconnexion.

## Composants les plus structurants

- `AppShell` : donne la structure globale de l'application (equivalent de `DashboardLayout` du frontend-intern).
- `Sidebar` : pilote la navigation entre les pages (equivalent de `SidebarNav` du frontend-intern).
- `SmartTable` : mutualise l'affichage et l'edition des donnees tabulaires (equivalent de `DataTable` du frontend-intern, mais avec edition inline, tri et pagination integres).
- `EditableCell` : porte la logique d'edition inline des cellules.
- `StatCard` : normalise l'affichage des KPIs (equivalent de `MetricCard` du frontend-intern).

## Correspondance avec le frontend-intern

| frontend-intern | frontend (notre projet) | Difference |
|----------------|------------------------|------------|
| `atoms/Avatar.jsx` | `atoms/Avatar/Avatar.tsx` | TypeScript, plus de props (src image) |
| `atoms/Badge.jsx` | `atoms/Badge/Badge.tsx` | 7 variantes au lieu de 3 |
| `atoms/Button.jsx` | `atoms/Button/Button.tsx` | 7 variantes, 5 tailles, loading state |
| `atoms/Icon.jsx` | `atoms/Icon/Icon.tsx` | Wrapper generique, icones via Bootstrap Icons CDN |
| `atoms/Input.jsx` | `atoms/Input/Input.tsx` | Icones gauche/droite, etat erreur |
| `atoms/Select.jsx` | `atoms/Select/Select.tsx` | Options typees (Choice[]), placeholder |
| `molecules/MetricCard.jsx` | `molecules/StatCard/StatCard.tsx` | Gradient, format currency, tendance |
| `molecules/EditableNumberCell.jsx` | `molecules/EditableCell/EditableCell.tsx` | Multi-type (text, number, date, select, checkbox) |
| `molecules/PageHeader.jsx` | `atoms/Heading/Heading.tsx` | Simplifie, pas de breadcrumb |
| `organisms/DataTable.jsx` | `organisms/SmartTable/SmartTable.tsx` | Tri, recherche, pagination, edition inline integres |
| `organisms/KpiGrid.jsx` | `molecules/StatCard/StatCardGroup` | Grille CSS responsive |
| `organisms/Navbar.jsx` | `layouts/Navbar/Navbar.tsx` | Design Amafin (rouge), liens specifiques |
| `organisms/SidebarNav.jsx` | `layouts/Sidebar/Sidebar.tsx` | Design Amafin (sombre), Bootstrap Icons |
| `templates/DashboardLayout.jsx` | `layouts/AppShell/AppShell.tsx` | Gere le collapse, combine sidebar+navbar |
| `tokens/theme.js` | `theme/tokens.css` | CSS variables au lieu de JS, plus complet |
| `config/api.js` | `api/client.ts` | Axios au lieu de fetch, CSRF auto, token support |
| Pas d'equivalent | `atoms/CurrencyDisplay` | Formatage comptable fr-MA |
| Pas d'equivalent | `atoms/DateDisplay` | Formatage de dates |
| Pas d'equivalent | `atoms/ProgressBar` | Barre de progression |
| Pas d'equivalent | `atoms/Tooltip` | Bulle d'information |
| Pas d'equivalent | `atoms/Skeleton` | Placeholder de chargement |
| Pas d'equivalent | `molecules/Toast` | Notifications temporaires |
| Pas d'equivalent | `molecules/SearchInput` | Barre de recherche |
| Pas d'equivalent | `molecules/Pagination` | Navigation entre pages |

## Resume

Les composants sont organises en 4 niveaux (atoms, molecules, organisms, layouts) dans une bibliotheque separee (`@amafin/ui`) reutilisable par n'importe quel projet. L'application Amafin (`apps/amafin`) ne contient que la logique metier : configuration de la navigation, appels API et pages connectant les composants aux donnees. Cette separation facilite la maintenance, la coherence visuelle et l'ajout de nouvelles pages sans dupliquer l'interface. Le SmartTable centralise toute la logique tabulaire, ce qui reduit chaque nouvelle page CRUD a environ 40 lignes de code.
