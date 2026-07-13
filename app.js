'use strict';

const API_BASE = 'https://ll.thespacedevs.com/2.3.0/launches/';
const CACHE_KEY = 'spacex-launch-tracker-v2';
const CACHE_DURATION = 15 * 60 * 1000;
const PAGE_SIZE = 9;
const REQUEST_LIMIT = 50;

const state = {
  upcoming: [],
  previous: [],
  activeView: 'upcoming',
  search: '',
  rocket: 'all',
  sort: 'date',
  visibleCount: PAGE_SIZE,
  countdownTimer: null,
};

const els = {
  featured: document.querySelector('#featured-launch'),
  dataStatus: document.querySelector('#data-status'),
  grid: document.querySelector('#launch-grid'),
  cardTemplate: document.querySelector('#card-template'),
  upcomingCount: document.querySelector('#upcoming-count'),
  previousCount: document.querySelector('#previous-count'),
  tabs: [...document.querySelectorAll('.tab')],
  search: document.querySelector('#search-input'),
  rocketFilter: document.querySelector('#rocket-filter'),
  sort: document.querySelector('#sort-select'),
  loadMore: document.querySelector('#load-more-button'),
  empty: document.querySelector('#empty-state'),
  errorNotice: document.querySelector('#error-notice'),
  errorMessage: document.querySelector('#error-message'),
  retry: document.querySelector('#retry-button'),
  refresh: document.querySelector('#refresh-button'),
  dialog: document.querySelector('#launch-dialog'),
  dialogContent: document.querySelector('#dialog-content'),
  dialogClose: document.querySelector('#dialog-close'),
};

function buildApiUrl(direction) {
  const now = new Date().toISOString();
  const params = new URLSearchParams({
    limit: String(REQUEST_LIMIT),
    lsp__name: 'SpaceX',
    mode: 'normal',
    ordering: direction === 'upcoming' ? 'net' : '-net',
  });
  params.set(direction === 'upcoming' ? 'net__gte' : 'net__lt', now);
  return `${API_BASE}?${params.toString()}`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const rateLimited = response.status === 429;
      throw new Error(rateLimited
        ? 'The free API request limit has been reached. Cached data will be used when available.'
        : `The launch API returned ${response.status}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!cached?.timestamp || !Array.isArray(cached.upcoming) || !Array.isArray(cached.previous)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      upcoming: state.upcoming,
      previous: state.previous,
    }));
  } catch {
    // The tracker still works when storage is unavailable.
  }
}

async function loadLaunches({ force = false } = {}) {
  setLoading(true);
  hideError();

  const cache = readCache();
  const cacheIsFresh = cache && Date.now() - cache.timestamp < CACHE_DURATION;

  if (!force && cacheIsFresh) {
    applyData(cache.upcoming, cache.previous);
    setStatus(`Showing cached data from ${formatRelativeTime(cache.timestamp)}.`);
    setLoading(false);
    return;
  }

  try {
    const [upcomingData, previousData] = await Promise.all([
      fetchJson(buildApiUrl('upcoming')),
      fetchJson(buildApiUrl('previous')),
    ]);

    const upcoming = Array.isArray(upcomingData.results) ? upcomingData.results : [];
    const previous = Array.isArray(previousData.results) ? previousData.results : [];
    applyData(upcoming, previous);
    writeCache();
    setStatus(`Live data updated ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())}.`);
  } catch (error) {
    if (cache) {
      applyData(cache.upcoming, cache.previous);
      setStatus(`API unavailable — showing cached data from ${formatRelativeTime(cache.timestamp)}.`);
      showError(`${normaliseError(error)} The most recently saved launch data is still displayed.`);
    } else {
      applyData([], []);
      setStatus('Launch data is currently unavailable.');
      showError(normaliseError(error));
    }
  } finally {
    setLoading(false);
  }
}

function applyData(upcoming, previous) {
  state.upcoming = upcoming.filter(Boolean);
  state.previous = previous.filter(Boolean);
  els.upcomingCount.textContent = String(state.upcoming.length);
  els.previousCount.textContent = String(state.previous.length);
  populateRocketFilter();
  renderFeatured();
  renderLaunches();
}

function setLoading(isLoading) {
  els.grid.setAttribute('aria-busy', String(isLoading));
  els.refresh.disabled = isLoading;
  els.retry.disabled = isLoading;
  if (isLoading) els.refresh.firstElementChild?.classList.add('spin');
  else els.refresh.firstElementChild?.classList.remove('spin');
}

function setStatus(message) {
  els.dataStatus.textContent = message;
}

function showError(message) {
  els.errorMessage.textContent = message;
  els.errorNotice.hidden = false;
}

function hideError() {
  els.errorNotice.hidden = true;
}

function normaliseError(error) {
  if (error?.name === 'AbortError') return 'The request timed out.';
  return error?.message || 'An unknown error occurred while loading launch data.';
}

function renderFeatured() {
  clearInterval(state.countdownTimer);
  const launch = state.upcoming[0];

  if (!launch) {
    els.featured.classList.remove('loading-card');
    els.featured.innerHTML = `
      <div class="featured-image placeholder"></div>
      <div class="featured-overlay"></div>
      <div class="featured-content">
        <p class="featured-kicker">No upcoming launch found</p>
        <h2 class="featured-title">Check back soon</h2>
        <p class="hero-intro">The launch provider may not have published the next mission yet.</p>
      </div>`;
    return;
  }

  const imageUrl = getImageUrl(launch);
  const videoUrl = getVideoUrl(launch);
  const launchDate = parseDate(launch.net);
  const imageMarkup = imageUrl
    ? `<img class="featured-image" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(imageAlt(launch))}">`
    : '<div class="featured-image placeholder"></div>';

  els.featured.classList.remove('loading-card');
  els.featured.innerHTML = `
    ${imageMarkup}
    <div class="featured-overlay"></div>
    <div class="featured-content">
      <div class="featured-topline">
        <p class="featured-kicker">Next scheduled launch</p>
        <span class="featured-status">${escapeHtml(statusName(launch))}</span>
      </div>
      <h2 class="featured-title">${escapeHtml(launch.name || 'Unnamed mission')}</h2>
      <div class="featured-meta">
        <span>◷ ${escapeHtml(formatDateTime(launchDate))}</span>
        <span>↗ ${escapeHtml(rocketName(launch))}</span>
        <span>⌖ ${escapeHtml(locationName(launch))}</span>
      </div>
      <div class="countdown" id="featured-countdown" aria-label="Countdown to launch"></div>
      <div class="featured-actions">
        <button class="button button-primary" id="featured-details" type="button">Mission details</button>
        ${videoUrl ? `<a class="button button-ghost" href="${escapeAttribute(videoUrl)}" target="_blank" rel="noopener noreferrer">Watch webcast ↗</a>` : ''}
      </div>
    </div>`;

  const featuredImage = els.featured.querySelector('img');
  featuredImage?.addEventListener('error', () => {
    featuredImage.replaceWith(Object.assign(document.createElement('div'), { className: 'featured-image placeholder' }));
  }, { once: true });

  els.featured.querySelector('#featured-details')?.addEventListener('click', () => openLaunchDialog(launch));
  updateCountdown(launchDate);
  state.countdownTimer = setInterval(() => updateCountdown(launchDate), 1000);
}

