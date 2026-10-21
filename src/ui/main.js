// FigUI3 core (MIT) + editor bundle (PolyForm Shield 1.0.0) for fig-select and the Figma-style fill picker.
import '@rogieking/figui3/fig.css'
import '@rogieking/figui3/fig.js'
import '@rogieking/figui3/fig-editor.css'
import '@rogieking/figui3/fig-editor.js'
import './styles.css'
import { ICONS } from './icons.js'

/* ---------- Constants ---------- */
const ROLES = [
  { value: 'column', label: 'Column' },
  { value: 'row', label: 'Row' },
  { value: 'column-group', label: 'Col group' },
  { value: 'row-group', label: 'Row group' },
]
const UNIQUE_ROLES = ['column', 'row']

// Fallback list until the plugin sends the fonts available in Figma
const DEFAULT_FONTS = {
  Inter: ['Regular', 'Medium', 'Semi Bold', 'Bold'],
  Roboto: ['Regular', 'Medium', 'Bold'],
}

// Figma style names → CSS weight, for previews
const STYLE_WEIGHTS = [
  ['thin', 100], ['hairline', 100], ['extra light', 200], ['extralight', 200], ['ultra light', 200], ['light', 300],
  ['medium', 500], ['semi bold', 600], ['semibold', 600], ['demi bold', 600], ['extra bold', 800], ['extrabold', 800],
  ['ultra bold', 800], ['black', 900], ['heavy', 900], ['bold', 700],
]

/* ---------- State ---------- */
function defaultSpacing() { return { padding: 48, gap: 48, groups: 128 } }
function defaultTag() {
  return {
    enableFill: true, fillColor: '#E5E5E5', cornerRadius: 8,
    enableStroke: true, strokeColor: '#A3A3A3', strokeWeight: 1,
    fontFamily: 'Inter', fontStyle: 'Regular', textSize: 16, textColor: '#404040',
    braceEnabled: true, braceColor: '#A3A3A3', braceWeight: 1,
  }
}

const state = {
  spacing: defaultSpacing(),
  tag: defaultTag(),
  selection: null, // { id, name, variantCount, keys, properties }
  roleByProp: {}, // { [property]: 'column' | 'row' | 'column-group' | 'row-group' }
  storedRoleMap: null, // last roles used, restored from clientStorage
  fonts: DEFAULT_FONTS,
  busy: false,
}

/* ---------- Utilities ---------- */
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => Array.from(document.querySelectorAll(sel))
const post = (pluginMessage) => parent.postMessage({ pluginMessage }, '*')

function normalizeHex(value, fallback) {
  let h = String(value || '').trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('')
  return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h.toUpperCase() : fallback
}

function toNumber(value, fallback, min = 0) {
  const n = Number(value)
  return value === '' || value === null || value === undefined || !isFinite(n) ? fallback : Math.max(min, n)
}

function styleToCss(style) {
  const s = String(style || '').toLowerCase()
  let weight = 400
  for (const [name, w] of STYLE_WEIGHTS) { if (s.includes(name)) { weight = w; break } }
  const numeric = s.match(/\b([1-9]00)\b/)
  if (numeric) weight = Number(numeric[1])
  return { weight, italic: s.includes('italic') || s.includes('oblique') }
}

function sortStyles(styles) {
  return styles.slice().sort((a, b) => {
    const ca = styleToCss(a), cb = styleToCss(b)
    return (ca.weight - cb.weight) || (Number(ca.italic) - Number(cb.italic)) || a.localeCompare(b)
  })
}

function option(value, label = value) {
  const el = document.createElement('fig-select-option')
  el.setAttribute('value', value)
  el.textContent = label
  return el
}

// Replaces a fig-select's options; values come from the document, so they're set as text
function setSelectOptions(select, values, selected, labelFor) {
  const list = document.createElement('fig-select-options')
  for (const v of values) list.appendChild(option(v, labelFor ? labelFor(v) : v))
  select.replaceChildren(list)
  select.setAttribute('value', selected)
  select.value = selected
}

/* ---------- Plugin format ↔ UI state ---------- */
function tagForPlugin() {
  const t = state.tag
  return {
    enableFill: t.enableFill, fillSource: { type: 'hex', value: t.fillColor },
    enableStroke: t.enableStroke, strokeSource: { type: 'hex', value: t.strokeColor }, strokeWeight: t.strokeWeight,
    cornerRadius: t.cornerRadius, textSize: t.textSize, textSource: { type: 'hex', value: t.textColor },
    braceEnabled: t.braceEnabled, braceSource: { type: 'hex', value: t.braceColor }, braceWeight: t.braceWeight,
    fontFamily: t.fontFamily, fontStyle: t.fontStyle,
  }
}

