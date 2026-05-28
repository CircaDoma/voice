// ─── STATE ──────────────────────────────────────────────────────────────────
let myDevices = [];
let hasSubmitted = false;

// Active drag operation (null when not dragging).
let drag = null;
let ghostEl = null;

// ─── GHOST ELEMENT ───────────────────────────────────────────────────────────
// A floating clone that follows the pointer during a drag. We draw it ourselves
// (Pointer Events have no built-in drag image), which also means no hotspot offset.
function createGhost(clientX, clientY) {
  ghostEl = document.createElement('div');
  ghostEl.className = 'placed-device drag-ghost';
  ghostEl.innerHTML = '<img src="assets/device-icon.svg">';
  document.body.appendChild(ghostEl);
  moveGhost(clientX, clientY);
}
function moveGhost(clientX, clientY) {
  if (!ghostEl) return;
  ghostEl.style.left = (clientX + window.scrollX) + 'px';
  ghostEl.style.top = (clientY + window.scrollY) + 'px';
}
function destroyGhost() {
  if (ghostEl) { ghostEl.remove(); ghostEl = null; }
}

// ─── POINTER DRAG: START ──────────────────────────────────────────────────────
// Begin a drag from the source token (creates a new device) or from an
// already-placed device (moves it).
function startDragNew(e) {
  if (hasSubmitted) return;
  e.preventDefault();
  drag = { mode: 'new', id: null };
  createGhost(e.clientX, e.clientY);
  setDropOverlay(true);
}

function startDragExisting(e, id) {
  if (hasSubmitted) return;
  e.preventDefault();
  e.stopPropagation();
  drag = { mode: 'existing', id };
  createGhost(e.clientX, e.clientY);
  setDropOverlay(true);
  // Hide the original while dragging so it's clear what's moving.
  const el = document.getElementById(id);
  if (el) el.style.visibility = 'hidden';
}

// ─── POINTER DRAG: MOVE ───────────────────────────────────────────────────────
function onPointerMove(e) {
  if (!drag) return;
  e.preventDefault();
  moveGhost(e.clientX, e.clientY);
  setDropOverlay(isOverFloorplan(e.clientX, e.clientY));
}

// ─── POINTER DRAG: END ────────────────────────────────────────────────────────
function onPointerUp(e) {
  if (!drag) return;
  e.preventDefault();

  const over = isOverFloorplan(e.clientX, e.clientY);
  const { x, y } = clientToSvg(e.clientX, e.clientY);

  if (drag.mode === 'new') {
    if (over && !hasSubmitted) placeDevice(x, y);
  } else if (drag.mode === 'existing') {
    const el = document.getElementById(drag.id);
    if (over) {
      moveDevice(drag.id, x, y);
      if (el) el.style.visibility = 'visible';
    } else {
      // Dropped off the plan → remove it.
      removeDevice(drag.id);
    }
  }

  destroyGhost();
  setDropOverlay(false);
  drag = null;
  // Single source of truth for the submit bar — reflects the current count,
  // so it shows after a placement and hides when the last device is removed.
  updateSubmitBar();
}

// Global listeners: pointermove/up live on the window so the drag keeps working
// even if the pointer leaves the token or the floorplan mid-drag.
window.addEventListener('pointermove', onPointerMove, { passive: false });
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);

// Wire up the source token once the DOM is ready.
function initSourceToken() {
  const token = document.getElementById('va-token');
  if (token) token.addEventListener('pointerdown', startDragNew);
}

// ─── DEVICE MANAGEMENT ──────────────────────────────────────────────────────
function placeDevice(x, y) {
  const id = 'va_' + Date.now();
  myDevices.push({ id, x, y });
  renderDevice(id, x, y);
  saveMyDevices();
  updateSubmitBar();
}

function moveDevice(id, x, y) {
  const d = myDevices.find(d => d.id === id);
  if (d) {
    d.x = x; d.y = y;
    const el = document.getElementById(id);
    if (el) {
      const px = svgToContainerPx(x, y);
      el.style.left = px.left + 'px';
      el.style.top = px.top + 'px';
    }
    saveMyDevices();
  }
}

