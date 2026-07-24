// ─── STATE ──────────────────────────────────────────────────────────────────
let myDevices = [];
let hasSubmitted = false;

// Active drag operation (null when not dragging).
let drag = null;
let ghostEl = null;

// Per-scenario localStorage keys — a placement in scenario 2 must never leak
// into scenario 3 (or into a different session).
function devicesKey() { return 'va_my_devices_' + sessionId + '_' + currentScenario().id; }
function submittedKey() { return 'va_submitted_' + sessionId + '_' + currentScenario().id; }

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
  localStorage.removeItem(submittedKey());
  // Also pull this browser's submission for the CURRENT scenario, so the
  // facilitator's heatmap doesn't keep a placement the student discarded.
  submissionsRef(currentScenario()).child(clientId).remove().catch(() => {});
  updateSubmitBar();
  fitFloorplan();
}

function loadMyDevices() {
  try {
    const saved = localStorage.getItem(devicesKey());
    if (saved) {
      myDevices = JSON.parse(saved);
      myDevices.forEach(d => renderDevice(d.id, d.x, d.y));
    }
    const submitted = localStorage.getItem(submittedKey());
    if (submitted === 'true') {
      hasSubmitted = true;
      document.getElementById('submitted-banner').style.display = 'block';
      document.getElementById('submit-btn').disabled = true;
    }
  } catch(e) {}
  updateSubmitBar();
}

function saveMyDevices() {
  localStorage.setItem(devicesKey(), JSON.stringify(myDevices));
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
  const scenario = currentScenario();
  const submission = {
    sessionId,
    scenarioId: scenario.id,
    devices: myDevices.map(d => ({ x: Math.round(d.x), y: Math.round(d.y) })),
    timestamp: Date.now()
  };
  try {
    // Keyed by session/scenario/client: everyone in the session lands under
    // the same scenario node (what the facilitator listens to), but each
    // browser keeps its own child. Re-submitting from the same browser
    // updates in place.
    await submissionsRef(scenario).child(clientId).set(submission);
    hasSubmitted = true;
    localStorage.setItem(submittedKey(), 'true');
    document.getElementById('submitted-banner').style.display = 'block';
    document.getElementById('submit-btn').disabled = true;
    showWaitOverlay();
  } catch(e) {
    alert('Could not save — check your connection and try again.');
    console.error(e);
  }
}

// ─── WAITING / COMPLETE OVERLAY ─────────────────────────────────────────────
// Menti-style holding screen: shown after submitting, dismissed automatically
// when the facilitator advances the scenario. Also doubles as the "all done"
// screen at the end of the session.
function showWaitOverlay() {
  document.getElementById('wait-title').textContent = 'Placement submitted';
  document.getElementById('wait-sub').textContent = 'Waiting for the facilitator to start the next scenario…';
  document.getElementById('wait-edit-btn').style.display = '';
  document.getElementById('wait-overlay').classList.add('show');
  updateScenarioProgress();
}

// Shown while the facilitator's session exists but hasn't been started yet
// (they're still on the big-code screen, before clicking Start Session) —
// there's no scenarioIndex node in Firebase at all at that point. Distinct
// from showWaitOverlay(): nothing's been submitted yet, so no Edit button and
// no progress dots (there's no progress to show).
function showNotStartedOverlay() {
  document.getElementById('wait-title').textContent = "You're in!";
  document.getElementById('wait-sub').textContent = 'Waiting for the facilitator to start the next scenario…';
  document.getElementById('wait-edit-btn').style.display = 'none';
  document.getElementById('wait-overlay').classList.add('show');
}

function showCompleteOverlay() {
  document.getElementById('wait-title').textContent = 'Session complete';
  document.getElementById('wait-sub').textContent = 'That\u2019s every scenario — thanks for participating.';
  document.getElementById('wait-edit-btn').style.display = 'none';
  document.getElementById('wait-overlay').classList.add('show');
  updateScenarioProgress();
}

function hideWaitOverlay() {
  document.getElementById('wait-overlay').classList.remove('show');
}

// "Edit my placement": reopen the current scenario. The previous submission
// stays in Firebase and is overwritten in place on resubmit.
function editPlacement() {
  hasSubmitted = false;
  localStorage.removeItem(submittedKey());
  document.getElementById('submitted-banner').style.display = 'none';
  document.getElementById('submit-btn').disabled = false;
  hideWaitOverlay();
  updateSubmitBar();
}

// ─── SCENARIO LOADING ───────────────────────────────────────────────────────
// Called on page load and every time the facilitator advances. Tears down the
// previous scenario's devices and restores any saved (but unsubmitted) work
// for the new one.
function loadScenario(idx) {
  scenarioIndex = idx;

  if (sessionIsComplete()) {
    showCompleteOverlay();
    return;
  }

  clearRenderedDevices();
  myDevices = [];
  hasSubmitted = false;
  document.getElementById('submitted-banner').style.display = 'none';
  document.getElementById('submit-btn').disabled = false;

  applyScenarioAssets(currentScenario());
  loadMyDevices();               // restores per-scenario saved state, if any

  if (hasSubmitted) {
    showWaitOverlay();           // e.g. page reload while waiting
  } else {
    hideWaitOverlay();
  }

  fitFloorplan();
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
let pinchFocalX = 0;
let pinchFocalY = 0;

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

    // Capture focal point once at pinch start
    const pts = [...activePointers.values()];
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const focal = clientToCanvas(midX, midY);
    pinchFocalX = focal.x;
    pinchFocalY = focal.y;
  }
}

