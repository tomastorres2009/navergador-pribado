const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const STORAGE_ACCOUNTS = 'nebula_accounts_v1';
const ENGINES = {
  google: 'Google',
  bing: 'Bing',
  duck: 'DuckDuckGo',
  brave: 'Brave',
  ecosia: 'Ecosia',
  startpage: 'Startpage',
  yahoo: 'Yahoo',
  youtube: 'YouTube',
  wikipedia: 'Wikipedia',
  reddit: 'Reddit',
  yandex: 'Yandex',
  qwant: 'Qwant',
  mojeek: 'Mojeek'
};

const ENGINE_KEYS = Object.keys(ENGINES);
const ENGINE_META = {
  google: { mark: 'G', className: 'engine-google' },
  bing: { mark: 'B', className: 'engine-bing' },
  duck: { mark: 'DD', className: 'engine-duck' },
  brave: { mark: 'B', className: 'engine-brave' },
  ecosia: { mark: 'E', className: 'engine-ecosia' },
  startpage: { mark: 'S', className: 'engine-startpage' },
  yahoo: { mark: 'Y!', className: 'engine-yahoo' },
  youtube: { mark: '▶', className: 'engine-youtube' },
  wikipedia: { mark: 'W', className: 'engine-wikipedia' },
  reddit: { mark: 'R', className: 'engine-reddit' },
  yandex: { mark: 'Ya', className: 'engine-yandex' },
  qwant: { mark: 'Q', className: 'engine-qwant' },
  mojeek: { mark: 'M', className: 'engine-mojeek' },
};

const SHORTCUTS = [
  { name: 'Google', url: 'https://www.google.com', emoji: 'G' },
  { name: 'YouTube', url: 'https://www.youtube.com', emoji: '▶' },
  { name: 'WhatsApp', url: 'https://web.whatsapp.com', emoji: '💬' },
  { name: 'Gmail', url: 'https://mail.google.com', emoji: '✉' },
  { name: 'TikTok', url: 'https://www.tiktok.com', emoji: '♪' },
  { name: 'Maps', url: 'https://maps.google.com', emoji: '🗺' },
  { name: 'Drive', url: 'https://drive.google.com', emoji: '☁' },
  { name: 'Instagram', url: 'https://www.instagram.com', emoji: '◎' }
];

const state = {
  currentUser: null,
  accounts: loadAccounts(),
  guestPrefs: defaultPrefs(),
  searchMode: 'web',
  tabs: [],
  activeTabId: null,
  sessionHistory: [],
  sessionBookmarks: [],
  drawerOpen: false,
  authMode: 'signup',
  currentUrl: '',
  currentSearch: '',
  progressTimer: null,
  fallbackTimer: null,
  activeLoadMeta: null,
  autoSwitching: false,
  audioCtx: null,
  recognition: null,
  listening: false,
};

function defaultPrefs() {
  return {
    displayName: 'Invitado',
    theme: 'midnight',
    engine: 'google',
    audioMode: 'off',
    openBehavior: 'smart',
    defaultMode: 'web',
    deviceMode: 'auto',
    fontSize: 16,
    volume: 45,
    autoEngineFallback: true,
    fallbackEngines: ['bing', 'duck', 'brave'],
    fallbackDelay: 4,
    alerts: true,
    compact: false,
    reduceMotion: false,
    sidebar: true,
  };
}

function normalizePrefs(p = {}) {
  const base = { ...defaultPrefs(), ...p };
  let fallback = Array.isArray(base.fallbackEngines) ? base.fallbackEngines : [base.fallbackOne, base.fallbackTwo, base.fallbackThree].filter(Boolean);
  fallback = fallback.filter(Boolean).map(v => String(v)).filter(v => ENGINE_KEYS.includes(v) && v !== base.engine);
  const unique = [];
  fallback.forEach(v => { if (!unique.includes(v)) unique.push(v); });
  while (unique.length < 3) {
    const candidate = ['bing', 'duck', 'brave', 'startpage', 'ecosia'].find(v => v !== base.engine && !unique.includes(v));
    if (!candidate) break;
    unique.push(candidate);
  }
  base.fallbackEngines = unique.slice(0, 3);
  base.fallbackDelay = Math.min(8, Math.max(2, Number(base.fallbackDelay) || 4));
  base.autoEngineFallback = !!base.autoEngineFallback;
  base.alerts = base.alerts !== false;
  return base;
}

function loadAccounts() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_ACCOUNTS) || '{}');
    const out = {};
    Object.entries(raw).forEach(([user, info]) => {
      out[user] = {
        passwordHash: info.passwordHash || '',
        prefs: normalizePrefs(info.prefs || {}),
      };
    });
    return out;
  } catch {
    return {};
  }
}

function saveAccounts() {
  localStorage.setItem(STORAGE_ACCOUNTS, JSON.stringify(state.accounts));
}

function getPrefs() {
  if (state.currentUser && state.accounts[state.currentUser]) return normalizePrefs(state.accounts[state.currentUser].prefs);
  return normalizePrefs(state.guestPrefs);
}

function savePrefs(prefs) {
  if (state.currentUser && state.accounts[state.currentUser]) {
    state.accounts[state.currentUser].prefs = normalizePrefs(prefs);
    saveAccounts();
  } else {
    state.guestPrefs = normalizePrefs(prefs);
  }
}

function makeEntry(kind, value, meta = {}) {
  return { kind, value, meta, at: Date.now() };
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function makeTab(entry = makeEntry('home', 'home')) {
  return { id: randomId(), history: [entry], index: 0, title: titleForEntry(entry) };
}

function currentTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0];
}

function currentEntry() {
  const tab = currentTab();
  return tab ? tab.history[tab.index] : makeEntry('home', 'home');
}

function titleForEntry(entry) {
  if (entry.kind === 'home') return 'Inicio';
  if (entry.kind === 'search') return `Buscar: ${entry.value}`;
  try {
    return new URL(entry.value).hostname.replace(/^www\./, '');
  } catch {
    return 'Página';
  }
}

function initials(name) {
  return String(name || 'I').split(/\s+/).slice(0, 2).map(v => v[0]?.toUpperCase() || '').join('') || 'I';
}

function looksLikeUrl(text) {
  const value = text.trim();
  return /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(value);
}