function removeDevice(id) {
  myDevices = myDevices.filter(d => d.id !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  saveMyDevices();
  updateSubmitBar();
}

function renderDevice(id, x, y) {
  const container = document.getElementById('floorplan-container');
  const px = svgToContainerPx(x, y);
  const el = document.createElement('div');
  el.className = 'placed-device';
  el.id = id;
  el.style.left = px.left + 'px';
  el.style.top = px.top + 'px';
  el.innerHTML = '<img src="assets/device-icon.svg"><button class="remove-btn" title="Remove">×</button>';

  // Start a move-drag when pressing the device body.
  el.addEventListener('pointerdown', (e) => startDragExisting(e, id));

  // Remove button: stop it from also starting a drag.
  const btn = el.querySelector('.remove-btn');
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeDevice(id);
  });

  container.appendChild(el);
}

function clearRenderedDevices() {
  document.querySelectorAll('.placed-device:not(.drag-ghost)').forEach(el => el.remove());
}

function clearMyDevices() {
  myDevices = [];
  hasSubmitted = false;
  clearRenderedDevices();
  document.getElementById('submitted-banner').style.display = 'none';
  document.getElementById('submit-btn').disabled = false;
  saveMyDevices();
  localStorage.removeItem('va_submitted_' + sessionId);
  updateSubmitBar();
}

function loadMyDevices() {
  try {
    const saved = localStorage.getItem('va_my_devices_' + sessionId);
    if (saved) {
      myDevices = JSON.parse(saved);
      myDevices.forEach(d => renderDevice(d.id, d.x, d.y));
    }
    const submitted = localStorage.getItem('va_submitted_' + sessionId);
    if (submitted === 'true') {
      hasSubmitted = true;
      document.getElementById('submitted-banner').style.display = 'block';
      document.getElementById('submit-btn').disabled = true;
    }
  } catch(e) {}
  updateSubmitBar();
}

function saveMyDevices() {
  localStorage.setItem('va_my_devices_' + sessionId, JSON.stringify(myDevices));
}

function updateSubmitBar() {
  document.querySelectorAll('.btn').forEach(btn => {
    btn.classList.toggle('show', myDevices.length > 0);
  });
}

// ─── SUBMISSION ─────────────────────────────────────────────────────────────
async function submitPlacement() {
  if (myDevices.length === 0) {
    alert('Place at least one voice assistant before submitting.');
    return;
  }
  const submission = {
    sessionId,
    devices: myDevices.map(d => ({ x: Math.round(d.x), y: Math.round(d.y) })),
    timestamp: Date.now()
  };
  try {
    const db = firebase.database();
    await db.ref('submissions/' + sessionId).set(submission);
    hasSubmitted = true;
    localStorage.setItem('va_submitted_' + sessionId, 'true');
    document.getElementById('submitted-banner').style.display = 'block';
    document.getElementById('submit-btn').disabled = true;
  } catch(e) {
    alert('Could not save — check your connection and try again.');
    console.error(e);
  }
}

// ─── ZOOM / PAN STATE ─────────────────────────────────────────────────────────
let zoomLevel = 1;
let panX = 0;
let panY = 0;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;

