// ─── SCENARIO CONTROL ───────────────────────────────────────────────────────
// The facilitator owns progression: Next/Back write scenarioIndex to Firebase
// and every student's listener advances them (or shows the waiting/complete
// screen). This view also listens rather than trusting its own writes, so two
// facilitator windows stay in sync.
let submissionsListener = null; // { ref } — so the old listener can be detached
let latestSnapshot = null;

// ─── ICONS ──────────────────────────────────────────────────────────────────
// Inline (not external files) so fill="currentColor" picks up whatever color
// the containing element already has — same trick as the toolbar icon
// buttons. Reused anywhere a small icon substitutes for a word.
const PERSON_ICON = '<svg viewBox="0 -960 960 960" width="18" height="18" fill="currentColor" style="vertical-align:-3px"><path d="M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z"/></svg>';
// Larger variant for the overlay's ready count — that line is meant to read
// at a glance from across the room, so it gets its own bigger size rather
// than sharing PERSON_ICON's small toolbar-badge sizing.
const PERSON_ICON_LG = '<svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor" style="vertical-align:-4px"><path d="M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z"/></svg>';
const COPY_ICON = '<svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/></svg>';
const CHECK_ICON = '<svg viewBox="0 -960 960 960" width="18" height="18" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>';
const START_ICON = '<svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor"><path d="M80-240v-480h80v480H80Zm560 0-57-56 144-144H240v-80h487L584-664l56-56 240 240-240 240Z"/></svg>';

// Feed the single floating X/Y counter — submissions come from renderHeatmap,
// ready count comes from the presence listener (see updateReadyCountDisplays
// further down). Tracked separately since they update from two independent
// Firebase listeners; whichever fires just recomputes the combined readout.
let currentSubmissionsCount = 0;
let currentReadyCount = 0;

function updateSubmissionCounter() {
  const el = document.getElementById('submission-counter');
  if (el) el.innerHTML = currentSubmissionsCount + '/' + currentReadyCount + ' ' + PERSON_ICON;
}

function setScenarioOnServer(idx) {
  idx = Math.max(0, Math.min(SCENARIOS.length, idx)); // length === "complete"
  scenarioStateRef().set(idx).catch(e => {
    alert('Could not update the scenario — check your connection.');
    console.error(e);
  });
}

function nextScenario() { setScenarioOnServer(scenarioIndex + 1); }
function prevScenario() { setScenarioOnServer(scenarioIndex - 1); }

function onScenarioChanged(idx) {
  scenarioIndex = typeof idx === 'number' ? idx : 0;

  // Even in the "complete" state, keep showing the LAST scenario's heatmap —
  // that's what the facilitator is debriefing.
  applyScenarioAssets(currentScenario());
  if (sessionIsComplete()) {
    document.getElementById('scenario-title').textContent = 'Session complete';
  }

  const nextBtn = document.getElementById('next-btn');
  const prevBtn = document.getElementById('prev-btn');
  if (nextBtn) {
    nextBtn.disabled = sessionIsComplete();
    const label = scenarioIndex === SCENARIOS.length - 1 ? 'End session' : 'Next scenario';
    nextBtn.title = label;
    nextBtn.setAttribute('aria-label', label);
  }
  if (prevBtn) prevBtn.disabled = scenarioIndex === 0;

  attachSubmissionsListener();
  fitFloorplan();
}

// ─── LIVE DATA ──────────────────────────────────────────────────────────────
// Listen to THIS session + THIS scenario only. Students write to
// submissions/{sessionId}/{scenarioId}/{clientId}, so every child here is one
// student's submission for the active scenario. Re-attached on every scenario
// change; the old listener is detached first so stale data can't render.
function attachSubmissionsListener() {
  if (submissionsListener) {
    submissionsListener.ref.off();
    submissionsListener = null;
  }
  latestSnapshot = null;
  renderHeatmap(null); // clear immediately; the listener repaints when data arrives

  const ref = submissionsRef(currentScenario());
  ref.on('value', (snapshot) => {
    latestSnapshot = snapshot;
    renderHeatmap(snapshot);
  }, (err) => {
    console.error('Firebase listener error:', err);
  });
  submissionsListener = { ref };
}

