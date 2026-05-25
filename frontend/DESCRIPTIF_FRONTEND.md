# Descriptif du frontend

Ce document decrit les elements principaux du frontend React/Vite Amafin, leur role et leur place dans l'architecture.

## Vue d'ensemble

Le frontend est organise en monorepo avec deux projets :

- `packages/ui/` : bibliotheque de composants reutilisables (`@amafin/ui`). Ne contient aucune logique metier Amafin. Peut etre utilisee dans n'importe quel projet futur.
- `apps/amafin/` : application Amafin qui consomme `@amafin/ui` et connecte les composants aux APIs Django.

L'architecture des composants suit l'approche atomic design :

- `atoms/` : composants UI tres simples et reutilisables (bouton, input, badge...).
- `molecules/` : combinaisons de plusieurs atomes (champ editable, pagination, carte KPI...).
- `organisms/` : blocs fonctionnels complets (SmartTable, tableau avec tri/filtre/edition inline).
- `layouts/` : structures de page (AppShell avec sidebar + navbar + contenu).
- `hooks/` : logique reutilisable sans UI (a venir : undo/redo, draft state...).
- `theme/` : variables CSS du design system (couleurs, espacements, typographie).
- `types/` : definitions TypeScript partagees (ColumnDef, Choice, FieldMeta).

## Stack technique

- **React** 19.0 avec TypeScript
- **Vite** 6.0 comme outil de build
- **pnpm** comme gestionnaire de paquets (monorepo workspaces)
- **Axios** pour les appels API
- **Zustand** pour la gestion d'etat (planification)
- **React Router** 7.0 pour la navigation
- **CSS Modules** pour le style isole des composants
- **recharts** pour les graphiques (a venir)

## Entree de l'application

- `apps/amafin/index.html` : squelette HTML. Charge Bootstrap Icons et la police Quicksand depuis Google Fonts.
- `apps/amafin/src/main.tsx` : point d'entree React. Monte l'application dans `#root`.
- `apps/amafin/src/App.tsx` : composant racine. Configure le routeur React Router, enveloppe toutes les pages dans `AppShell` (sidebar + navbar), et gere la navigation.
- `apps/amafin/src/config/navigation.ts` : definition des sections et items de la sidebar avec leurs icones Bootstrap Icons.

## Configuration et theming

- `packages/ui/src/theme/tokens.css` : centralise toutes les variables CSS (couleurs, espacements, ombres, rayons, tailles de texte, dimensions du layout). Equivalent du fichier `tokens/theme.js` du frontend-intern.
- `packages/ui/src/theme/reset.css` : reset CSS pour uniformiser le rendu entre navigateurs.
- `packages/ui/src/types/common.ts` : types partages (ID, Size, ColorVariant, SortDirection).
- `packages/ui/src/types/fields.ts` : types pour les colonnes de tableau et metadonnees de champs, alignes avec le format retourne par les endpoints Django `/form_options/`.
- `packages/ui/src/global.d.ts` : declarations TypeScript pour les imports CSS Modules.

## Configuration API

- `apps/amafin/src/api/client.ts` : client Axios configure avec token CSRF automatique, gestion des erreurs 401/403 (redirection vers `/login/`), et support du cookie de session.
- `apps/amafin/src/api/incomes.ts` : fonctions API pour `/api/incomes/` (fetch, create, update, delete).
- `apps/amafin/vite.config.ts` : proxy Vite qui redirige `/api/*` et `/static/*` vers Django (port 8000) pendant le developpement.

## Atoms

