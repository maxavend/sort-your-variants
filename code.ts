// code.ts — Sort your variants (patched)
// Changes in this revision:
// 1. Plugin window size set to 520x600.
// 2. Corrected ComponentSet frame resizing logic to prevent variants from being cut off.
// 3. Group tags now combine multiple properties into a single tag, showing "PropertyName: Value".
// 4. Robust defaults: no undefined in TagOptions. Defaults = Fill #E5E5E5, Stroke #A3A3A3, Text #404040, Inter 16, Brace #D4D4D4.
// 5. Brace rendered below chip (z-order).
// 6. Column chips: auto-rotation 90° when overlapping, bottom-aligned, 48px from Component Set.

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
  fontFamily?: string;
  fontStyle?: string;
}

type StrokeCapableNode = GeometryMixin & BlendMixin & MinimalStrokesMixin & { strokeWeight: number | typeof figma.mixed };

const DEFAULT_SPACING: SpacingPrefs = { padding: 48, gap: 48, groups: 128 };
const PLUGIN_KEYS = { spacing: 'spacing_preferences', order: 'property_order', tag: 'tag_options' } as const;

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
  braceSource: { type: 'hex', id: null, value: '#D4D4D4' },
  fontFamily: 'Inter',
  fontStyle: 'Regular',
};

// Layout constants
const TAG_GAP = 48;
const CONNECTOR = 12;
const GROUP_CHIP_GAP = 48;

// FIX 1: Plugin window size updated
figma.showUI(__html__, { width: 520, height: 600 });

// ---------------- Utilities ----------------
function isComponentSet(node: SceneNode | null): node is ComponentSetNode { return !!node && node.type === 'COMPONENT_SET'; }
function hasLayoutMode(node: BaseNode | null): node is AutoLayoutNode { return !!node && (node as { layoutMode?: unknown }).layoutMode !== undefined; }

function indexOfStr(arr: string[], v: string | undefined): number { if (!v) return -1; for (let i = 0; i < arr.length; i++) if (arr[i] === v) return i; return -1; }
function pushUnique(arr: string[], v: string): void { if (indexOfStr(arr, v) === -1) arr.push(v); }

function deriveValueOrder(variants: ComponentNode[], key: string, defined: string[]): string[] {
  const present: string[] = [];
  for (const variant of variants) {
    const props = variant.variantProperties as Record<string, string> | null; if (!props) continue; const val = props[key]; if (val) pushUnique(present, val);
  }
  const ordered: string[] = []; for (const d of defined) if (indexOfStr(present, d) !== -1) ordered.push(d); for (const p of present) if (indexOfStr(ordered, p) === -1) ordered.push(p); return ordered;
}

function isBooleanLiteral(val: string | undefined | null): boolean {
  if (val === undefined || val === null) return false;
  const l = String(val).trim().toLowerCase();
  return l === 'true' || l === 'false';
}

function computeFallbackOrder(variantProps: VariantPropsMap): string[] {
  const keys = Object.keys(variantProps); if (keys.length === 0) return [];
  const tuples = keys.map(k => ({ k, len: variantProps[k]?.values.length || 0 }));
  tuples.sort((a, b) => (b.len - a.len) || a.k.localeCompare(b.k));
  return tuples.map(t => t.k);
}

function rgbFromHex(hex: string): RGB { const h = hex.replace('#',''); const r = parseInt(h.slice(0,2), 16) / 255; const g = parseInt(h.slice(2,4), 16) / 255; const b = parseInt(h.slice(4,6), 16) / 255; return { r, g, b }; }
function toHexByte(n: number): string { const nn = Math.max(0, Math.min(255, Math.round(n))); const s = nn.toString(16); return s.length === 1 ? '0' + s : s; }
function _rgbToHex(rgb: RGB): string { return '#' + toHexByte(rgb.r * 255) + toHexByte(rgb.g * 255) + toHexByte(rgb.b * 255); }

function getPreferences(componentSet: ComponentSetNode) {
  const savedSpacing = componentSet.getPluginData(PLUGIN_KEYS.spacing);
  const savedOrder = componentSet.getPluginData(PLUGIN_KEYS.order);
  const savedTag = componentSet.getPluginData(PLUGIN_KEYS.tag);
  const spacing = savedSpacing ? (JSON.parse(savedSpacing) as SpacingPrefs) : DEFAULT_SPACING;
  const propertyOrder = savedOrder ? (JSON.parse(savedOrder) as string[]) : ([] as string[]);

  // Always return normalized TagOptions (no undefined)
  const parsedTag = savedTag ? JSON.parse(savedTag) : undefined;
  const tagOptions = normalizeTagOptions(parsedTag);

  return { spacing, propertyOrder, tagOptions };
}