function tagFromPlugin(raw) {
  const d = defaultTag()
  if (!raw || typeof raw !== 'object') return d
  const hex = (src, flat, fallback) => normalizeHex((src && typeof src === 'object' ? src.value : src) ?? flat, fallback)
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback)
  return {
    enableFill: bool(raw.enableFill, d.enableFill), fillColor: hex(raw.fillSource, raw.fillColor, d.fillColor),
    cornerRadius: toNumber(raw.cornerRadius, d.cornerRadius),
    enableStroke: bool(raw.enableStroke, d.enableStroke), strokeColor: hex(raw.strokeSource, raw.strokeColor, d.strokeColor),
    strokeWeight: toNumber(raw.strokeWeight, d.strokeWeight),
    fontFamily: raw.fontFamily || d.fontFamily, fontStyle: raw.fontStyle || d.fontStyle,
    textSize: toNumber(raw.textSize, d.textSize, 1), textColor: hex(raw.textSource, raw.textColor, d.textColor),
    braceEnabled: bool(raw.braceEnabled, d.braceEnabled), braceColor: hex(raw.braceSource, raw.braceColor, d.braceColor),
    braceWeight: toNumber(raw.braceWeight, d.braceWeight, 1),
  }
}

function spacingFromPlugin(raw) {
  const d = defaultSpacing()
  if (!raw || typeof raw !== 'object') return d
  return { padding: toNumber(raw.padding, d.padding), gap: toNumber(raw.gap, d.gap), groups: toNumber(raw.groups, d.groups) }
}

/* ---------- Roles ---------- */
function defaultRoleFor(index) {
  return ['column', 'row', 'row-group', 'column-group'][index] || 'row-group'
}

// Keeps valid existing roles, fills the rest with defaults; Column and Row stay unique
function ensureRoles(keys) {
  const next = {}
  const taken = {}
  for (const key of keys) {
    const role = state.roleByProp[key]
    if (!role) continue
    if (UNIQUE_ROLES.includes(role)) {
      if (taken[role]) continue
      taken[role] = key
    }
    next[key] = role
  }
  keys.forEach((key, i) => {
    if (next[key]) return
    let role = defaultRoleFor(i)
    if (UNIQUE_ROLES.includes(role) && taken[role]) role = UNIQUE_ROLES.find(r => !taken[r]) || 'row-group'
    next[key] = role
    if (UNIQUE_ROLES.includes(role)) taken[role] = key
  })
  state.roleByProp = next
}

function setRole(key, role) {
  const prev = state.roleByProp[key]
  if (role === prev) return
  // Column and Row are unique: the property that had it takes this one's previous role
  if (UNIQUE_ROLES.includes(role)) {
    const holder = Object.keys(state.roleByProp).find(k => k !== key && state.roleByProp[k] === role)
    if (holder) state.roleByProp[holder] = prev
  }
  state.roleByProp[key] = role
  renderRoles()
}

function rolesAreValid() {
  const roles = Object.values(state.roleByProp)
  const count = (r) => roles.filter(x => x === r).length
  if (roles.length === 1) return count('column') + count('row') === 1
  return count('column') === 1 && count('row') === 1
}

/* ---------- Rendering ---------- */
function renderSelection() {
  const sel = state.selection
  $('#selection').classList.toggle('is-empty', !sel)
  $('#selectionName').textContent = sel ? sel.name : 'Select a component set'
  $('#selectionMeta').textContent = sel && sel.variantCount ? `${sel.variantCount} variants` : ''
}

function renderRoles() {
  const list = $('#roleList')
  const sel = state.selection
  $('#rolesSection').classList.toggle('is-empty', !sel || sel.keys.length === 0)
  list.replaceChildren()

  if (!sel || sel.keys.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = sel ? 'This component set has no variant properties.' : 'Select a component set to assign roles to its properties.'
    list.appendChild(empty)
    updateOrganizeButton()
    return
  }

  for (const key of sel.keys) {
    const row = document.createElement('div')
    row.className = 'prop-row'
    row.setAttribute('role', 'listitem')

    const text = document.createElement('span')
    text.className = 'prop-text'
    const name = document.createElement('span')
    name.className = 'prop-name'
    name.textContent = key
    const values = document.createElement('span')
    values.className = 'prop-values'
    values.textContent = (sel.properties[key]?.values || []).join(', ')
    values.title = values.textContent
    text.append(name, values)

    const select = document.createElement('fig-select')
    select.setAttribute('label', `Role for ${key}`)
    select.setAttribute('variant', 'input')
    setSelectOptions(select, ROLES.map(r => r.value), state.roleByProp[key], v => ROLES.find(r => r.value === v).label)
    select.addEventListener('change', () => setRole(key, select.value))

    row.append(text, select)
    list.appendChild(row)
  }
  updateOrganizeButton()
}

