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
}

function saveMyDevices() {
  localStorage.setItem('va_my_devices_' + sessionId, JSON.stringify(myDevices));
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

// `defer` guarantees the DOM is parsed before this runs.
initSourceToken();
loadMyDevices();