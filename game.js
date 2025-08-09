const canvas = document.getElementById('drawCanvas');
const overlay = document.getElementById('overlayCanvas');
const scoreDisplay = document.getElementById('scoreDisplay');
const debugEl = document.getElementById('debug');
const clearBtn = document.getElementById('clearBtn');
const scoreBtn = document.getElementById('scoreBtn');
const shapeSelect = document.getElementById('shapeSelect');

function updateScoreDisplay(score) {
  const scoreEl = document.getElementById('scoreDisplay');

  // Clear previous classes
  scoreEl.classList.remove('score-high', 'score-medium', 'score-low');

  // Set text
  scoreEl.textContent = score;

  // Apply class based on score
  if (score >= 8) {
    scoreEl.classList.add('score-high');
  } else if (score >= 5) {
    scoreEl.classList.add('score-medium');
  } else {
    scoreEl.classList.add('score-low');
  }
}

function setupCanvas(c, w = 760, h = 480) {
  const dpr = window.devicePixelRatio || 1;
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

const ctx = setupCanvas(canvas);
const overlayCtx = setupCanvas(overlay);

let drawing = false;
let rawPoints = [];

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
  return { x, y };
}

canvas.addEventListener('mousedown', e => {
  drawing = true;
  rawPoints = [];
  rawPoints.push(toCanvasCoords(e));
  drawPoint(rawPoints[0]);
});
window.addEventListener('mousemove', e => {
  if (!drawing) return;
  const p = toCanvasCoords(e);
  rawPoints.push(p);
  drawLineSegment();
});
window.addEventListener('mouseup', e => {
  if (!drawing) return;
  drawing = false;
  drawLineSegment();
});
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  drawing = true;
  rawPoints = [];
  rawPoints.push(toCanvasCoords(e));
  drawPoint(rawPoints[0]);
}, { passive: false });
window.addEventListener('touchmove', e => {
  if (!drawing) return;
  const p = toCanvasCoords(e);
  rawPoints.push(p);
  drawLineSegment();
}, { passive: false });
window.addEventListener('touchend', e => {
  drawing = false;
});

function clear() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  rawPoints = [];
  scoreDisplay.textContent = '—';
  scoreDisplay.classList.remove('score-high', 'score-medium', 'score-low');
  debugEl.textContent = '';
}
clearBtn.onclick = clear;

function drawPoint(p) {
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawLineSegment() {
  if (rawPoints.length < 2) return;
  const a = rawPoints[rawPoints.length - 2];
  const b = rawPoints[rawPoints.length - 1];
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function resample(points, N = 200) {
  if (points.length === 0) return [];
  const D = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    D.push(D[D.length - 1] + Math.hypot(dx, dy));
  }
  const total = D[D.length - 1];
  if (total === 0) return Array(N).fill(points[0]);

  const out = [];
  const step = total / (N - 1);
  let target = 0;
  let j = 0;
  for (let i = 0; i < N; i++) {
    target = i * step;
    while (j < D.length - 1 && D[j + 1] < target) j++;
    const t0 = D[j], t1 = D[j + 1];
    const p0 = points[j], p1 = points[j + 1];
    const f = (target - t0) / (t1 - t0 || 1);
    out.push({
      x: p0.x + (p1.x - p0.x) * f,
      y: p0.y + (p1.y - p0.y) * f
    });
  }
  return out;
}

function fitCircle(points) {
  const n = points.length;
  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  let sumXb = 0, sumYb = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    const x = points[i].x, y = points[i].y;
    const b = -(x * x + y * y);
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
    sumXY += x * y;
    sumXb += x * b;
    sumYb += y * b;
    sumB += b;
  }
  const M = [
    [sumX2, sumXY, sumX],
    [sumXY, sumY2, sumY],
    [sumX, sumY, n]
  ];
  const v = [sumXb, sumYb, sumB];
  const p = solve3(M, v);
  if (!p) return null;
  const D = p[0], E = p[1], F = p[2];
  const h = -D / 2, k = -E / 2;
  const rad2 = h * h + k * k - F;
  const r = rad2 > 0 ? Math.sqrt(rad2) : 0;
  return { h, k, r };
}

function solve3(A, b) {
  const m = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]]
  ];
  const n = 3;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(m[r][i]) > Math.abs(m[maxRow][i])) maxRow = r;
    }
    if (Math.abs(m[maxRow][i]) < 1e-12) return null;
    if (maxRow !== i) {
      const tmp = m[i]; m[i] = m[maxRow]; m[maxRow] = tmp;
    }
    const piv = m[i][i];
    for (let c = i; c < n + 1; c++) m[i][c] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = m[r][i];
      for (let c = i; c < n + 1; c++) m[r][c] -= factor * m[i][c];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

function computeCircleScore(points, fit) {
  if (!fit || fit.r <= 0) return { score: 0, details: { msg: 'bad-fit' } };
  const h = fit.h, k = fit.k, r = fit.r;
  const errors = points.map(p => Math.abs(Math.hypot(p.x - h, p.y - k) - r));
  const MAE = errors.reduce((a, b) => a + b, 0) / errors.length;
  const rel_error = MAE / r;
  const angles = points.map(p => Math.atan2(p.y - k, p.x - h)).sort((a, b) => a - b);

  let maxGap = 0;
  for (let i = 0; i < angles.length - 1; i++) {
    maxGap = Math.max(maxGap, angles[i + 1] - angles[i]);
  }
  const wrap = (angles[0] + 2 * Math.PI) - angles[angles.length - 1];
  maxGap = Math.max(maxGap, wrap);

  const coverage = Math.max(0, (2 * Math.PI - maxGap) / (2 * Math.PI));
  const T = 0.25;
  const goodFactor = Math.max(0, 1 - (rel_error / T));
  const raw = coverage * goodFactor;
  const final = Math.round(raw * 100) / 10;
  return {
    score: Math.max(0, final),
    details: { MAE, rel_error, coverage, r }
  };
}

