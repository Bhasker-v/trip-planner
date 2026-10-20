// app.js — main app logic
'use strict';
window.$ = window.$ || ((s, r = document) => r.querySelector(s));
window.$$ = window.$$ || ((s, r = document) => Array.from(r.querySelectorAll(s)));
// const $  = (s, r = document) => r.querySelector(s);
// const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().trim().replace(/\s+/g, '-');
const S = window.TripDataService;

/* ---------- Theme ---------- */
const root = document.documentElement;
const saved = localStorage.getItem('theme');
if (saved === 'dark') root.setAttribute('data-theme', 'dark');
$('#themeToggle').onclick = () => {
  const dark = root.hasAttribute('data-theme');
  dark ? root.removeAttribute('data-theme') : root.setAttribute('data-theme', 'dark');
  localStorage.setItem('theme', dark ? 'light' : 'dark');
};

/* ---------- Toasts ---------- */
let toastTimer;
function toast(msg) {
  $$('.toasts .toast').forEach(t => t.remove());
  const container = document.querySelector('.toasts') || (() => {
    const c = document.createElement('div');
    c.className = 'toasts';
    document.body.appendChild(c);
    return c;
  })();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  container.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

/* ---------- City dropdowns ---------- */
const origin = $('#originCity'), dest = $('#destCity'), refreshBtn = $('#themeToggle');
const customDest = $('#customDestCity');
let cities = [];

const destValue = () => customDest.value.trim() || dest.value;

function paint() {
  origin.innerHTML = '<option value="">Select origin city</option>';
  dest.innerHTML   = '<option value="">Select destination city</option>';
  cities.forEach(c => {
    [[origin, 'Select origin city'], [dest, 'Select destination city']].forEach(([sel]) => {
      const o = document.createElement('option');
      o.value = c.name; o.textContent = c.name;
      sel.appendChild(o);
    });
  });
  toast(`Loaded ${cities.length} cities`);
}

async function loadCities(force = false) {
  try {
    cities = await S.getCityList({ forceRefresh: force });
    paint();
  } catch (e) {
    cities = S.FALLBACK_CITIES;
    paint();
    toast('Could not load cities — using built-in list');
  }
}
loadCities();

/* ---------- Chips & pills ---------- */
let amenities = new Set();
let transport = 'train';

$('#amenities').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  const amenity = c.dataset.amenity;
  const willBeOn = c.getAttribute('aria-pressed') !== 'true';
  if (willBeOn && (amenity === 'budget' || amenity === 'luxury')) {
    const other = amenity === 'budget' ? 'luxury' : 'budget';
    const otherEl = document.querySelector(`.chip[data-amenity="${other}"]`);
    if (otherEl && otherEl.getAttribute('aria-pressed') === 'true') {
      otherEl.setAttribute('aria-pressed', 'false');
      amenities.delete(other);
    }
  }
  c.setAttribute('aria-pressed', String(willBeOn));
  willBeOn ? amenities.add(amenity) : amenities.delete(amenity);
  const customField = document.getElementById('customAmenityField');
  if (customField) {
    const show = amenities.has('other');
    customField.classList.toggle('hidden', !show);
    if (!show) document.getElementById('customAmenity').value = '';
  }
});

$('#transport').addEventListener('click', e => {
  const p = e.target.closest('.pill'); if (!p) return;
  $$('#transport .pill').forEach(x => x.setAttribute('aria-pressed', 'false'));
  p.setAttribute('aria-pressed', 'true');
  transport = p.dataset.transport;
});