function normalizeUrl(text) {
  const value = text.trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function buildSearchUrl(query, mode = 'web', engine = 'google') {
  const q = encodeURIComponent(query);
  switch (engine) {
    case 'google':
      if (mode === 'images') return `https://www.google.com/search?tbm=isch&q=${q}`;
      if (mode === 'videos') return `https://www.google.com/search?tbm=vid&q=${q}`;
      if (mode === 'news') return `https://www.google.com/search?tbm=nws&q=${q}`;
      if (mode === 'maps') return `https://www.google.com/maps/search/${q}`;
      return `https://www.google.com/search?q=${q}`;
    case 'bing':
      if (mode === 'images') return `https://www.bing.com/images/search?q=${q}`;
      if (mode === 'videos') return `https://www.bing.com/videos/search?q=${q}`;
      if (mode === 'news') return `https://www.bing.com/news/search?q=${q}`;
      if (mode === 'maps') return `https://www.bing.com/maps?q=${q}`;
      return `https://www.bing.com/search?q=${q}`;
    case 'duck':
      if (mode === 'images') return `https://duckduckgo.com/?q=${q}&iar=images&iax=images&ia=images`;
      if (mode === 'videos') return `https://duckduckgo.com/?q=${q}&ia=videos&iax=videos`;
      if (mode === 'news') return `https://duckduckgo.com/?q=${q}&iar=news&ia=news`;
      if (mode === 'maps') return `https://duckduckgo.com/?q=${q}&iaxm=maps`;
      return `https://duckduckgo.com/?q=${q}`;
    case 'brave':
      if (mode === 'images') return `https://search.brave.com/images?q=${q}`;
      if (mode === 'news') return `https://search.brave.com/news?q=${q}`;
      return `https://search.brave.com/search?q=${q}`;
    case 'ecosia':
      if (mode === 'images') return `https://www.ecosia.org/images?q=${q}`;
      return `https://www.ecosia.org/search?q=${q}`;
    case 'startpage':
      return `https://www.startpage.com/do/dsearch?query=${q}`;
    case 'yahoo':
      if (mode === 'images') return `https://images.search.yahoo.com/search/images?p=${q}`;
      if (mode === 'videos') return `https://video.search.yahoo.com/search/video?p=${q}`;
      if (mode === 'news') return `https://news.search.yahoo.com/search?p=${q}`;
      return `https://search.yahoo.com/search?p=${q}`;
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${q}`;
    case 'wikipedia':
      return `https://es.wikipedia.org/w/index.php?search=${q}`;
    case 'reddit':
      return `https://www.reddit.com/search/?q=${q}`;
    case 'yandex':
      if (mode === 'images') return `https://yandex.com/images/search?text=${q}`;
      return `https://yandex.com/search/?text=${q}`;
    case 'qwant':
      return `https://www.qwant.com/?q=${q}&t=web`;
    case 'mojeek':
      return `https://www.mojeek.com/search?q=${q}`;
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

function toast(title, text = '') {
  const prefs = (typeof getPrefs === 'function') ? getPrefs() : defaultPrefs();
  if (prefs.alerts === false) return;
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<strong>${escapeHtml(title)}</strong>${text ? `<small>${escapeHtml(text)}</small>` : ''}`;
  $('#toastWrap').appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 220);
  }, 2600);
}

function escapeHtml(text = '') {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}


function engineMeta(engine = 'google') {
  return ENGINE_META[engine] || { mark: 'G', className: 'engine-google' };
}

function engineLogoHtml(engine = 'google', large = false) {
  const meta = engineMeta(engine);
  return `<span class="engine-logo ${meta.className}${large ? ' large' : ''}">${escapeHtml(meta.mark)}</span>`;
}

function setEngineVisual(engine = getPrefs().engine, context = 'idle') {
  const meta = engineMeta(engine);
  const name = ENGINES[engine] || ENGINES.google;
  const badge = $('#engineBadgeBtn');
  if (badge) {
    const logo = $('#engineLogoMark');
    const label = $('#engineLogoName');
    logo.className = `engine-logo ${meta.className}`;
    logo.textContent = meta.mark;
    label.textContent = name;
    badge.title = `Motor activo: ${name}`;
  }
  const viewerBadge = $('#viewerEngineBadge');
  const viewerLogo = $('#viewerEngineLogo');
  const viewerName = $('#viewerEngineName');
  const viewerMode = $('#viewerEngineMode');
  if (viewerBadge && viewerLogo && viewerName && viewerMode) {
    viewerLogo.className = `engine-logo ${meta.className} large`;
    viewerLogo.textContent = meta.mark;
    viewerName.textContent = name;
    viewerMode.textContent = labelForMode(state.searchMode);
    viewerBadge.classList.toggle('hidden', context === 'home');
  }
}

function updateClock() {
  $('#clockText').textContent = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function populateEngineSelects() {
  const options = Object.entries(ENGINES).map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  const fallbackOptions = ['<option value="">Sin respaldo</option>'].concat(Object.entries(ENGINES).map(([k, label]) => `<option value="${k}">${label}</option>`)).join('');
  $('#setEngine').innerHTML = options;
  $('#authEngine').innerHTML = options;
  $('#setFallbackOne').innerHTML = fallbackOptions;
  $('#setFallbackTwo').innerHTML = fallbackOptions;
  $('#setFallbackThree').innerHTML = fallbackOptions;
}

function applyPrefs() {
  const prefs = getPrefs();
  document.body.className = '';
  document.body.classList.add(`theme-${prefs.theme}`);
  if (prefs.compact) document.body.classList.add('compact');
  if (prefs.reduceMotion) document.body.classList.add('reduce-motion');
  if (prefs.deviceMode && prefs.deviceMode !== 'auto') document.body.classList.add(`view-${prefs.deviceMode}`);
  document.documentElement.style.setProperty('--font-scale', String(prefs.fontSize / 16));
  $('#audioLabel').textContent = prefs.audioMode === 'off' ? 'Audio off' : prefs.audioMode === 'ui' ? 'Audio UI' : 'Audio voz';
  $('#metricEngine').textContent = ENGINES[prefs.engine] || 'Google';
  $('#metricTheme').textContent = prefs.theme[0].toUpperCase() + prefs.theme.slice(1);
  $('#footerMode').textContent = labelForMode(state.searchMode);
  setEngineVisual(prefs.engine, currentEntry().kind === 'home' ? 'home' : 'search');
  const sidebarVisible = !!prefs.sidebar;
  $('#sidebar').classList.toggle('hidden', !sidebarVisible);
}

function labelForMode(mode) {
  return ({ web: 'Web', images: 'Imágenes', videos: 'Videos', news: 'Noticias', maps: 'Mapas' })[mode] || 'Web';
}

function updateUserUi() {
  const prefs = getPrefs();
  const display = state.currentUser ? (prefs.displayName || state.currentUser) : 'Invitado';
  $('#profileNameTop').textContent = display;
  $('#profileNameSide').textContent = display;
  $('#footerProfile').textContent = display;
  $('#profileAvatarTop').textContent = initials(display);
  $('#profileAvatarSide').textContent = initials(display);
  $('#heroTitle').textContent = state.currentUser ? `Hola, ${display}` : 'Navega con tu estilo';
  $('#heroText').textContent = state.currentUser ? 'Tu cuenta está activa. Tus ajustes se guardan dentro del perfil.' : 'Tus ajustes pueden guardarse dentro de tu cuenta. El historial y los favoritos viven solo en la sesión.';
  $('#logoutBtn').classList.toggle('hidden', !state.currentUser);
  $('#openAuthBtn').textContent = state.currentUser ? 'Cuenta' : 'Entrar';
  $('#profileHint').textContent = state.currentUser ? 'Tu cuenta existe en este navegador. El historial se borra al salir.' : 'Entra para guardar tus ajustes.';
  $('#netStatus').textContent = state.currentUser ? 'Cuenta local activa' : 'Sesión temporal activa';
}

function resetSession() {
  state.sessionHistory = [];
  state.sessionBookmarks = [];
  state.tabs = [makeTab()];
  state.activeTabId = state.tabs[0].id;
  state.currentUrl = '';
  state.currentSearch = '';
  renderTabs();
  renderHistory();
  renderBookmarks();
  renderShortcuts();
  renderHome();
}

function renderShortcuts() {
  $('#shortcutGrid').innerHTML = SHORTCUTS.map((item, i) => `
    <button class="quick-card" data-shortcut-index="${i}">
      <span class="emoji">${escapeHtml(item.emoji)}</span>
      <strong>${escapeHtml(item.name)}</strong>
      <small>${escapeHtml(item.url)}</small>
    </button>
  `).join('');
}

function renderTabs() {
  $('#metricTabs').textContent = String(state.tabs.length);
  $('#tabs').innerHTML = state.tabs.map(tab => {
    const entry = tab.history[tab.index];
    return `
      <button class="tab ${tab.id === state.activeTabId ? 'active' : ''}" data-tab-id="${tab.id}">
        <span class="tab-dot"></span>
        <span class="tab-meta"><strong>${escapeHtml(tab.title)}</strong><small>${escapeHtml(entry.kind === 'url' ? entry.value : entry.kind === 'search' ? entry.value : 'Inicio')}</small></span>
        ${state.tabs.length > 1 ? `<span class="tab-close" data-close-tab="${tab.id}">✕</span>` : '<span></span>'}
      </button>
    `;
  }).join('');
  updateNavButtons();
}

function renderHistory() {
  $('#metricHistory').textContent = String(state.sessionHistory.length);
  $('#historyList').innerHTML = state.sessionHistory.length ? state.sessionHistory.map((item, i) => `
    <button class="mini-item" data-history-index="${i}">
      <strong>${escapeHtml(item.label)}</strong>
      <small>${escapeHtml(item.sub)}</small>
    </button>
  `).join('') : '<div class="mini-item"><small>Vacío por ahora</small></div>';
}

function renderBookmarks() {
  $('#bookmarkList').innerHTML = state.sessionBookmarks.length ? state.sessionBookmarks.map((item, i) => `
    <button class="mini-item" data-bookmark-index="${i}">
      <strong>${escapeHtml(item.label)}</strong>
      <small>${escapeHtml(item.entry.value)}</small>
    </button>
  `).join('') : '<div class="mini-item"><small>Solo duran en esta sesión</small></div>';
}

function renderHome() {
  $('#homeScreen').classList.remove('hidden');
  $('#searchScreen').classList.add('hidden');
  $('#frameWrap').classList.add('hidden');
  $('#pageTitle').textContent = 'Inicio';
  $('#pageUrl').textContent = 'Panel principal';
  $('#footerStatus').textContent = 'Listo';
  setEngineVisual(getPrefs().engine, 'home');
}


function renderSearchPanel(query) {
  state.currentSearch = query;
  $('#homeScreen').classList.add('hidden');
  $('#searchScreen').classList.remove('hidden');
  $('#frameWrap').classList.add('hidden');
  const engine = getPrefs().engine;
  const mainUrl = buildSearchUrl(query, state.searchMode, engine);
  const meta = engineMeta(engine);
  $('#pageTitle').textContent = `Buscar: ${query}`;
  $('#pageUrl').textContent = `${ENGINES[engine]} · ${labelForMode(state.searchMode)}`;
  $('#footerStatus').textContent = 'Ventana de búsqueda preparada';
  setEngineVisual(engine, 'search');
  $('#searchScreen').innerHTML = `
    <div class="search-window">
      <div class="search-brand-hero">
        <div class="search-hero-copy">
          <div class="search-header">
            <div>
              <h2>
                <span class="search-engine-title">${engineLogoHtml(engine, true)}<span>${escapeHtml(ENGINES[engine])}</span></span>
                <span>“${escapeHtml(query)}”</span>
              </h2>
              <p>Tu búsqueda está preparada con una vista más premium. Si este motor no se deja mostrar dentro, el navegador-app te avisa y puede intentar con otro automáticamente.</p>
              <div class="search-subline">
                <span class="tiny-pill">${escapeHtml(labelForMode(state.searchMode))}</span>
                <span class="tiny-pill">Motor principal: ${escapeHtml(ENGINES[engine])}</span>
                <span class="tiny-pill">Cambio automático: ${getPrefs().autoEngineFallback ? 'Activo' : 'Apagado'}</span>
              </div>
            </div>
          </div>
          <div class="search-prompt">${escapeHtml(query)}</div>
          <div class="search-actions">
            <button class="soft-btn primary" data-search-action="inside" data-engine="${engine}">Cargar resultados dentro</button>
            <button class="soft-btn" data-search-action="float" data-engine="${engine}">Abrir en flotante</button>
            <button class="soft-btn" data-search-action="outside" data-engine="${engine}">Abrir por fuera</button>
          </div>
        </div>
        <div class="search-preview">
          <div class="search-preview-head">
            <strong>Vista del motor</strong>
            <span class="engine-tag">${escapeHtml(ENGINES[engine])}</span>
          </div>
          <div class="search-preview-bar">
            ${engineLogoHtml(engine, true)}
            <div class="search-preview-text">
              <strong>${escapeHtml(ENGINES[engine])}</strong>
              <small>${escapeHtml(mainUrl)}</small>
            </div>
          </div>
          <div class="search-preview-lines">
            <span></span><span></span><span></span>
          </div>
          <div class="mini-item">
            <strong>Consulta lista</strong>
            <small>${escapeHtml(query)}</small>
          </div>
        </div>
      </div>
      <div class="engine-grid">
        ${Object.entries(ENGINES).map(([key, label]) => `
          <article class="engine-card ${key === engine ? 'current' : ''}">
            <div class="engine-topline">
              <div class="engine-card-head">
                ${engineLogoHtml(key, true)}
                <div class="engine-card-copy">
                  <h3>${escapeHtml(label)}</h3>
                  <p>${escapeHtml(query)}</p>
                </div>
              </div>
              ${key === engine ? '<span class="engine-tag">Activo</span>' : ''}
            </div>
            <div class="engine-actions">
              <button class="soft-btn primary" data-search-action="inside" data-engine="${key}">Dentro</button>
              <button class="soft-btn" data-search-action="float" data-engine="${key}">Flotante</button>
              <button class="soft-btn" data-search-action="outside" data-engine="${key}">Fuera</button>
            </div>
          </article>
        `).join('')}
      </div>
      <div class="mini-item">
        <strong>URL preparada</strong>
        <small>${escapeHtml(mainUrl)}</small>
      </div>
    </div>
  `;
}

function animateProgress() {
  clearInterval(state.progressTimer);
  const bar = $('#progressBar');
  let value = 10;
  bar.style.width = '10%';
  state.progressTimer = setInterval(() => {
    value = Math.min(88, value + Math.random() * 10);
    bar.style.width = `${value}%`;
  }, 180);
}

function endProgress() {
  clearInterval(state.progressTimer);
  $('#progressBar').style.width = '100%';
  setTimeout(() => $('#progressBar').style.width = '0%', 250);
}

function getEngineChain(primaryEngine) {
  const prefs = getPrefs();
  const fallback = normalizePrefs(prefs).fallbackEngines || [];
  return [primaryEngine, ...fallback].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
}

function makeSearchUrlEntry(query, engine, tried = [engine]) {
  return makeEntry('url', buildSearchUrl(query, state.searchMode, engine), { source: 'search', query, engine, primaryEngine: engine, tried });
}

function attemptNextEngine(reason = 'timeout') {
  const meta = state.activeLoadMeta;
  const prefs = getPrefs();
  if (!meta || meta.source !== 'search' || !prefs.autoEngineFallback) return false;
  const chain = getEngineChain(meta.primaryEngine || meta.engine || prefs.engine);
  const tried = Array.isArray(meta.tried) ? meta.tried.slice() : [meta.engine || prefs.engine];
  const nextEngine = chain.find(engine => !tried.includes(engine));
  if (!nextEngine) {
    $('#frameOverlay').classList.remove('hidden');
    $('#footerStatus').textContent = 'No hubo otro motor disponible para seguir intentando dentro.';
    toast('Sin más motores', 'Ya se intentaron los motores configurados.');
    return false;
  }
  state.autoSwitching = true;
  meta.tried = [...tried, nextEngine];
  meta.engine = nextEngine;
  const nextUrl = buildSearchUrl(meta.query, state.searchMode, nextEngine);
  state.currentUrl = nextUrl;
  const tab = currentTab();
  if (tab) {
    tab.history[tab.index] = makeEntry('url', nextUrl, { ...meta });
    tab.title = `${ENGINES[nextEngine]}: ${meta.query}`;
    renderTabs();
  }
  $('#pageTitle').textContent = `${ENGINES[nextEngine]}: ${meta.query}`;
  $('#pageUrl').textContent = nextUrl;
  setEngineVisual(nextEngine, 'search');
  $('#footerStatus').textContent = `Intentando con ${ENGINES[nextEngine]}...`;
  $('#frameOverlay').classList.add('hidden');
  toast('Cambio automático', `Esta búsqueda se va a intentar con ${ENGINES[nextEngine]}.`);
  animateProgress();
  clearTimeout(state.fallbackTimer);
  $('#webFrame').src = nextUrl;
  state.fallbackTimer = setTimeout(() => {
    state.autoSwitching = false;
    attemptNextEngine('timeout');
  }, prefs.fallbackDelay * 1000);
  return true;
}

function renderFrame(url, title = titleForEntry(makeEntry('url', url))) {
  state.currentUrl = url;
  const entry = currentEntry();
  const prefs = getPrefs();
  state.activeLoadMeta = entry?.meta ? { ...entry.meta } : null;
  state.autoSwitching = false;
  $('#homeScreen').classList.add('hidden');
  $('#searchScreen').classList.add('hidden');
  $('#frameWrap').classList.remove('hidden');
  $('#pageTitle').textContent = title;
  $('#pageUrl').textContent = url;
  const visualEngine = state.activeLoadMeta?.engine || getPrefs().engine;
  setEngineVisual(visualEngine, 'search');
  $('#footerStatus').textContent = 'Cargando página...';
  $('#frameOverlay').classList.add('hidden');
  animateProgress();
  clearTimeout(state.fallbackTimer);
  $('#webFrame').src = url;
  state.fallbackTimer = setTimeout(() => {
    const meta = state.activeLoadMeta;
    if (meta?.source === 'search' && prefs.autoEngineFallback) {
      const moved = attemptNextEngine('timeout');
      if (moved) return;
    }
    $('#frameOverlay').classList.remove('hidden');
    $('#footerStatus').textContent = 'La página puede estar bloqueando el visor interno';
  }, prefs.fallbackDelay * 1000);
}

$('#webFrame').addEventListener('load', () => {
  clearTimeout(state.fallbackTimer);
  $('#frameOverlay').classList.add('hidden');
  endProgress();
  const meta = state.activeLoadMeta;
  if (meta?.source === 'search') {
    $('#footerStatus').textContent = `Resultados cargados con ${ENGINES[meta.engine] || 'el motor activo'}`;
  } else {
    $('#footerStatus').textContent = 'Página cargada';
  }
  state.autoSwitching = false;
});

function pushHistory(entry, label) {
  const sub = entry.kind === 'url' ? entry.value : entry.kind === 'search' ? `${ENGINES[getPrefs().engine]} · ${labelForMode(state.searchMode)}` : 'Inicio';
  state.sessionHistory = [{ entry, label, sub }, ...state.sessionHistory.filter(x => !(x.entry.kind === entry.kind && x.entry.value === entry.value))].slice(0, 24);
  renderHistory();
}

function recordToTab(entry, title) {
  const tab = currentTab();
  tab.history = tab.history.slice(0, tab.index + 1);
  tab.history.push(entry);
  tab.index = tab.history.length - 1;
  tab.title = title || titleForEntry(entry);
  pushHistory(entry, tab.title);
  renderTabs();
}

function openEntry(entry, push = false) {
  const tab = currentTab();
  if (push) recordToTab(entry, titleForEntry(entry));
  tab.title = titleForEntry(entry);
  renderTabs();
  $('#omniboxInput').value = entry.kind === 'home' ? '' : entry.value;
  if (entry.kind === 'home') return renderHome();
  if (entry.kind === 'search') return renderSearchPanel(entry.value);
  return renderFrame(entry.value, titleForEntry(entry));
}

function parseInput(text) {
  const value = text.trim();
  if (!value) return null;
  return looksLikeUrl(value) ? makeEntry('url', normalizeUrl(value)) : makeEntry('search', value);
}

function navigate(raw) {
  const entry = parseInput(raw);
  if (!entry) return;
  const prefs = getPrefs();
  if (entry.kind === 'search') {
    recordToTab(entry, `Buscar: ${entry.value}`);
    if (prefs.openBehavior === 'outside') {
      renderSearchPanel(entry.value);
      openExternal(buildSearchUrl(entry.value, state.searchMode, prefs.engine));
      return;
    }
    if (prefs.openBehavior === 'float') {
      renderSearchPanel(entry.value);
      openFloat(buildSearchUrl(entry.value, state.searchMode, prefs.engine));
      return;
    }
    if (prefs.openBehavior === 'inside') {
      const urlEntry = makeSearchUrlEntry(entry.value, prefs.engine, [prefs.engine]);
      recordToTab(urlEntry, `${ENGINES[prefs.engine]}: ${entry.value}`);
      openEntry(urlEntry, false);
      return;
    }
    renderSearchPanel(entry.value);
    return;
  }
  recordToTab(entry, titleForEntry(entry));
  if (prefs.openBehavior === 'outside') return openExternal(entry.value);
  if (prefs.openBehavior === 'float') return openFloat(entry.value);
  openEntry(entry, false);
}

function openExternal(url) {
  if (!url) return toast('Abrir afuera', 'No hay nada para abrir.');
  window.open(url, '_blank', 'noopener,noreferrer');
  toast('Abierto por fuera', 'Se abrió sin cerrar tu navegador-app.');
}

function openFloat(url) {
  if (!url) return toast('Flotante', 'No hay nada para abrir.');
  $('#floatWindow').classList.remove('hidden');
  $('#floatUrl').textContent = url;
  $('#floatFrame').src = url;
  beep('success');
}

function addBookmark() {
  const entry = currentEntry();
  if (entry.kind === 'home') return toast('Favoritos', 'Primero abre algo.');
  const label = titleForEntry(entry);
  state.sessionBookmarks = [{ entry, label }, ...state.sessionBookmarks.filter(x => !(x.entry.kind === entry.kind && x.entry.value === entry.value))].slice(0, 16);
  renderBookmarks();
  toast('Guardado', 'Favorito guardado solo en esta sesión.');
}

function updateNavButtons() {
  const tab = currentTab();
  const backDisabled = !(tab && tab.index > 0);
  const fwdDisabled = !(tab && tab.index < tab.history.length - 1);
  ['backBtn', 'mobileBackBtn'].forEach(id => $('#' + id).disabled = backDisabled);
  $('#forwardBtn').disabled = fwdDisabled;
}

function goBack() {
  const tab = currentTab();
  if (!tab || tab.index <= 0) return toast('Atrás', 'No hay más páginas hacia atrás.');
  tab.index -= 1;
  openEntry(tab.history[tab.index], false);
}

function goForward() {
  const tab = currentTab();
  if (!tab || tab.index >= tab.history.length - 1) return toast('Adelante', 'No hay más páginas hacia adelante.');
  tab.index += 1;
  openEntry(tab.history[tab.index], false);
}

function reloadCurrent() {
  const entry = currentEntry();
  if (entry.kind === 'home') return renderHome();
  if (entry.kind === 'search') return renderSearchPanel(entry.value);
  renderFrame(entry.value, titleForEntry(entry));
}

function goHome() {
  const entry = makeEntry('home', 'home');
  recordToTab(entry, 'Inicio');
  openEntry(entry, false);
}

function newTab(entry = makeEntry('home', 'home')) {
  const tab = makeTab(entry);
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  renderTabs();
  openEntry(entry, false);
}

function closeTab(tabId) {
  if (state.tabs.length === 1) return toast('Pestañas', 'Debe quedar al menos una.');
  const idx = state.tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  const active = state.activeTabId === tabId;
  state.tabs.splice(idx, 1);
  if (active) {
    state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
    openEntry(currentEntry(), false);
  }
  renderTabs();
}

function setActiveTab(tabId) {
  state.activeTabId = tabId;
  openEntry(currentEntry(), false);
}

function syncSettingsForm() {
  const prefs = getPrefs();
  $('#setDisplayName').value = prefs.displayName || '';
  $('#setTheme').value = prefs.theme;
  $('#setEngine').value = prefs.engine;
  $('#setAudio').value = prefs.audioMode;
  $('#setOpenBehavior').value = prefs.openBehavior;
  $('#setDefaultMode').value = prefs.defaultMode;
  $('#setDeviceMode').value = prefs.deviceMode;
  $('#setFontSize').value = prefs.fontSize;
  $('#setVolume').value = prefs.volume;
  $('#setFallbackOne').value = prefs.fallbackEngines?.[0] || '';
  $('#setFallbackTwo').value = prefs.fallbackEngines?.[1] || '';
  $('#setFallbackThree').value = prefs.fallbackEngines?.[2] || '';
  $('#setFallbackDelay').value = prefs.fallbackDelay;
  $('#setAutoEngineFallback').checked = !!prefs.autoEngineFallback;
  $('#setAlerts').checked = !!prefs.alerts;
  $('#setCompact').checked = !!prefs.compact;
  $('#setReduceMotion').checked = !!prefs.reduceMotion;
  $('#setSidebar').checked = !!prefs.sidebar;
  $('#fontValue').textContent = `${prefs.fontSize}px`;
  $('#volumeValue').textContent = `${prefs.volume}%`;
  $('#fallbackDelayValue').textContent = `${prefs.fallbackDelay}s`;
}

function collectSettingsForm() {
  const current = getPrefs();
  const selectedEngine = $('#setEngine').value;
  return normalizePrefs({
    ...current,
    displayName: $('#setDisplayName').value.trim() || current.displayName || state.currentUser || 'Invitado',
    theme: $('#setTheme').value,
    engine: selectedEngine,
    audioMode: $('#setAudio').value,
    openBehavior: $('#setOpenBehavior').value,
    defaultMode: $('#setDefaultMode').value,
    deviceMode: $('#setDeviceMode').value,
    fontSize: Number($('#setFontSize').value),
    volume: Number($('#setVolume').value),
    fallbackEngines: [$('#setFallbackOne').value, $('#setFallbackTwo').value, $('#setFallbackThree').value].filter(v => v && v !== selectedEngine),
    fallbackDelay: Number($('#setFallbackDelay').value),
    autoEngineFallback: $('#setAutoEngineFallback').checked,
    alerts: $('#setAlerts').checked,
    compact: $('#setCompact').checked,
    reduceMotion: $('#setReduceMotion').checked,
    sidebar: $('#setSidebar').checked,
  });
}

function saveSettingsAction() {
  const prefs = collectSettingsForm();
  savePrefs(prefs);
  state.searchMode = prefs.defaultMode;
  syncModeButtons();
  applyPrefs();
  updateUserUi();
  syncSettingsForm();
  toast('Ajustes guardados', state.currentUser ? 'Quedaron guardados dentro de tu cuenta.' : 'Quedaron activos como invitado.');
}

function resetSettingsAction() {
  const prefs = defaultPrefs();
  prefs.displayName = state.currentUser ? (state.accounts[state.currentUser]?.prefs.displayName || state.currentUser) : 'Invitado';
  savePrefs(prefs);
  state.searchMode = prefs.defaultMode;
  syncModeButtons();
  applyPrefs();
  updateUserUi();
  syncSettingsForm();
  toast('Ajustes restablecidos');
}

function syncModeButtons() {
  $$('.mode-chip[data-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.searchMode));
  $('#modeBadge').textContent = labelForMode(state.searchMode);
  $('#footerMode').textContent = labelForMode(state.searchMode);
  const engine = state.activeLoadMeta?.engine || getPrefs().engine;
  setEngineVisual(engine, currentEntry().kind === 'home' ? 'home' : 'search');
}

function openDrawer() {
  state.drawerOpen = true;
  $('#menuDrawer').classList.remove('hidden');
  $('#menuDrawer').setAttribute('aria-hidden', 'false');
  syncSettingsForm();
}

function closeDrawer() {
  state.drawerOpen = false;
  $('#menuDrawer').classList.add('hidden');
  $('#menuDrawer').setAttribute('aria-hidden', 'true');
}

function openAuth(mode = 'signup') {
  state.authMode = mode;
  $('#authModal').classList.remove('hidden');
  $('#authTitle').textContent = mode === 'signup' ? 'Crear cuenta' : 'Entrar';
  $('#authSub').textContent = mode === 'signup' ? 'Guarda solo tu cuenta y tus ajustes.' : 'Entra con tu usuario y tu contraseña.';
  $('#authNameWrap').classList.toggle('hidden', mode === 'login');
  $('#authSubmitBtn').textContent = mode === 'signup' ? 'Crear cuenta' : 'Entrar';
  $('#authMsg').textContent = '';
  $$('.auth-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.authMode === mode));
  renderSavedAccounts();
  $('#authUser').focus();
}

function closeAuth() {
  $('#authModal').classList.add('hidden');
}

function renderSavedAccounts() {
  const names = Object.keys(state.accounts);
  $('#savedAccounts').innerHTML = names.map(name => `<button class="saved-account" data-saved-user="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
}

async function hashText(text) {
  if (window.crypto?.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(text)));
}

async function createAccount() {
  const username = $('#authUser').value.trim().toLowerCase();
  const name = $('#authName').value.trim() || username;
  const password = $('#authPass').value;
  if (!/^[a-z0-9._-]{3,24}$/i.test(username)) return $('#authMsg').textContent = 'Usuario de 3 a 24 caracteres.';
  if (password.length < 4) return $('#authMsg').textContent = 'La contraseña debe tener al menos 4 caracteres.';
  if (state.accounts[username]) return $('#authMsg').textContent = 'Ese usuario ya existe.';
  const prefs = defaultPrefs();
  prefs.displayName = name;
  prefs.theme = $('#authTheme').value;
  prefs.engine = $('#authEngine').value;
  const passwordHash = await hashText(password);
  state.accounts[username] = { passwordHash, prefs };
  saveAccounts();
  await login(username, password, true);
}

async function login(userArg = null, passArg = null, quiet = false) {
  const username = (userArg || $('#authUser').value).trim().toLowerCase();
  const password = passArg || $('#authPass').value;
  const account = state.accounts[username];
  if (!account) return $('#authMsg').textContent = 'No encontré esa cuenta.';
  const hash = await hashText(password);
  if (hash !== account.passwordHash) return $('#authMsg').textContent = 'Contraseña incorrecta.';
  state.currentUser = username;
  state.searchMode = account.prefs.defaultMode || 'web';
  resetSession();
  applyPrefs();
  updateUserUi();
  syncSettingsForm();
  syncModeButtons();
  closeAuth();
  if (!quiet) toast('Cuenta abierta', `Entraste como ${account.prefs.displayName || username}.`);
}

function logout() {
  if (!state.currentUser) return toast('Cuenta', 'No hay una cuenta abierta.');
  state.currentUser = null;
  state.guestPrefs = defaultPrefs();
  resetSession();
  applyPrefs();
  updateUserUi();
  syncSettingsForm();
  syncModeButtons();
  toast('Sesión cerrada', 'La cuenta quedó guardada. El historial se borró.');
}

function beep(type = 'tap') {
  const prefs = getPrefs();
  if (prefs.audioMode === 'off') return;
  try {
    state.audioCtx = state.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
    const ctx = state.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = type === 'success' ? 520 : type === 'warn' ? 220 : 360;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.001, prefs.volume / 1000), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.start(now); osc.stop(now + 0.2);
  } catch {}
}

function cycleAudio() {
  const prefs = getPrefs();
  prefs.audioMode = prefs.audioMode === 'off' ? 'ui' : prefs.audioMode === 'ui' ? 'voice' : 'off';
  savePrefs(prefs);
  applyPrefs();
  beep('success');
  toast('Audio', prefs.audioMode === 'off' ? 'Desactivado' : prefs.audioMode === 'ui' ? 'Efectos UI activos' : 'Voz y UI activas');
}

function speakCurrent() {
  if (!('speechSynthesis' in window)) return toast('Voz', 'Este navegador no soporta lectura.');
  const prefs = getPrefs();
  const text = ($('#omniboxInput').value || $('#pageTitle').textContent || 'Sin texto').trim();
  if (!text) return toast('Voz', 'No hay texto para leer.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-CO';
  u.rate = 0.98;
  u.pitch = 1;
  u.volume = Math.max(0.1, prefs.volume / 100);
  speechSynthesis.speak(u);
  toast('Lectura iniciada', text.slice(0, 40));
}

function setupRecognition() {
  const API = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!API) {
    $('#voiceBtn').title = 'La búsqueda por voz no está disponible aquí';
    return;
  }
  const rec = new API();
  rec.lang = 'es-CO';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  rec.onstart = () => {
    state.listening = true;
    $('#voiceBtn').classList.add('active');
    toast('Escuchando', 'Habla ahora para buscar.');
  };
  rec.onend = () => {
    state.listening = false;
    $('#voiceBtn').classList.remove('active');
  };
  rec.onerror = () => {
    state.listening = false;
    $('#voiceBtn').classList.remove('active');
    toast('Micrófono', 'No pude usar el micrófono.');
  };
  rec.onresult = e => {
    const text = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
    $('#omniboxInput').value = text;
    if (e.results[e.results.length - 1]?.isFinal) navigate(text);
  };
  state.recognition = rec;
}

function toggleVoiceSearch() {
  if (!state.recognition) return toast('Micrófono', 'La búsqueda por voz no está disponible en este navegador.');
  try {
    if (state.listening) state.recognition.stop();
    else state.recognition.start();
  } catch {
    toast('Micrófono', 'No pude iniciar la grabación.');
  }
}

function duplicateCurrentTab() {
  const entry = currentEntry();
  newTab(entry);
  toast('Pestaña duplicada');
}

function shareCurrent() {
  const entry = currentEntry();
  const text = entry.kind === 'home' ? 'Inicio' : entry.value;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Copiado', 'Se copió al portapapeles.')).catch(() => toast('Copiar', text));
  } else {
    toast('Copiar', text);
  }
}