function computeRectangleScore(points) {
  if (points.length === 0) return { score: 0, details: { msg: 'no-points' } };
  let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const drawnWidth = maxX - minX;
  const drawnHeight = maxY - minY;

  let totalDist = 0;
  for (const p of points) {
    const distX = Math.min(Math.abs(p.x - minX), Math.abs(p.x - maxX));
    const distY = Math.min(Math.abs(p.y - minY), Math.abs(p.y - maxY));
    totalDist += Math.min(distX, distY);
  }
  const avgDist = totalDist / points.length;

  const maxDist = Math.min(drawnWidth, drawnHeight) / 3;
  let score = Math.max(0, 1 - (avgDist / maxDist));

  return { score: score * 10, details: { avgDist, drawnWidth, drawnHeight } };
}

function computeTriangleScore(points) {
  if (points.length === 0) return { score: 0, details: { msg: 'no-points' } };

  let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const side = Math.max(maxX - minX, maxY - minY);
  const idealPerimeter = 3 * side;

  let perimeter = 0;
  for (let i = 1; i < points.length; i++) {
    perimeter += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  perimeter += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);

  let score = Math.max(0, 1 - Math.abs(perimeter - idealPerimeter) / idealPerimeter);

  return { score: score * 10, details: { perimeter, idealPerimeter } };
}

function drawFit(shape, fit) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  overlayCtx.setLineDash([]);
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeStyle = '#e74c3c';

  if (shape === 'circle') {
    if (!fit || fit.r <= 0) return;
    overlayCtx.setLineDash([6, 6]);
    overlayCtx.beginPath();
    overlayCtx.arc(fit.h, fit.k, fit.r, 0, Math.PI * 2);
    overlayCtx.stroke();
    overlayCtx.setLineDash([]);
  } else if (shape === 'rectangle') {
    if (!fit) return;
    overlayCtx.beginPath();
    overlayCtx.strokeRect(fit.minX, fit.minY, fit.width, fit.height);
  } else if (shape === 'triangle') {
    if (!fit) return;
    overlayCtx.beginPath();
    overlayCtx.moveTo(fit.p1.x, fit.p1.y);
    overlayCtx.lineTo(fit.p2.x, fit.p2.y);
    overlayCtx.lineTo(fit.p3.x, fit.p3.y);
    overlayCtx.closePath();
    overlayCtx.stroke();
  }
}

scoreBtn.onclick = () => {
  if (rawPoints.length < 10) {
    scoreDisplay.textContent = 'Draw first!';
    scoreDisplay.classList.remove('score-high', 'score-medium', 'score-low');
    return;
  }

  const shape = shapeSelect.value;
  const N = 200;
  const pts = resample(rawPoints, N);
  let score, out, fit;

  if (shape === 'circle') {
    fit = fitCircle(pts);
    out = computeCircleScore(pts, fit);
    score = out.score;
    debugEl.textContent = `MAE≈${out.details.MAE?.toFixed(2) || 0} px, rel≈${out.details.rel_error?.toFixed(3) || 0}, coverage=${(out.details.coverage * 100 || 0).toFixed(0)}%`;
    drawFit(shape, fit);

  } else if (shape === 'rectangle') {
    let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    fit = { minX, minY, width: maxX - minX, height: maxY - minY };
    out = computeRectangleScore(pts);
    score = out.score;
    debugEl.textContent = `AvgDist≈${out.details.avgDist.toFixed(2)} px, Width=${out.details.drawnWidth.toFixed(1)}, Height=${out.details.drawnHeight.toFixed(1)}`;
    drawFit(shape, fit);

  } else if (shape === 'triangle') {
    out = computeTriangleScore(pts);
    score = out.score;
    debugEl.textContent = `Perimeter=${out.details.perimeter.toFixed(1)}, Ideal=${out.details.idealPerimeter.toFixed(1)}`;
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y));
    const side = Math.max(maxX - minX, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const height = side * Math.sqrt(3) / 2;
    const p1 = { x: cx, y: cy - 2 / 3 * height };
    const p2 = { x: cx - side / 2, y: cy + height / 3 };
    const p3 = { x: cx + side / 2, y: cy + height / 3 };
    fit = { p1, p2, p3 };
    drawFit(shape, fit);
  }

  updateScoreDisplay(score.toFixed(1) + ' / 10');
};

// Draw preview shape in small preview canvas
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

function drawPreview(shape) {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.strokeStyle = 'black';
  previewCtx.lineWidth = 2;

  if (shape === 'circle') {
    previewCtx.beginPath();
    previewCtx.arc(60, 60, 40, 0, Math.PI * 2);
    previewCtx.stroke();
  } else if (shape === 'rectangle') {
    previewCtx.strokeRect(20, 20, 80, 80);
  } else if (shape === 'triangle') {
    previewCtx.beginPath();
    previewCtx.moveTo(60, 20);
    previewCtx.lineTo(100, 100);
    previewCtx.lineTo(20, 100);
    previewCtx.closePath();
    previewCtx.stroke();
  }
}

shapeSelect.addEventListener('change', () => {
  clear();
  drawPreview(shapeSelect.value);
});

// Initialize preview on load
drawPreview(shapeSelect.value);
