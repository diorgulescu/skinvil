// SPDX-License-Identifier: GPL-3.0-only
import type { PaletteCategoryId } from '../core/palettes';
import type { StarterTemplateId } from '../core/starterSkins';
import type { FaceName, PartId } from '../core/uvMap';

export type Locale = 'ro' | 'en';

export interface TranslationStrings {
  appSubtitle: string;
  langToggleTooltip: string;

  // Header actions & 6 Starter Templates
  templatesBtn: string;
  templatesTooltip: string;
  templates: Record<StarterTemplateId, string>;

  skinNamePlaceholder: string;
  skinNameTooltip: string;
  saveWardrobeBtn: string;
  saveWardrobeTooltip: string;
  openWardrobeBtn: string;
  openWardrobeTooltip: string;
  forgeHeaderBtn: string;
  forgeHeaderTooltip: string;

  importPngBtn: string;
  importPngTooltip: string;
  exportPngBtn: string;
  exportPngTooltip: string;

  savedToastPrefix: string;
  savedToWardrobeToast: string;
  importedToast64: string;
  importedToastLegacy: string;
  importedToastHd: string;
  detectedSlimTag: string;
  detectedClassicTag: string;
  dropOverlayTitle: string;
  dropOverlaySub: string;

  // Wardrobe ("Vestiar") & .mcpack Forge Modal
  wardrobeTitle: string;
  wardrobeSubtitle: string;
  wardrobeSaveCurrentBtn: string;
  wardrobeSaveAsNewBtn: string;
  wardrobeImportIntoBtn: string;
  wardrobeEmptyState: string;
  wardrobeSelectAllBtn: string;
  wardrobeClearSelectionBtn: string;

  cardCheckTooltip: string;
  cardEditBtn: string;
  cardEditTooltip: string;
  cardDuplicateTooltip: string;
  cardRenameTooltip: string;
  cardDeleteTooltip: string;
  cardGeomToggleTooltip: string;

  trayTitle: string;
  trayPackNameLabel: string;
  trayPackNameDefault: string;
  traySelectedCount: (count: number) => string;
  trayUsingCurrentHint: string;
  forgeMcpackBtn: string;
  forgeMcpackTooltip: string;
  exportJavaPngsBtn: string;
  exportJavaPngsTooltip: string;
  forgedSuccessToast: string;
  exportedPngsToast: (count: number) => string;
  closeBtn: string;

  // History & Model
  undoBtn: string;
  undoTooltip: string;
  redoBtn: string;
  redoTooltip: string;

  modelClassic: string;
  modelClassicTooltip: string;
  modelSlim: string;
  modelSlimTooltip: string;

  toggle2DBtn: string;
  toggle2DTooltip: string;

  // Left Tools Panel
  paintLayerSectionTitle: string;
  paintLayerBase: string;
  paintLayerBaseTooltip: string;
  paintLayerOuter: string;
  paintLayerOuterTooltip: string;

  toolsSectionTitle: string;
  toolPencil: string;
  toolPencilTooltip: string;
  toolEraser: string;
  toolEraserTooltip: string;
  toolBucket: string;
  toolBucketTooltip: string;
  toolEyedropper: string;
  toolEyedropperTooltip: string;

  modifiersSectionTitle: string;
  modMirror: string;
  modMirrorTooltip: string;
  modNoise: string;
  modNoiseTooltip: string;

  eraserBaseOptionLabel: string;
  eraserModeSkin: string;
  eraserModeSkinTooltip: string;
  eraserModeClear: string;
  eraserModeClearTooltip: string;

  // Mini-mannequin visibility widget
  mannequinTitle: string;
  mannequinHint: string;
  baseLayerTitle: string;
  outerLayerTitle: string;
  toggleAllBaseTooltip: string;
  toggleAllOuterTooltip: string;
  allOn: string;
  allOff: string;

  // 3D Viewport Controls & Poses
  resetViewBtn: string;
  resetViewTooltip: string;