// Manual refresh just re-renders from the last snapshot (the listener keeps it
// current; the button exists as a belt-and-braces control for facilitators).
function refreshHeatmap() {
  if (latestSnapshot) renderHeatmap(latestSnapshot);
}

// ─── HEATMAP ────────────────────────────────────────────────────────────────
function renderHeatmap(snapshot) {
  document.querySelectorAll('.heatmap-dot').forEach(el => el.remove());

  const allDevices = [];
  let numSubmissions = 0;

  if (snapshot && snapshot.exists()) {
    snapshot.forEach(child => {
      const data = child.val();
      if (!data || !Array.isArray(data.devices)) return;
      numSubmissions++;
      data.devices.forEach(d => {
        allDevices.push({ x: d.x, y: d.y });
      });
    });
  }

  currentSubmissionsCount = numSubmissions;
  updateSubmissionCounter();

  if (allDevices.length === 0) {
    return;
  }

  // Build density grid. Coordinates are in logical plan units for the ACTIVE
  // scenario (0..PLAN_WIDTH × 0..PLAN_HEIGHT).
  const CELL = 40;
  const density = {};
  allDevices.forEach(d => {
    // floor + center-of-cell: a device at (95, 95) lands in cell (2,2) whose
    // center is (100, 100) — the dot sits near the cluster, not on a grid line.
    const gx = Math.floor(d.x / CELL);
    const gy = Math.floor(d.y / CELL);
    const key = gx + '_' + gy;
    density[key] = (density[key] || 0) + 1;
  });

  const maxDensity = Math.max(...Object.values(density));

  // Render dots. They are children of #floorplan-container, which carries the
  // pan/zoom transform — so position AND size are in raw logical units and the
  // transform scales them along with the floorplan. No screen-pixel conversion
  // here (that was the old double-scaling trap).
  const container = document.getElementById('floorplan-container');

  Object.entries(density).forEach(([key, count]) => {
    const [gx, gy] = key.split('_').map(Number);
    const cx = (gx + 0.5) * CELL;
    const cy = (gy + 0.5) * CELL;
    const px = svgToContainerPx(cx, cy);

    const intensity = count / maxDensity;
    const radius = 28 + intensity * 36;      // logical units
    const alpha = 0.15 + intensity * 0.55;

    const r = Math.round(79 + intensity * 176);
    const g = Math.round(142 - intensity * 80);
    const b = Math.round(247 - intensity * 150);

    const dot = document.createElement('div');
    dot.className = 'heatmap-dot';
    dot.style.left = (px.left - radius) + 'px';
    dot.style.top = (px.top - radius) + 'px';
    dot.style.width = (radius * 2) + 'px';
    dot.style.height = (radius * 2) + 'px';
    dot.style.background = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    container.appendChild(dot);
  });
}

// ─── CLEAR ──────────────────────────────────────────────────────────────────
// Scoped to THIS session — clearing one class's data must not wipe another's.
// Removes ALL scenarios' submissions for the session and rewinds to scenario 1.
// Ends the CURRENTLY ACTIVE session: deletes all its data from Firebase and
// removes it from this browser's picker list, then returns to the picker —
// there's nothing left here to view. This replaced an earlier "clear data but
// stay in place" behavior; that in-place reset no longer exists, so this
// button is now a one-way exit from the session, matching deleteSession()'s
// removal logic (they share removeSessionData below).
async function endSession() {
  if (!confirm('End session ' + sessionId + ' and delete it? This removes it from your session list and cannot be undone.')) return;
  try {
    await removeSessionData(sessionId);
  } catch (e) {
    alert('Could not end the session: ' + (e.message || e) +
      '\n\nIf this says "permission_denied", your Firebase Realtime Database rules need to allow writes to submissions/ and sessions/.');
    console.error(e);
    return;
  }
  saveSessionList(loadSessionList().filter(s => s.id !== sessionId));
  backToSessions();
}

// ─── VIEWPORT (zoom / pan / fit) ────────────────────────────────────────────
// Same viewport model as the student view: one CSS transform on the container,
// transform-origin 0 0, pan compensates to anchor the focal point. Duplicated
// here rather than moved into shared.js to avoid touching the working student
// drag code — if a third view ever appears, extract this into viewport.js.
let zoomLevel = 1;
let panX = 0;
let panY = 0;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;

