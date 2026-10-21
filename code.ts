// code.ts — Sort your variants (patched)
// Changes in this revision:
// 1. Logic completely refactored to use a role map ('roleMap') instead of drag-and-drop.
// 2. A new 'organizeByRoles' function serves as the main entry point for layout logic.
// 3. Added validation to ensure 'Column' and 'Row' roles are always assigned (exactly one each).
// 4. Columns Group now supports MULTIPLE properties (composed id; stable ordering).
// 5. Added role normalization (alias & case-insensitive) for Column/Row/Col Group/Row Group.
// 6. Removed all obsolete code related to 'propertyOrder' and drag-and-drop.
// 7. UI rebuilt with FigUI3 (src/ui); plugin window uses Figma's theme colors.
// 8. Errors while organizing are reported to the UI; hex colors and numbers are sanitized.
// 9. Brace uses its own weight; preferences saved on a set are sent on selection.
// 10. Tag groups are tracked by Component Set id and placed in the set's parent coordinate space.

// ---------------- Debug helpers ----------------
const DEBUG: boolean = false; // toggle to enable/disable verbose logging
function dbg(label: string, data?: unknown) { if (DEBUG) console.log(`[SYV] ${label}`, data ?? ''); }
function dbgi(label: string, data: unknown[]) { if (DEBUG) console.log(`[SYV] ${label} ->`, JSON.stringify(data)); }
function _warn(label: string, data?: unknown) { console.warn(`[SYV] ${label}`, data ?? ''); }

// ---------------- Types ----------------
interface SpacingPrefs { padding: number; gap: number; groups: number }
interface VariantPropsMap { [key: string]: { values: string[] } }

type AutoLayoutNode = FrameNode | ComponentSetNode | ComponentNode | InstanceNode;

interface ColorSource { type: 'hex' | 'paint' | 'variable'; id: string | null; value: string }
function _varAlias(id: string): VariableAlias { return { type: 'VARIABLE_ALIAS', id }; }

interface TagOptions {
  enableFill: boolean;
  fillSource: ColorSource;
  enableStroke: boolean;
  strokeSource: ColorSource;
  strokeWeight: number;
  cornerRadius: number;
  textSize: number;
  textSource: ColorSource;
  braceEnabled: boolean;
  braceSide: 'left' | 'right' | 'auto';
  braceSource: ColorSource;
  braceWeight: number;
  fontFamily?: string;
  fontStyle?: string;
}

type StrokeCapableNode = GeometryMixin & BlendMixin & MinimalStrokesMixin & { strokeWeight: number | typeof figma.mixed };

const DEFAULT_SPACING: SpacingPrefs = { padding: 48, gap: 48, groups: 128 };
// MODIFICADO: 'order' key ya no se usa.
const PLUGIN_KEYS = { spacing: 'spacing_preferences', tag: 'tag_options', tagsFor: 'tags_for' } as const;

// Default Tag Options (robust, never undefined)
const DEFAULT_TAG_OPTIONS: TagOptions = {
  enableFill: true,
  fillSource: { type: 'hex', id: null, value: '#E5E5E5' },
  enableStroke: true,
  strokeSource: { type: 'hex', id: null, value: '#A3A3A3' },
  strokeWeight: 1,
  cornerRadius: 8,
  textSize: 16,
  textSource: { type: 'hex', id: null, value: '#404040' },
  braceEnabled: true,
  braceSide: 'auto',
  braceSource: { type: 'hex', id: null, value: '#A3A3A3' },
  braceWeight: 1,
  fontFamily: 'Inter',
  fontStyle: 'Regular',
};

// Layout constants
// TAG_GAP: distance from component set to the first layer of chips (now 24px per request)
const TAG_GAP = 24;
const CONNECTOR = 12;
// Distance between group brace and chips / between chip stacks
const GROUP_CHIP_GAP = 24;

figma.showUI(__html__, { width: 360, height: 640, themeColors: true });

// ---------------- Utilities ----------------
function isComponentSet(node: SceneNode | null): node is ComponentSetNode { return !!node && node.type === 'COMPONENT_SET'; }
function hasLayoutMode(node: BaseNode | null): node is AutoLayoutNode { return !!node && (node as { layoutMode?: unknown }).layoutMode !== undefined; }

function indexOfStr(arr: string[], v: string | undefined): number { if (!v) return -1; for (let i = 0; i < arr.length; i++) if (arr[i] === v) return i; return -1; }
function _pushUnique(arr: string[], v: string): void { if (indexOfStr(arr, v) === -1) arr.push(v); }

function deriveValueOrder(variants: ComponentNode[], key: string, defined: string[]): string[] {
  // Gather values in the order variants appear, without sorting.
  const present: string[] = [];
  const seen = new Set<string>();
  for (const variant of variants) {
    const props = variant.variantProperties as Record<string, string> | null;
    if (!props) continue;
    const val = props[key];
    if (val && !seen.has(val)) {
      present.push(val);
      seen.add(val);
    }
  }
  // Build the final order: strictly follow 'defined' (when provided), then append any extra 'present'.
  const ordered: string[] = [];
  const added = new Set<string>();
  for (let i = 0; i < defined.length; i++) {
    const d = defined[i];
    if (seen.has(d) && !added.has(d)) {
      ordered.push(d);
      added.add(d);
    }
  }
  for (let i = 0; i < present.length; i++) {
    const p = present[i];
    if (!added.has(p)) {
      ordered.push(p);
      added.add(p);
    }
  }
  return ordered;
}

function isBooleanLiteral(val: string | undefined | null): boolean {
  if (val === undefined || val === null) return false;
  const l = String(val).trim().toLowerCase();
  return l === 'true' || l === 'false';
}

// (unused helper kept intentionally; satisfies eslint rule by leading underscore)
function _computeFallbackOrder(variantProps: VariantPropsMap): string[] {
  const keys = Object.keys(variantProps); if (keys.length === 0) return [];
  const tuples = keys.map(k => ({ k, len: variantProps[k]?.values.length || 0 }));
  tuples.sort((a, b) => (b.len - a.len) || a.k.localeCompare(b.k));
  return tuples.map(t => t.k);
}

function sanitizeHex(input: unknown, fallback: string): string {
  let h = String(input === undefined || input === null ? '' : input).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(ch => ch + ch).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h.toUpperCase() : fallback;
}

function toNumber(input: unknown, fallback: number, min = 0): number {
  if (input === undefined || input === null || input === '') return fallback;
  const n = Number(input); return isFinite(n) ? Math.max(min, n) : fallback;
}

function parseJSON(raw: string): unknown { if (!raw) return undefined; try { return JSON.parse(raw); } catch (_e) { return undefined; } }

function normalizeSpacing(raw: unknown): SpacingPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    padding: toNumber(r.padding, DEFAULT_SPACING.padding),
    gap: toNumber(r.gap, DEFAULT_SPACING.gap),
    groups: toNumber(r.groups, DEFAULT_SPACING.groups),
  };
}