/* ---------- Validation ---------- */
function validate() {
  let ok = true;
  const fail = (id, msg) => { $('#' + id).textContent = msg; ok = false; };
  const clear = id => { $('#' + id).textContent = ''; };

  ['errOrigin','errDest','errMembers','errDateFrom','errDateTo'].forEach(clear);
  const o = origin.value, d = destValue(), m = parseInt($('#members').value, 10);
  const tripFrom = $('#tripFrom').value, tripTo = $('#tripTo').value;

  if (!o) fail('errOrigin', 'Pick a starting city');
  if (!d) fail('errDest', 'Pick a destination or type your own');
  if (!(m >= 1 && m <= 50)) fail('errMembers', 'Enter 1–50 travelers');
  if (!tripFrom) fail('errDateFrom', 'Pick start date');
  if (!tripTo) fail('errDateTo', 'Pick end date');
  if (tripFrom && tripTo && tripTo < tripFrom) fail('errDateTo', 'End date must be after start');
  return ok;
}

/* ---------- Options step ---------- */
let options = [];
let stayChoice = null;
let cityDetail = null;

const distBadge = d => d ? `<span class="dist">${esc(d)}</span>` : '';

function placeRow(p, i) {
  const level = p.level && p.level !== 'live'
    ? `<span class="row-level">${esc(p.level)}</span>` : '';
  return `
    <div class="row">
      <label>
        <input type="checkbox" name="option" data-idx="${i}" checked>
        <span class="row-name">${esc(p.name)}</span>
      </label>
      ${level}${distBadge(p.distanceText)}
      <a class="map-link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">↗ Map</a>
    </div>`;
}

const SKEL = `<div class="card"><div class="skeleton" style="width:38%"></div>
  ${'<div class="skeleton"></div>'.repeat(5)}</div>`;