- `atoms/Button/` : bouton reutilisable avec 7 variantes visuelles (`primary`, `secondary`, `success`, `danger`, `warning`, `info`, `ghost`), 5 tailles, mode chargement et icone optionnelle.
- `atoms/IconButton/` : bouton contenant uniquement une icone, avec `aria-label` obligatoire pour l'accessibilite.
- `atoms/Input/` : champ de saisie avec icones gauche/droite, etat d'erreur et plusieurs tailles.
- `atoms/Select/` : liste deroulante stylisee avec placeholder et options typees (`Choice[]`).
- `atoms/Checkbox/` : case a cocher avec label et taille variable.
- `atoms/DatePicker/` : champ de date base sur `Input` avec `type="date"`.
- `atoms/Badge/` : pastille coloree pour afficher un statut ou un compteur.
- `atoms/Tag/` : chip colore avec bouton de suppression optionnel. Utilise pour les devises (EUR, MAD) et les priorites (P0, P1).
- `atoms/Spinner/` : indicateur de chargement anime en SVG.
- `atoms/Text/` : texte stylise avec controle de taille, poids, couleur et variante `muted`.
- `atoms/Heading/` : titres h1 a h6 avec tailles automatiques.
- `atoms/Icon/` : conteneur d'icone avec taille et couleur configurables.
- `atoms/CurrencyDisplay/` : formate un nombre en format comptable (locale `fr-MA`, separateurs de milliers). Supporte la colorisation positive/negative.
- `atoms/DateDisplay/` : formate une date en format court, long ou ISO.
- `atoms/PercentDisplay/` : formate un nombre en pourcentage.
- `atoms/ProgressBar/` : barre de progression coloree avec label optionnel.
- `atoms/StatusDot/` : point de statut colore (active, inactive, warning, error) avec label.
- `atoms/EmptyState/` : placeholder affiche quand un tableau n'a pas de donnees.
- `atoms/Skeleton/` : placeholder de chargement avec animation pulse.
- `atoms/Tooltip/` : bulle d'information au survol avec positionnement configurable.
- `atoms/Divider/` : separateur horizontal ou vertical.
- `atoms/Avatar/` : avatar utilisateur avec image ou initiales generees automatiquement.

## Molecules

- `molecules/FormField/` : groupe label + champ + message d'erreur + texte d'aide. Indicateur obligatoire (`*`).
- `molecules/SearchInput/` : champ de recherche avec icone loupe, bouton de nettoyage et debounce.
- `molecules/EditableCell/` : cellule de tableau editable. Double-clic pour basculer en mode edition, Echap pour annuler, Entree pour sauvegarder. Detecte automatiquement le type de champ (texte, nombre, date, select, checkbox) et affiche le composant d'edition adapte.
- `molecules/SortHeader/` : entete de colonne cliquable avec fleche de tri (ascendant/descendant/neutre).
- `molecules/Pagination/` : navigation entre pages (Precedent / Page N / Suivant).
- `molecules/PageSizeSelector/` : selecteur "Afficher 10 / 25 / 50 / 100" pour le nombre de lignes par page.
- `molecules/StatCard/` : carte KPI affichant un titre, une valeur formatee et une couleur de fond. Utilisee pour les indicateurs du dashboard (Solde Courant, Gap P0, etc.).
- `molecules/StatCardGroup/` : grille responsive de StatCards.
- `molecules/Toast/` : notification temporaire en bas a droite (succes/erreur/warning/info) avec fermeture automatique.

## Organisms

- `organisms/SmartTable/` : tableau complet remplacant `smart_table.js` et jQuery DataTables. Fonctionnalites : recherche, tri multi-colonnes, pagination, selection du nombre de lignes, edition inline par double-clic, ajout de ligne, suppression, colonnes editables vs lecture seule avec couleurs distinctes, etat vide et etat de chargement.

## Layouts