function rgbFromHex(hex: string): RGB { const h = sanitizeHex(hex, '#000000').slice(1); const r = parseInt(h.slice(0,2), 16) / 255; const g = parseInt(h.slice(2,4), 16) / 255; const b = parseInt(h.slice(4,6), 16) / 255; return { r, g, b }; }
function toHexByte(n: number): string { const nn = Math.max(0, Math.min(255, Math.round(n))); const s = nn.toString(16); return s.length === 1 ? '0' + s : s; }
function _rgbToHex(rgb: RGB): string { return '#' + toHexByte(rgb.r * 255) + toHexByte(rgb.g * 255) + toHexByte(rgb.b * 255); }

function getPreferences(componentSet: ComponentSetNode) {
  const savedSpacing = parseJSON(componentSet.getPluginData(PLUGIN_KEYS.spacing));
  const savedTag = parseJSON(componentSet.getPluginData(PLUGIN_KEYS.tag));
  return {
    spacing: normalizeSpacing(savedSpacing),
    tagOptions: normalizeTagOptions(savedTag),
    hasSavedSpacing: savedSpacing !== undefined,
    hasSavedTag: savedTag !== undefined,
  };
}

function normalizeColorSource(input: unknown, fallbackHex: string): ColorSource {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>).value : input;
  return { type: 'hex', id: null, value: sanitizeHex(value, fallbackHex) };
}

function normalizeTagOptions(raw: unknown): TagOptions {
  const base = { ...DEFAULT_TAG_OPTIONS };
  if (!raw || typeof raw !== 'object') return base;

  const r = raw as Record<string, unknown>;
  // Accept many possible field names for colors coming from UI or pluginData
  const fillVal = r.fillSource ?? r.fillHex ?? r.fillColor ?? r.fill;
  const strokeVal = r.strokeSource ?? r.strokeHex ?? r.strokeColor ?? r.stroke;
  const textVal = r.textSource ?? r.textColor ?? r.textHex ?? r.text;
  const braceVal = r.braceSource ?? r.braceStrokeHex ?? r.braceColor ?? r.brace;

  return {
    enableFill: r.enableFill === undefined ? base.enableFill : Boolean(r.enableFill),
    fillSource: normalizeColorSource(fillVal ?? base.fillSource.value, base.fillSource.value),
    enableStroke: r.enableStroke === undefined ? base.enableStroke : Boolean(r.enableStroke),
    strokeSource: normalizeColorSource(strokeVal ?? base.strokeSource.value, base.strokeSource.value),
    strokeWeight: toNumber(r.strokeWeight, base.strokeWeight),
    cornerRadius: toNumber(r.cornerRadius, base.cornerRadius),
    textSize: toNumber(r.textSize, base.textSize, 1),
    textSource: normalizeColorSource(textVal ?? base.textSource.value, base.textSource.value),
    braceEnabled: r.braceEnabled === undefined ? base.braceEnabled : (r.braceEnabled !== false),
    braceSide: (r.braceSide as 'left' | 'right' | 'auto') ?? base.braceSide,
    braceSource: normalizeColorSource(braceVal ?? base.braceSource.value, base.braceSource.value),
    braceWeight: toNumber(r.braceWeight, base.braceWeight, 1),
    fontFamily: (r.fontFamily as string) || base.fontFamily,
    fontStyle: (r.fontStyle as string) || base.fontStyle,
  };
}

async function loadCoreFonts(opts?: { family?: string; style?: string }) {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }); // Pre-load bold for tags
    if (opts?.family && opts?.style) { await figma.loadFontAsync({ family: opts.family, style: opts.style }); }
  }
  catch (e) { console.warn('Font combination not available:', opts); }
}

function ensureSetFreePositioning(componentSet: ComponentSetNode) {
  if (hasLayoutMode(componentSet) && componentSet.layoutMode !== 'NONE') { componentSet.layoutMode = 'NONE'; }
}

// Remove this ComponentSet's previous tag group (tracked by id), plus name-matched leftovers from older versions
function cleanupDebugArtifacts(cs: ComponentSetNode) {
  const page = figma.currentPage;
  const owned = page.findAllWithCriteria({ types: ['GROUP'], pluginData: { keys: [PLUGIN_KEYS.tagsFor] } });
  for (const g of owned) {
    if (g.getPluginData(PLUGIN_KEYS.tagsFor) === cs.id) { try { g.remove(); } catch (_) { /* noop */ } }
  }
  const legacyNames = [`${cs.name} debug-overlay`, `${cs.name} tags`];
  const legacy = page.findAllWithCriteria({ types: ['GROUP'] }).filter((g) => legacyNames.indexOf(g.name) !== -1 && !g.getPluginData(PLUGIN_KEYS.tagsFor));
  for (const g of legacy) {
    try { g.remove(); } catch (_) { /* noop */ }
  }
}

// ---------------- Placement helpers ----------------
type TagParent = BaseNode & ChildrenMixin;
function isAutoLayout(node: BaseNode | null): boolean { return hasLayoutMode(node) && node.layoutMode !== 'NONE'; }

// Appends a node to the tag parent; inside auto layout it is taken out of the flow.
function appendFree(parent: TagParent, node: SceneNode) {
  parent.appendChild(node);
  if (isAutoLayout(parent) && 'layoutPositioning' in node) node.layoutPositioning = 'ABSOLUTE';
}

// Groups nodes in place; inside auto layout the group is taken out of the flow and moved back where its children were.
function groupFree(nodes: SceneNode[], parent: TagParent): GroupNode {
  let minX = Infinity, minY = Infinity;
  for (const n of nodes) { const b = n.absoluteBoundingBox; if (b) { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); } }
  const group = figma.group(nodes, parent);
  if (isAutoLayout(parent)) {
    group.layoutPositioning = 'ABSOLUTE';
    const after = group.absoluteBoundingBox;
    if (after && isFinite(minX) && isFinite(minY)) { group.x += minX - after.x; group.y += minY - after.y; }
  }
  return group;
}

// --- Role normalization helpers (alias & case-insensitive) ---
function normalizeRole(v?: string): 'column' | 'row' | 'column-group' | 'row-group' | '' {
  if (!v) return '';
  const s = v.trim().toLowerCase().replace(/[_\s]+/g, '-'); // "Col Group" -> "col-group"
  if (s === 'column' || s === 'col') return 'column';
  if (s === 'row' ) return 'row';
  if (s === 'group-col' || s === 'column-group' || s === 'groupcol') return 'column-group';
  if (s === 'row-group' || s === 'grouprow') return 'row-group';
  return '';
}

function normalizeRoleMap(input: Record<string, string>): Record<string, 'column' | 'row' | 'column-group' | 'row-group'> {
  const out: Record<string, 'column' | 'row' | 'column-group' | 'row-group'> = {};
  for (const k of Object.keys(input || {})) {
    const role = normalizeRole(input[k]);
    if (role) out[k] = role;
  }
  dbg('normalizeRoleMap.out', out);
  return out;
}

