// ─── FIREBASE INIT ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDEpS0QyoiX5Y1fh35pSzjoIS-s4n4D3NY",
  authDomain: "voice-session.firebaseapp.com",
  databaseURL: "https://voice-session-default-rtdb.firebaseio.com",
  projectId: "voice-session",
  storageBucket: "voice-session.firebasestorage.app",
  messagingSenderId: "578750056973",
  appId: "1:578750056973:web:d36237cc85cfbd6409e344"
};
firebase.initializeApp(firebaseConfig);

// ─── SESSION ────────────────────────────────────────────────────────────────
// Sessions are no longer auto-minted on page load. Each view decides when a
// session becomes active: the student view asks for a code (or reads
// ?session= from the URL), the facilitator view offers a picker / "start new
// session" flow. Nothing that touches `sessionId` may run before setSession().
let sessionId = null;

function setSession(sid) {
  sessionId = sid;
  const display = document.getElementById('session-display');
  if (display) display.textContent = sid;
  return sid;
}

// 4 random uppercase letters — no digits. Plenty of headroom for how few
// sessions this ever needs to hold at once, and letters-only avoids the
// visually-ambiguous 0/O, 1/I mixups digits bring into a spoken-aloud code.
function newSessionCode() {
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return code;
}

// Read ?session=CODE from the URL (normalized), or null.
function sessionFromUrl() {
  const raw = new URL(window.location.href).searchParams.get('session');
  return raw ? raw.trim().toUpperCase() : null;
}

// Write the active session into the URL so a refresh rejoins the same session.
function putSessionInUrl(sid) {
  const u = new URL(window.location.href);
  u.searchParams.set('session', sid);
  history.replaceState(null, '', u);
}

// Per-browser client ID. The session code is SHARED by the whole class, so
// submissions must be keyed by client too — otherwise every student writes to
// the same path and only the last submission survives.
function getOrCreateClientId() {
  let cid = localStorage.getItem('va_client_id');
  if (!cid) {
    cid = 'C' + Math.random().toString(36).substr(2, 8);
    localStorage.setItem('va_client_id', cid);
  }
  return cid;
}
const clientId = getOrCreateClientId();

// ─── SCENARIO STATE ─────────────────────────────────────────────────────────
// The facilitator drives progression by writing an index to
// sessions/{sessionId}/scenarioIndex. Both views listen to it (see
// initScenarioSync below) so everyone advances together, Menti-style.
//
// scenarioIndex === SCENARIOS.length is a valid terminal state meaning
// "session complete".
let scenarioIndex = 0;

function currentScenario() {
  return SCENARIOS[Math.min(scenarioIndex, SCENARIOS.length - 1)];
}

function sessionIsComplete() {
  return scenarioIndex >= SCENARIOS.length;
}

function scenarioStateRef() {
  return firebase.database().ref('sessions/' + sessionId + '/scenarioIndex');
}

// Firebase path for one scenario's submissions in this session.
function submissionsRef(scenario) {
  return firebase.database().ref('submissions/' + sessionId + '/' + scenario.id);
}

// Live presence: one child per connected, ready student browser. Written on
// the student's "I'm Ready" click and auto-removed via onDisconnect() when
// that browser disconnects — so this reflects who's here right now, not a
// running tally of everyone who's ever joined. Feeds the facilitator's
// Menti-style ready counter (big-code overlay + toolbar stat).
function joinedRef(sid) {
  return firebase.database().ref('joined/' + sid);
}

// Subscribe to scenario changes. onChange(index) fires immediately with the
// current value (0 if the facilitator hasn't opened the session yet) and again
// on every advance.
function initScenarioSync(onChange) {
  scenarioStateRef().on('value', (snap) => {
    const idx = snap.val();
    // null means the facilitator hasn't started this session yet (no node
    // written) — pass that through as-is rather than defaulting to 0, so
    // callers can tell "not started" apart from "on scenario 1" and show a
    // waiting screen instead of jumping straight into the floorplan.
    onChange(typeof idx === 'number' ? idx : null);
  }, (err) => {
    console.error('Scenario sync error:', err);
    onChange(0); // a real connection error still degrades to scenario 1 rather than a blank screen
  });
}

// ─── COORDINATE SPACE ───────────────────────────────────────────────────────
// Stored device positions live in a fixed logical space matching the ACTIVE
// floorplan's viewBox — the dimensions come from the scenario config and are
// updated by applyScenarioAssets() on every scenario change.
//
// The floorplan container carries a CSS transform: translate(pan) scale(zoom).
// Placed devices/heatmap dots are children of that container, so they inherit
// the transform automatically and must be positioned in raw logical units.
// Do NOT apply scale here too, or it gets applied twice.
let PLAN_WIDTH = SCENARIOS[0].planWidth;
let PLAN_HEIGHT = SCENARIOS[0].planHeight;

// Swap the floorplan image + logical dimensions + toolbar text for a scenario.
// Shared by both views. Caller is responsible for re-fitting the viewport.
function applyScenarioAssets(scenario) {
  PLAN_WIDTH = scenario.planWidth;
  PLAN_HEIGHT = scenario.planHeight;

  const img = document.getElementById('floorplan-img');
  img.src = scenario.floorplan;
  img.style.width = scenario.planWidth + 'px';
  img.style.height = scenario.planHeight + 'px';

  const title = document.getElementById('scenario-title');
  if (title) title.textContent = scenario.title;
  const instructions = document.getElementById('scenario-instructions');
  if (instructions) instructions.textContent = scenario.instructions;

  updateScenarioProgress();
}

// "Scenario X of N" text + dots, on whichever elements the page has.
function updateScenarioProgress() {
  const label = document.getElementById('scenario-progress');
  if (label) {
    label.textContent = sessionIsComplete()
      ? 'Session complete'
      : 'Scenario ' + (scenarioIndex + 1) + ' of ' + SCENARIOS.length;
  }
  document.querySelectorAll('.progress-dots').forEach(dotsEl => {
    dotsEl.innerHTML = '';
    SCENARIOS.forEach((s, i) => {
      const dot = document.createElement('span');
      dot.className = 'dot' +
        (i < scenarioIndex ? ' done' : '') +
        (i === scenarioIndex ? ' current' : '');
      dotsEl.appendChild(dot);
    });
  });
}

// Screen/pointer position → logical plan units.
// img.getBoundingClientRect() reflects the POST-transform size/position, so
// dividing by it maps a screen point back into the image's 0..PLAN space.
function clientToSvg(clientX, clientY) {
  const img = document.getElementById('floorplan-img');
  const rect = img.getBoundingClientRect();
  const x = (clientX - rect.left) * (PLAN_WIDTH / rect.width);
  const y = (clientY - rect.top) * (PLAN_HEIGHT / rect.height);
  return { x, y };
}

// Logical plan units → position inside the (untransformed) container.
// The image sits at its natural size at the container's origin before any
// transform, so logical units map 1:1 to container-local pixels. The
// container's own CSS transform then scales/pans the device along with the image.
function svgToContainerPx(x, y) {
  return { left: x, top: y };
}

// Is a client point inside the floorplan image's bounds?
function isOverFloorplan(clientX, clientY) {
  const img = document.getElementById('floorplan-img');
  const r = img.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

// Show/hide the dashed drop overlay.
function setDropOverlay(active) {
  const o = document.getElementById('drop-overlay');
  if (o) o.classList.toggle('active', active);
}