function clearSession() {
  resetSession();
  toast('Sesión limpia', 'Se borró historial, favoritos y pestañas temporales.');
}

function clearHistoryOnly() {
  state.sessionHistory = [];
  renderHistory();
  toast('Historial', 'Se borró el historial de esta sesión.');
}

function maybeCurrentUrlFromEntry() {
  const entry = currentEntry();
  if (entry.kind === 'url') return entry.value;
  if (entry.kind === 'search') return buildSearchUrl(entry.value, state.searchMode, getPrefs().engine);
  return '';
}

function handleSearchAction(action, engine) {
  const query = state.currentSearch || $('#omniboxInput').value.trim();
  if (!query) return toast('Búsqueda', 'No hay búsqueda para abrir.');
  const url = buildSearchUrl(query, state.searchMode, engine);
  if (action === 'outside') return openExternal(url);
  if (action === 'float') return openFloat(url);
  const entry = makeSearchUrlEntry(query, engine, [engine]);
  recordToTab(entry, `${ENGINES[engine]}: ${query}`);
  setEngineVisual(engine, 'search');
  openEntry(entry, false);
}

function showSuggestions(text) {
  const value = text.trim().toLowerCase();
  if (!value) return hideSuggestions();
  const suggestions = [];
  state.sessionHistory.forEach(item => {
    if (item.label.toLowerCase().includes(value) || item.sub.toLowerCase().includes(value)) suggestions.push({ kind: 'hist', title: item.label, sub: item.sub, value: item.entry.value });
  });
  SHORTCUTS.forEach(item => {
    if (item.name.toLowerCase().includes(value) || item.url.toLowerCase().includes(value)) suggestions.push({ kind: 'shortcut', title: item.name, sub: item.url, value: item.url });
  });
  suggestions.push({ kind: 'search', title: `Buscar “${text.trim()}”`, sub: `${ENGINES[getPrefs().engine]} · ${labelForMode(state.searchMode)}`, value: text.trim() });
  const finalList = suggestions.slice(0, 7);
  $('#suggestionsBox').innerHTML = finalList.map((item, index) => `
    <button class="suggest-item" data-suggest-index="${index}">
      <span class="suggest-icon">${item.kind === 'search' ? '🔎' : item.kind === 'hist' ? '🕘' : '↗'}</span>
      <span class="suggest-text"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.sub)}</small></span>
    </button>
  `).join('');
  $('#suggestionsBox').classList.remove('hidden');
  $('#suggestionsBox').dataset.payload = JSON.stringify(finalList);
}