function normalizeColorSource(input: unknown, fallbackHex: string): ColorSource {
  const isCS = !!input && typeof input === 'object' && 'type' in (input as Record<string, unknown>);
  if (isCS) return input as ColorSource;
  const hex = String(input || fallbackHex).replace(/#/g, '');
  return { type: 'hex', id: null, value: '#' + hex };
}

function normalizeTagOptions(raw: unknown): TagOptions {
  const base = { ...DEFAULT_TAG_OPTIONS };
  if (!raw || typeof raw !== 'object') return base;

  const r = raw as Record<string, unknown>;
  return {
    enableFill: r.enableFill === undefined ? base.enableFill : Boolean(r.enableFill),
    fillSource: normalizeColorSource(r.fillSource ?? r.fillHex, base.fillSource.value),
    enableStroke: r.enableStroke === undefined ? base.enableStroke : Boolean(r.enableStroke),
    strokeSource: normalizeColorSource(r.strokeSource ?? r.strokeHex, base.strokeSource.value),
    strokeWeight: Number(r.strokeWeight ?? base.strokeWeight),
    cornerRadius: Number(r.cornerRadius ?? base.cornerRadius),
    textSize: Number(r.textSize ?? base.textSize),
    textSource: normalizeColorSource(r.textSource ?? r.textColor, base.textSource.value),
    braceEnabled: r.braceEnabled === undefined ? base.braceEnabled : (r.braceEnabled !== false),
    braceSide: (r.braceSide as 'left' | 'right' | 'auto') ?? base.braceSide,
    braceSource: normalizeColorSource(r.braceSource ?? r.braceStrokeHex, base.braceSource.value),
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

// ---------------- Messaging helpers ----------------
function snapshotSelection() {
  const sel = figma.currentPage.selection;
  if (sel.length === 1 && isComponentSet(sel[0])) {
    const cs = sel[0];
    let properties: VariantPropsMap = {};
    try { properties = cs.variantGroupProperties as VariantPropsMap; } catch (e) { console.warn('variantGroupProperties error:', e); }
    const preferences = getPreferences(cs);
    figma.ui.postMessage({
      type: 'selection-changed', componentSetId: cs.id, componentSetName: cs.name,
      properties: properties, propertyKeys: Object.keys(properties), spacing: preferences.spacing,
      propertyOrder: preferences.propertyOrder, tagOptions: preferences.tagOptions,
    });
  } else {
    figma.ui.postMessage({ type: 'selection-changed', componentSetId: '', componentSetName: '', properties: {}, propertyKeys: [], spacing: DEFAULT_SPACING, propertyOrder: [] });
  }
}
setTimeout(snapshotSelection, 50);
figma.on('selectionchange', snapshotSelection);

// ---------------- Fonts & Tokens ----------------
async function sendFontsToUI() { const fonts = await figma.listAvailableFontsAsync(); figma.ui.postMessage({ type: 'fonts-list', fonts }); }

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
async function createChip(textSegments: { characters: string, bold: boolean }[], tag: TagOptions, defaultFont: { family: string, style: string }, boldFont: { family: string, style: string }): Promise<FrameNode> {
  const chip = figma.createFrame();
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
    const fontToUse = segment.bold ? boldFont : defaultFont;
    await figma.loadFontAsync(fontToUse);
    textNode.setRangeFontName(currentPos, currentPos + segment.characters.length, fontToUse);
    currentPos += segment.characters.length;
  }

  chip.appendChild(textNode);
  return chip;
}

// ---------------- Core organizer ----------------
async function organizeVariantsByOrder(componentSet: ComponentSetNode, propertyOrder: string[], spacing: SpacingPrefs, tag?: TagOptions): Promise<string | null> {
  const variants = componentSet.children.filter((n): n is ComponentNode => n.type === 'COMPONENT');
  let variantProps: VariantPropsMap;
  try {
    variantProps = componentSet.variantGroupProperties as VariantPropsMap;
  } catch (e) {
    console.warn(e);
    return '⚠️ Variant conflict. Ensure properties/values are consistent.';
  }
  if (Object.keys(variantProps).length < 1) return '⚠️ Component Set needs at least one property';

  const orderedKeys = propertyOrder && propertyOrder.length > 0 ? propertyOrder : Object.keys(variantProps);

  // NEW BEHAVIOR
  // 1º -> COLUMNS, 2º -> ROWS, 3º -> COLUMN GROUPS, 4º+ -> ROW GROUPS
  if (orderedKeys.length >= 3) {
    const colKey = orderedKeys[0];
    const rowKey = orderedKeys[1];
    const colGroupKey = orderedKeys[2];
    const rowGroupKeys = orderedKeys.slice(3);
    return await organizeVariantsCoreV2(
      componentSet,
      rowKey,
      colKey,
      colGroupKey,
      rowGroupKeys,
      spacing,
      variants,
      variantProps,
      tag || undefined
    );
  }

  // Fallbacks: preserve compatibility when there are < 3 propiedades
  if (orderedKeys.length === 2) {
    const colKey = orderedKeys[0];
    const rowKey = orderedKeys[1];
    return await organizeVariantsCore(
      componentSet,
      rowKey,
      colKey,
      [],
      spacing,
      variants,
      variantProps,
      tag
    );
  }

  // Only one key → treat as columns with a single implicit row
  const onlyKey = orderedKeys[0];
  return await organizeVariantsCore(
    componentSet,
    null,
    onlyKey,
    [],
    spacing,
    variants,
    variantProps,
    tag
  );
}

async function organizeVariantsCore(
  componentSet: ComponentSetNode,
  rowProperty: string | null,
  columnProperty: string,
  groupKeys: string[],
  spacing: SpacingPrefs,
  variants: ComponentNode[],
  variantProps: VariantPropsMap,
  rawTag?: TagOptions
): Promise<string | null> {
  if (componentSet.parent) {
    const parent = componentSet.parent as (BaseNode & ChildrenMixin);
    const prev = parent.children.filter((n) => n.type === 'GROUP' && n.name === `${componentSet.name} tags`) as GroupNode[];
    prev.forEach((g) => g.remove());
  }

  ensureSetFreePositioning(componentSet);
  const tag: TagOptions | null = rawTag ? normalizeTagOptions(rawTag) : null;

  const definedCols = variantProps[columnProperty]?.values || []; const colValues = deriveValueOrder(variants, columnProperty, definedCols);
  const definedRows = rowProperty ? (variantProps[rowProperty]?.values || []) : []; const rowValues = rowProperty ? deriveValueOrder(variants, rowProperty, definedRows) : ['default'];

  function pickGroupProps(variant: ComponentNode) { const src = variant.variantProperties as Record<string, string> | null; const out: Record<string, string> = {}; if (!src) return out; for (const gk of groupKeys) { const val = src[gk]; if (val) out[gk] = val; } return out; }
  const groupsJSON: string[] = []; for (const v of variants) { const j = JSON.stringify(pickGroupProps(v)); if (indexOfStr(groupsJSON, j) === -1) groupsJSON.push(j); }
  const groupsCount = Math.max(1, groupsJSON.length);

  const padding = Number(spacing.padding); const gap = Number(spacing.gap); const groupSpacing = Number(spacing.groups);

  const colWidths: number[] = colValues.map(cv => { let w = 0; for (const v of variants) { const p = v.variantProperties as Record<string, string> | null; if (p && p[columnProperty] === cv) w = Math.max(w, v.width); } return w; });
  const rowRefHeights: number[] = rowValues.map(rv => { let h = 0; for (const v of variants) { const p = v.variantProperties as Record<string, string> | null; if (!rowProperty) { h = Math.max(h, v.height); continue; } if (p && p[rowProperty] === rv) h = Math.max(h, v.height); } return h; });

  const colOffset: number[] = []; { let acc = padding; for (let c = 0; c < colValues.length; c++) { colOffset[c] = acc; acc += colWidths[c] + gap; } }
  const rowCenter: number[] = []; if (rowValues.length > 0) {
    rowCenter[0] = rowRefHeights[0] / 2;
    for (let r = 1; r < rowValues.length; r++) {
      rowCenter[r] = rowCenter[r-1] + (rowRefHeights[r-1] / 2) + gap + (rowRefHeights[r] / 2);
    }
  } else {
    rowCenter[0] = rowRefHeights.length > 0 ? rowRefHeights[0] / 2 : 0;
  }

  // FIX 2: Corrected frame resizing logic
  const innerW = colWidths.reduce((a, b) => a + b, 0) + gap * Math.max(0, colValues.length - 1);
  const blockH = rowRefHeights.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowValues.length - 1);
  const compW = padding * 2 + innerW;
  const compH = padding * 2 + (blockH * groupsCount) + groupSpacing * Math.max(0, groupsCount - 1);

  for (const v of variants) {
    const props = v.variantProperties as Record<string, string> | null; if (!props) continue;
    let c = indexOfStr(colValues, props[columnProperty]); if (c < 0) c = 0;
    let r = rowProperty ? indexOfStr(rowValues, props[rowProperty]) : 0; if (r < 0) r = 0;
    let g = 0; if (groupsJSON.length > 1) { const gj = JSON.stringify(pickGroupProps(v)); const gi = indexOfStr(groupsJSON, gj); g = gi >= 0 ? gi : 0; }

    const cx = colOffset[c] + (colWidths[c] - v.width) / 2;
    const cy = (padding + g * (blockH + groupSpacing)) + (rowCenter[r] - v.height / 2);
    v.x = cx; v.y = cy;
  }

  componentSet.resizeWithoutConstraints(compW, compH);

  const parentContainer: BaseNode & ChildrenMixin = (componentSet.parent as (BaseNode & ChildrenMixin)) || (figma.currentPage as unknown as BaseNode & ChildrenMixin);
  const baseX = componentSet.x; const baseY = componentSet.y;
  const tagsNodes: SceneNode[] = [];

  if (tag) {
    const defaultFont = { family: tag.fontFamily || 'Inter', style: tag.fontStyle || 'Regular' };
    const boldFont = { family: tag.fontFamily || 'Inter', style: 'Bold' };

    // --- Column chips (with overlap detection & rotation + strict bottom align) ---
    const columnChips: FrameNode[] = [];
    const colCenters: number[] = [];
    const preW: number[] = [];
    const preH: number[] = [];

    for (let c = 0; c < colValues.length; c++) {
      const chip = await createChip([{ characters: colValues[c], bold: false }], tag, defaultFont, boldFont);
      columnChips.push(chip);
      // Ensure chip is in the document so we can read render bounds
      parentContainer.appendChild(chip);
      colCenters[c] = colOffset[c] + colWidths[c] / 2;
      preW[c] = chip.width;
      preH[c] = chip.height;
    }

    // Overlap detection: compare center distance with half-width sums (+8px proximity threshold)
    let rotateColumns = false;
    const MIN_CHIP_GAP = 8; // px
    for (let c = 0; c < columnChips.length - 1; c++) {
      const gapCenters = colCenters[c + 1] - colCenters[c];
      const halfLeft = columnChips[c].width / 2;
      const halfRight = columnChips[c + 1].width / 2;
      const minRequired = halfLeft + halfRight + MIN_CHIP_GAP; // need at least 8px of air
      if (gapCenters < minRequired) { rotateColumns = true; break; }
    }

    // Bottom baseline 48px above the top edge of the set
    const baselineY = baseY - TAG_GAP;

    for (let c = 0; c < columnChips.length; c++) {
      const chip = columnChips[c];
      const centerX = colCenters[c];

      if (!rotateColumns) {
        // Tentative position
        chip.x = baseX + centerX - chip.width / 2;
        chip.y = baselineY - chip.height;
      } else {
        // 90° rotation around top-left; set tentative position using pre-rotation sizes
        const w0 = preW[c];
        const h0 = preH[c];
        chip.rotation = 90;
        chip.x = baseX + centerX - (h0 / 2);
        chip.y = baselineY - w0; // align bottom using pre-rotation width as rotated height
      }

      // --- Correction using actual rendered bounds (accounts for rotation pivot + strokes/effects) ---
      const rb = chip.absoluteRenderBounds;
      if (rb) {
        // Re-center horizontally using rendered width
        chip.x = baseX + centerX - (rb.width / 2);
        // Force exact bottom alignment to baseline
        const currentBottom = rb.y + rb.height;
        chip.y += (baselineY - currentBottom);
      }

      tagsNodes.push(chip);
    }

    // --- Row chips & group chips with brace ---
    for (let g = 0; g < groupsCount; g++) {
      const groupTopY = padding + g * (blockH + groupSpacing);
      let minRowChipX = Infinity;
      const rowChipNodes: FrameNode[] = [];

      if (rowProperty && rowValues.length > 1) {
        for (let r = 0; r < rowValues.length; r++) {
          const chip = await createChip([{ characters: rowValues[r], bold: false }], tag, defaultFont, boldFont);
          const centerY = groupTopY + rowCenter[r];
          chip.x = baseX - TAG_GAP - chip.width;
          chip.y = baseY + centerY - chip.height / 2;
          tagsNodes.push(chip); rowChipNodes.push(chip);
          if (chip.x < minRowChipX) minRowChipX = chip.x;
        }
      } else {
        minRowChipX = baseX - TAG_GAP;
      }

      let rowsTop = Infinity, rowsBottom = -Infinity;
      for (const rc of rowChipNodes) { rowsTop = Math.min(rowsTop, rc.y); rowsBottom = Math.max(rowsBottom, rc.y + rc.height); }
      if (!isFinite(rowsTop) || !isFinite(rowsBottom)) { rowsTop = baseY + groupTopY; rowsBottom = baseY + groupTopY + blockH; }
      const rowsHeight = Math.max(0, rowsBottom - rowsTop);
      const rowsCenterY = rowsTop + rowsHeight / 2;

      if (groupsCount > 1 && groupKeys.length > 0) {
        const obj = JSON.parse(groupsJSON[g] || '{}') as Record<string, string>;
        // FIX 3: Create combined group tag with bold property names
        const textSegments: { characters: string, bold: boolean }[] = [];
        const keys = Object.keys(obj);
        keys.forEach((k, index) => {
          textSegments.push({ characters: k, bold: true });
          textSegments.push({ characters: `: ${obj[k]}`, bold: false });
          if (index < keys.length - 1) { textSegments.push({ characters: ', ', bold: false }); }
        });

        const titleChip = await createChip(textSegments, tag, defaultFont, boldFont);
        const groupChipRight = minRowChipX - GROUP_CHIP_GAP;
        titleChip.x = groupChipRight - titleChip.width;
        titleChip.y = rowsCenterY - titleChip.height / 2;

        const braceVec = figma.createVector();
        braceVec.vectorPaths = [{
          windingRule: 'NONE',
          data: `M ${CONNECTOR} 0 L ${CONNECTOR} ${rowsHeight} M 0 ${rowsHeight/2} L ${CONNECTOR} ${rowsHeight/2}`
        }];
        braceVec.x = groupChipRight; braceVec.y = rowsTop;
        await applyStrokeFromSource(braceVec, tag.braceSource, Math.max(1, tag.strokeWeight), tag.braceEnabled);
        try { (braceVec as { strokeCap: StrokeCap | typeof figma.mixed }).strokeCap = 'ROUND'; } catch (_) { /* noop: strokeCap may be unsupported */ }

        // Brace below, chip above without non-existent methods
        const braceGroup = figma.group([braceVec], parentContainer); braceGroup.name = 'brace';
        const groupChip = figma.group([braceGroup, titleChip], parentContainer); groupChip.name = 'group-chip';
        // Ensure stacking order: brace below, chip above without non-existent methods
        groupChip.appendChild(titleChip);

        tagsNodes.push(groupChip);
      }
    }
  }

  if (tagsNodes.length > 0) {
    const groupParent: BaseNode & ChildrenMixin = (componentSet.parent as (BaseNode & ChildrenMixin)) || (figma.currentPage as unknown as BaseNode & ChildrenMixin);
    const tagGroup = figma.group(tagsNodes, groupParent);
    tagGroup.name = `${componentSet.name} tags`;
  }

  return null;
}

// ---------------- Message handlers ----------------
figma.ui.onmessage = async (msg: unknown) => {
  const m = msg as { type: string; [k: string]: unknown };
  if (m.type === 'ui-loaded') { await sendFontsToUI(); setTimeout(snapshotSelection, 50); return; }

  if (m.type === 'order-updated-ui') {
    const order = (m as { order?: string[] }).order;
    const s = figma.currentPage.selection[0];
    if (s && isComponentSet(s) && Array.isArray(order)) { s.setPluginData(PLUGIN_KEYS.order, JSON.stringify(order)); }
    return;
  }

  if (m.type === 'organize-variants') {
    const sel = figma.currentPage.selection;
    if (!(sel.length === 1 && isComponentSet(sel[0]))) {
      const msg = '⚠️ Select a Component Set';
      figma.notify(msg);
      figma.ui.postMessage({ type: 'organize-error', message: msg });
      return;
    }
    const cs = sel[0];

    const payload = m as { spacing?: Partial<SpacingPrefs>; propertyOrder?: string[]; tagOptions?: unknown };

    const spacing: SpacingPrefs = { ...DEFAULT_SPACING, ...(payload.spacing || {}) } as SpacingPrefs;
    cs.setPluginData(PLUGIN_KEYS.spacing, JSON.stringify(spacing));
    const propertyOrder: string[] = Array.isArray(payload.propertyOrder) ? payload.propertyOrder : [];
    cs.setPluginData(PLUGIN_KEYS.order, JSON.stringify(propertyOrder));

    const currentPrefs = getPreferences(cs);
    if (payload.tagOptions) {
      cs.setPluginData(PLUGIN_KEYS.tag, JSON.stringify(normalizeTagOptions(payload.tagOptions)));
    }

    // Use payload (if any) else persisted; normalized in all cases
    const normTag = normalizeTagOptions(payload.tagOptions ?? currentPrefs.tagOptions);
    await loadCoreFonts({ family: normTag.fontFamily, style: normTag.fontStyle });

    ensureSetFreePositioning(cs);

    let variantProps: VariantPropsMap;
    try {
      variantProps = cs.variantGroupProperties as VariantPropsMap;
    } catch (e) {
      const msg = '⚠️ Variant conflict';
      figma.notify(msg);
      figma.ui.postMessage({ type: 'organize-error', message: msg });
      return;
    }
    const finalOrder = propertyOrder.length ? propertyOrder : computeFallbackOrder(variantProps);

    const error = await organizeVariantsByOrder(cs, finalOrder, spacing, normTag || undefined);
    if (error) {
      figma.notify(error);
      figma.ui.postMessage({ type: 'organize-error', message: error });
    } else {
      figma.notify('✅ Variants organized');
      figma.ui.postMessage({ type: 'organize-done' });
    }
    return;
  }
};

// --- organizeVariantsCoreV2: supports column groups and row groups ---
async function organizeVariantsCoreV2(
  componentSet: ComponentSetNode,
  rowKey: string,
  colKey: string,
  colGroupKey: string | null,
  rowGroupKeys: string[],
  spacing: SpacingPrefs,
  variants: ComponentNode[],
  variantProps: VariantPropsMap,
  rawTag?: TagOptions
): Promise<string | null> {
  // Prepare
  ensureSetFreePositioning(componentSet);
  const tag: TagOptions | null = rawTag ? normalizeTagOptions(rawTag) : null;

  const definedCols = variantProps[colKey]?.values || [];
  const colValues = deriveValueOrder(variants, colKey, definedCols);

  const definedRows = variantProps[rowKey]?.values || [];
  const rowValues = deriveValueOrder(variants, rowKey, definedRows);

  // Column groups (3º clave): if missing, single group
  const colGroupValues: string[] = [];
  if (colGroupKey) {
    for (const v of variants) {
      const p = v.variantProperties as Record<string,string> | null; if (!p) continue;
      const g = p[colGroupKey] ?? '__noColGroup__';
      if (colGroupValues.indexOf(g) === -1) colGroupValues.push(g);
    }
  } else {
    colGroupValues.push('__noColGroup__');
  }

  // Row group ids (4º+): concatenated "Prop:Value" stable order
  const rowGroupIds: string[] = [];
  function rowGroupIdFor(p: Record<string,string> | null): string {
    if (!rowGroupKeys.length) return '__noRowGroup__';
    const segs: string[] = [];
    for (const k of rowGroupKeys) segs.push(`${k}:${p?.[k] ?? '—'}`);
    return segs.join(' | ');
  }
  for (const v of variants) {
    const p = v.variantProperties as Record<string,string> | null;
    const id = rowGroupIdFor(p);
    if (rowGroupIds.indexOf(id) === -1) rowGroupIds.push(id);
  }

  // Measurements
  const padding = Number(spacing.padding);
  const gap = Number(spacing.gap);
  const groupSpacing = Number(spacing.groups);

  const colWidths: number[] = colValues.map(cv => {
    let w = 0; for (const v of variants) { const p = v.variantProperties as Record<string,string> | null; if (p && p[colKey] === cv) w = Math.max(w, v.width); }
    return w;
  });
  const rowHeights: number[] = rowValues.map(rv => {
    let h = 0; for (const v of variants) { const p = v.variantProperties as Record<string,string> | null; if (p && p[rowKey] === rv) h = Math.max(h, v.height); }
    return h;
  });

  const colOffset: number[] = []; { let acc = 0; for (let c=0;c<colValues.length;c++){ colOffset[c] = acc; acc += colWidths[c] + gap; } }
  const blockW = Math.max(0, colWidths.reduce((a,b)=>a+b,0) + gap * Math.max(0,colValues.length-1));

  const rowCenter: number[] = []; if (rowValues.length){ rowCenter[0]=rowHeights[0]/2; for (let r=1;r<rowValues.length;r++){ rowCenter[r]=rowCenter[r-1] + (rowHeights[r-1]/2) + gap + (rowHeights[r]/2); } }
  const blockH = Math.max(0, rowHeights.reduce((a,b)=>a+b,0) + gap * Math.max(0,rowValues.length-1));

  // Remove any previous tag group for this Component Set (replace, don't stack)
  if (componentSet.parent) {
    const parent = componentSet.parent as (BaseNode & ChildrenMixin);
    const prev = parent.children.filter((n) => n.type === 'GROUP' && n.name === `${componentSet.name} tags`) as GroupNode[];
    prev.forEach((g) => g.remove());
  }

  // Place each variant
  for (const v of variants) {
    const p = v.variantProperties as Record<string,string> | null; if (!p) continue;
    const cIdx = Math.max(0, colValues.indexOf(p[colKey] ?? colValues[0]));
    const rIdx = Math.max(0, rowValues.indexOf(p[rowKey] ?? rowValues[0]));
    const cgVal = colGroupKey ? (p[colGroupKey] ?? '__noColGroup__') : '__noColGroup__';
    const cgIdx = Math.max(0, colGroupValues.indexOf(cgVal));
    const rgIdx = Math.max(0, rowGroupIds.indexOf(rowGroupIdFor(p)));

  // Place column-group blocks left-to-right, preserving Figma property order
  const xBlock = padding + cgIdx * (blockW + groupSpacing);
    const yBand  = padding + rgIdx * (blockH + groupSpacing);

    const cx = xBlock + colOffset[cIdx] + (colWidths[cIdx] - v.width) / 2;
    const cy = yBand  + rowCenter[rIdx] - v.height / 2;

    v.x = cx; v.y = cy;
  }

  // Resize ComponentSet to fit all groups
  const compW = padding*2 + (blockW * colGroupValues.length) + groupSpacing * Math.max(0, colGroupValues.length - 1);
  const compH = padding*2 + (blockH * rowGroupIds.length) + groupSpacing * Math.max(0, rowGroupIds.length - 1);
  componentSet.resizeWithoutConstraints(compW, compH);

  // --- Tags (chips) ---
  const parentContainer: BaseNode & ChildrenMixin = (componentSet.parent as (BaseNode & ChildrenMixin)) || (figma.currentPage as unknown as BaseNode & ChildrenMixin);
  const baseX = componentSet.x; const baseY = componentSet.y;
  const setRightX = baseX + compW;
  const tagsNodes: SceneNode[] = [];

  if (tag) {
    const defaultFont = { family: tag.fontFamily || 'Inter', style: tag.fontStyle || 'Regular' };
    const boldFont = { family: tag.fontFamily || 'Inter', style: 'Bold' };

    // --- Column chips: per column-group block, with robust overlap detection & two-pass rotation ---
    const baselineY = baseY - TAG_GAP; // bottom-aligned 48px above the component set
    const colCentersInBlock: number[] = colValues.map((_, i) => colOffset[i] + colWidths[i] / 2);

    for (let gIdx = 0; gIdx < colGroupValues.length; gIdx++) {
      // Place blocks left-to-right to respect the defined order of property values
      const blockStartX = baseX + padding + gIdx * (blockW + groupSpacing);

      // Create chips once per block so we can reuse them across passes
      const chips: FrameNode[] = [];
      const preW: number[] = []; const preH: number[] = [];
      for (let c = 0; c < colValues.length; c++) {
        const v = colValues[c];
        const segs = isBooleanLiteral(v)
          ? [ { characters: `${colKey}`, bold: true }, { characters: `: ${v}` , bold: false } ]
          : [ { characters: v, bold: false } ];
        const chip = await createChip(segs, tag, defaultFont, boldFont);
        parentContainer.appendChild(chip);
        chips.push(chip);
        preW[c] = chip.width; preH[c] = chip.height;
      }

      // Helper: place chips with a rotation flag (no pushing to tags yet)
      const layoutChips = (rotate: boolean): number => {
        let maxTopChipHeight = 0;
        for (let c = 0; c < chips.length; c++) {
          const chip = chips[c];
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
          const rb = chip.absoluteRenderBounds;
          if (rb) {
            // center and bottom-align using rendered bounds
            chip.x = centerX - (rb.width / 2);
            const currentBottom = rb.y + rb.height;
            chip.y += (baselineY - currentBottom);
            maxTopChipHeight = Math.max(maxTopChipHeight, rb.height);
          } else {
            maxTopChipHeight = Math.max(maxTopChipHeight, chip.height);
          }
          // Clamp within this block using rendered width when available
          const rb2 = chip.absoluteRenderBounds;
          const effW = rb2 ? rb2.width : chip.width;
          const minX = blockStartX; const maxX = blockStartX + blockW - effW;
          chip.x = Math.max(minX, Math.min(maxX, chip.x));
        }
        return maxTopChipHeight;
      };

      // Pass 1: try without rotation, then check overlap with rendered bounds
      let maxH = layoutChips(false);
      let overlapped = false;
      {
        const MIN_CHIP_GAP = 8;
        for (let c = 0; c < chips.length - 1; c++) {
          const rbA = chips[c].absoluteRenderBounds; const rbB = chips[c+1].absoluteRenderBounds;
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
        const centerX = blockStartX + colCentersInBlock[c];
        const rb = chip.absoluteRenderBounds;
        if (rb) {
          chip.x = centerX - (rb.width / 2);
          const currentBottom = rb.y + rb.height;
          chip.y += (baselineY - currentBottom);
          // Re-clamp with rendered width
          const minX = blockStartX; const maxX = blockStartX + blockW - rb.width;
          chip.x = Math.max(minX, Math.min(maxX, chip.x));
        }
        tagsNodes.push(chip);
      }

      // Column-group chip (top): place CHIP 48px above tallest top chip, brace directly below (0px gap)
      if (colGroupKey && colGroupValues[gIdx] !== '__noColGroup__') {
        const segs: { characters: string, bold: boolean }[] = [
          { characters: `${colGroupKey}`, bold: true },
          { characters: `: ${colGroupValues[gIdx]}`, bold: false },
        ];
        const cgChip = await createChip(segs, tag, defaultFont, boldFont);

        const topOfTopChipsY = baselineY - maxH; // top of tallest chip AFTER any rotation
        const targetChipBottom = topOfTopChipsY - 48; // chip-to-chip spacing = 48px

        const centerX = blockStartX + blockW / 2;
        cgChip.x = centerX - cgChip.width / 2;
        // Place cgChip so its bottom hits targetChipBottom using render bounds
        const rb0 = cgChip.absoluteRenderBounds;
        if (rb0) {
          const dy = targetChipBottom - (rb0.y + rb0.height);
          cgChip.y = (cgChip.y || 0) + dy;
          // re-center using rendered width
          const dx = centerX - (rb0.x + rb0.width / 2);
          cgChip.x = (cgChip.x || 0) + dx;
        } else {
          cgChip.y = targetChipBottom - cgChip.height;
        }

        // Brace immediately below the chip (0px internal)
        const brace = figma.createVector();
        brace.vectorPaths = [{ windingRule: 'NONE', data: `M 0 ${CONNECTOR} L ${blockW} ${CONNECTOR} M ${blockW/2} 0 L ${blockW/2} ${CONNECTOR}` }];
        await applyStrokeFromSource(brace, tag.braceSource, Math.max(1, tag.strokeWeight), tag.braceEnabled);
        try { (brace as { strokeCap: StrokeCap | typeof figma.mixed }).strokeCap = 'ROUND'; } catch (_) { /* noop */ }
        const rb1 = cgChip.absoluteRenderBounds;
        const chipBottom = rb1 ? (rb1.y + rb1.height) : (cgChip.y + cgChip.height);
        brace.x = centerX - (blockW / 2);
        brace.y = chipBottom; // touching

        const grouped = figma.group([brace, cgChip], parentContainer); grouped.name = 'col-group-chip';
        // Ensure brace is behind chip inside the group
        grouped.insertChild(0, brace); // send brace to back within group
        grouped.appendChild(cgChip);   // bring chip to front within group
        tagsNodes.push(grouped);
      }
    }

    // --- Row chips por banda + título de grupo de filas (brace) ---
    for (let rg = 0; rg < rowGroupIds.length; rg++) {
      const yBand = padding + rg * (blockH + groupSpacing);

      // Chips de fila (una vez por banda, a la IZQUIERDA del set) — alineados a 48px del borde izquierdo
      let rowsTop = Infinity, rowsBottom = -Infinity;
      let minRowChipLeft = Infinity;
      const targetRight = baseX - TAG_GAP; // borde derecho renderizado de cada chip
      for (let r = 0; r < rowValues.length; r++) {
        const v = rowValues[r];
        const segs = isBooleanLiteral(v)
          ? [ { characters: `${rowKey}`, bold: true }, { characters: `: ${v}`, bold: false } ]
          : [ { characters: v, bold: false } ];
        const chip = await createChip(segs, tag, defaultFont, boldFont);
        const targetCenterY = baseY + yBand + rowCenter[r];

        // Posición tentativa a la izquierda (aprox), luego corregimos por bounds
        chip.x = targetRight - chip.width;
        chip.y = targetCenterY - chip.height / 2;
        parentContainer.appendChild(chip);

        const rb = chip.absoluteRenderBounds;
        if (rb) {
          // Ajustar para que el borde derecho RENDERIZADO sea exactamente baseX - TAG_GAP
          const currentRight = rb.x + rb.width;
          chip.x += (targetRight - currentRight);
          // Centrar verticalmente con altura renderizada
          const currentCenterY = rb.y + rb.height / 2;
          chip.y += (targetCenterY - currentCenterY);
          // Extremos para brace
          const newTop = chip.absoluteRenderBounds ? chip.absoluteRenderBounds.y : chip.y;
          const newBottom = chip.absoluteRenderBounds ? (chip.absoluteRenderBounds.y + chip.absoluteRenderBounds.height) : (chip.y + chip.height);
          if (newTop < rowsTop) rowsTop = newTop;
          if (newBottom > rowsBottom) rowsBottom = newBottom;
          // Capture minimum left edge from render bounds
          const left = rb.x;
          if (left < minRowChipLeft) minRowChipLeft = left;
        } else {
          if (chip.y < rowsTop) rowsTop = chip.y;
          if (chip.y + chip.height > rowsBottom) rowsBottom = chip.y + chip.height;
          if (chip.x < minRowChipLeft) minRowChipLeft = chip.x;
        }
        tagsNodes.push(chip);
      }
      if (!isFinite(rowsTop) || !isFinite(rowsBottom)) { rowsTop = baseY + yBand; rowsBottom = baseY + yBand + blockH; }
      if (!isFinite(minRowChipLeft)) { minRowChipLeft = baseX - TAG_GAP; }
      const rowsHeight = Math.max(0, rowsBottom - rowsTop);
      const rowsCenterY = rowsTop + rowsHeight / 2;

      // Chip combinado de grupo de filas con brace (si hay 4º+ claves) — 48px MÁS a la izquierda que los row chips
      if (rowGroupKeys.length) {
        const obj: Record<string,string> = {};
        const firstMatch = variants.find((v) => {
          const vp = (v.variantProperties as Record<string, string> | null) || null;
          return rowGroupIdFor(vp) === rowGroupIds[rg];
        });
        const p = (firstMatch?.variantProperties || {}) as Record<string,string>;
        for (const k of rowGroupKeys) obj[k] = p[k] ?? '—';

        const textSegments: { characters: string, bold: boolean }[] = [];
        const keys = Object.keys(obj);
        keys.forEach((k, index) => {
          textSegments.push({ characters: k, bold: true });
          textSegments.push({ characters: `: ${obj[k]}`, bold: false });
          if (index < keys.length - 1) textSegments.push({ characters: ', ', bold: false });
        });

        const titleChip = await createChip(textSegments, tag, defaultFont, boldFont);

        // El brace debe estar a 48px a la IZQUIERDA del CHIP DE ROW más ancho (referencia = borde IZQUIERDO mínimo)
        const braceRightX = (minRowChipLeft) - GROUP_CHIP_GAP; // 48px a la izquierda del left más extremo

        // Posicionar el chip con su borde derecho renderizado pegado al **derecho** del brace (0px interno)
        titleChip.x = braceRightX - titleChip.width; // aproximación
        titleChip.y = rowsCenterY - titleChip.height / 2;
        parentContainer.appendChild(titleChip);
        const trb = titleChip.absoluteRenderBounds;
        if (trb) {
          const tright = trb.x + trb.width;
          titleChip.x += (braceRightX - tright);
          const tcy = trb.y + trb.height / 2;
          titleChip.y += (rowsCenterY - tcy);
        }

        // Brace vertical con la **punta** apuntando hacia la IZQUIERDA (hacia el chip) — 180° respecto a la otra orientación
        const braceVec = figma.createVector();
        // Vertical en x=0 y tick de -CONNECTOR → 0 (apunta a la izquierda)
        braceVec.vectorPaths = [{ windingRule: 'NONE', data: `M 0 0 L 0 ${rowsHeight} M -${CONNECTOR} ${rowsHeight/2} L 0 ${rowsHeight/2}` }];
        // Colocar la línea vertical exactamente en braceRightX (0px de separación con el chip por su borde derecho)
        braceVec.x = braceRightX; braceVec.y = rowsTop;
        await applyStrokeFromSource(braceVec, tag.braceSource, Math.max(1, tag.strokeWeight), tag.braceEnabled);
        try { (braceVec as { strokeCap: StrokeCap | typeof figma.mixed }).strokeCap = 'ROUND'; } catch (_) { /* noop */ }

        const groupChip = figma.group([braceVec, titleChip], parentContainer); groupChip.name = 'row-group-chip';
        // Ensure brace is behind chip inside the group
        groupChip.insertChild(0, braceVec); // send brace to back within group
        groupChip.appendChild(titleChip);   // bring chip to front within group
        tagsNodes.push(groupChip);
      }
    }
  }

  if (tagsNodes.length > 0) {
    const groupParent: BaseNode & ChildrenMixin = (componentSet.parent as (BaseNode & ChildrenMixin)) || (figma.currentPage as unknown as BaseNode & ChildrenMixin);
    const tagGroup = figma.group(tagsNodes, groupParent);
    tagGroup.name = `${componentSet.name} tags`;
  }

  return null;
}