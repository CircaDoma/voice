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

// ─── COORDINATE HELPERS ─────────────────────────────────────────────────────
// Stored device positions live in a fixed logical space (0..860 × 0..620),
// matching the floorplan image's natural dimensions.
const PLAN_WIDTH = 860;
const PLAN_HEIGHT = 620;

// Screen/pointer position → logical plan units.
function clientToSvg(clientX, clientY) {
  const img = document.getElementById('floorplan-img');
  const rect = img.getBoundingClientRect();
  const x = (clientX - rect.left) * (PLAN_WIDTH / rect.width);
  const y = (clientY - rect.top) * (PLAN_HEIGHT / rect.height);
  return { x, y };
}

// Logical plan units → CSS pixels relative to the container.
function svgToContainerPx(x, y) {
  const img = document.getElementById('floorplan-img');
  const imgRect = img.getBoundingClientRect();
  const containerRect = document.getElementById('floorplan-container').getBoundingClientRect();
  const scaleX = imgRect.width / PLAN_WIDTH;
  const scaleY = imgRect.height / PLAN_HEIGHT;
  const offsetX = imgRect.left - containerRect.left;
  const offsetY = imgRect.top - containerRect.top;
  return {
    left: offsetX + x * scaleX,
    top: offsetY + y * scaleY,
  };
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