function renderFonts() {
  const families = Object.keys(state.fonts).sort((a, b) => a.localeCompare(b))
  if (!families.includes(state.tag.fontFamily)) state.tag.fontFamily = families.includes('Inter') ? 'Inter' : families[0]
  setSelectOptions($('#fontFamily'), families, state.tag.fontFamily)
  renderFontStyles()
}

function renderFontStyles() {
  const styles = sortStyles(state.fonts[state.tag.fontFamily] || ['Regular'])
  if (!styles.includes(state.tag.fontStyle)) state.tag.fontStyle = styles.includes('Regular') ? 'Regular' : styles[0]
  setSelectOptions($('#fontStyle'), styles, state.tag.fontStyle)
}

// Writes state into the controls (after restore / reset)
function renderControls() {
  const { spacing, tag } = state
  const setNum = (id, v) => { const el = $(id); el.setAttribute('value', v); el.value = v }
  const setColor = (id, v) => { const el = $(id); el.setAttribute('value', v); if ('value' in el) el.value = v }
  setNum('#padding', spacing.padding); setNum('#gap', spacing.gap); setNum('#groups', spacing.groups)
  setColor('#fillColor', tag.fillColor); setNum('#radius', tag.cornerRadius)
  setColor('#strokeColor', tag.strokeColor); setNum('#strokeWeight', tag.strokeWeight)
  setNum('#textSize', tag.textSize); setColor('#textColor', tag.textColor)
  setColor('#braceColor', tag.braceColor); setNum('#braceWeight', tag.braceWeight)
  renderFonts()
  renderToggles()
  renderPreview()
}