// ---------------- Messaging helpers ----------------
function snapshotSelection() {
  const sel = figma.currentPage.selection;
  if (sel.length === 1 && isComponentSet(sel[0])) {
    const cs = sel[0];
    let properties: VariantPropsMap = {};
    try { properties = cs.variantGroupProperties as VariantPropsMap; } catch (e) { console.warn('variantGroupProperties error:', e); }
    dbg('snapshotSelection.properties.keys', Object.keys(properties));
    const preferences = getPreferences(cs);
    figma.ui.postMessage({
      type: 'selection-changed', componentSetId: cs.id, componentSetName: cs.name,
      properties: properties, propertyKeys: Object.keys(properties),
      variantCount: cs.children.filter((n) => n.type === 'COMPONENT').length,
      // Only preferences saved on this set are sent, so the UI keeps the last used ones otherwise
      spacing: preferences.hasSavedSpacing ? preferences.spacing : null,
      tagOptions: preferences.hasSavedTag ? preferences.tagOptions : null,
    });
  } else {
    figma.ui.postMessage({ type: 'selection-changed', componentSetId: '', componentSetName: '', properties: {}, propertyKeys: [], spacing: null, tagOptions: null });
  }
}
setTimeout(snapshotSelection, 50);
figma.on('selectionchange', snapshotSelection);

// ---------------- Fonts & Tokens ----------------
async function sendFontsToUI() {
  try { const fonts = await figma.listAvailableFontsAsync(); figma.ui.postMessage({ type: 'fonts-list', fonts }); }
  catch (e) { console.warn('listAvailableFontsAsync error:', e); }
}

// ---------------- Apply color helpers ----------------
async function applyFillFromSource(node: GeometryMixin & BlendMixin & MinimalStrokesMixin, src: ColorSource, enable = true): Promise<void> {
  if (!enable) { node.fills = []; return; }
  const p: SolidPaint = { type: 'SOLID', color: rgbFromHex(src.value), opacity: 1 };
  node.fills = [p];
}

async function applyStrokeFromSource(node: StrokeCapableNode, src: ColorSource, weight: number, enable = true): Promise<void> {
  if (!enable || weight <= 0) { node.strokes = []; return; }
  node.strokes = [{ type: 'SOLID', color: rgbFromHex(src.value) }]; node.strokeWeight = weight;
}

async function applyTextColor(t: TextNode, src: ColorSource): Promise<void> {
  t.fills = [{ type: 'SOLID', color: rgbFromHex(src.value) }];
}


// ---------------- Tag chip factory ----------------
async function createChip(textSegments: { characters: string, bold: boolean }[], tag: TagOptions, defaultFont: { family: string, style: string }, boldFont: { family: string, style: string }, parent: TagParent): Promise<FrameNode> {
  const chip = figma.createFrame();
  appendFree(parent, chip);
  chip.name = 'tag-chip';
  chip.layoutMode = 'HORIZONTAL';
  chip.primaryAxisAlignItems = 'CENTER';
  chip.counterAxisAlignItems = 'CENTER';
  chip.primaryAxisSizingMode = 'AUTO';
  chip.counterAxisSizingMode = 'AUTO';
  chip.itemSpacing = 4;
  chip.paddingLeft = 8; chip.paddingRight = 8; chip.paddingTop = 8; chip.paddingBottom = 8;
  chip.cornerRadius = tag.cornerRadius;

  await applyFillFromSource(chip, tag.fillSource, tag.enableFill);
  await applyStrokeFromSource(chip, tag.strokeSource, tag.strokeWeight, tag.enableStroke);

  const textNode = figma.createText();
  let currentPos = 0;
  let fullText = '';

  for (const segment of textSegments) { fullText += segment.characters; }
  textNode.characters = fullText;
  textNode.fontSize = tag.textSize;
  await applyTextColor(textNode, tag.textSource);

  for (const segment of textSegments) {
    // Determine font to load (requested or fallback)
    let fontToUse = segment.bold ? boldFont : defaultFont;
    // Try loading the requested font, if fails, fallback to Inter Regular/Bold
    try {
      await figma.loadFontAsync(fontToUse);
    } catch (e) {
      const fallback = segment.bold ? { family: 'Inter', style: 'Bold' } : { family: 'Inter', style: 'Regular' };
      try {
        await figma.loadFontAsync(fallback);
        fontToUse = fallback;
      } catch (e2) {
        console.warn('Failed to load both requested and fallback fonts for tag text:', fontToUse, e, e2);
        // Skip setting font for this range but advance position
        currentPos += segment.characters.length;
        continue;
      }
    }

    try {
      textNode.setRangeFontName(currentPos, currentPos + segment.characters.length, fontToUse);
    } catch (e) {
      console.warn('Failed to setRangeFontName for tag text range:', e);
    }
    currentPos += segment.characters.length;
  }

  chip.appendChild(textNode);
  return chip;
}

// ---------------- Core organizer ----------------

// NUEVA FUNCIÓN: El punto de entrada principal que interpreta el roleMap.
async function organizeByRoles(
  componentSet: ComponentSetNode,
  roleMapRaw: Record<string, string>,
  spacing: SpacingPrefs,
  tag?: TagOptions
): Promise<string | null> {
  let variantProps: VariantPropsMap;
  try {
    variantProps = componentSet.variantGroupProperties as VariantPropsMap;
  } catch (e) {
    return '⚠️ Variant conflict. Ensure properties/values are consistent.';
  }

  dbg('organizeByRoles.variantProps.keys', Object.keys(variantProps || {}));
  dbg('organizeByRoles.roleMap.raw', roleMapRaw);
  // Normaliza roles (acepta alias y mayúsculas/espacios)
  const roleMap = normalizeRoleMap(roleMapRaw);
  for (const k of Object.keys(roleMap)) if (!variantProps[k]) delete roleMap[k];

  // Extraer claves por rol
  const colKeys = Object.keys(roleMap).filter(k => roleMap[k] === 'column');
  const rowKeys = Object.keys(roleMap).filter(k => roleMap[k] === 'row');
  const colGroupKeys = Object.keys(roleMap).filter(k => roleMap[k] === 'column-group');
  const rowGroupKeys = Object.keys(roleMap).filter(k => roleMap[k] === 'row-group');

  dbgi('roles.colKeys', colKeys);
  dbgi('roles.rowKeys', rowKeys);
  dbgi('roles.colGroupKeys', colGroupKeys);
  dbgi('roles.rowGroupKeys', rowGroupKeys);

  // Ajuste: Si el Component Set solo tiene UNA propiedad, permitir que el usuario la
  // asigne como Column o como Row y crear un eje sintético para la otra dimensión
  // de forma que la organización pueda ejecutarse (ej. 1 fila x N columnas).
  const propCount = Object.keys(variantProps || {}).length;
  const SYN_ROW = '__syv_synthetic_row__';
  const SYN_COL = '__syv_synthetic_col__';

  if (propCount === 1) {
    // Si el usuario asignó la única propiedad como columna pero no hay row,
    // añadimos una fila sintética con un único valor.
    if (colKeys.length === 1 && rowKeys.length === 0) {
      rowKeys.push(SYN_ROW);
      // Añadir entry mínima para que organizeVariantsCoreV3 pueda derivar valores.
      variantProps[SYN_ROW] = { values: ['—'] };
      dbg('single-prop.synth.rowKeys', rowKeys);
      dbg('single-prop.synth.colKeys', colKeys);
      dbg('single-prop.variantProps', variantProps);
    }
    // Si el usuario asignó la única propiedad como fila pero no hay column,
    // añadimos una columna sintética con un único valor.
    else if (rowKeys.length === 1 && colKeys.length === 0) {
      colKeys.push(SYN_COL);
      variantProps[SYN_COL] = { values: ['—'] };
      dbg('single-prop.synth.rowKeys', rowKeys);
      dbg('single-prop.synth.colKeys', colKeys);
      dbg('single-prop.variantProps', variantProps);
    }
  }

  // Validación final: Debe existir exactamente 1 Column y 1 Row (incluyendo sintéticos)
  if (colKeys.length !== 1) return '⚠️ Debe haber exactamente 1 "Column" asignado.';
  if (rowKeys.length !== 1) return '⚠️ Debe haber exactamente 1 "Row" asignado.';

  const colKey = colKeys[0];
  const rowKey = rowKeys[0];

  const variants = componentSet.children.filter((n): n is ComponentNode => n.type === 'COMPONENT');
  
  return await organizeVariantsCoreV3(
    componentSet,
    rowKey,
    colKey,
    colGroupKeys, // ahora múltiples
    rowGroupKeys,
    spacing,
    variants,
    variantProps,
    tag
  );
}