// Combine pan + scale into one transform. transform-origin stays 0 0 (set in CSS)
// so the coordinate helpers stay predictable; pan compensates to anchor the focal point.
function applyZoom() {
  const container = document.getElementById('floorplan-container');
  container.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

// Convert a client (viewport) point to canvas-relative pixels.
function clientToCanvas(clientX, clientY) {
  const canvas = document.getElementById('canvas-area');
  const r = canvas.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

// Zoom toward a focal point (canvas-relative px), keeping that point visually anchored.
function zoomAt(focalX, focalY, newZoom) {
  newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
  const ratio = newZoom / zoomLevel;
  panX = focalX - (focalX - panX) * ratio;
  panY = focalY - (focalY - panY) * ratio;
  zoomLevel = newZoom;
  applyZoom();
}

// ─── WHEEL ZOOM (desktop) ──────────────────────────────────────────────────────
function onWheelZoom(e) {
  e.preventDefault();
  const { x, y } = clientToCanvas(e.clientX, e.clientY);
  const delta = -e.deltaY * 0.0015;        // wheel up = zoom in
  zoomAt(x, y, zoomLevel * (1 + delta));
}

function initZoom() {
  const canvas = document.getElementById('canvas-area');
  if (!canvas) return;
  canvas.addEventListener('wheel', onWheelZoom, { passive: false });
}

initZoom();

// ─── PINCH ZOOM (touch) ───────────────────────────────────────────────────────
// Track active pointers by id so we can detect two-finger gestures.
const activePointers = new Map();
let pinchStartDist = null;
let pinchStartZoom = 1;

function pointerDist() {
  const pts = [...activePointers.values()];
  if (pts.length < 2) return null;
  const dx = pts[0].x - pts[1].x;
  const dy = pts[0].y - pts[1].y;
  return Math.hypot(dx, dy);
}

function onZoomPointerDown(e) {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    // A pinch is starting — abort any single-finger device drag so the
    // first finger doesn't accidentally move a device mid-pinch.
    if (drag) {
      const el = drag.id && document.getElementById(drag.id);
      if (el) el.style.visibility = 'visible';
      destroyGhost();
      setDropOverlay(false);
      drag = null;
    }
    pinchStartDist = pointerDist();
    pinchStartZoom = zoomLevel;
  }
}

function onZoomPointerMove(e) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2 && pinchStartDist) {
    e.preventDefault();
    const pts = [...activePointers.values()];
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const { x, y } = clientToCanvas(midX, midY);
    const dist = pointerDist();
    const ratio = dist / pinchStartDist;
    zoomAt(x, y, pinchStartZoom * ratio);
  }
}

function onZoomPointerUp(e) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchStartDist = null;
}

function initPinch() {
  const canvas = document.getElementById('canvas-area');
  if (!canvas) return;
  canvas.addEventListener('pointerdown', onZoomPointerDown);
  canvas.addEventListener('pointermove', onZoomPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onZoomPointerUp);
  canvas.addEventListener('pointercancel', onZoomPointerUp);
}

initPinch();


// ─── PAN (drag empty floorplan to move it) ────────────────────────────────────
let pan = null;  // { startX, startY, startPanX, startPanY }

function startPan(e) {
  // Only when not already device-dragging or pinching.
  if (drag || activePointers.size >= 2) return;
  pan = {
    startX: e.clientX,
    startY: e.clientY,
    startPanX: panX,
    startPanY: panY,
  };
}

function onPanMove(e) {
  if (!pan) return;
  if (activePointers.size >= 2) { pan = null; return; }  // pinch took over
  e.preventDefault();
  panX = pan.startPanX + (e.clientX - pan.startX);
  panY = pan.startPanY + (e.clientY - pan.startY);
  applyZoom();
}

function onPanUp() {
  pan = null;
}

function initPan() {
  const container = document.getElementById('floorplan-container');
  if (!container) return;
  // pointerdown on the container background starts a pan. Devices and the
  // remove button call stopPropagation, so their drags won't reach here.
  container.addEventListener('pointerdown', startPan);
  window.addEventListener('pointermove', onPanMove, { passive: false });
  window.addEventListener('pointerup', onPanUp);
  window.addEventListener('pointercancel', onPanUp);
}

initPan();

// Center the floorplan in the canvas via an initial pan offset (we no longer
// rely on flex centering, so the transform owns all positioning).
function centerFloorplan() {
  const canvas = document.getElementById('canvas-area');
  const container = document.getElementById('floorplan-container');
  if (!canvas || !container) return;
  const cRect = canvas.getBoundingClientRect();
  panX = (cRect.width - PLAN_WIDTH * zoomLevel) / 2;
  panY = (cRect.height - PLAN_HEIGHT * zoomLevel) / 2;
  applyZoom();
}


// `defer` guarantees the DOM is parsed before this runs.
initSourceToken();
loadMyDevices();
centerFloorplan();