function renderToggles() {
  const toggles = { fill: 'enableFill', stroke: 'enableStroke', brace: 'braceEnabled' }
  for (const [section, key] of Object.entries(toggles)) {
    const on = state.tag[key]
    const el = $(`[data-section="${section}"]`)
    el.classList.toggle('is-off', !on)
    const btn = el.querySelector('[data-toggle]')
    btn.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${section}`)
    btn.querySelector('fig-icon').setAttribute('name', on ? 'minus' : 'add')
  }
}

function renderPreview() {
  const t = state.tag
  const font = styleToCss(t.fontStyle)
  for (const chip of $$('[data-chip]')) {
    Object.assign(chip.style, {
      background: t.enableFill ? t.fillColor : 'transparent',
      boxShadow: t.enableStroke && t.strokeWeight > 0 ? `inset 0 0 0 ${t.strokeWeight}px ${t.strokeColor}` : 'none',
      borderRadius: `${t.cornerRadius}px`,
      color: t.textColor,
      fontFamily: `"${t.fontFamily}", Inter, sans-serif`,
      fontWeight: String(font.weight),
      fontStyle: font.italic ? 'italic' : 'normal',
    })
  }
  const brace = $('#previewBrace')
  brace.style.visibility = t.braceEnabled ? 'visible' : 'hidden'
  brace.style.borderRight = `${t.braceWeight}px solid ${t.braceColor}`
  Object.assign(brace.querySelector('.brace-tick').style, { background: t.braceColor, height: `${t.braceWeight}px` })
}

function updateOrganizeButton() {
  const btn = $('#organizeBtn')
  const ready = !!state.selection && state.selection.keys.length > 0 && rolesAreValid() && !state.busy
  btn.toggleAttribute('disabled', !ready)
  btn.textContent = state.busy ? 'Organizing…' : 'Reorganize variants'
}

/* ---------- Inputs → state ---------- */
function bindInputs() {
  const numbers = {
    padding: ['spacing', 'padding', 0], gap: ['spacing', 'gap', 0], groups: ['spacing', 'groups', 0],
    radius: ['tag', 'cornerRadius', 0], strokeWeight: ['tag', 'strokeWeight', 0],
    textSize: ['tag', 'textSize', 1], braceWeight: ['tag', 'braceWeight', 1],
  }
  for (const [id, [section, key, min]] of Object.entries(numbers)) {
    const el = document.getElementById(id)
    const read = (e) => {
      const raw = e && e.detail !== undefined && typeof e.detail !== 'object' ? e.detail : el.value
      state[section][key] = toNumber(raw, state[section][key], min)
      renderPreview()
    }
    el.addEventListener('input', read)
    el.addEventListener('change', read)
  }

  for (const key of ['fillColor', 'strokeColor', 'textColor', 'braceColor']) {
    const el = document.getElementById(key)
    const read = (e) => {
      const detail = e && e.detail && typeof e.detail === 'object' ? e.detail : null
      state.tag[key] = normalizeHex(detail?.color || detail?.hex || el.value, state.tag[key])
      renderPreview()
    }
    el.addEventListener('input', read)
    el.addEventListener('change', read)
  }

  $('#fontFamily').addEventListener('change', (e) => {
    state.tag.fontFamily = e.target.value
    renderFontStyles()
    renderPreview()
  })
  $('#fontStyle').addEventListener('change', (e) => {
    state.tag.fontStyle = e.target.value
    renderPreview()
  })

  for (const btn of $$('[data-toggle]')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle
      state.tag[key] = !state.tag[key]
      renderToggles()
      renderPreview()
    })
  }

  $('#organizeBtn').addEventListener('click', () => {
    if ($('#organizeBtn').hasAttribute('disabled')) return
    state.busy = true
    updateOrganizeButton()
    post({ type: 'organize-variants', roleMap: { ...state.roleByProp }, spacing: { ...state.spacing }, tagOptions: tagForPlugin() })
  })

  $('#resetBtn').addEventListener('click', () => {
    state.spacing = defaultSpacing()
    state.tag = defaultTag()
    renderControls()
    post({ type: 'save-settings', spacing: state.spacing, tagOptions: tagForPlugin() })
  })
}

/* ---------- Plugin → UI ---------- */
window.addEventListener('message', (event) => {
  const msg = event.data && event.data.pluginMessage
  if (!msg) return

  if (msg.type === 'fonts-list') {
    const byFamily = {}
    for (const f of msg.fonts || []) {
      const family = f && f.fontName && f.fontName.family
      const style = f && f.fontName && f.fontName.style
      if (!family || !style) continue
      if (!byFamily[family]) byFamily[family] = []
      if (!byFamily[family].includes(style)) byFamily[family].push(style)
    }
    if (Object.keys(byFamily).length > 0) {
      state.fonts = byFamily
      renderFonts()
      renderPreview()
    }
  }

  if (msg.type === 'stored-config') {
    const config = msg.config || {}
    if (config.spacing) state.spacing = spacingFromPlugin(config.spacing)
    if (config.tagOptions) state.tag = tagFromPlugin(config.tagOptions)
    if (config.roleMap) state.storedRoleMap = config.roleMap
    renderControls()
  }

  if (msg.type === 'selection-changed') {
    if (!msg.componentSetId) {
      state.selection = null
    } else {
      const keys = msg.propertyKeys || []
      const isNewSet = !state.selection || state.selection.id !== msg.componentSetId
      state.selection = { id: msg.componentSetId, name: msg.componentSetName || 'Component set', variantCount: msg.variantCount || 0, keys, properties: msg.properties || {} }
      if (isNewSet) {
        // Last used roles apply to properties with the same name
        const stored = state.storedRoleMap || {}
        state.roleByProp = {}
        for (const k of keys) if (stored[k]) state.roleByProp[k] = stored[k]
      }
      ensureRoles(keys)
      // Preferences saved on this component set win over the last used ones
      if (msg.spacing || msg.tagOptions) {
        if (msg.spacing) state.spacing = spacingFromPlugin(msg.spacing)
        if (msg.tagOptions) state.tag = tagFromPlugin(msg.tagOptions)
        renderControls()
      }
    }
    renderSelection()
    renderRoles()
  }

  if (msg.type === 'organize-done' || msg.type === 'organize-error') {
    state.busy = false
    if (msg.type === 'organize-done') state.storedRoleMap = { ...state.storedRoleMap, ...state.roleByProp }
    updateOrganizeButton()
  }
})

/* ---------- Init ---------- */
for (const el of $$('[data-icon]')) el.innerHTML = ICONS[el.dataset.icon] || ''
bindInputs()
renderControls()
renderSelection()
renderRoles()
post({ type: 'ui-loaded' })