function applyZoom() {
  const container = document.getElementById('floorplan-container');
  container.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

function clientToCanvas(clientX, clientY) {
  const canvas = document.getElementById('canvas-area');
  const r = canvas.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

function zoomAt(focalX, focalY, newZoom) {
  newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
  const ratio = newZoom / zoomLevel;
  panX = focalX - (focalX - panX) * ratio;
  panY = focalY - (focalY - panY) * ratio;
  zoomLevel = newZoom;
  applyZoom();
}

// Wheel zoom (desktop / projector laptop).
function onWheelZoom(e) {
  e.preventDefault();
  const { x, y } = clientToCanvas(e.clientX, e.clientY);
  const delta = -e.deltaY * 0.0015;
  zoomAt(x, y, zoomLevel * (1 + delta));
}

// Pinch zoom (touch).
const activePointers = new Map();
let pinchStartDist = null;
let pinchStartZoom = 1;
let pinchFocalX = 0;
let pinchFocalY = 0;

function pointerDist() {
  const pts = [...activePointers.values()];
  if (pts.length < 2) return null;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function onZoomPointerDown(e) {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    pan = null; // pinch takes over from any in-progress pan
    pinchStartDist = pointerDist();
    pinchStartZoom = zoomLevel;
    const pts = [...activePointers.values()];
    const focal = clientToCanvas((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    pinchFocalX = focal.x;
    pinchFocalY = focal.y;
  }
}

function onZoomPointerMove(e) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2 && pinchStartDist) {
    e.preventDefault();
    zoomAt(pinchFocalX, pinchFocalY, pinchStartZoom * (pointerDist() / pinchStartDist));
  }
}

function onZoomPointerUp(e) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchStartDist = null;
}

// Pan (the whole view is read-only, so any single-pointer drag pans).
let pan = null;

function startPan(e) {
  if (activePointers.size >= 2) return;
  pan = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY };
}

function onPanMove(e) {
  if (!pan) return;
  if (activePointers.size >= 2) { pan = null; return; }
  e.preventDefault();
  panX = pan.startPanX + (e.clientX - pan.startX);
  panY = pan.startPanY + (e.clientY - pan.startY);
  applyZoom();
}

function onPanUp() { pan = null; }

function fitFloorplan() {
  const canvas = document.getElementById('canvas-area');
  if (!canvas) return;

  const cRect = canvas.getBoundingClientRect();
  const margin = 16;

  const cs = getComputedStyle(canvas);
  const padTop = parseFloat(cs.paddingTop);
  const padBottom = parseFloat(cs.paddingBottom);
  const padLeft = parseFloat(cs.paddingLeft);
  const padRight = parseFloat(cs.paddingRight);

  const availW = cRect.width - padLeft - padRight - margin * 2;
  const availH = cRect.height - padTop - padBottom - margin * 2;

  const fitZoom = Math.min(availW / PLAN_WIDTH, availH / PLAN_HEIGHT);
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fitZoom));

  const scaledW = PLAN_WIDTH * zoomLevel;
  const contentW = cRect.width - padLeft - padRight;

  // Center within the content box; padding already offsets the origin.
  panX = (contentW - scaledW) / 2;
  panY = margin;

  applyZoom();
}

function initViewport() {
  const canvas = document.getElementById('canvas-area');
  const container = document.getElementById('floorplan-container');
  if (!canvas || !container) return;

  canvas.addEventListener('wheel', onWheelZoom, { passive: false });
  canvas.addEventListener('pointerdown', onZoomPointerDown);
  canvas.addEventListener('pointermove', onZoomPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onZoomPointerUp);
  canvas.addEventListener('pointercancel', onZoomPointerUp);

  container.addEventListener('pointerdown', startPan);
  window.addEventListener('pointermove', onPanMove, { passive: false });
  window.addEventListener('pointerup', onPanUp);
  window.addEventListener('pointercancel', onPanUp);
}

window.matchMedia('(orientation: landscape)').addEventListener('change', () => {
  requestAnimationFrame(fitFloorplan);
});

// ─── SESSION PICKER ─────────────────────────────────────────────────────────
// Past sessions live in this browser's localStorage (there is no server-side
// registry of "the instructor's sessions" — listing the Firebase root would
// surface every session ever created by anyone). Opening a session via
// ?session=CODE also records it here, so a bookmarked link still shows up
// in the picker afterward.
const SESSIONS_KEY = 'va_instructor_sessions';

