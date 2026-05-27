// ─── HEATMAP ────────────────────────────────────────────────────────────────
async function refreshHeatmap() {
  try {
    const db = firebase.database();
    const snapshot = await db.ref('submissions').get();

    document.querySelectorAll('.placed-device').forEach(el => el.remove());
    document.querySelectorAll('.heatmap-dot').forEach(el => el.remove());

    const allDevices = [];
    let totalDevicesCount = 0;
    const submissions = [];

    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const data = child.val();
        submissions.push(data);
        data.devices.forEach(d => {
          allDevices.push({ x: d.x, y: d.y });
          totalDevicesCount++;
        });
      });
    }

    const numSubmissions = submissions.length;
    document.getElementById('count-num').textContent = numSubmissions;
    document.getElementById('stat-submissions').textContent = numSubmissions;
    document.getElementById('stat-avg').textContent =
      numSubmissions > 0 ? Math.round(totalDevicesCount / numSubmissions) : 0;

    if (allDevices.length === 0) {
      document.getElementById('stat-hotspot').textContent = '—';
      document.getElementById('stat-missed').textContent = '—';
      return;
    }

    // Build density grid (coords are in SVG viewBox units)
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

    // Hot/cold rooms
    const roomCenters = {
      'Kitchen': {x: 164, y: 148},
      'Living Rm': {x: 434, y: 148},
      'Bed 2': {x: 702, y: 148},
      'Primary Bed': {x: 164, y: 338},
      'Bed 3': {x: 702, y: 338},
      'Hallway': {x: 504, y: 338},
      'Laundry': {x: 124, y: 504},
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

    // Render heatmap dots — sized in viewBox units, then scaled to CSS pixels.
    const container = document.getElementById('floorplan-container');
    const svg = document.getElementById('floorplan-svg');
    const svgRect = svg.getBoundingClientRect();
    const vbWidth = svg.viewBox.baseVal.width || svg.width.baseVal.value;
    const radiusScale = svgRect.width / vbWidth;

    Object.entries(density).forEach(([key, count]) => {
      const [gx, gy] = key.split('_').map(Number);
      const svgCx = (gx + 0.5) * CELL;
      const svgCy = (gy + 0.5) * CELL;
      const px = svgToContainerPx(svgCx, svgCy);

      const intensity = count / maxDensity;
      const radius = (28 + intensity * 36) * radiusScale;
      const alpha = 0.15 + intensity * 0.55;

      const r = Math.round(79 + intensity * 176);
      const g = Math.round(142 - intensity * 80);
      const b = Math.round(247 - intensity * 150);

      const dot = document.createElement('div');
      dot.className = 'heatmap-dot';
      dot.style.left = px.left + 'px';
      dot.style.top = px.top + 'px';
      dot.style.width = (radius * 2) + 'px';
      dot.style.height = (radius * 2) + 'px';
      dot.style.background = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      dot.style.marginLeft = (-radius) + 'px';
      dot.style.marginTop = (-radius) + 'px';
      container.appendChild(dot);
    });

  } catch(e) {
    console.error('Heatmap error:', e);
  }
}

async function clearAllData() {
  if (!confirm('Clear ALL submissions for this session? This cannot be undone.')) return;
  try {
    const db = firebase.database();
    await db.ref('submissions').remove();
    document.querySelectorAll('.heatmap-dot').forEach(el => el.remove());
    document.getElementById('count-num').textContent = '0';
    document.getElementById('stat-submissions').textContent = '0';
    document.getElementById('stat-avg').textContent = '0';
    document.getElementById('stat-hotspot').textContent = '—';
    document.getElementById('stat-missed').textContent = '—';
    alert('All data cleared.');
  } catch(e) {
    alert('Error clearing data.');
  }
}

// The instructor page is read-only; ignore any drops onto the canvas
// rather than blocking with `preventDefault` (the overlay handler is enough).
function onDrop(e) {
  e.preventDefault();
  document.getElementById('drop-overlay').classList.remove('active');
}

// Kick off the live heatmap on load.
refreshHeatmap();
setInterval(refreshHeatmap, 8000);
