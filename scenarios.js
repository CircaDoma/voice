// ─── SCENARIO CONFIG ────────────────────────────────────────────────────────
// THIS IS THE ONLY FILE TO TOUCH when adding, removing, or reordering
// scenarios. Every entry needs:
//
//   id           Unique, stable string. Used in Firebase paths and
//                localStorage keys — NEVER reuse an old id for a new
//                floorplan or stale submissions will bleed into it.
//   title        Shown in the toolbar on both views.
//   instructions Student-facing prompt for the scenario.
//   floorplan    Path to the SVG asset.
//   planWidth /  MUST match the SVG's viewBox width/height. All stored
//   planHeight   device coordinates are in these units.
//   roomCenters  Logical-unit centers used by the facilitator's
//                hotspot/coldest stats.
//
// The session runs the array in order. Deleting an entry just removes it
// from the flow; its old submissions stay in Firebase but are never read.
const SCENARIOS = [
  {
    id: 'fp1',
    title: 'Single-Story Home',
    instructions: 'Drag devices onto the floorplan for full voice coverage. Fewest devices, every room heard.',
    floorplan: 'assets/floorplan-1.svg',
    planWidth: 877,
    planHeight: 710,
    roomCenters: {
      'Kitchen':       { x: 105, y: 115 },
      'Office':        { x: 300, y: 115 },
      'Bedroom Suite': { x: 510, y: 140 },
      'Dining Room':   { x: 105, y: 360 },
      'Bathroom':      { x: 510, y: 375 },
      'Living Room':   { x: 160, y: 550 },
      'Mud Room':      { x: 525, y: 550 },
      'Garage':        { x: 753, y: 336 },
    },
  },
  {
    id: 'fp2',
    title: 'Two-Floor House',
    instructions: 'Both floors are shown side by side. Devices do not hear through floors — cover each level.',
    floorplan: 'assets/floorplan-2.svg',
    planWidth: 880,
    planHeight: 660,
    roomCenters: {
      'Kitchen (F1)':     { x: 120, y: 195 },
      'Dining (F1)':      { x: 320, y: 195 },
      'Living Room (F1)': { x: 220, y: 450 },
      'Primary Bed (F2)': { x: 560, y: 195 },
      'Bed 2 (F2)':       { x: 760, y: 195 },
      'Landing (F2)':     { x: 590, y: 395 },
      'Bed 3 (F2)':       { x: 750, y: 465 },
      'Bath (F2)':        { x: 550, y: 535 },
    },
  },
  {
    id: 'fp3',
    title: 'Open Floorplan',
    instructions: 'Few walls, lots of echo. Cover each zone without devices overhearing each other.',
    floorplan: 'assets/floorplan-3.svg',
    planWidth: 860,
    planHeight: 620,
    roomCenters: {
      'Kitchen':     { x: 200, y: 170 },
      'Dining':      { x: 480, y: 170 },
      'Living Room': { x: 290, y: 460 },
      'Bedroom':     { x: 700, y: 130 },
      'Bath':        { x: 700, y: 310 },
      'Entry':       { x: 700, y: 490 },
    },
  },
  {
    id: 'fp4',
    title: 'Detached Studio + Patio',
    instructions: 'Coverage is needed on the patio and in the studio too. Mind the range gap between buildings.',
    floorplan: 'assets/floorplan-4.svg',
    planWidth: 900,
    planHeight: 620,
    roomCenters: {
      'Kitchen': { x: 160, y: 160 },
      'Living':  { x: 430, y: 160 },
      'Bedroom': { x: 140, y: 450 },
      'Hall':    { x: 410, y: 380 },
      'Bath':    { x: 410, y: 530 },
      'Patio':   { x: 645, y: 450 },
      'Studio':  { x: 815, y: 450 },
    },
  },
  {
    id: 'fp5',
    title: 'Vacation Rental',
    instructions: 'Hatched rooms are off-limits to guests. Cover the guest areas — keep devices out of owner spaces.',
    floorplan: 'assets/floorplan-5.svg',
    planWidth: 860,
    planHeight: 620,
    roomCenters: {
      'Kitchen':        { x: 170, y: 165 },
      'Living':         { x: 450, y: 165 },
      'Bed 1':          { x: 710, y: 165 },
      'Bed 2':          { x: 150, y: 455 },
      'Bath':           { x: 420, y: 455 },
      "Owner's Closet": { x: 700, y: 385 },
      'Utility':        { x: 700, y: 530 },
    },
  },
  {
    id: 'fp6',
    title: 'Compact Single-Story',
    instructions: 'Small footprint, open kitchen and living. How few devices can cover it all?',
    floorplan: 'assets/floorplan-6.svg',
    planWidth: 700,
    planHeight: 500,
    roomCenters: {
      'Kitchen':     { x: 220, y: 140 },
      'Living Room': { x: 220, y: 370 },
      'Bedroom':     { x: 550, y: 140 },
      'Bath':        { x: 550, y: 370 },
    },
  },
];