function loadSessionList() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; }
  catch (e) { return []; }
}

function saveSessionList(list) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
}

function rememberSession(sid) {
  const list = loadSessionList();
  if (!list.some(s => s.id === sid)) {
    list.push({ id: sid, createdAt: Date.now() });
    saveSessionList(list);
  }
}

function initInstructorGate() {
  const fromUrl = sessionFromUrl();
  if (fromUrl) {
    startInstructorSession(fromUrl);
    return;
  }
  renderSessionList();
  document.getElementById('instructor-gate').classList.add('active');
}

function renderSessionList() {
  const listEl = document.getElementById('past-sessions');
  listEl.innerHTML = '';
  const sessions = loadSessionList();

  if (sessions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gate-empty';
    empty.textContent = 'No past sessions on this device yet.';
    listEl.appendChild(empty);
    return;
  }

  // Newest first.
  sessions.slice().sort((a, b) => b.createdAt - a.createdAt).forEach(s => {
    const row = document.createElement('div');
    row.className = 'session-item';

    const open = document.createElement('button');
    open.className = 'session-open';
    const date = new Date(s.createdAt).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    open.innerHTML =
      '<span class="session-item-code">' + s.id + '</span>' +
      '<span class="session-item-date">' + date + '</span>';
    open.addEventListener('click', () => startInstructorSession(s.id));

    const del = document.createElement('button');
    del.className = 'session-delete';
    del.title = 'Delete session and all its data';
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });

    row.appendChild(open);
    row.appendChild(del);
    listEl.appendChild(row);
  });
}

// Delete a session: remove its submissions AND scenario-progress node from
// Firebase, then drop it from this browser's picker list. Firebase first —
// if the network write fails, the entry stays in the list rather than
// orphaning data that looks deleted. Join-presence cleanup is best-effort and
// separate: it's non-essential, and if it's the piece failing (e.g. security
// rules not yet covering the newer 'joined/' path) it shouldn't block
// deleting the data that actually matters.
// Shared Firebase cleanup for a session: submissions and scenario state are
// essential (their failure aborts the delete); join-presence is best-effort
// cleanup that shouldn't block the rest.
async function removeSessionData(sid) {
  await firebase.database().ref('submissions/' + sid).remove();
  await firebase.database().ref('sessions/' + sid).remove();
  try {
    await joinedRef(sid).remove();
  } catch (e) {
    console.warn('Session data was deleted, but could not clean up its join-presence node (non-critical):', e);
  }
}

async function deleteSession(sid) {
  if (!confirm('Delete session ' + sid + ' and ALL of its submissions? This cannot be undone.')) return;
  try {
    await removeSessionData(sid);
  } catch (e) {
    alert('Could not delete session data: ' + (e.message || e) +
      '\n\nIf this says "permission_denied", your Firebase Realtime Database rules need to allow writes to submissions/ and sessions/.');
    console.error(e);
    return;
  }
  saveSessionList(loadSessionList().filter(s => s.id !== sid));
  renderSessionList();
}

// Build the student join URL for this session. Strips the trailing
// "instructor" segment from the CURRENT page's own URL rather than
// resolving 'index.html' relatively — that would resolve to this page's own
// folder (instructor/index.html) now that this view lives one level down,
// not the student view at the site root. Handles the segment with or
// without a trailing slash or explicit index.html, since static hosts vary
// on whether they redirect to the slash form.
function studentJoinUrl(sid) {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/instructor\/?(index\.html)?$/, '');
  url.search = '';
  url.hash = '';
  url.searchParams.set('session', sid);
  return url.href;
}

// ─── CLIPBOARD ──────────────────────────────────────────────────────────────
// navigator.clipboard requires a secure context (HTTPS or localhost); the
// execCommand fallback covers plain-HTTP deployments (e.g. a school's local
// network IP, like 127.0.0.1:5500 in dev).
async function copyJoinLink(url, btnEl) {
  try {
    await navigator.clipboard.writeText(url);
    flashCopied(btnEl);
    return;
  } catch (e) { /* fall through to the legacy path below */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    flashCopied(btnEl);
  } catch (e) {
    alert('Could not copy automatically — the link is:\n' + url);
  }
}

