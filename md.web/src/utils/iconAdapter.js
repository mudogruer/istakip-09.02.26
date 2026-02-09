const ICON_MAP = {
  '📊': 'dashboard',
  '💼': 'work',
  '🏭': 'factory',
  '🔧': 'build',
  '✓': 'check',
  '✔': 'check',
  '✔️': 'check',
  '👥': 'groups',
  '📦': 'inventory_2',
  '🛒': 'shopping_cart',
  '📄': 'description',
  '📑': 'description',
  '📂': 'folder',
  '📁': 'archive',
  '💰': 'account_balance_wallet',
  '📈': 'bar_chart',
  '⚙️': 'settings',
  '🔍': 'search',
  '👤': 'person',
  '🚪': 'logout',
  '🗑': 'delete',
  '🗑️': 'delete',
  '👁': 'visibility',
  '👁️': 'visibility',
  '✏': 'edit',
  '✏️': 'edit',
  '⬇️': 'download',
  '⬆️': 'upload',
  '📥': 'file_download',
  '📤': 'file_upload',
  '⏰': 'schedule',
  '⚠': 'warning',
  '⚠️': 'warning',
  '📋': 'assignment',
  '⋯': 'more_horiz',
  '→': 'arrow_forward',
  '▲': 'expand_less',
  '▼': 'expand_more',
  '🖨️': 'print',
  '🏪': 'store',
  '🪟': 'window',
  '✨': 'auto_awesome',
  '⏳': 'hourglass_top',
  '💾': 'save',
  '⏱️': 'timer',
};

const ICON_ONLY_SELECTORS = [
  '.btn-icon',
  '.stat-icon',
  '.metric-icon',
  '.empty-state-icon',
  '.widget-icon',
  '.widget-stat-icon',
  '.widget-list-item-icon',
  '.widget-empty-icon',
  '.widget-picker-icon',
  '.topbar-search-icon',
  '.topbar-user-menu-icon',
  '.nav-link-icon',
  '.nav-collapsible-icon',
  '.topbar-user-chevron',
  '.login-logo-icon',
  '.login-error-icon',
  '.login-label-icon',
  '.access-denied-icon',
  '.widget-error-icon',
  '.file-drop-area .icon',
  '.autocomplete-create-icon',
];

const TEXT_ICON_SELECTORS = [
  'button',
  '.card-title',
  '.section-title',
  '.page-title',
  '.topbar-user-menu-item',
  '.form-label',
  '.badge',
  'h1',
  'h2',
  'h3',
  'h4',
];

const ensureMaterialIconsLoaded = () => {
  if (document.querySelector('link[data-material-symbols]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..700,0,0';
  link.setAttribute('data-material-symbols', 'true');
  document.head.appendChild(link);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const emojiKeys = Object.keys(ICON_MAP);
const emojiPattern = new RegExp(`^\\s*(${emojiKeys.map(escapeRegExp).join('|')})\\s+(.*)$`);

export const getMaterialIconName = (icon) => {
  if (!icon) return null;
  return ICON_MAP[icon] || icon;
};

const createIconSpan = (iconName) => {
  const span = document.createElement('span');
  span.className = 'material-symbols-outlined';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = iconName;
  return span;
};

const replaceIconOnlyElement = (element) => {
  if (element.querySelector('.material-symbols-outlined')) return;
  const raw = element.textContent.trim();
  const iconName = getMaterialIconName(raw);
  if (!ICON_MAP[raw]) return;
  element.textContent = '';
  element.appendChild(createIconSpan(iconName));

  if (element.classList.contains('btn-icon') && !element.getAttribute('aria-label')) {
    const fallbackLabel = element.getAttribute('title');
    if (fallbackLabel) {
      element.setAttribute('aria-label', fallbackLabel);
    }
  }
};

const replaceLeadingEmojiText = (element) => {
  if (element.querySelector('.material-symbols-outlined')) return;
  if (element.childElementCount > 0) return;
  if (element.closest('option')) return;

  const match = element.textContent.match(emojiPattern);
  if (!match) return;

  const iconName = getMaterialIconName(match[1]);
  if (!iconName) return;
  const rest = match[2];

  element.textContent = '';
  element.appendChild(createIconSpan(iconName));
  element.appendChild(document.createTextNode(` ${rest}`));
};

export const applyMaterialIcons = (root = document) => {
  ensureMaterialIconsLoaded();

  const iconOnlyTargets = root.querySelectorAll(ICON_ONLY_SELECTORS.join(','));
  iconOnlyTargets.forEach((element) => replaceIconOnlyElement(element));

  const iconOnlyTextNodes = root.querySelectorAll('span, div, button');
  iconOnlyTextNodes.forEach((element) => {
    if (element.closest('option')) return;
    if (element.childElementCount > 0) return;
    replaceIconOnlyElement(element);
  });

  const textTargets = root.querySelectorAll(TEXT_ICON_SELECTORS.join(','));
  textTargets.forEach((element) => replaceLeadingEmojiText(element));
};