function hideSuggestions() {
  $('#suggestionsBox').classList.add('hidden');
  $('#suggestionsBox').innerHTML = '';
  delete $('#suggestionsBox').dataset.payload;
}

function handleTraffic(action) {
  if (action === 'close') {
    goHome();
    toast('Inicio', 'La pestaña volvió al inicio.');
    return;
  }
  if (action === 'compact') {
    const prefs = getPrefs();
    prefs.compact = !prefs.compact;
    savePrefs(prefs);
    applyPrefs();
    syncSettingsForm();
    toast('Interfaz', prefs.compact ? 'Modo compacto activado.' : 'Modo compacto desactivado.');
    return;
  }
  if (action === 'fullscreen') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      toast('Pantalla completa', 'Activada si el navegador lo permite.');
    } else {
      document.exitFullscreen?.();
      toast('Pantalla completa', 'Cerrada.');
    }
  }
}

function wireStaticEvents() {
  $('#navForm').addEventListener('submit', e => { e.preventDefault(); hideSuggestions(); navigate($('#omniboxInput').value); });
  $('#omniboxInput').addEventListener('input', e => showSuggestions(e.target.value));
  $('#omniboxInput').addEventListener('focus', e => showSuggestions(e.target.value));
  $('#omniboxInput').addEventListener('blur', () => setTimeout(hideSuggestions, 140));
  $('#suggestionsBox').addEventListener('click', e => {
    const btn = e.target.closest('[data-suggest-index]');
    if (!btn) return;
    const list = JSON.parse($('#suggestionsBox').dataset.payload || '[]');
    const item = list[Number(btn.dataset.suggestIndex)];
    if (!item) return;
    $('#omniboxInput').value = item.value;
    hideSuggestions();
    navigate(item.value);
  });

  $('#hamburgerBtn').addEventListener('click', openDrawer);
  $('#engineBadgeBtn').addEventListener('click', openDrawer);
  $('#mobileMenuBtn').addEventListener('click', openDrawer);
  $('#closeDrawerBtn').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);

  $('#accountQuickBtn').addEventListener('click', () => openAuth(state.currentUser ? 'login' : 'signup'));
  $('#openAuthBtn').addEventListener('click', () => openAuth(state.currentUser ? 'login' : 'signup'));
  $('#heroAccountBtn').addEventListener('click', () => openAuth(state.currentUser ? 'login' : 'signup'));
  $('#settingsBtn').addEventListener('click', openDrawer);
  $('#heroSettingsBtn').addEventListener('click', openDrawer);

  $('#backBtn').addEventListener('click', goBack);
  $('#mobileBackBtn').addEventListener('click', goBack);
  $('#forwardBtn').addEventListener('click', goForward);
  $('#reloadBtn').addEventListener('click', reloadCurrent);
  $('#homeBtn').addEventListener('click', goHome);
  $('#mobileHomeBtn').addEventListener('click', goHome);
  $('#heroSearchBtn').addEventListener('click', () => $('#omniboxInput').focus());
  $('#mobileSearchBtn').addEventListener('click', () => $('#omniboxInput').focus());

  $('#audioBtn').addEventListener('click', cycleAudio);
  $('#speakBtn').addEventListener('click', speakCurrent);
  $('#voiceBtn').addEventListener('click', toggleVoiceSearch);

  $('#outsideBtn').addEventListener('click', () => openExternal(maybeCurrentUrlFromEntry()));
  $('#floatBtn').addEventListener('click', () => openFloat(maybeCurrentUrlFromEntry()));
  $('#mobileFloatBtn').addEventListener('click', () => openFloat(maybeCurrentUrlFromEntry()));

  $('#newTabBtn').addEventListener('click', () => newTab());
  $('#duplicateBtn').addEventListener('click', duplicateCurrentTab);
  $('#shareBtn').addEventListener('click', shareCurrent);
  $('#bookmarkBtn').addEventListener('click', addBookmark);
  $('#clearSessionBtn').addEventListener('click', clearSession);
  $('#clearHistoryBtn').addEventListener('click', clearHistoryOnly);

  $('#overlayOutsideBtn').addEventListener('click', () => openExternal(state.currentUrl));
  $('#overlayFloatBtn').addEventListener('click', () => openFloat(state.currentUrl));
  $('#overlayHomeBtn').addEventListener('click', goHome);

  $('#floatCloseBtn').addEventListener('click', () => $('#floatWindow').classList.add('hidden'));
  $('#floatRefreshBtn').addEventListener('click', () => { const src = $('#floatFrame').src; if (src) $('#floatFrame').src = src; });

  $('#saveSettingsBtn').addEventListener('click', saveSettingsAction);
  $('#resetSettingsBtn').addEventListener('click', resetSettingsAction);
  $('#setFontSize').addEventListener('input', () => $('#fontValue').textContent = `${$('#setFontSize').value}px`);
  $('#setVolume').addEventListener('input', () => $('#volumeValue').textContent = `${$('#setVolume').value}%`);
  $('#setFallbackDelay').addEventListener('input', () => $('#fallbackDelayValue').textContent = `${$('#setFallbackDelay').value}s`);

  $('#authSubmitBtn').addEventListener('click', async () => {
    if (state.authMode === 'signup') await createAccount();
    else await login();
  });
  $('#guestBtn').addEventListener('click', () => { closeAuth(); toast('Modo invitado', 'Sin guardar historial ni ajustes.'); });
  $('#closeAuthBtn').addEventListener('click', closeAuth);
  $('#authBackdrop').addEventListener('click', closeAuth);
  $$('.auth-tab').forEach(btn => btn.addEventListener('click', () => openAuth(btn.dataset.authMode)));
  $('#savedAccounts').addEventListener('click', e => {
    const btn = e.target.closest('[data-saved-user]');
    if (!btn) return;
    $('#authUser').value = btn.dataset.savedUser;
    openAuth('login');
  });
  $('#logoutBtn').addEventListener('click', logout);

  $('#tabs').addEventListener('click', e => {
    const closeBtn = e.target.closest('[data-close-tab]');
    if (closeBtn) return closeTab(closeBtn.dataset.closeTab);
    const tabBtn = e.target.closest('[data-tab-id]');
    if (!tabBtn) return;
    setActiveTab(tabBtn.dataset.tabId);
  });

  $('#historyList').addEventListener('click', e => {
    const item = e.target.closest('[data-history-index]');
    if (!item) return;
    const ref = state.sessionHistory[Number(item.dataset.historyIndex)];
    if (!ref) return;
    recordToTab(ref.entry, ref.label);
    openEntry(ref.entry, false);
  });
  $('#bookmarkList').addEventListener('click', e => {
    const item = e.target.closest('[data-bookmark-index]');
    if (!item) return;
    const ref = state.sessionBookmarks[Number(item.dataset.bookmarkIndex)];
    if (!ref) return;
    recordToTab(ref.entry, ref.label);
    openEntry(ref.entry, false);
  });
  $('#shortcutGrid').addEventListener('click', e => {
    const card = e.target.closest('[data-shortcut-index]');
    if (!card) return;
    const idx = Number(card.dataset.shortcutIndex);
    navigate(SHORTCUTS[idx].url);
  });
  $('#searchScreen').addEventListener('click', e => {
    const btn = e.target.closest('[data-search-action]');
    if (!btn) return;
    handleSearchAction(btn.dataset.searchAction, btn.dataset.engine);
  });

  $$('.mode-chip[data-mode]').forEach(btn => btn.addEventListener('click', () => {
    state.searchMode = btn.dataset.mode;
    syncModeButtons();
    beep('tap');
  }));

  $$('.menu-btn').forEach(btn => btn.addEventListener('click', () => {
    const action = btn.dataset.menuAction;
    if (action === 'new-tab') newTab();
    if (action === 'home') goHome();
    if (action === 'voice') toggleVoiceSearch();
    if (action === 'float') openFloat(maybeCurrentUrlFromEntry());
    if (action === 'outside') openExternal(maybeCurrentUrlFromEntry());
    if (action === 'clear-session') clearSession();
    if (action === 'account') openAuth(state.currentUser ? 'login' : 'signup');
    if (action === 'logout') logout();
  }));

  $('#trafficClose').addEventListener('click', () => handleTraffic('close'));
  $('#trafficCompact').addEventListener('click', () => handleTraffic('compact'));
  $('#trafficFullscreen').addEventListener('click', () => handleTraffic('fullscreen'));
}

function init() {
  populateEngineSelects();
  setupRecognition();
  updateClock();
  setInterval(updateClock, 1000);
  resetSession();
  state.searchMode = getPrefs().defaultMode || 'web';
  syncModeButtons();
  applyPrefs();
  updateUserUi();
  syncSettingsForm();
  wireStaticEvents();
}

init();