async function showOptions() {
  if (!validate()) return;
  const d = destValue();
  const isOut = $('#tripType').value === 'outstation';
  const radiusKm = isOut ? 50 : 25;

  const tripFrom = $('#tripFrom').value;
  const tripTo = $('#tripTo').value;
  let numDays = 1;
  let numNights = 0;
  if (tripFrom && tripTo) {
    const start = new Date(tripFrom);
    const end = new Date(tripTo);
    const diffTime = end - start;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    numDays = Math.max(1, diffDays + 1);
    numNights = Math.max(0, numDays - 1);
  }
  const isNight = numNights > 0;

  document.getElementById('formSection').classList.add('hidden');
  document.getElementById('optionsSection')?.classList.remove('hidden') ||
    document.querySelector('main').insertAdjacentHTML('beforeend',
      '<section id="optionsSection" class="hidden card"></section>');

  const optionsSection = document.getElementById('optionsSection');
  if (!optionsSection.innerHTML) {
    optionsSection.innerHTML = `
      <div class="strip" id="tripStrip"></div>
      <div class="card" style="margin-top: 20px;">
        <h2 class="panel-title">Your trip options</h2>
        <p class="panel-sub" id="optionsSubtitle">Loading...</p>
        <div id="optionsContainer"></div>
      </div>
      <button class="btn btn-primary btn-block" id="finalizeBtn">Build itinerary →</button>
    `;
  }

  $('#optionsSubtitle').textContent = 'Loading places near ' + d + '…';
  $('#optionsContainer').innerHTML = SKEL;
  $('#finalizeBtn').disabled = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  cityDetail = await S.getCityDetails(d);
  const data = await S.getTripOptions(d, { radiusKm });

  const groups = [
    { key: 'resort',       title: '🏖 Resorts & stays' },
    { key: 'entertainment',title: '🎡 Entertainment areas' },
    { key: 'attraction',   title: '🏛 Attractions' },
    { key: 'food',         title: '🍽 Food & cafés' }
  ].map(g => ({ ...g, rows: data.groups[g.key] || [] }));

  options = groups.flatMap(g => g.rows);
  stayChoice = null;

  const oc = S.CITY_DATA[norm(origin.value)]?.center;
  const dc = data.center;
  const kms = (oc && dc && typeof oc.lat === 'number' && typeof dc.lat === 'number')
    ? S.fmtDist(S.haversine(oc.lat, oc.lon, dc.lat, dc.lon))
    : null;
  $('#tripStrip').innerHTML = `
    <span class="route">${esc(origin.value)}<em>→</em>${esc(d)}</span>
    <span class="meta">${esc($('#tripType').value)}${kms && !isNaN(kms) ? ' · ' + esc(kms) + ' apart' : ''} · ${
      parseInt($('#members').value, 10)} traveler${$('#members').value === '1' ? '' : 's'}</span>
    <span class="tag ${data.source === 'live' ? 'live' : ''}">${data.source === 'live' ? '● Live data' : 'Curated data'}</span>`;

  $('#optionsSubtitle').textContent = data.source === 'live'
    ? `Live places within ${radiusKm} km of ${d}, nearest first.`
    : `Best-known places around ${d}, sorted by distance from the centre.`;

  let html = '';
  html += `<div class="card"><h3 class="panel-title">How will you travel?</h3>
    <p class="panel-sub">Select everything you're open to.</p><div class="rows">`;
  ['train','bus','flight','cab'].forEach(t => {
    html += `<div class="row"><label>
      <input type="checkbox" name="tmode" value="${t}" ${t === transport ? 'checked' : ''}>
      <span class="row-name">${t[0].toUpperCase() + t.slice(1)}</span></label></div>`;
  });
  html += `</div></div>`;

  groups.forEach(g => {
    if (!g.rows.length) return;
    const hasDist = g.key !== 'food';
    html += `<div class="card">
      <h3 class="panel-title">${g.title} <span class="row-level" style="margin-left:auto">${g.rows.length}</span></h3>
      ${hasDist ? `<p class="panel-sub">Nearest to ${esc(d)} centre first</p>` : ''}
      <div style="max-height: 300px; overflow-y: auto; margin: 0 -4px; padding: 0 4px;">
        <div class="rows">`;
    g.rows.forEach(p => {
      const idx = options.indexOf(p);
      html += placeRow(p, idx);
    });
    html += `</div></div></div>`;
  });

  if (isNight) {
    const levels = [['budget','Budget'],['premium','🏨 Premium'],['luxury','✨ Luxury']];
    html += `<div class="card">
      <h3 class="panel-title">Where will you stay?</h3>
      <p class="panel-sub">Pick a tier — we'll factor it into the budget.</p>
      <div class="rows">`;
    levels.forEach(([lv, label], i) => {
      html += `<div class="row"><label>
        <input type="radio" name="stayLevel" value="${lv}" ${lv === 'premium' ? 'checked' : ''}>
        <span class="row-name">${label}</span></label></div>`;
    });
    html += `</div></div>`;
    html += `<div class="row" style="margin-top:8px"><label style="flex:1">
      <input type="radio" name="stayLevel" value="custom" id="customStayRadio">
      <span class="row-name">✏️ Custom</span></label></div>`;
  }

  if (!groups.some(g => g.rows.length)) {
    html = `<div class="card"><p style="margin:0;color:var(--muted);font-size:.875rem">
      No curated data for ${esc(d)} yet. Try one of the built-in cities.</p></div>`;
  }

  $('#optionsContainer').innerHTML = html;
  $('#finalizeBtn').disabled = false;
}

/* ---------- Itinerary step ---------- */
const STOP_TIMES = ['Morning', 'Midday', 'Afternoon', 'Evening', 'Night'];