  poseStand: string;
  poseStandTooltip: string;
  poseWalk: string;
  poseWalkTooltip: string;
  poseAction: string;
  poseActionTooltip: string;
  poseSpread: string;
  poseSpreadTooltip: string;
  posePauseTooltip: string;
  posePlayTooltip: string;

  viewportHint: string;
  statusReady: string;

  // 2D Editor Panel
  editor2DTitle: string;
  editor2DUvGuides: string;
  editor2DUvGuidesTooltip: string;
  editor2DHint: string;

  // Right Color Workshop
  colorSectionTitle: string;
  hexInputTooltip: string;
  recentColorsTitle: string;
  palettesTitle: string;
  palettes: Record<PaletteCategoryId, string>;

  parts: Record<PartId, string>;
  faces: Record<FaceName, string>;
  layers: { base: string; outer: string };

  // About & GNU GPLv3 Legal Notices (Section 0 & 5d)
  aboutLicenseBtn: string;
  aboutLicenseTooltip: string;
  aboutModalTitle: string;
  aboutFreeSoftwareNotice: string;
  aboutNoWarrantyNotice: string;
  aboutMinecraftDisclaimer: string;
}

export const TRANSLATIONS: Record<Locale, TranslationStrings> = {
  ro: {
    appSubtitle: 'Atelier 3D de Skin-uri Voxel',
    langToggleTooltip: 'Schimbă limba instant (Română / Engleză)',

    templatesBtn: 'Șabloane (6)',
    templatesTooltip: 'Alege unul dintre cele 6 personaje de pornire 100% offline',
    templates: {
      explorer: 'Explorator Clasic (Steve)',
      adventurer: 'Aventurier Subțire (Alex)',
      knight: 'Cavaler Regal',
      astronaut: 'Astronaut Spațial',
      robot: 'Robot Cyber',
      blank: 'Pânză Goală (De la zero)',
    },

    skinNamePlaceholder: 'Numele personajului...',
    skinNameTooltip: 'Numele acestui skin pentru Vestiar și .mcpack',
    saveWardrobeBtn: 'Salvează',
    saveWardrobeTooltip: 'Salvează personajul curent în Vestiarul local',
    openWardrobeBtn: 'Vestiar',
    openWardrobeTooltip: 'Deschide Vestiarul cu skin-urile salvate și pachetul .mcpack',
    forgeHeaderBtn: '.mcpack',
    forgeHeaderTooltip: 'Făurește un pachet .mcpack pentru Minecraft Bedrock!',

    importPngBtn: 'Importă PNG',
    importPngTooltip: 'Încarcă sau trage un skin .png (64×64, 64×32 clasic sau 128×128 HD)',
    exportPngBtn: 'PNG',
    exportPngTooltip: 'Salvează rapid skin-ul curent ca fișier .png (Java / Bedrock)',

    savedToastPrefix: 'Fișier salvat:',
    savedToWardrobeToast: 'Salvat în Vestiar:',
    importedToast64: 'Skin 64×64 importat',
    importedToastLegacy: 'Skin clasic 64×32 convertit automat la 64×64',
    importedToastHd: 'Skin HD 128×128 importat',
    detectedSlimTag: 'detectat: Alex Subțire 3px',
    detectedClassicTag: 'detectat: Steve Clasic 4px',
    dropOverlayTitle: 'Eliberează fișierul .PNG aici!',
    dropOverlaySub: 'Suportă skin-uri 64×64, 64×32 (conversie automată) și 128×128 HD',

    wardrobeTitle: 'Vestiarul Meu & Făuritor .mcpack',
    wardrobeSubtitle:
      'Bifează mai multe personaje din Vestiar ca să le împachetezi într-un singur fișier .mcpack!',
    wardrobeSaveCurrentBtn: 'Salvează Skin-ul Curent',
    wardrobeSaveAsNewBtn: 'Salvează ca Copie Nouă',
    wardrobeImportIntoBtn: 'Adaugă fișier .PNG în Vestiar',
    wardrobeEmptyState:
      'Vestiarul tău este gol momentan! Apasă pe „Salvează Skin-ul Curent” sau importă fișiere .PNG ca să îți construiești colecția.',
    wardrobeSelectAllBtn: 'Bifează Tot',
    wardrobeClearSelectionBtn: 'Debifează Tot',

    cardCheckTooltip: 'Include acest skin în tava de export .mcpack',
    cardEditBtn: 'Editează',
    cardEditTooltip: 'Încarcă acest personaj în editorul 3D',
    cardDuplicateTooltip: 'Creează o copie a acestui skin',
    cardRenameTooltip: 'Redenumește personajul',
    cardDeleteTooltip: 'Șterge definitiv din Vestiar',
    cardGeomToggleTooltip: 'Schimbă manual între Clasic (Steve 4px) și Subțire (Alex 3px)',

    trayTitle: 'Tava de Făurit Pachet (.mcpack & Java PNG)',
    trayPackNameLabel: 'Nume Pachet:',
    trayPackNameDefault: 'Eroii Mei Skinvil',
    traySelectedCount: (count) =>
      count === 1 ? '1 skin bifat pentru pachet' : `${count} skin-uri bifate pentru pachet`,
    trayUsingCurrentHint:
      'Niciun skin bifat în Vestiar — se va exporta personajul curent din editor!',
    forgeMcpackBtn: 'Făurește .mcpack',
    forgeMcpackTooltip: 'Creează pachetul .mcpack gata de deschis în Minecraft Bedrock',
    exportJavaPngsBtn: 'Exportă PNG-uri (Java)',
    exportJavaPngsTooltip: 'Salvează fișiere .png individuale pentru Minecraft Java Edition',
    forgedSuccessToast: 'Pachet .mcpack făurit cu succes:',
    exportedPngsToast: (count) => `${count} fișier(e) .PNG exportate!`,
    closeBtn: 'Închide',

    undoBtn: 'Înapoi',
    undoTooltip: 'Anulează ultima modificare (Cmd/Ctrl+Z) — până la 50 pași',
    redoBtn: 'Înainte',
    redoTooltip: 'Refă modificarea anulată (Cmd/Ctrl+Shift+Z)',

    modelClassic: 'Steve (4px)',
    modelClassicTooltip: 'Model Clasic cu brațe de 4 pixeli lățime (comutare manuală)',
    modelSlim: 'Alex (3px)',
    modelSlimTooltip: 'Model Subțire cu brațe de 3 pixeli lățime (comutare manuală)',

    toggle2DBtn: 'Grilă 2D',
    toggle2DTooltip: 'Arată sau ascunde panoul de pictură plată 64×64',

    paintLayerSectionTitle: 'Strat Activ de Pictat',
    paintLayerBase: 'Corp (Bază)',
    paintLayerBaseTooltip:
      'Pictează direct pe capul, părul și corpul personajului [Tasta L]',
    paintLayerOuter: '3D Exterior',
    paintLayerOuterTooltip:
      'Pictează accesorii 3D în relief — pălării, ochelari, căști, jachetă [Tasta L]',

    toolsSectionTitle: 'Unelte de Pictat',
    toolPencil: 'Creion',
    toolPencilTooltip: 'Pictează pixel cu pixel (1px) pe personaj [Tasta B]',
    toolEraser: 'Radieră',
    toolEraserTooltip: 'Șterge stratul exterior (transparent) sau curăță baza [Tasta E]',
    toolBucket: 'Găleată',
    toolBucketTooltip: 'Umple doar fața cubului pe care ai dat clic [Tasta G]',
    toolEyedropper: 'Pipetă',
    toolEyedropperTooltip: 'Alege culoarea unui pixel direct de pe personaj [Tasta I]',

    modifiersSectionTitle: 'Super-Puteri',
    modMirror: 'Oglindă X',
    modMirrorTooltip: 'Pictează simetric stânga-dreapta pe față, corp, brațe și picioare [Tasta M]',
    modNoise: 'Textură ±6%',
    modNoiseTooltip: 'Adaugă variație subtilă de lumină (±6% HSL) ca în blocurile voxel [Tasta N]',

    eraserBaseOptionLabel: 'Radieră pe Bază:',
    eraserModeSkin: 'Culoare Piele',
    eraserModeSkinTooltip: 'Pe stratul de bază, radiera pictează culoarea pielii de bază',
    eraserModeClear: 'Transparent',
    eraserModeClearTooltip: 'Pe stratul de bază, radiera face pixelul complet transparent',

    mannequinTitle: 'Părți Vizibile',
    mannequinHint: 'Apasă pe părțile corpului ca să le arăți sau să le ascunzi!',
    baseLayerTitle: 'Corp (Bază)',
    outerLayerTitle: 'Haine (Exterior)',
    toggleAllBaseTooltip: 'Arată sau ascunde toate cele 6 părți ale corpului de bază',
    toggleAllOuterTooltip: 'Arată sau ascunde tot stratul exterior (pălărie, jachetă, mâneci, pantaloni)',
    allOn: 'Tot',
    allOff: 'Nimic',

    resetViewBtn: 'Centrare',
    resetViewTooltip: 'Adu camera înapoi în fața personajului',

    poseStand: 'Stând',
    poseStandTooltip: 'Poziție dreaptă cu respirație ușoară animată',
    poseWalk: 'Mers',
    poseWalkTooltip: 'Mers voxel animat în timp real (îngheață automat cât timp pictezi!)',
    poseAction: 'Acțiune',
    poseActionTooltip: 'Alergare eroică dinamică (sau postură eroică fixă când pui pauză)',
    poseSpread: 'Desfăcut (T)',
    poseSpreadTooltip: 'Postură T complet nemișcată — ideală pentru pictat părțile interioare!',
    posePauseTooltip: 'Îngheață mișcarea',
    posePlayTooltip: 'Pornește mișcarea',

    viewportHint:
      'Clic-stânga pe model: Pictează (pe fundal: Rotește)  •  Clic-dreapta: Rotește  •  Rotiță: Zoom',
    statusReady: 'Pregătit de pictat! Plimbă mouse-ul peste personaj.',

    editor2DTitle: 'Harta Plată 2D (64×64)',
    editor2DUvGuides: 'Contur UV',
    editor2DUvGuidesTooltip: 'Arată sau ascunde liniile colorate pentru fețele cuburilor',
    editor2DHint: 'Sincronizat instant cu personajul 3D!',

    colorSectionTitle: 'Atelier de Culori',
    hexInputTooltip: 'Cod culoare HEX (ex: #38BDF8)',
    recentColorsTitle: 'Culori Recente (12)',
    palettesTitle: 'Palete pentru Copii',
    palettes: {
      skinTones: 'Piele',
      knightsMetals: 'Cavaleri',
      vibrantHoodies: 'Hanorace',
      natureCamo: 'Natură',
    },

    parts: {
      head: 'Cap',
      torso: 'Corp',
      rightArm: 'Braț Drept',
      leftArm: 'Braț Stâng',
      rightLeg: 'Picior Drept',
      leftLeg: 'Picior Stâng',
      hat: 'Pălărie / Cască',
      jacket: 'Jachetă',
      rightSleeve: 'Mânecă Dreaptă',
      leftSleeve: 'Mânecă Stângă',
      rightPants: 'Pantalon Drept',
      leftPants: 'Pantalon Stâng',
    },
    faces: {
      front: 'Față',
      back: 'Spate',
      left: 'Stânga',
      right: 'Dreapta',
      top: 'Sus',
      bottom: 'Jos',
    },
    layers: {
      base: 'Bază',
      outer: 'Exterior',
    },

    aboutLicenseBtn: 'GPLv3',
    aboutLicenseTooltip: 'Despre Skinvil, drepturi de autor și licența liberă GNU GPLv3',
    aboutModalTitle: 'Despre Skinvil & Licența Liberă GNU GPLv3',
    aboutFreeSoftwareNotice:
      'Skinvil este software liber (free software): îl poți redistribui și/sau modifica în termenii Licenței Publice Generale GNU versiunea 3 (GNU GPLv3, SPDX: GPL-3.0-only), publicată de Free Software Foundation.',
    aboutNoWarrantyNotice:
      'FĂRĂ GARANȚIE: Acest program este distribuit în speranța că va fi util, dar FĂRĂ NICIO GARANȚIE; fără măcar garanția implicită de VANDABILITATE sau POTRIVIRE PENTRU UN ANUMIT SCOP (vezi Secțiunile 15 și 16 din licența completă de mai jos).',
    aboutMinecraftDisclaimer:
      'NU ESTE UN PRODUS OFICIAL MINECRAFT. NU ESTE APROBAT DE ȘI NU ESTE ASOCIAT CU MOJANG SAU MICROSOFT.',
  },

  en: {
    appSubtitle: '3D Voxel Character Skin Forge',
    langToggleTooltip: 'Switch language instantly (Romanian / English)',

    templatesBtn: 'Templates (6)',
    templatesTooltip: 'Pick one of the 6 offline starter characters',
    templates: {
      explorer: 'Classic Explorer (Steve)',
      adventurer: 'Slim Adventurer (Alex)',
      knight: 'Royal Knight',
      astronaut: 'Space Astronaut',
      robot: 'Cyber Robot',
      blank: 'Blank Canvas (Fresh Start)',
    },

    skinNamePlaceholder: 'Character name...',
    skinNameTooltip: 'Character display name for Wardrobe and .mcpack export',
    saveWardrobeBtn: 'Save',
    saveWardrobeTooltip: 'Save current character into your local Wardrobe',
    openWardrobeBtn: 'Wardrobe',
    openWardrobeTooltip: 'Open My Skins Wardrobe and the .mcpack Pack Builder tray',
    forgeHeaderBtn: '.mcpack',
    forgeHeaderTooltip: 'Forge a Minecraft Bedrock .mcpack skin pack!',

    importPngBtn: 'Import PNG',
    importPngTooltip: 'Open or drag-and-drop a .png skin (64×64, legacy 64×32, or 128×128 HD)',
    exportPngBtn: 'PNG',
    exportPngTooltip: 'Quick-export current skin as a standalone .png file',

    savedToastPrefix: 'Saved file:',
    savedToWardrobeToast: 'Saved to Wardrobe:',
    importedToast64: 'Imported 64×64 skin',
    importedToastLegacy: 'Converted legacy 64×32 skin to 64×64',
    importedToastHd: 'Imported 128×128 HD skin',
    detectedSlimTag: 'detected: Slim Alex 3px',
    detectedClassicTag: 'detected: Classic Steve 4px',
    dropOverlayTitle: 'Drop .PNG Skin File to Import!',
    dropOverlaySub: 'Supports 64×64, legacy 64×32 (auto-converted), and 128×128 HD skins',

    wardrobeTitle: 'My Skins Wardrobe & .mcpack Forge',
    wardrobeSubtitle:
      'Check multiple characters in your Wardrobe to bundle them into one ready-to-install .mcpack!',
    wardrobeSaveCurrentBtn: 'Save Current Editor Skin',
    wardrobeSaveAsNewBtn: 'Save as New Copy',
    wardrobeImportIntoBtn: 'Import .PNG into Wardrobe',
    wardrobeEmptyState:
      'Your Wardrobe is empty! Click "Save Current Editor Skin" or import .PNG skins to start building your collection.',
    wardrobeSelectAllBtn: 'Select All',
    wardrobeClearSelectionBtn: 'Clear Selection',

    cardCheckTooltip: 'Check to add this skin to the Forge .mcpack export tray',
    cardEditBtn: 'Edit',
    cardEditTooltip: 'Load this character into the 3D/2D editor',
    cardDuplicateTooltip: 'Duplicate this saved skin',
    cardRenameTooltip: 'Rename this character',
    cardDeleteTooltip: 'Delete from Wardrobe',
    cardGeomToggleTooltip: 'Manually toggle between Classic (Steve 4px) and Slim (Alex 3px)',

    trayTitle: 'Forge .mcpack & Java PNG Export Tray',
    trayPackNameLabel: 'Pack Name:',
    trayPackNameDefault: 'My Skinvil Heroes',
    traySelectedCount: (count) =>
      count === 1 ? '1 skin in export tray' : `${count} skins in export tray`,
    trayUsingCurrentHint:
      'No Wardrobe skins checked — exporting your active editor character!',
    forgeMcpackBtn: 'Forge .mcpack',
    forgeMcpackTooltip: 'Build a Bedrock Edition .mcpack archive with all selected skins',
    exportJavaPngsBtn: 'Export PNGs (Java)',
    exportJavaPngsTooltip: 'Export standalone .png files for Minecraft Java Edition',
    forgedSuccessToast: 'Forged .mcpack archive:',
    exportedPngsToast: (count) => `Exported ${count} standalone .PNG file(s)!`,
    closeBtn: 'Close',

    undoBtn: 'Undo',
    undoTooltip: 'Undo last change (Cmd/Ctrl+Z) — up to 50 steps',
    redoBtn: 'Redo',
    redoTooltip: 'Redo undone change (Cmd/Ctrl+Shift+Z)',

    modelClassic: 'Steve (4px)',
    modelClassicTooltip: 'Classic model with 4-pixel wide arms (manual override)',
    modelSlim: 'Alex (3px)',
    modelSlimTooltip: 'Slim model with 3-pixel wide arms (manual override)',

    toggle2DBtn: '2D Grid',
    toggle2DTooltip: 'Show or hide the synced 64×64 flat pixel-grid editor',

    paintLayerSectionTitle: 'Active Paint Layer',
    paintLayerBase: 'Body (Base)',
    paintLayerBaseTooltip:
      'Paint directly flush on the character head, hair, and body [Key L]',
    paintLayerOuter: '3D Outer',
    paintLayerOuterTooltip:
      'Paint raised 3D accessories — hats, glasses, helmets, jacket [Key L]',

    toolsSectionTitle: 'Paint Tools',
    toolPencil: 'Pencil',
    toolPencilTooltip: 'Paint 1px blocks directly on your character [Key B]',
    toolEraser: 'Eraser',
    toolEraserTooltip: 'Erase Outer layer to transparent or clean Base layer [Key E]',
    toolBucket: 'Bucket Fill',
    toolBucketTooltip: 'Flood-fill strictly inside the clicked cube face [Key G]',
    toolEyedropper: 'Eyedropper',
    toolEyedropperTooltip: 'Sample a pixel color directly from the character [Key I]',

    modifiersSectionTitle: 'Power-Ups',
    modMirror: 'Mirror X',
    modMirrorTooltip: 'Horizontal X-axis mirror symmetry across face, torso, and paired limbs [Key M]',
    modNoise: 'Auto-Noise',
    modNoiseTooltip: 'Subtle ±6% HSL lightness texture variation per stroke [Key N]',

    eraserBaseOptionLabel: 'Base Eraser:',
    eraserModeSkin: 'Skin Fill',
    eraserModeSkinTooltip: 'On the Base layer, Eraser paints the base skin color',
    eraserModeClear: 'Clear Alpha',
    eraserModeClearTooltip: 'On the Base layer, Eraser clears pixels to transparent',

    mannequinTitle: 'Body Visibility',
    mannequinHint: 'Click any body part to show or hide it while painting!',
    baseLayerTitle: 'Body (Base)',
    outerLayerTitle: 'Armor (Outer)',
    toggleAllBaseTooltip: 'Show or hide all 6 Base body parts',
    toggleAllOuterTooltip: 'Show or hide all 6 Outer clothing/armor parts',
    allOn: 'All',
    allOff: 'None',

    resetViewBtn: 'Reset View',
    resetViewTooltip: 'Reset camera back to the front hero view',

    poseStand: 'Stand',
    poseStandTooltip: 'Gentle animated idle breathing pose',
    poseWalk: 'Walk',
    poseWalkTooltip: 'Real-time animated voxel walk cycle (auto-freezes while painting!)',
    poseAction: 'Action',
    poseActionTooltip: 'Dynamic hero sprint cycle (or static heroic strike when paused)',
    poseSpread: 'Spread / T-Pose',
    poseSpreadTooltip: 'Strictly static T-Pose — keeps inner limb faces still for precision painting!',
    posePauseTooltip: 'Freeze motion',
    posePlayTooltip: 'Start motion',

    viewportHint:
      'Left-drag model: Paint (background: Orbit)  •  Right-drag: Orbit  •  Scroll: Zoom',
    statusReady: 'Ready to paint! Hover over the character.',

    editor2DTitle: '2D Flat Texture (64×64)',
    editor2DUvGuides: 'UV Guides',
    editor2DUvGuidesTooltip: 'Show or hide color-coded cube face boundaries',
    editor2DHint: 'Live-synced with the 3D character!',

    colorSectionTitle: 'Color Workshop',
    hexInputTooltip: 'HEX color code (e.g. #38BDF8)',
    recentColorsTitle: 'Recent Colors (12)',
    palettesTitle: 'Kid Palettes',
    palettes: {
      skinTones: 'Skin Tones',
      knightsMetals: 'Knights',
      vibrantHoodies: 'Hoodies',
      natureCamo: 'Nature',
    },

    parts: {
      head: 'Head',
      torso: 'Torso',
      rightArm: 'Right Arm',
      leftArm: 'Left Arm',
      rightLeg: 'Right Leg',
      leftLeg: 'Left Leg',
      hat: 'Hat / Helmet',
      jacket: 'Jacket',
      rightSleeve: 'Right Sleeve',
      leftSleeve: 'Left Sleeve',
      rightPants: 'Right Pants',
      leftPants: 'Left Pants',
    },
    faces: {
      front: 'Front',
      back: 'Back',
      left: 'Left',
      right: 'Right',
      top: 'Top',
      bottom: 'Bottom',
    },
    layers: {
      base: 'Base',
      outer: 'Outer',
    },

    aboutLicenseBtn: 'GPLv3',
    aboutLicenseTooltip: 'About Skinvil, copyright notice, and GNU GPLv3 free software license',
    aboutModalTitle: 'About Skinvil & GNU GPLv3 License',
    aboutFreeSoftwareNotice:
      'Skinvil is free software: you can redistribute it and/or modify it under the terms of version 3 of the GNU General Public License (GNU GPLv3, SPDX: GPL-3.0-only) as published by the Free Software Foundation.',
    aboutNoWarrantyNotice:
      'NO WARRANTY: This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE (see Sections 15 & 16 in the full license text below).',
    aboutMinecraftDisclaimer:
      'NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
  },
};

export class I18nStore {
  private locale: Locale = 'ro'; // Defaulting to Romanian for kids per specification!
  private listeners: Set<(locale: Locale, t: TranslationStrings) => void> = new Set();

  public get currentLocale(): Locale {
    return this.locale;
  }

  public get t(): TranslationStrings {
    return TRANSLATIONS[this.locale];
  }

  public setLocale(next: Locale): void {
    if (this.locale === next) return;
    this.locale = next;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = next;
    }
    for (const fn of this.listeners) {
      fn(this.locale, this.t);
    }
  }

  public toggleLocale(): void {
    this.setLocale(this.locale === 'ro' ? 'en' : 'ro');
  }

  public subscribe(fn: (locale: Locale, t: TranslationStrings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
