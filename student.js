// ─── STATE ──────────────────────────────────────────────────────────────────
let myDevices = [];
let hasSubmitted = false;

// ─── DRAG FROM SIDEBAR ──────────────────────────────────────────────────────
function onTokenDrag(e) {
  e.dataTransfer.setData('type', 'new');
}

function onDrop(e) {
  e.preventDefault();
  document.getElementById('drop-overlay').classList.remove('active');

  const type = e.dataTransfer.getData('type');
  const { x, y } = clientToSvg(e.clientX, e.clientY);

  if (type === 'existing') {
    const id = e.dataTransfer.getData('device-id');
    moveDevice(id, x, y);
  } else if (!hasSubmitted) {
    placeDevice(x, y);
  }
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
  el.innerHTML = '🔊<button class="remove-btn" onclick="removeDevice(\'' + id + '\')" title="Remove">×</button>';
  el.setAttribute('draggable', 'true');

  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('type', 'existing');
    e.dataTransfer.setData('device-id', id);
  });

  container.appendChild(el);
}

function clearRenderedDevices() {
  document.querySelectorAll('.placed-device').forEach(el => el.remove());
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

// Restore any in-progress placement on page load.
// `defer` on the script tag guarantees the DOM is parsed first.
loadMyDevices();
