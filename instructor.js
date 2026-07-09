// ─── LIVE DATA ──────────────────────────────────────────────────────────────
// Listen to THIS session only. Students write to submissions/{sessionId}/{clientId},
// so every child here is one student's submission. A realtime listener replaces
// the old 8-second polling loop — the heatmap updates the moment anyone submits.
let latestSnapshot = null;

function initLiveListener() {
  const db = firebase.database();
  db.ref('submissions/' + sessionId).on('value', (snapshot) => {
    latestSnapshot = snapshot;
    renderHeatmap(snapshot);
  }, (err) => {
    console.error('Firebase listener error:', err);
  });
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
  let totalDevicesCount = 0;
  let numSubmissions = 0;

  if (snapshot && snapshot.exists()) {
    snapshot.forEach(child => {
      const data = child.val();
      if (!data || !Array.isArray(data.devices)) return;
      numSubmissions++;
      data.devices.forEach(d => {
        allDevices.push({ x: d.x, y: d.y });
        totalDevicesCount++;
      });
    });
  }

  document.getElementById('stat-submissions').textContent = numSubmissions;
  document.getElementById('stat-avg').textContent =
    numSubmissions > 0 ? Math.round(totalDevicesCount / numSubmissions) : 0;

  if (allDevices.length === 0) {
    document.getElementById('stat-hotspot').textContent = '—';
    document.getElementById('stat-missed').textContent = '—';
    return;
  }

  // Build density grid. Coordinates are in logical plan units (0..860 × 0..620).
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

  // Hot/cold rooms (centers in logical plan units).
  const roomCenters = {
    'Kitchen':      { x: 164, y: 148 },
    'Living Rm':    { x: 434, y: 148 },
    'Bed 2':        { x: 702, y: 148 },
    'Primary Bed':  { x: 164, y: 338 },
    'Bed 3':        { x: 702, y: 338 },
    'Hallway':      { x: 504, y: 338 },
    'Laundry':      { x: 124, y: 504 },
  };

  let hotRoom = '—', coldRoom = '—', hotScore = -1, coldScore = Infinity;
  Object.entries(roomCenters).forEach(([name, center]) => {
    let score = 0;
    allDevices.forEach(d => {
      const dist = Math.sqrt((d.x - center.x) ** 2 + (d.y - center.y) ** 2);
      if (dist < 100) score++;
    });
    if (score > hotScore) { hotScore = score; hotRoom = name; }
    if (score < coldScore) { coldScore = score; coldRoom = name; }
  });

  document.getElementById('stat-hotspot').textContent = hotRoom;
  document.getElementById('stat-missed').textContent = coldRoom;

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
async function clearAllData() {
  if (!confirm('Clear ALL submissions for session ' + sessionId + '? This cannot be undone.')) return;
  try {
    const db = firebase.database();
    await db.ref('submissions/' + sessionId).remove();
    // The live listener fires on the removal and re-renders the empty state.
  } catch (e) {
    alert('Error clearing data.');
    console.error(e);
  }
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

// ─── JOIN HINT ──────────────────────────────────────────────────────────────
// Students must open the page with ?session=CODE, otherwise shared.js mints
// them a private session and their submission never reaches this heatmap.
function showJoinHint() {
  const hint = document.getElementById('join-hint');
  if (!hint) return;
  const url = new URL('index.html', window.location.href);
  url.searchParams.set('session', sessionId);
  hint.textContent = 'Students join at: ' + url.href;
}

// ─── INIT ───────────────────────────────────────────────────────────────────
initViewport();
fitFloorplan();
showJoinHint();
initLiveListener();
