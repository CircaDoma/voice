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

// sessionId is used by both pages — set once at load.
const sessionId = getOrCreateSession();

// ─── COORDINATE HELPERS ─────────────────────────────────────────────────────
// Stored device positions and roomCenters live in SVG viewBox units (0..860 × 0..620).
// These helpers translate between client-space (drop events) and viewBox space,
// and back to container CSS pixels for absolutely-positioned HTML overlays.

function clientToSvg(clientX, clientY) {
  const svg = document.getElementById('floorplan-svg');
  const rect = svg.getBoundingClientRect();
  const vbWidth = svg.viewBox.baseVal.width || svg.width.baseVal.value;
  const vbHeight = svg.viewBox.baseVal.height || svg.height.baseVal.value;
  const x = (clientX - rect.left) * (vbWidth / rect.width);
  const y = (clientY - rect.top) * (vbHeight / rect.height);
  return { x, y };
}

function svgToContainerPx(x, y) {
  const svg = document.getElementById('floorplan-svg');
  const svgRect = svg.getBoundingClientRect();
  const containerRect = document.getElementById('floorplan-container').getBoundingClientRect();
  const vbWidth = svg.viewBox.baseVal.width || svg.width.baseVal.value;
  const vbHeight = svg.viewBox.baseVal.height || svg.height.baseVal.value;
  const scaleX = svgRect.width / vbWidth;
  const scaleY = svgRect.height / vbHeight;
  // SVG may be offset within the container (borders, sibling elements); account for that.
  const offsetX = svgRect.left - containerRect.left;
  const offsetY = svgRect.top - containerRect.top;
  return {
    left: offsetX + x * scaleX,
    top: offsetY + y * scaleY,
  };
}

// ─── DRAG OVERLAY (both pages use this so the overlay shows during drag-over) ─
function onDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-overlay').classList.add('active');
}

function onDragLeave(e) {
  document.getElementById('drop-overlay').classList.remove('active');
}