// ---------------- Message handlers ----------------
interface OrganizePayload { spacing?: unknown; roleMap?: Record<string, string>; tagOptions?: unknown }

async function handleOrganize(payload: OrganizePayload): Promise<string | null> {
  const sel = figma.currentPage.selection;
  if (!(sel.length === 1 && isComponentSet(sel[0]))) return '⚠️ Select a Component Set';
  const cs = sel[0];
  if (!payload.roleMap) return '⚠️ Role map not provided.';

  const spacing = normalizeSpacing(payload.spacing);
  cs.setPluginData(PLUGIN_KEYS.spacing, JSON.stringify(spacing));
  const normTag = normalizeTagOptions(payload.tagOptions ?? getPreferences(cs).tagOptions);
  cs.setPluginData(PLUGIN_KEYS.tag, JSON.stringify(normTag));

  // Persist last-used configuration locally so it can be restored when the UI reopens
  try {
    await figma.clientStorage.setAsync('syv_last_config', { roleMap: payload.roleMap, spacing, tagOptions: normTag });
  } catch (e) {
    console.warn('Failed to save last config:', e);
  }

  await loadCoreFonts({ family: normTag.fontFamily, style: normTag.fontStyle });
  ensureSetFreePositioning(cs);
  return await organizeByRoles(cs, payload.roleMap, spacing, normTag);
}

figma.ui.onmessage = async (msg: unknown) => {
  const m = msg as { type: string; [k: string]: unknown };
  if (m.type === 'ui-loaded') {
    await sendFontsToUI();
    // Try to restore last saved configuration (roleMap, spacing, tagOptions)
    try {
      const stored = await figma.clientStorage.getAsync('syv_last_config') as { roleMap?: Record<string,string>; spacing?: Partial<SpacingPrefs>; tagOptions?: unknown } | null;
      if (stored) {
        figma.ui.postMessage({ type: 'stored-config', config: stored });
      }
    } catch (e) {
      console.warn('Failed to load stored config:', e);
    }
    setTimeout(snapshotSelection, 50);
    return;
  }

  if (m.type === 'save-settings') {
    try {
  const payload = m as { spacing?: Partial<SpacingPrefs>; tagOptions?: unknown };
  const spacingToStore = normalizeSpacing(payload.spacing);
  const tagToStore = normalizeTagOptions(payload.tagOptions ?? DEFAULT_TAG_OPTIONS);
  const toStore = { spacing: spacingToStore, tagOptions: tagToStore };
  await figma.clientStorage.setAsync('syv_last_config', toStore);
    } catch (e) {
      console.warn('Failed to save settings to clientStorage:', e);
    }
    // Also attempt to write into the currently selected Component Set pluginData so settings are tied to that set
    try {
      const sel = figma.currentPage.selection;
      if (sel.length === 1 && isComponentSet(sel[0])) {
        const cs = sel[0] as ComponentSetNode;
  const payload = m as { spacing?: Partial<SpacingPrefs>; tagOptions?: unknown };
  if (payload.spacing) cs.setPluginData(PLUGIN_KEYS.spacing, JSON.stringify(normalizeSpacing(payload.spacing)));
  if (payload.tagOptions) cs.setPluginData(PLUGIN_KEYS.tag, JSON.stringify(normalizeTagOptions(payload.tagOptions)));
      }
    } catch (e) {
      console.warn('Failed to write pluginData on ComponentSet:', e);
    }
    return;
  }

  // ELIMINADO: El mensaje 'order-updated-ui' es obsoleto.
  
  if (m.type === 'organize-variants') {
    let error: string | null;
    try { error = await handleOrganize(m as OrganizePayload); }
    catch (e) { console.error(e); error = '⚠️ ' + (e instanceof Error ? e.message : String(e)); }

    if (error) {
      figma.notify(error, { error: true });
      figma.ui.postMessage({ type: 'organize-error', message: error });
    } else {
      figma.notify('✅ Variants organized');
      figma.ui.postMessage({ type: 'organize-done' });
    }
    return;
  }
};