function onZoomPointerMove(e) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2 && pinchStartDist) {
    e.preventDefault();
    const dist = pointerDist();
    const ratio = dist / pinchStartDist;
    zoomAt(pinchFocalX, pinchFocalY, pinchStartZoom * ratio);
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

  container.addEventListener('pointerdown', startPan);
  window.addEventListener('pointermove', onPanMove, { passive: false });
  window.addEventListener('pointerup', onPanUp);
  window.addEventListener('pointercancel', onPanUp);
}

initPan();

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

  // Center within the content box. Do NOT add padLeft — the canvas's CSS
  // padding already offsets the container's origin by that amount, so adding
  // it here would double-count it (the right-shift bug).
  panX = (contentW - scaledW) / 2;
  panY = margin;


  applyZoom();
}

// Re-fit the floorplan whenever orientation changes (portrait <-> landscape).
// Resets zoom/pan back to the fitted position for the new orientation.
window.matchMedia("(orientation: landscape)").addEventListener("change", () => {
  // Wait a frame so the browser finishes the reflow before we measure.
  requestAnimationFrame(fitFloorplan);
});

// ─── SESSION GATE ───────────────────────────────────────────────────────────
// The page no longer mints a private session on load. If the URL carries
// ?session=CODE (the facilitator's join link), show a one-click confirm
// screen; otherwise show the code-entry gate. Either way, a single click
// (Join) is what starts the session — there's no separate Ready step
// anymore. Everything that depends on sessionId — per-scenario localStorage
// keys, Firebase writes, scenario sync — runs only after startStudentSession.
function initStudentGate() {
  const fromUrl = sessionFromUrl();
  if (fromUrl) {
    showLinkJoinGate(fromUrl);
    return;
  }

  const gate = document.getElementById('session-gate');
  const input = document.getElementById('session-input');
  const err = document.getElementById('session-error');

  // Prefill the last session this browser joined — handy when a student
  // reopens the page mid-class.
  const last = localStorage.getItem('va_last_session');
  if (last) input.value = last;

  function tryJoin() {
    const code = input.value.trim().toUpperCase();
    if (!code) {
      err.textContent = 'Enter a session code.';
      return;
    }
    err.textContent = '';
    putSessionInUrl(code);
    gate.classList.remove('active');
    startStudentSession(code);
  }

  document.getElementById('session-join-btn').addEventListener('click', tryJoin);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryJoin(); });

  gate.classList.add('active');
  input.focus();
}

// When arriving via the facilitator's join link, the session code is already
// known — there's nothing to type — but a click is still required before
// marking live presence, same reasoning as the code-entry Join button: it's
// an explicit "I'm here" signal, not just a page load. Shown on every load
// (including reloads), since a reload drops the live presence connection
// anyway.
function showLinkJoinGate(sid) {
  const gate = document.getElementById('link-join-gate');
  const btn = document.getElementById('link-join-btn');
  if (!gate || !btn) { startStudentSession(sid); return; }

  gate.classList.add('active');
  btn.onclick = () => {
    gate.classList.remove('active');
    startStudentSession(sid);
  };
}

function startStudentSession(sid) {
  setSession(sid);
  localStorage.setItem('va_last_session', sid);

  // Live presence, Menti-style: registered on Join, and auto-cleared the
  // moment this browser disconnects (closed tab, lost connection, navigated
  // away) via onDisconnect — so the facilitator's count reflects who's
  // actually here right now, updating on both late joins and early leaves.
  // set() must be registered before onDisconnect() would otherwise remove a
  // node that was never written; ordering here (onDisconnect first, then
  // set) matches Firebase's own recommended presence pattern.
  const presenceRef = joinedRef(sid).child(clientId);
  presenceRef.onDisconnect().remove();
  presenceRef.set(true).catch(() => {});

  const gate = document.getElementById('session-gate');
  if (gate) gate.classList.remove('active');

  // initScenarioSync fires immediately with the current index. A null index
  // means the facilitator's session exists but hasn't been started yet (they
  // are still on the big-code screen) — show the waiting screen rather than
  // jumping into scenario 1. It fires again on every facilitator advance,
  // which is what dismisses whichever waiting screen is showing.
  initScenarioSync((idx) => {
    if (idx === null) {
      showNotStartedOverlay();
      return;
    }
    if (idx !== scenarioIndex || !document.getElementById('floorplan-img').style.width) {
      loadScenario(idx);
    }
  });
}

// Return to the code-entry gate (e.g. the student joined the wrong session).
// A reload is the cleanest reset: it drops ?session= from the URL so the gate
// shows again, and discards all in-memory state for the wrong session. The
// gate prefills the last-used code, which the student can correct. Presence
// is also cleared explicitly rather than relying on onDisconnect's timing —
// this makes the facilitator's count drop right away instead of waiting on
// the disconnect to be detected.
function changeSession() {
  if (sessionId) {
    joinedRef(sessionId).child(clientId).remove().catch(() => {});
  }
  const u = new URL(window.location.href);
  u.searchParams.delete('session');
  window.location.href = u.href;
}

// ─── INIT ───────────────────────────────────────────────────────────────────
initSourceToken();
initStudentGate();