function finalize() {
  const picked = $$('input[name="option"]:checked')
    .map(i => options[parseInt(i.dataset.idx, 10)])
    .filter(Boolean);
  const modes = $$('input[name="tmode"]:checked').map(i => i.value);
  let stayLv = $('input[name="stayLevel"]:checked')?.value;
  const customStay = stayLv === 'custom' ? $('#customStay').value?.trim() : null;

  const o = origin.value, d = destValue();
  const isOut  = $('#tripType').value === 'outstation';
  const members= parseInt($('#members').value, 10) || 2;
  const purpose= $('#purpose').value;

  const tripFrom = $('#tripFrom').value;
  const tripTo = $('#tripTo').value;
  let numDays = 1;
  let numNights = 0;
  if (tripFrom && tripTo) {
    const start = new Date(tripFrom);
    const end = new Date(tripTo);
    const diffTime = end - start;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    numDays = Math.max(1, diffDays + 1);
    numNights = Math.max(0, numDays - 1);
  }
  const isNight = numNights > 0;

  const tripDt = tripFrom || new Date().toISOString().split('T')[0];
  const date = tripDt;
  const mainMode = modes[0] || transport;

  const sights = picked.filter(p => p.type === 'Attraction' || p.type === 'Entertainment');
  const food = picked.filter(p => p.type === 'Food');
  const perDay = 4;
  const days = [];
  for (let i = 0, n = 0; i < numDays; i++) {
    const stops = [];
    const slice = sights.slice(n, n + perDay);
    n += perDay;
    slice.forEach((p, j) => stops.push({
      when: STOP_TIMES[j] || 'Evening',
      name: p.name,
      sub: [p.type, p.distanceText && `${p.distanceText} away`].filter(Boolean).join(' · '),
      link: p.link
    }));
    if ((!isNight || i === 0) && food.length) {
      const f = food[i] || food[0];
      stops.push({ when: 'Evening', name: f.name, sub: 'Food & dining', link: f.link });
    }
    if (stops.length) {
      days.push({
        title: `Day ${i + 1}`,
        sub: i === 0 ? 'Arrival & exploration' : (i === numDays - 1 ? 'Sightseeing & departure' : 'Sightseeing'),
        stops,
        stay: (isNight && i < numNights) ? stayLv : null
      });
    } else {
      days.push({
        title: `Day ${i + 1}`,
        sub: 'Free-form day',
        stops: [{ when: 'Morning', name: 'Explore the city centre', sub: 'No places selected' }],
        stay: isNight && (i < numNights) ? stayLv : null
      });
    }
  }

  const distKm = (() => {
    const a = S.CITY_DATA[norm(o)]?.center, b = S.CITY_DATA[norm(d)]?.center;
    return (a && b) ? S.haversine(a.lat, a.lon, b.lat, b.lon) : (isOut ? 500 : 30);
  })();

  const perPerson = {
    Travel: Math.round(distKm * 1.9) + 120,
    Stay:    isNight ? (stayLv === 'custom' ? 1500 : ({ budget: 1200, premium: 2800, luxury: 6000 }[stayLv] || 2800)) * numNights : 0,
    Food:    600 * numDays,
    Activities: 350 * numDays
  };

  if (amenities.has('ac')) perPerson.Travel += 150;
  if (amenities.has('wifi')) perPerson.Stay += 200;
  if (amenities.has('parking')) perPerson.Travel += 120;
  if (amenities.has('luxury')) { perPerson.Stay = Math.max(perPerson.Stay, 6000); perPerson.Food += 900; }
  if (amenities.has('budget')) { perPerson.Stay = Math.min(perPerson.Stay || 1200, 1200); }

  const tripTotal = Object.values(perPerson).reduce((a, b) => a + b, 0);

  const slug = s => norm(s);
  const links = [];

  if (modes.includes('train'))
    links.push(['primary', '🚆 Book Train · IRCTC',
      `https://www.irctc.co.in/nget/train-search?fromStation=${encodeURIComponent(o.toUpperCase())}&toStation=${encodeURIComponent(d.toUpperCase())}&journeyDate=${date}`]);
  if (modes.includes('flight'))
    links.push(['primary', '✈️ Book Flight · MMT',
      `https://www.makemytrip.com/flight/search?fromCity=${slug(o)}&toCity=${slug(d)}&departureDate=${date}`]);
  if (modes.includes('bus'))
    links.push(['primary', '🚌 Book Bus · RedBus',
      `https://www.redbus.in/bus-tickets/${slug(o)}-to-${slug(d)}?date=${date}`]);
  if (modes.includes('cab'))
    links.push(['', '🚕 Book Cab · Uber',
      `https://m.uber.com/ul/?action=setPickup&pickup=${encodeURIComponent(o)}`]);
  if (isNight)
    links.push(['primary', '🏨 Book Hotel · MMT',
      `https://www.makemytrip.com/hotels/hotel-listing?city=${slug(d)}&checkin=${date}&checkout=${date}`]);
  if (!links.length)
    links.push(['', '🗺 Open in Maps',
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d + ' tourism')}`]);

  const stopHTML = s => `
    <div class="stop">
      <div class="time">${esc(s.when)}</div>
      <div class="rail"><div class="dot"></div><div class="line"></div></div>
      <div class="body">
        <div class="name">${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">${esc(s.name)} ↗</a>` : esc(s.name)}</div>
        ${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ''}
      </div>
    </div>`;

  const stayDisplay = { budget:'💵 Budget', premium:'🏨 Premium', luxury:'✨ Luxury', custom: customStay || 'Custom Stay' };
  const customAmenityText = amenities.has('other') ? ($('#customAmenity').value || '').trim() : '';

  const resultsHtml = `
    <div class="strip">
      <span class="route">${esc(o)}<em>→</em>${esc(d)}</span>
      <span class="meta">${esc(distKm?.toFixed(0) || 'N/A')} km · ${members} traveler${members === 1 ? '' : 's'} · ${esc(purpose)} · ${esc(date)}</span>
      <span class="tag">${esc(mainMode)}</span>
    </div>

    <div class="card">
      <h2 class="panel-title">Your itinerary</h2>
      <p class="panel-sub">${days.length} day${days.length === 1 ? '' : 's'} · ${picked.length} place${picked.length === 1 ? '' : 's'} selected${customAmenityText ? ' · ' + esc(customAmenityText) : ''}</p>
      ${days.map(day => `
        <div class="day-head">${esc(day.title)} · ${esc(day.sub)}</div>
        <div class="timeline">
          ${day.stops.map(stopHTML).join('')}
          ${day.stay ? `<div class="stop">
            <div class="time">Night</div>
            <div class="rail"><div class="dot"></div></div>
            <div class="body"><div class="name">Stay · ${esc(stayDisplay[day.stay] || day.stay)}</div>
            <div class="sub">${esc(customStay || cityDetail?.stays?.[day.stay]?.[0]?.name || d + ' city hotel')}</div></div>
          </div>` : ''}
        </div>`).join('')}
    </div>

    <div class="card">
      <h3 class="panel-title">Cost estimate</h3>
      <p class="panel-sub">Per person · for all ${members} travelers: ₹${(tripTotal * members).toLocaleString('en-IN')}</p>
      ${Object.entries(perPerson).filter(([, v]) => v > 0).map(([k, v]) =>
        `<div class="kv"><span>${esc(k)}</span><span>₹${v.toLocaleString('en-IN')}</span></div>`).join('')}
      <div class="kv total"><span>Total per person</span><span>₹${tripTotal.toLocaleString('en-IN')}</span></div>
    </div>

    <div class="card">
      <h3 class="panel-title">Book &amp; navigate</h3>
      <p class="panel-sub">Opens ${esc(date)} on the provider's site.</p>
      <div class="links">
        ${links.map(([cls, label, href]) =>
          `<a class="link-btn ${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`).join('')}
      </div>
    </div>

    <button class="btn btn-ghost btn-block" id="newTrip">🔄 Plan another trip</button>`;

  // Replace content
  document.querySelector('main').innerHTML = resultsHtml;
  document.getElementById('newTrip')?.addEventListener('click', reset);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Navigation ---------- */
function reset() {
  document.getElementById('optionsSection')?.classList.add('hidden');
  // Re-add form section
  document.querySelector('main').innerHTML = `
    <section id="formSection">
      <h2>Plan your trip</h2>
      <p>Tell us where you're headed and we'll build the itinerary.</p>

      <form id="tripForm" novalidate>
        <div class="grid">
          <div class="field">
            <label for="originCity">From</label>
            <select id="originCity" required></select>
            <span class="err" id="errOrigin"></span>
          </div>
          <div class="field">
            <label for="destCity">To</label>
            <select id="destCity"></select>
            <span class="err" id="errDest"></span>
          </div>
          <div class="field">
            <label for="customDestCity">Or a place of your choice</label>
            <input type="text" id="customDestCity" placeholder="e.g. Coorg, Hampi">
          </div>
          <div class="field">
            <label for="tripFrom">From date</label>
            <input type="date" id="tripFrom" required>
            <span class="err" id="errDateFrom"></span>
          </div>
          <div class="field">
            <label for="tripTo">To date</label>
            <input type="date" id="tripTo" required>
            <span class="err" id="errDateTo"></span>
          </div>
          <div class="field">
            <label for="members">Travelers</label>
            <input type="number" id="members" min="1" max="50" value="2" required>
            <span class="err" id="errMembers"></span>
          </div>
          <div class="field">
            <label for="purpose">Purpose</label>
            <select id="purpose">
              <option value="leisure">Leisure</option>
              <option value="family">Family</option>
              <option value="business">Business</option>
              <option value="pilgrimage">Pilgrimage</option>
              <option value="romantic">Romantic</option>
            </select>
          </div>
          <div class="field">
            <label for="tripType">Trip type</label>
            <select id="tripType">
              <option value="local">Local / Day trip</option>
              <option value="outstation">Outstation</option>
            </select>
          </div>
          <div class="field">
            <label for="customStay">Custom Stay</label>
            <input type="text" id="customStay" placeholder="Enter custom stay option">
            <span class="err" id="errCustomStay"></span>
          </div>
        </div>

        <h3>Preferences</h3>
        <div class="chips" id="amenities">
          <button type="button" class="chip" data-amenity="ac" aria-pressed="false">AC</button>
          <button type="button" class="chip" data-amenity="wifi" aria-pressed="false">WiFi</button>
          <button type="button" class="chip" data-amenity="parking" aria-pressed="false">Parking</button>
          <button type="button" class="chip" data-amenity="budget" aria-pressed="false">Budget</button>
          <button type="button" class="chip" data-amenity="luxury" aria-pressed="false">Luxury</button>
          <button type="button" class="chip" data-amenity="other" aria-pressed="false">Other</button>
        </div>
        <div class="field hidden" id="customAmenityField">
          <label for="customAmenity">Your preference</label>
          <input type="text" id="customAmenity" placeholder="e.g. Pet-friendly, Gym">
        </div>

        <h3>Transport</h3>
        <div class="chips" id="transport">
          <button type="button" class="pill" data-transport="train" aria-pressed="true">Train</button>
          <button type="button" class="pill" data-transport="bus" aria-pressed="false">Bus</button>
          <button type="button" class="pill" data-transport="flight" aria-pressed="false">Flight</button>
          <button type="button" class="pill" data-transport="cab" aria-pressed="false">Cab</button>
        </div>

        <button class="btn btn-primary btn-block" type="submit">Find places &amp; resorts</button>
      </form>
    </section>`;
  $('#customDestCity').value = '';
  // Reattach event listeners
  $('#tripForm').addEventListener('submit', e => { e.preventDefault(); showOptions(); });
  document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class="toasts"></div>');
  paint(); // Reload cities
  resetChips(); // Reset amenities
}

function resetChips() {
  amenities = new Set();
  $$('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
  document.getElementById('customAmenityField')?.classList.add('hidden');
}

$('#tripForm').addEventListener('submit', e => { e.preventDefault(); showOptions(); });
document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class="toasts"></div>');
resetChips();