// --- organizeVariantsCoreV3: soporta múltiples column groups y múltiples row groups ---
async function organizeVariantsCoreV3(
  componentSet: ComponentSetNode,
  rowKey: string,
  colKey: string,
  colGroupKeys: string[],   // múltiples props para agrupar columnas
  rowGroupKeys: string[],   // múltiples props para agrupar filas (ya existía)
  spacing: SpacingPrefs,
  variants: ComponentNode[],
  variantProps: VariantPropsMap,
  rawTag?: TagOptions
): Promise<string | null> {
  // Prepare
  ensureSetFreePositioning(componentSet);
  cleanupDebugArtifacts(componentSet);
  const tag: TagOptions | null = rawTag ? normalizeTagOptions(rawTag) : null;

  // Detect synthetic axes (single-property mode)
  const SYN_ROW = '__syv_synthetic_row__';
  const SYN_COL = '__syv_synthetic_col__';
  const isSyntheticRow = rowKey === SYN_ROW;
  const isSyntheticCol = colKey === SYN_COL;

  const definedCols = (variantProps[colKey]?.values || []) as string[];
  let colValues = deriveValueOrder(variants, colKey, definedCols);
  // Fallback for synthetic or missing column values: use defined order or a single placeholder
  if (colValues.length === 0) {
    colValues = definedCols.length > 0 ? [...definedCols] : ['—'];
  }
  dbgi('col.defined', definedCols);
  dbgi('col.values', colValues);

  const definedRows = (variantProps[rowKey]?.values || []) as string[];
  let rowValues = deriveValueOrder(variants, rowKey, definedRows);
  // Fallback for synthetic or missing row values: use defined order or a single placeholder
  if (rowValues.length === 0) {
    rowValues = definedRows.length > 0 ? [...definedRows] : ['—'];
  }
  dbgi('row.defined', definedRows);
  dbgi('row.values', rowValues);

  // ---- Helpers de orden estable para values de una prop ----
  function stableOrderForPropValues(prop: string, present: string[]): string[] {
    // 1) Respect the order defined in Figma for this property, if provided.
    const defined = (variantProps[prop]?.values || []) as string[];
    const picked: string[] = [];
    // Keep a fast lookup to avoid duplicates.
    const added = new Set<string>();
    for (let i = 0; i < defined.length; i++) {
      const d = defined[i];
      if (present.indexOf(d) !== -1 && !added.has(d)) {
        picked.push(d);
        added.add(d);
      }
    }
    // 2) Append any present values that are not listed in 'defined', in the order we first saw them.
    for (let i = 0; i < present.length; i++) {
      const p = present[i];
      if (!added.has(p)) {
        picked.push(p);
        added.add(p);
      }
    }
    return picked;
  }

  // ---- Column group ids: composición por múltiples props ----
  type ColGroupId = string;
  const colGroupIdsSet = new Set<ColGroupId>();

  function colGroupIdFor(p: Record<string, string> | null): ColGroupId {
    if (!colGroupKeys.length) return '__noColGroup__';
    const segs: string[] = [];
    for (let i = 0; i < colGroupKeys.length; i++) {
      const k = colGroupKeys[i];
      segs.push(`${k}:${p?.[k] ?? '—'}`);
    }
    return segs.join(' | ');
  }

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const p = v.variantProperties as Record<string,string> | null;
    colGroupIdsSet.add(colGroupIdFor(p));
  }

  // Orden estable de col group ids
  let colGroupIds: ColGroupId[] = [];
  if (!colGroupKeys.length) {
    colGroupIds = ['__noColGroup__'];
  } else {
    // valores presentes por prop (con orden estable)
    const presentByProp: Record<string, string[]> = {};
    for (let kIdx = 0; kIdx < colGroupKeys.length; kIdx++) {
      const k = colGroupKeys[kIdx];
      const presentSet = new Set<string>();
      for (let vIdx = 0; vIdx < variants.length; vIdx++) {
        const p = (variants[vIdx].variantProperties as Record<string,string> | null);
        presentSet.add(p?.[k] ?? '—');
      }
      presentByProp[k] = stableOrderForPropValues(k, Array.from(presentSet));
    }

    // producto cartesiano en el orden estable (función expresión para evitar no-inner-declarations)
    const cartesian = (acc: string[][], restKeys: string[]): string[][] => {
      if (!restKeys.length) return acc;
      const head = restKeys[0];
      const tail = restKeys.slice(1);
      const next: string[][] = [];
      for (let i = 0; i < acc.length; i++) {
        const row = acc[i];
        const vals = presentByProp[head];
        for (let j = 0; j < vals.length; j++) {
          next.push([...row, `${head}:${vals[j]}`]);
        }
      }
      return cartesian(next, tail);
    };

    const combos = cartesian([[]], colGroupKeys).map(parts => parts.join(' | '));
    colGroupIds = combos.filter(id => colGroupIdsSet.has(id));
  }
  dbgi('colGroupIds', colGroupIds);

  // ---- Row group ids (multi-prop, orden estable como columnas) ----
  type RowGroupId = string;
  const rowGroupIdsSet = new Set<RowGroupId>();
  function rowGroupIdFor(p: Record<string,string> | null): RowGroupId {
    if (!rowGroupKeys.length) return '__noRowGroup__';
    const segs: string[] = [];
    for (let i = 0; i < rowGroupKeys.length; i++) {
      const k = rowGroupKeys[i];
      segs.push(`${k}:${p?.[k] ?? '—'}`);
    }
    return segs.join(' | ');
  }
  for (let i = 0; i < variants.length; i++) {
    const vp = variants[i].variantProperties as Record<string,string> | null;
    rowGroupIdsSet.add(rowGroupIdFor(vp));
  }
  let rowGroupIds: RowGroupId[] = [];
  if (!rowGroupKeys.length) {
    rowGroupIds = ['__noRowGroup__'];
  } else {
    // valores presentes por prop (con orden estable)
    const presentRowsByProp: Record<string, string[]> = {};
    for (let kIdx = 0; kIdx < rowGroupKeys.length; kIdx++) {
      const k = rowGroupKeys[kIdx];
      const presentSet = new Set<string>();
      for (let vIdx = 0; vIdx < variants.length; vIdx++) {
        const p = (variants[vIdx].variantProperties as Record<string,string> | null);
        presentSet.add(p?.[k] ?? '—');
      }
      presentRowsByProp[k] = stableOrderForPropValues(k, Array.from(presentSet));
    }
    // producto cartesiano en el orden estable
    const cartesianRows = (acc: string[][], restKeys: string[]): string[][] => {
      if (!restKeys.length) return acc;
      const head = restKeys[0];
      const tail = restKeys.slice(1);
      const next: string[][] = [];
      for (let i = 0; i < acc.length; i++) {
        const row = acc[i];
        const vals = presentRowsByProp[head];
        for (let j = 0; j < vals.length; j++) {
          next.push([...row, `${head}:${vals[j]}`]);
        }
      }
      return cartesianRows(next, tail);
    };
    const combosRows = cartesianRows([[]], rowGroupKeys).map(parts => parts.join(' | '));
    rowGroupIds = combosRows.filter(id => rowGroupIdsSet.has(id));
  }
  dbgi('rowGroupIds', rowGroupIds);

  // Measurements
  const padding = Number(spacing.padding);
  const gap = Number(spacing.gap);
  const groupSpacing = Number(spacing.groups);

  // Compute effective bounding rects for each variant (use absoluteRenderBounds when available)
  type EffRect = { absX: number; absY: number; width: number; height: number; localLeft: number; localTop: number };
  const compAbsX = componentSet.absoluteTransform[0][2];
  const compAbsY = componentSet.absoluteTransform[1][2];

  const effRects: EffRect[] = variants.map((v) => {
    const abs = v.absoluteRenderBounds;
    if (abs) {
      return { absX: abs.x, absY: abs.y, width: abs.width, height: abs.height, localLeft: abs.x - compAbsX, localTop: abs.y - compAbsY };
    }
    // fallback to node-local geometry when absolute render bounds are not available
    return { absX: compAbsX + v.x, absY: compAbsY + v.y, width: v.width, height: v.height, localLeft: v.x, localTop: v.y };
  });

  const colWidths: number[] = colValues.map(cv => {
    let w = 0;
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const p = v.variantProperties as Record<string,string> | null;
      // Treat missing property as the first/implicit value so synthetic axes get measured
      const val = (p ? (p[colKey] ?? colValues[0]) : colValues[0]);
      if (val === cv) w = Math.max(w, effRects[i].width);
    }
    // Ensure minimum width to avoid collapsing when no direct match found
    return Math.max(0, w);
  });

  const rowHeights: number[] = rowValues.map(rv => {
    let h = 0;
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const p = v.variantProperties as Record<string,string> | null;
      // Treat missing property as the first/implicit value so synthetic axes get measured
      const val = (p ? (p[rowKey] ?? rowValues[0]) : rowValues[0]);
      if (val === rv) h = Math.max(h, effRects[i].height);
    }
    return Math.max(0, h);
  });

  const colOffset: number[] = []; { let acc = 0; for (let c=0;c<colValues.length;c++){ colOffset[c] = acc; acc += colWidths[c] + gap; } }
  const blockW = Math.max(0, colWidths.reduce((a,b)=>a+b,0) + gap * Math.max(0,colValues.length-1));

  const rowCenter: number[] = []; if (rowValues.length){ rowCenter[0]=rowHeights[0]/2; for (let r=1;r<rowValues.length;r++){ rowCenter[r]=rowCenter[r-1] + (rowHeights[r-1]/2) + gap + (rowHeights[r]/2); } }
  const blockH = Math.max(0, rowHeights.reduce((a,b)=>a+b,0) + gap * Math.max(0,rowValues.length-1));
  dbg('layout.metrics', { padding, gap, groupSpacing, blockW, blockH, cols: colValues.length, rows: rowValues.length });

  // Place each variant (logs per-node)
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const p = v.variantProperties as Record<string,string> | null; if (!p) continue;
    const idx = i;
    const cIdx = Math.max(0, colValues.indexOf(p[colKey] ?? colValues[0]));
    const rIdx = Math.max(0, rowValues.indexOf(p[rowKey] ?? rowValues[0]));

    const cgId = colGroupIdFor(p);
    const cgIdx = Math.max(0, colGroupIds.indexOf(cgId));

    const rgId = rowGroupIdFor(p);
    const rgIdx = Math.max(0, rowGroupIds.indexOf(rgId));

    // Place column-group blocks left-to-right, preserving Figma property order
    const xBlock = padding + cgIdx * (blockW + groupSpacing);
    const yBand  = padding + rgIdx * (blockH + groupSpacing);

    // Desired center within the Component Set local coordinates
    const desiredCenterX = xBlock + colOffset[cIdx] + (colWidths[cIdx] / 2);
    const desiredCenterY = yBand + rowCenter[rIdx];

    const eff = effRects[idx];
    // eff.localLeft is the left of the rendered bounding box relative to the ComponentSet origin
    const deltaX = eff.localLeft - v.x; // overflow/offset from node origin to bounding box
    const deltaY = eff.localTop - v.y;

    // Compute new node origin so that the rendered bounding box centers at desiredCenter
    const newVX = desiredCenterX - (eff.width / 2) - deltaX;
    const newVY = desiredCenterY - (eff.height / 2) - deltaY;

    // Ensure the rendered bounds respect padding when there's only one axis (synthetic on the other)
    if (isSyntheticRow || isSyntheticCol) {
      const minX = padding;
      const minY = padding;
      const maxX = padding + blockW - eff.width;
      const maxY = padding + blockH - eff.height;
      // Clamp within the intended grid area to avoid drift
      const clampedVX = Math.min(Math.max(newVX, minX), maxX);
      const clampedVY = Math.min(Math.max(newVY, minY), maxY);
      v.x = clampedVX;
      v.y = clampedVY;
    } else {
      v.x = newVX; v.y = newVY;
    }
    dbg('place.variant', {
      name: v.name,
      props: v.variantProperties,
      cIdx, rIdx, cgIdx, rgIdx,
      newVX, newVY
    });
  }

  // (Removed: Visual debug overlay creation)
  // (Removed: Resize ComponentSet to fit all groups -- now handled after tag creation)

  // --- Tags (chips) ---
  dbg('tags.start', { colValues: colValues.length, rowValues: rowValues.length, colGroupIds: colGroupIds.length, rowGroupIds: rowGroupIds.length });
  const parentContainer: BaseNode & ChildrenMixin = (componentSet.parent as (BaseNode & ChildrenMixin)) || (figma.currentPage as unknown as BaseNode & ChildrenMixin);
  const baseX = componentSet.x; const baseY = componentSet.y;
  // Render bounds in the parent's coordinate space (baseX/baseY space), so they compare with x/y below
  const originX = componentSet.absoluteTransform[0][2] - baseX; const originY = componentSet.absoluteTransform[1][2] - baseY;
  const localBounds = (n: FrameNode | GroupNode | VectorNode): Rect | null => { const b = n.absoluteRenderBounds; return b ? { x: b.x - originX, y: b.y - originY, width: b.width, height: b.height } : null; };
  const tagsNodes: SceneNode[] = [];

  // Track the widest horizontal span of column chips across all groups
  let globalMaxColChipSpan = 0;

  if (tag) {
    // Defensive logging to help debug missing tag generation
    try {
      if (!tag.fillSource || !tag.textSource) {
        console.warn('Tag options missing expected color sources:', tag);
      }
    } catch (e) { console.warn('Error inspecting tag options:', e); }
    const defaultFont = { family: tag.fontFamily || 'Inter', style: tag.fontStyle || 'Regular' };
    const boldFont = { family: tag.fontFamily || 'Inter', style: 'Bold' };

    // --- Column chips: per column-group block, with robust overlap detection & two-pass rotation ---
  const baselineY = baseY - TAG_GAP; // bottom-aligned TAG_GAP above the component set
    const colCentersInBlock: number[] = colValues.map((_, i) => colOffset[i] + colWidths[i] / 2);

    if (!isSyntheticCol) {
      for (let gIdx = 0; gIdx < colGroupIds.length; gIdx++) {
        const blockStartX = baseX + padding + gIdx * (blockW + groupSpacing);

        // Create chips once per block so we can reuse them across passes
        const chips: (FrameNode | null)[] = [];
        const preW: number[] = []; const preH: number[] = [];
        for (let c = 0; c < colValues.length; c++) {
          const v = colValues[c];
          // Skip placeholder values (synthetic/missing) — do not create an empty chip
          if (v === '—') { preW[c] = 0; preH[c] = 0; chips.push(null); continue; }
          const segs = isBooleanLiteral(v)
            ? [ { characters: `${colKey}`, bold: true }, { characters: `: ${v}` , bold: false } ]
            : [ { characters: v, bold: false } ];
          const chip = await createChip(segs, tag, defaultFont, boldFont, parentContainer);
          chips.push(chip);
          preW[c] = chip.width; preH[c] = chip.height;
        }

        // Helper: place chips with a rotation flag (no pushing to tags yet)
        const layoutChips = (rotate: boolean): number => {
          let maxTopChipHeight = 0;
          for (let c = 0; c < chips.length; c++) {
            const chip = chips[c];
            // Skip missing chips for placeholder values
            if (!chip) continue;
            const centerX = blockStartX + colCentersInBlock[c];
            chip.rotation = rotate ? 90 : 0;
            if (rotate) {
              const w0 = preW[c], h0 = preH[c];
              chip.x = centerX - (h0 / 2);
              chip.y = baselineY - w0; // align bottom using pre-rotation width
            } else {
              chip.x = centerX - preW[c] / 2;
              chip.y = baselineY - preH[c];
            }
            const rb = localBounds(chip);
            if (rb) {
              chip.x = centerX - (rb.width / 2);
              const currentBottom = rb.y + rb.height;
              chip.y += (baselineY - currentBottom);
              maxTopChipHeight = Math.max(maxTopChipHeight, rb.height);
            } else {
              maxTopChipHeight = Math.max(maxTopChipHeight, chip.height);
            }
            // Removed horizontal clamping: do not restrict chip.x to blockW
          }
          return maxTopChipHeight;
        };

        // Pass 1: try without rotation, then check overlap with rendered bounds
        let maxH = layoutChips(false);
        let overlapped = false;
        {
          // Minimum spacing between chips: use TAG_GAP (24px)
          const MIN_CHIP_GAP = TAG_GAP;
          for (let c = 0; c < chips.length - 1; c++) {
            const a = chips[c]; const b = chips[c+1];
            if (!a || !b) continue;
            const rbA = localBounds(a); const rbB = localBounds(b);
            if (!rbA || !rbB) continue;
            const centerA = rbA.x + rbA.width / 2; const centerB = rbB.x + rbB.width / 2;
            const gapCenters = Math.abs(centerB - centerA);
            const minRequired = (rbA.width / 2) + (rbB.width / 2) + MIN_CHIP_GAP;
            if (gapCenters < minRequired) { overlapped = true; break; }
          }
        }
        // If overlaps, rotate and re-layout; re-evaluate max height
        if (overlapped) { maxH = layoutChips(true); }

        // Final pass: ensure perfect centering using a fresh read of render bounds, then push to tags
        for (let c = 0; c < chips.length; c++) {
          const chip = chips[c];
          if (!chip) continue;
          const centerX = blockStartX + colCentersInBlock[c];
          const rb = localBounds(chip);
          if (rb) {
            chip.x = centerX - (rb.width / 2);
            const currentBottom = rb.y + rb.height;
            chip.y += (baselineY - currentBottom);
            // Removed horizontal clamping: do not restrict chip.x to blockW
          }
          tagsNodes.push(chip);
        }

        // Measure total horizontal span of chips for this column-group block
        let minXChip = Infinity;
        let maxXChip = -Infinity;
        for (let c = 0; c < chips.length; c++) {
          const chip = chips[c];
          if (!chip) continue;
          const rb = localBounds(chip);
          if (!rb) continue;
          if (rb.x < minXChip) minXChip = rb.x;
          const right = rb.x + rb.width;
          if (right > maxXChip) maxXChip = right;
        }
        if (isFinite(minXChip) && isFinite(maxXChip) && minXChip !== Infinity) {
          const span = maxXChip - minXChip;
          if (span > globalMaxColChipSpan) globalMaxColChipSpan = span;
        }

        // Column-group chip (top): compuesto por TODAS las props de column-group
        if (colGroupIds[gIdx] !== '__noColGroup__') {
          const parts = colGroupIds[gIdx].split(' | '); // ["Prop:Val", "Prop2:Val2", ...]
          const segs: { characters: string; bold: boolean }[] = [];
          let allPlaceholders = true;
          for (let i = 0; i < parts.length; i++) {
            const pair: string = parts[i];
            const split = pair.split(':');
            const k = split[0];
            const val = split.slice(1).join(':').trim();
            if (val !== '—') allPlaceholders = false;
            segs.push({ characters: k, bold: true });
            segs.push({ characters: `: ${val}`, bold: false });
            if (i < parts.length - 1) segs.push({ characters: ', ', bold: false });
          }
          if (!allPlaceholders) {
            const cgChip = await createChip(segs, tag, defaultFont, boldFont, parentContainer);

            const topOfTopChipsY = baselineY - maxH; // top of tallest chip AFTER any rotation
            const targetChipBottom = topOfTopChipsY - TAG_GAP; // chip-to-chip spacing = TAG_GAP

            const centerX = blockStartX + blockW / 2;
            cgChip.x = centerX - cgChip.width / 2;
            const rb0 = localBounds(cgChip);
            if (rb0) {
              const dy = targetChipBottom - (rb0.y + rb0.height);
              cgChip.y = (cgChip.y || 0) + dy;
              const dx = centerX - (rb0.x + rb0.width / 2);
              cgChip.x = (cgChip.x || 0) + dx;
            } else {
              cgChip.y = targetChipBottom - cgChip.height;
            }

            const brace = figma.createVector();
            appendFree(parentContainer, brace);
            brace.vectorPaths = [{ windingRule: 'NONE', data: `M 0 ${CONNECTOR} L ${blockW} ${CONNECTOR} M ${blockW/2} 0 L ${blockW/2} ${CONNECTOR}` }];
            await applyStrokeFromSource(brace, tag.braceSource, tag.braceWeight, tag.braceEnabled);
            try { (brace as { strokeCap: StrokeCap | typeof figma.mixed }).strokeCap = 'ROUND'; } catch (_) { /* noop */ }
            const rb1 = localBounds(cgChip);
            const chipBottom = rb1 ? (rb1.y + rb1.height) : (cgChip.y + cgChip.height);
            brace.x = centerX - (blockW / 2);
            brace.y = chipBottom; // touching

            const grouped = groupFree([brace, cgChip], parentContainer); grouped.name = 'col-group-chip';
            grouped.insertChild(0, brace); // brace atrás
            grouped.appendChild(cgChip);   // chip al frente
            tagsNodes.push(grouped);
          }
        }
      }
    }

    // --- Row chips por banda + título de grupo de filas (brace) ---
    if (!isSyntheticRow) {
      for (let rg = 0; rg < rowGroupIds.length; rg++) {
        const yBand = padding + rg * (blockH + groupSpacing);

        // Chips de fila (una vez por banda, a la IZQUIERDA del set)
        let rowsTop = Infinity, rowsBottom = -Infinity;
        let minRowChipLeft = Infinity;
        const targetRight = baseX - TAG_GAP; // borde derecho renderizado de cada chip

  const rowChips: FrameNode[] = [];
  for (let r = 0; r < rowValues.length; r++) {
          const v = rowValues[r];
          // Skip placeholder values
          if (v === '—') continue;
          const segs = isBooleanLiteral(v)
            ? [ { characters: `${rowKey}`, bold: true }, { characters: `: ${v}`, bold: false } ]
            : [ { characters: v, bold: false } ];
          const chip = await createChip(segs, tag, defaultFont, boldFont, parentContainer);
          const targetCenterY = baseY + yBand + rowCenter[r];

          // Posición tentativa a la izquierda (aprox), luego corregimos por bounds
          chip.x = targetRight - chip.width;
          chip.y = targetCenterY - chip.height / 2;

          const rb = localBounds(chip);
          if (rb) {
            const currentRight = rb.x + rb.width;
            chip.x += (targetRight - currentRight);
            const currentCenterY = rb.y + rb.height / 2;
            chip.y += (targetCenterY - currentCenterY);
            const newTop = (localBounds(chip)?.y ?? chip.y);
            const newBottom = ((localBounds(chip)?.y ?? chip.y) + (localBounds(chip)?.height ?? chip.height));
            if (newTop < rowsTop) rowsTop = newTop;
            if (newBottom > rowsBottom) rowsBottom = newBottom;
            const left = rb.x;
            if (left < minRowChipLeft) minRowChipLeft = left;
          } else {
            if (chip.y < rowsTop) rowsTop = chip.y;
            if (chip.y + chip.height > rowsBottom) rowsBottom = chip.y + chip.height;
            if (chip.x < minRowChipLeft) minRowChipLeft = chip.x;
          }
          tagsNodes.push(chip);
          rowChips.push(chip);
        }
        // Ensure minimum vertical spacing (TAG_GAP) between row chips (stacking to avoid overlap)
        if (rowChips.length) {
          // Sort by current top
          rowChips.sort((a,b) => {
            const ta = (localBounds(a)?.y ?? a.y);
            const tb = (localBounds(b)?.y ?? b.y);
            return ta - tb;
          });
          for (let i = 1; i < rowChips.length; i++) {
            const prev = rowChips[i-1]; const cur = rowChips[i];
            const prevTop = (localBounds(prev)?.y ?? prev.y);
            const prevH = (localBounds(prev)?.height ?? prev.height);
            const curTop = (localBounds(cur)?.y ?? cur.y);
            const requiredTop = prevTop + prevH + TAG_GAP;
            if (curTop < requiredTop) {
              const shift = requiredTop - curTop;
              cur.y = (cur.y || 0) + shift;
            }
          }
        }

        if (!isFinite(rowsTop) || !isFinite(rowsBottom)) { rowsTop = baseY + yBand; rowsBottom = baseY + yBand + blockH; }
        if (!isFinite(minRowChipLeft)) { minRowChipLeft = baseX - TAG_GAP; }
        const rowsHeight = Math.max(0, rowsBottom - rowsTop);
        const rowsCenterY = rowsTop + rowsHeight / 2;

        // Chip combinado de grupo de filas con brace (si hay 4º+ claves)
        if (rowGroupKeys.length) {
          const obj: Record<string,string> = {};
          const firstMatch = variants.find((v) => {
            const vp = (v.variantProperties as Record<string, string> | null) || null;
            return rowGroupIdFor(vp) === rowGroupIds[rg];
          });
          const p = (firstMatch?.variantProperties || {}) as Record<string,string>;
          for (let i = 0; i < rowGroupKeys.length; i++) {
            const k = rowGroupKeys[i];
            obj[k] = p[k] ?? '—';
          }
          const textSegments: { characters: string, bold: boolean }[] = [];
          const keys = Object.keys(obj);
          let allPlaceholders = true;
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (obj[k] !== '—') allPlaceholders = false;
            textSegments.push({ characters: k, bold: true });
            textSegments.push({ characters: `: ${obj[k]}`, bold: false });
            if (i < keys.length - 1) textSegments.push({ characters: ', ', bold: false });
          }
          if (!allPlaceholders) {
            const titleChip = await createChip(textSegments, tag, defaultFont, boldFont, parentContainer);

            // El brace debe estar a GROUP_CHIP_GAP a la IZQUIERDA del CHIP DE ROW más ancho (referencia = borde IZQUIERDO mínimo)
            const braceRightX = (minRowChipLeft) - GROUP_CHIP_GAP;

            // Posicionar el chip pegado al brace (0px interno)
            titleChip.x = braceRightX - titleChip.width; // aproximación
            titleChip.y = rowsCenterY - titleChip.height / 2;
            const trb = localBounds(titleChip);
            if (trb) {
              const tright = trb.x + trb.width;
              titleChip.x += (braceRightX - tright);
              const tcy = trb.y + trb.height / 2;
              titleChip.y += (rowsCenterY - tcy);
            }

            // Brace vertical con la punta hacia la IZQUIERDA (180° respecto al horizontal superior)
            const braceVec = figma.createVector();
            appendFree(parentContainer, braceVec);
            braceVec.vectorPaths = [{ windingRule: 'NONE', data: `M 0 0 L 0 ${rowsHeight} M -${CONNECTOR} ${rowsHeight/2} L 0 ${rowsHeight/2}` }];
            braceVec.x = braceRightX; braceVec.y = rowsTop;
            await applyStrokeFromSource(braceVec, tag.braceSource, tag.braceWeight, tag.braceEnabled);
            try { (braceVec as { strokeCap: StrokeCap | typeof figma.mixed }).strokeCap = 'ROUND'; } catch (_) { /* noop */ }

            const groupChip = groupFree([braceVec, titleChip], parentContainer); groupChip.name = 'row-group-chip';
            groupChip.insertChild(0, braceVec); // brace atrás
            groupChip.appendChild(titleChip);   // chip al frente
            tagsNodes.push(groupChip);
          }
        }
      }
    }
  }

  // Resize ComponentSet to fit grid width OR chip span, whichever is wider
  const compW_base = padding*2 + (blockW * colGroupIds.length) + groupSpacing * Math.max(0, colGroupIds.length - 1);
  const chipAwareWidth = (globalMaxColChipSpan > 0 && !isSyntheticCol) ? Math.ceil(globalMaxColChipSpan + padding) : 0;
  const compW = Math.max(compW_base, chipAwareWidth);
  const compH = padding*2 + (blockH * rowGroupIds.length) + groupSpacing * Math.max(0, rowGroupIds.length - 1);
  componentSet.resizeWithoutConstraints(compW, compH);

  if (tagsNodes.length > 0) {
    const groupParent: BaseNode & ChildrenMixin = (componentSet.parent as (BaseNode & ChildrenMixin)) || (figma.currentPage as unknown as BaseNode & ChildrenMixin);
    const tagGroup = groupFree(tagsNodes, groupParent);
    tagGroup.name = `${componentSet.name} tags`;
    tagGroup.setPluginData(PLUGIN_KEYS.tagsFor, componentSet.id);
  }

  return null;
}