function flashCopied(btnEl) {
  if (!btnEl) return;
  const original = btnEl.innerHTML;
  btnEl.innerHTML = CHECK_ICON;
  btnEl.disabled = true;
  setTimeout(() => {
    btnEl.innerHTML = original;
    btnEl.disabled = false;
  }, 1500);
}

// ─── READY COUNTER ──────────────────────────────────────────────────────────
// Live count of students who clicked Ready and are still connected — feeds
// two spots: the big-code overlay (pre-start, for building anticipation) and
// the toolbar's "Ready" stat (once the session is running). One listener
// serves both; whichever element exists on screen gets updated, and a
// missing element is just skipped. Stays attached for the whole time the
// facilitator has a session open, since students can join late or drop
// mid-session and the count needs to reflect that live, Menti-style.
let readyCountListener = null;

function attachReadyCountListener(sid) {
  detachReadyCountListener();
  const ref = joinedRef(sid);
  ref.on('value', (snap) => {
    const count = snap.exists() ? snap.numChildren() : 0;
    updateReadyCountDisplays(count);
  }, (err) => {
    // This callback firing at all confirms the count is stuck at 0 because
    // reads are being rejected, not because no one has joined. Most likely
    // cause: 'joined/' is newer than 'submissions/' and 'sessions/', and your
    // Firebase Realtime Database rules haven't been extended to cover it.
    console.error('Ready-count read failed for session ' + sid + ' — likely a Firebase rules gap on the "joined/" path:', err);
  });
  readyCountListener = { ref };
}

function detachReadyCountListener() {
  if (readyCountListener) {
    readyCountListener.ref.off();
    readyCountListener = null;
  }
}

function updateReadyCountDisplays(count) {
  const overlayEl = document.getElementById('join-count');
  if (overlayEl) overlayEl.innerHTML = count + ' ' + PERSON_ICON_LG;

  currentReadyCount = count;
  updateSubmissionCounter();
}

// New session: mint a code, show it large for the room, wait for Next.
function startNewSession() {
  const sid = newSessionCode();
  rememberSession(sid);

  document.getElementById('instructor-gate').classList.remove('active');

  document.getElementById('big-code').textContent = sid;
  const urlBtn = document.getElementById('big-code-url-btn');
  const url = studentJoinUrl(sid);
  urlBtn.innerHTML = COPY_ICON;
  urlBtn.title = 'Copy join link';
  urlBtn.setAttribute('aria-label', 'Copy join link');
  urlBtn.onclick = () => copyJoinLink(url, urlBtn);

  document.getElementById('join-count').innerHTML = '0 ' + PERSON_ICON_LG;
  attachReadyCountListener(sid);

  const screen = document.getElementById('new-session-screen');
  screen.dataset.sid = sid;
  screen.classList.add('active');
}

function proceedToHeatmap() {
  const screen = document.getElementById('new-session-screen');
  screen.classList.remove('active');
  startInstructorSession(screen.dataset.sid);
}

function startInstructorSession(sid) {
  setSession(sid);
  rememberSession(sid);
  putSessionInUrl(sid);
  document.getElementById('instructor-gate').classList.remove('active');

  showJoinHint();
  attachReadyCountListener(sid);

  // If no scenario index exists yet for this session, claim it as scenario 1
  // — this makes the facilitator's page the session's source of truth
  // without stomping an in-progress session on reload.
  scenarioStateRef().transaction(v => (typeof v === 'number' ? v : 0));

  // The sync listener fires immediately with the current index, which drives
  // the first applyScenarioAssets/fit/heatmap attach.
  initScenarioSync(onScenarioChanged);
}

// Back to the picker. A reload is the simplest way to detach the live
// Firebase listener(s) and reset all heatmap/scenario state cleanly.
function backToSessions() {
  const u = new URL(window.location.href);
  u.searchParams.delete('session');
  window.location.href = u.href;
}

// ─── JOIN HINT ──────────────────────────────────────────────────────────────
// Students must open the page with ?session=CODE, otherwise the student view
// shows the code-entry gate instead of joining this session directly.
function showJoinHint() {
  const btn = document.getElementById('join-hint-btn');
  if (!btn) return;
  const url = studentJoinUrl(sessionId);
  btn.textContent = url;
  btn.onclick = () => copyJoinLink(url, btn);
}

// ─── INIT ───────────────────────────────────────────────────────────────────
initViewport();
initInstructorGate();
