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
  let variantProps: VariantPropsMap; try { variantProps = componentSet.variantGroupProperties as VariantPropsMap; } catch (e) { console.warn(e); return '⚠️ Variant conflict. Ensure properties/values are consistent.'; }
  if (Object.keys(variantProps).length < 1) return '⚠️ Component Set needs at least one property';
  const orderedKeys = propertyOrder && propertyOrder.length > 0 ? propertyOrder : Object.keys(variantProps);
  const columnProperty = orderedKeys[0]; const rowProperty = orderedKeys.length > 1 ? orderedKeys[1] : null; const groupKeys = orderedKeys.slice(2);
  return await organizeVariantsCore(componentSet, rowProperty, columnProperty, groupKeys, spacing, variants, variantProps, tag);
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
        try { (braceVec as { strokeCap: StrokeCap | typeof figma.mixed }).strokeCap = 'ROUND'; } catch (_){ void 0; }

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