- `layouts/AppShell/` : structure principale de l'application. Combine `Sidebar` + `Navbar` + zone de contenu. Gere l'etat collapse/expand de la sidebar.
- `layouts/Sidebar/` : navigation laterale fixe (270px, 70px collapse). Fond sombre (#142b38) avec gradient. Sections titrées, icones Bootstrap Icons, etat actif avec barre bleue laterale. Animation fluide de collapse.
- `layouts/Navbar/` : barre superieure fixe rouge (#dc3545) avec gradient. Liens de navigation (Home, Achats, Financements, Escomptes, Payments), bouton capture, date du jour, icones messages/notifications, bouton deconnexion.

## Pages metier

- `pages/Home.tsx` : dashboard principal avec 5 cartes KPI (Solde Courant, Encaissement Prevu, Total P0, Finex et autres, Gap P0), emplacements pour les graphiques (18 semaines, 7 jours, Escompte ring, Finex ring) et tableau des engagements prioritaires.
- `pages/Incomes.tsx` : page des encaissements. Charge les metadonnees depuis `/api/incomes/form_options/` et les donnees depuis `/api/incomes/`. Affiche un SmartTable avec edition inline, ajout et suppression. Notifications Toast pour les retours utilisateur.

## Connexion avec Django

- Le frontend React ne remplace pas les templates Django existants. Les deux coexistent :
  - `http://localhost:8000/` → templates Django (inchange)
  - `http://localhost:8000/react/` → application React
  - `http://localhost:5174/react/` → serveur de developpement Vite (hot reload)
- Toutes les donnees transitent par les endpoints `/api/*` de Django REST Framework.
- L'authentification fonctionne par cookie de session (navigateur) ou par token (`Authorization: Token xxx`) pour les outils externes.
- Le proxy Vite redirige `/api/*`, `/static/*`, `/login/` et `/logout/` vers Django pendant le developpement.

## Ce qui reste a construire

### Composants manquants dans `@amafin/ui`

- `MetaForm` : formulaire genere dynamiquement a partir des metadonnees `/form_options/`.
- `DonutChart`, `BarChart`, `StackedBarChart` : graphiques pour le dashboard.
- `MatrixGrid` : grille editable societe x banque pour la page Soldes.
- `KanbanBoard` + `KanbanCard` : tableau Kanban drag-and-drop pour la planification.
- `DataCard` : carte generique avec entete et contenu.
- `ColumnFilter` : filtre par colonne dans SmartTable.
- `FileUpload` : import de fichiers (Excel).
- `ConfirmDialog` : modale de confirmation.
- `DropdownMenu` : menu contextuel.
- `ProgressGroup` : barre de progression avec label et valeur.
- `DateRangePicker`, `SelectField`, `DateField` : variantes enrichies des atomes.

### Hooks manquants

- `useUndoRedo` : pile undo/redo generique pour la planification.
- `useDraftState` : pattern draft → commit.
- `useFetch` : chargement de donnees avec etats loading/error.
- `useDebounce` : delai sur la saisie de recherche.
- `useClickOutside` : fermeture des dropdowns au clic exterieur.
- `useKeyboard` : raccourcis clavier (Ctrl+Z undo).

### Pages manquantes dans `apps/amafin`

- Factures, Payments (tous types), Impots, Salaires, Financement, Escomptes, FX, Banks, Soldes, Balance Agee, Planification.
- Dashboard Home connecte aux vraies donnees via `/api/dashboard/`.

## Dossiers a ne pas modifier manuellement

- `node_modules/` : dependances installees par pnpm.
- `packages/ui/dist/` : build generee de la bibliotheque.
- `apps/amafin/dist/` : build generee de l'application.

## Commandes

```bash
# Installer les dependances (premiere fois ou apres un pull)
cd frontend && pnpm install

# Lancer le serveur de developpement React
cd frontend/apps/amafin && pnpm dev

# Verifier les types TypeScript
cd frontend/apps/amafin && npx tsc --noEmit

# Build de production
cd frontend && pnpm build
```

## Resume rapide

Le frontend est organise en monorepo avec une bibliotheque de composants reutilisables (`@amafin/ui`) et une application metier (`apps/amafin`). Les composants suivent l'atomic design (atoms → molecules → organisms → layouts). Le SmartTable remplace `smart_table.js` et jQuery DataTables. L'AppShell reproduit le layout sidebar + navbar du Django existant. Toutes les donnees sont accessibles via les APIs JSON Django, y compris les KPIs du dashboard (`/api/dashboard/`), la balance agee (`/api/balance-agee/`) et la matrice des soldes (`/api/soldes/today/`). L'ajout de nouvelles pages suit un pattern simple de 40 lignes : creer les fonctions API, creer la page avec SmartTable, ajouter la route.
