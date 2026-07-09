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
function getOrCreateSession() {
  const url = new URL(window.location.href);
  let sid = url.searchParams.get('session') || localStorage.getItem('va_session_id');
  if (!sid) {
    sid = 'S' + Math.random().toString(36).substr(2, 6).toUpperCase();
    localStorage.setItem('va_session_id', sid);
  }
  const display = document.getElementById('session-display');
  if (display) display.textContent = sid;
  return sid;
}
const sessionId = getOrCreateSession();

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

// ─── COORDINATE HELPERS ─────────────────────────────────────────────────────
// Stored device positions live in a fixed logical space (0..860 × 0..620),
// matching the floorplan image's NATURAL (untransformed) dimensions.
//
// The floorplan container carries a CSS transform: translate(pan) scale(zoom).
// Placed devices are children of that container, so they inherit the transform
// automatically. That means devices must be positioned in raw logical units —
// the transform does all the scaling/panning. Do NOT apply scale here too, or
// it gets applied twice (the "offset up-and-left" bug).
const PLAN_WIDTH = 860;
const PLAN_HEIGHT = 620;

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
// The image sits at its natural 860×620 size at the container's origin before
// any transform, so logical units map 1:1 to container-local pixels. The
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