function updateCountdown(date) {
  const container = document.querySelector('#featured-countdown');
  if (!container || !date) return;
  const difference = date.getTime() - Date.now();

  if (difference <= 0) {
    container.innerHTML = '<div class="countdown-item" style="grid-column:1/-1"><span class="countdown-value">Launching now</span><span class="countdown-label">Check the webcast for live status</span></div>';
    return;
  }

  const totalSeconds = Math.floor(difference / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    ['Days', days], ['Hours', hours], ['Minutes', minutes], ['Seconds', seconds],
  ];
  container.innerHTML = parts.map(([label, value]) => `
    <div class="countdown-item">
      <span class="countdown-value">${String(value).padStart(2, '0')}</span>
      <span class="countdown-label">${label}</span>
    </div>`).join('');
}

function populateRocketFilter() {
  const selected = state.rocket;
  const rockets = [...new Set([...state.upcoming, ...state.previous].map(rocketName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  els.rocketFilter.innerHTML = '<option value="all">All rockets</option>';
  rockets.forEach((rocket) => {
    const option = document.createElement('option');
    option.value = rocket;
    option.textContent = rocket;
    els.rocketFilter.append(option);
  });
  state.rocket = rockets.includes(selected) ? selected : 'all';
  els.rocketFilter.value = state.rocket;
}

function getFilteredLaunches() {
  const launches = [...state[state.activeView]];
  const term = state.search.trim().toLowerCase();
  const filtered = launches.filter((launch) => {
    const haystack = [
      launch.name,
      rocketName(launch),
      locationName(launch),
      launch.pad?.name,
      launch.mission?.name,
      launch.mission?.type,
      launch.mission?.orbit?.name,
      statusName(launch),
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !term || haystack.includes(term);
    const matchesRocket = state.rocket === 'all' || rocketName(launch) === state.rocket;
    return matchesSearch && matchesRocket;
  });

  filtered.sort((a, b) => {
    if (state.sort === 'name') return (a.name || '').localeCompare(b.name || '');
    const delta = dateValue(a.net) - dateValue(b.net);
    return state.activeView === 'upcoming' ? delta : -delta;
  });
  return filtered;
}

function renderLaunches() {
  const launches = getFilteredLaunches();
  const visible = launches.slice(0, state.visibleCount);
  els.grid.replaceChildren();
  els.grid.setAttribute('aria-labelledby', `${state.activeView}-tab`);

  visible.forEach((launch) => els.grid.append(createLaunchCard(launch)));
  els.empty.hidden = launches.length !== 0;
  els.grid.hidden = launches.length === 0;
  els.loadMore.hidden = visible.length >= launches.length;
}

function createLaunchCard(launch) {
  const fragment = els.cardTemplate.content.cloneNode(true);
  const article = fragment.querySelector('.launch-card');
  const button = fragment.querySelector('.card-button');
  const imageWrap = fragment.querySelector('.card-image-wrap');
  const image = fragment.querySelector('.card-image');
  const badge = fragment.querySelector('.status-badge');
  const imageUrl = getImageUrl(launch);

  if (imageUrl) {
    image.src = imageUrl;
    image.alt = imageAlt(launch);
    image.addEventListener('error', () => imageWrap.classList.add('no-image'), { once: true });
  } else {
    imageWrap.classList.add('no-image');
  }

  badge.textContent = statusName(launch);
  const badgeClass = statusClass(launch);
  if (badgeClass) badge.classList.add(badgeClass);
  fragment.querySelector('.card-date').textContent = formatDateTime(parseDate(launch.net));
  fragment.querySelector('.card-title').textContent = launch.name || 'Unnamed mission';
  fragment.querySelector('.card-rocket').textContent = rocketName(launch);
  fragment.querySelector('.card-location').textContent = locationName(launch);
  fragment.querySelector('.card-orbit').textContent = launch.mission?.orbit?.name || launch.mission?.type || 'Mission details pending';
  button.setAttribute('aria-label', `View details for ${launch.name || 'this launch'}`);
  button.addEventListener('click', () => openLaunchDialog(launch));
  return article;
}

function openLaunchDialog(launch) {
  const imageUrl = getImageUrl(launch);
  const videoUrl = getVideoUrl(launch);
  const infoUrl = getInfoUrl(launch);
  const mapUrl = safeUrl(launch.pad?.map_url);
  const launchDate = parseDate(launch.net);
  const windowStart = parseDate(launch.window_start);
  const windowEnd = parseDate(launch.window_end);
  const missionDescription = launch.mission?.description || launch.pad?.description || 'A detailed mission description has not yet been published.';
  const agencies = (launch.mission?.agencies || []).map((agency) => agency.name).filter(Boolean).join(', ') || 'Not specified';
  const probability = Number.isFinite(launch.probability) ? `${launch.probability}%` : 'Not published';
  const windowText = windowStart && windowEnd
    ? `${formatDateTime(windowStart)} – ${formatTime(windowEnd)}`
    : formatDateTime(launchDate);

  els.dialogContent.innerHTML = `
    <div class="dialog-hero ${imageUrl ? '' : 'no-image'}">
      ${imageUrl ? `<img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(imageAlt(launch))}">` : ''}
      <div class="dialog-heading">
        <span class="status-badge ${statusClass(launch)}">${escapeHtml(statusName(launch))}</span>
        <h2 id="dialog-title">${escapeHtml(launch.name || 'Unnamed mission')}</h2>
        <p class="dialog-subtitle">${escapeHtml(formatDateTime(launchDate))} · ${escapeHtml(rocketName(launch))}</p>
      </div>
    </div>
    <div class="dialog-body">
      <p class="dialog-summary">${escapeHtml(missionDescription)}</p>
      <dl class="detail-grid">
        ${detailItem('Launch status', statusName(launch))}
        ${detailItem('Date and time', formatDateTime(launchDate))}
        ${detailItem('Launch window', windowText)}
        ${detailItem('Rocket', rocketName(launch))}
        ${detailItem('Mission type', launch.mission?.type || 'Not specified')}
        ${detailItem('Target orbit', launch.mission?.orbit?.name || 'Not specified')}
        ${detailItem('Launch pad', launch.pad?.name || 'Not announced')}
        ${detailItem('Location', locationName(launch))}
        ${detailItem('Launch probability', probability)}
        ${detailItem('Provider', launch.launch_service_provider?.name || 'SpaceX')}
        ${detailItem('Mission agencies', agencies)}
        ${detailItem('Last updated', formatDateTime(parseDate(launch.last_updated)))}
      </dl>
      ${launch.weather_concerns ? `<section class="dialog-section"><h3>Weather concerns</h3><p class="dialog-summary">${escapeHtml(launch.weather_concerns)}</p></section>` : ''}
      ${launch.failreason ? `<section class="dialog-section"><h3>Failure reason</h3><p class="dialog-summary">${escapeHtml(launch.failreason)}</p></section>` : ''}
      <section class="dialog-section">
        <h3>Links</h3>
        <div class="dialog-links">
          ${videoUrl ? externalButton('Watch webcast', videoUrl) : ''}
          ${infoUrl ? externalButton('Mission information', infoUrl) : ''}
          ${mapUrl ? externalButton('View launch pad map', mapUrl) : ''}
          ${safeUrl(launch.url) ? externalButton('API record', launch.url) : ''}
        </div>
        ${!videoUrl && !infoUrl && !mapUrl ? '<p class="dialog-note">No external links have been published for this mission yet.</p>' : ''}
      </section>
    </div>`;

  const dialogImage = els.dialogContent.querySelector('.dialog-hero img');
  dialogImage?.addEventListener('error', () => {
    dialogImage.remove();
    els.dialogContent.querySelector('.dialog-hero')?.classList.add('no-image');
  }, { once: true });

  els.dialog.showModal();
  document.body.classList.add('dialog-open');
  els.dialogClose.focus();
}

function closeDialog() {
  if (els.dialog.open) els.dialog.close();
  document.body.classList.remove('dialog-open');
}

function detailItem(label, value) {
  return `<div class="detail-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || 'Not specified')}</dd></div>`;
}

function externalButton(label, url) {
  return `<a class="button button-ghost" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
}

function getImageUrl(launch) {
  return safeUrl(
    launch.image?.image_url ||
    launch.image?.thumbnail_url ||
    launch.mission?.image?.image_url ||
    launch.rocket?.configuration?.image_url ||
    launch.rocket?.configuration?.image?.image_url
  );
}

function getVideoUrl(launch) {
  const candidates = [
    ...(launch.vidURLs || []),
    ...(launch.vid_urls || []),
    ...(launch.mission?.vid_urls || []),
  ];
  const first = candidates.find((item) => safeUrl(typeof item === 'string' ? item : item?.url));
  return safeUrl(typeof first === 'string' ? first : first?.url);
}

function getInfoUrl(launch) {
  const candidates = [
    ...(launch.infoURLs || []),
    ...(launch.info_urls || []),
    ...(launch.mission?.info_urls || []),
  ];
  const first = candidates.find((item) => safeUrl(typeof item === 'string' ? item : item?.url));
  return safeUrl(typeof first === 'string' ? first : first?.url);
}

function imageAlt(launch) {
  const credit = launch.image?.credit;
  return `${launch.name || 'SpaceX launch'}${credit ? ` — image credit ${credit}` : ''}`;
}

function rocketName(launch) {
  return launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || 'Rocket not announced';
}

function locationName(launch) {
  return launch.pad?.location?.name || launch.pad?.name || 'Launch site not announced';
}

function statusName(launch) {
  return launch.status?.abbrev || launch.status?.name || (launch.net && new Date(launch.net) > new Date() ? 'Scheduled' : 'Completed');
}

function statusClass(launch) {
  const status = statusName(launch).toLowerCase();
  if (status.includes('success')) return 'success';
  if (status.includes('fail')) return 'failure';
  if (status.includes('go') || status.includes('scheduled') || status.includes('confirmed')) return 'go';
  return '';
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value) {
  return parseDate(value)?.getTime() ?? 0;
}

function formatDateTime(date) {
  if (!date) return 'Date not announced';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

function formatTime(date) {
  if (!date) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(date);
}

function formatRelativeTime(timestamp) {
  const diffMinutes = Math.round((timestamp - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  return formatter.format(Math.round(diffMinutes / 60), 'hour');
}

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function resetList() {
  state.visibleCount = PAGE_SIZE;
  renderLaunches();
}

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    state.activeView = tab.dataset.view;
    els.tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    state.visibleCount = PAGE_SIZE;
    renderLaunches();
  });
});

els.search.addEventListener('input', (event) => {
  state.search = event.target.value;
  resetList();
});

els.rocketFilter.addEventListener('change', (event) => {
  state.rocket = event.target.value;
  resetList();
});

els.sort.addEventListener('change', (event) => {
  state.sort = event.target.value;
  resetList();
});

els.loadMore.addEventListener('click', () => {
  state.visibleCount += PAGE_SIZE;
  renderLaunches();
});

els.refresh.addEventListener('click', () => loadLaunches({ force: true }));
els.retry.addEventListener('click', () => loadLaunches({ force: true }));
els.dialogClose.addEventListener('click', closeDialog);
els.dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
els.dialog.addEventListener('click', (event) => {
  if (event.target === els.dialog) closeDialog();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && els.dialog.open) closeDialog();
});

loadLaunches();
