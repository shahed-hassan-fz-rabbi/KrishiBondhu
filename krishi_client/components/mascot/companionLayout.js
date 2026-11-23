const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function intersectionArea(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

export function getCompanionPositionBounds({ viewportWidth, viewportHeight, size, safeArea = {}, margin = 12, bottomNavHeight = 0 }) {
  const left = Math.max(margin, (safeArea.left || 0) + (safeArea.left ? margin : 0));
  // Safe edge measurements already end at the visible control bounds; do not
  // add another margin that can push the character into the first content row.
  const top = Math.max(margin, safeArea.top || 0);
  const right = Math.min(viewportWidth - margin, (safeArea.right ?? viewportWidth) - (safeArea.right < viewportWidth ? margin : 0));
  // Never let Bondhu rest on top of the sticky header or the fixed bottom nav.
  const bottomCap = bottomNavHeight > 0 ? viewportHeight - bottomNavHeight : viewportHeight - margin;
  const bottom = Math.min(bottomCap, (safeArea.bottom ?? viewportHeight) - (safeArea.bottom < viewportHeight ? margin : 0));
  return {
    minX: left,
    minY: top,
    maxX: Math.max(left, right - size.width),
    maxY: Math.max(top, bottom - size.height),
  };
}

/** Return a safe, viewport-clamped position for Bondhu given measured obstacles. */
export function resolveCompanionPosition({
  viewportWidth,
  viewportHeight,
  size,
  obstacles = [],
  preferredPositions = [],
  candidatePositions = [],
  safeArea = {},
  bottomNavHeight = 0,
  margin = 12,
}) {
  return chooseCompanionPosition({
    viewportWidth,
    viewportHeight,
    size,
    obstacles,
    preferredPositions,
    candidatePositions,
    safeArea,
    bottomNavHeight,
    margin,
  });
}

/** Validate a previously saved position; return null when it is obstructed or off-screen. */
export function validateCompanionPosition({ position, viewportWidth, viewportHeight, size, obstacles = [], safeArea = {}, bottomNavHeight = 0, margin = 12 }) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const { minX: left, minY: top, maxX, maxY } = getCompanionPositionBounds({ viewportWidth, viewportHeight, size, safeArea, margin, bottomNavHeight });
  const clamped = { x: clamp(position.x, left, maxX), y: clamp(position.y, top, maxY) };
  const visible = { x: 0, y: 0, width: size.width, height: size.height };
  const rect = { left: clamped.x, top: clamped.y, right: clamped.x + size.width, bottom: clamped.y + size.height };
  const hardOverlap = obstacles.reduce((sum, obstacle) => obstacle.soft ? sum : sum + intersectionArea(rect, obstacle) * (obstacle.weight || 1), 0);
  const offScreen = clamped.x < left || clamped.x > maxX || clamped.y < top || clamped.y > maxY;
  if (offScreen || hardOverlap >= 1) return null;
  return clamped;
}

/** Find a safe fixed position inside the usable viewport, away from measured content. */
export function chooseCompanionPosition({
  viewportWidth,
  viewportHeight,
  size,
  obstacles = [],
  preferredPositions = [],
  candidatePositions = [],
  safeArea = {},
  collisionBounds = null,
  margin = 12,
  bottomNavHeight = 0,
}) {
  const { minX: left, minY: top, maxX, maxY } = getCompanionPositionBounds({ viewportWidth, viewportHeight, size, safeArea, margin, bottomNavHeight });
  const clampPosition = (point) => ({
    x: clamp(point.x, left, maxX),
    y: clamp(point.y, top, maxY),
  });
  const visibleRect = (point) => {
    const visible = collisionBounds || { x: 0, y: 0, width: size.width, height: size.height };
    return { left: point.x + visible.x, top: point.y + visible.y, right: point.x + visible.x + visible.width, bottom: point.y + visible.y + visible.height };
  };
  const overlapAt = (point) => {
    const rect = visibleRect(point);
    return obstacles.reduce((sum, obstacle) => sum + intersectionArea(rect, obstacle) * (obstacle.weight || 1), 0);
  };
  const hardOverlapAt = (point) => {
    const rect = visibleRect(point);
    return obstacles.reduce((sum, obstacle) => obstacle.soft ? sum : sum + intersectionArea(rect, obstacle) * (obstacle.weight || 1), 0);
  };
  const isSafe = (point) => hardOverlapAt(point) < 1;

  for (const preferred of preferredPositions) {
    if (!preferred || !Number.isFinite(preferred.x) || !Number.isFinite(preferred.y)) continue;
    const point = clampPosition(preferred);
    if (isSafe(point) && overlapAt(point) < 1) return point;
  }

  const defaultPoint = { x: maxX, y: maxY };
  const candidates = [
    defaultPoint,
    { x: left, y: maxY },
    { x: maxX, y: top },
    { x: left, y: top },
    { x: maxX, y: clamp((top + maxY) / 2, top, maxY) },
    { x: left, y: clamp((top + maxY) / 2, top, maxY) },
    ...candidatePositions,
  ];

  // Include positions immediately outside cards and other measured regions. This
  // finds safe gaps between panels instead of limiting placement to four corners.
  for (const obstacle of obstacles) {
    const centerX = clamp((obstacle.left + obstacle.right - size.width) / 2, left, maxX);
    const centerY = clamp((obstacle.top + obstacle.bottom - size.height) / 2, top, maxY);
    candidates.push(
      { x: clamp(obstacle.left - size.width - margin, left, maxX), y: centerY },
      { x: clamp(obstacle.right + margin, left, maxX), y: centerY },
      { x: centerX, y: clamp(obstacle.top - size.height - margin, top, maxY) },
      { x: centerX, y: clamp(obstacle.bottom + margin, top, maxY) },
      { x: maxX, y: clamp(obstacle.top - size.height - margin, top, maxY) },
      { x: left, y: clamp(obstacle.top - size.height - margin, top, maxY) },
      { x: clamp(obstacle.left - size.width - margin, left, maxX), y: maxY },
      { x: clamp(obstacle.right + margin, left, maxX), y: maxY },
    );
  }

  let best = null;
  let bestWithoutTextOverlap = null;
  for (const candidate of candidates) {
    const point = clampPosition(candidate);
    const overlap = overlapAt(point);
    const hardOverlap = hardOverlapAt(point);
    const distanceFromDefault = Math.abs(point.x - defaultPoint.x) + Math.abs(point.y - defaultPoint.y);
    const cost = overlap + distanceFromDefault * 0.25;
    if (!best || cost < best.cost) best = { ...point, cost, overlap };
    if (isSafe(point)) {
      const safeCost = hardOverlap * 10000 + overlap + distanceFromDefault * 0.02;
      if (!bestWithoutTextOverlap || safeCost < bestWithoutTextOverlap.cost) bestWithoutTextOverlap = { ...point, cost: safeCost };
      if (overlap < 1) return point;
    }
  }

  // If the viewport is dense, search the remaining usable space for a clear
  // rectangle. Coarse steps keep scroll/resize reflows inexpensive, while the
  // final coordinates remain clamped to the exact measured safe bounds.
  const step = Math.max(16, Math.min(32, Math.floor(Math.min(size.width, size.height) / 5)));
  let nearestSafe = null;
  for (let y = top; y <= maxY; y += step) {
    for (let x = left; x <= maxX; x += step) {
      const point = clampPosition({ x, y });
      if (!isSafe(point)) continue;
      const distance = Math.abs(point.x - defaultPoint.x) + Math.abs(point.y - defaultPoint.y);
      const cost = overlapAt(point) + distance * 0.02;
      if (!nearestSafe || cost < nearestSafe.cost) nearestSafe = { ...point, cost };
    }
  }
  if (nearestSafe) return { x: nearestSafe.x, y: nearestSafe.y };
  if (bestWithoutTextOverlap) return { x: bestWithoutTextOverlap.x, y: bestWithoutTextOverlap.y };
  return { x: best.x, y: best.y };
}

/** Place a compact speech bubble near Bondhu while avoiding its body and a tour spotlight target. */
export function placeCompanionBubble({ viewportWidth, viewportHeight, launcher, bubble, target = null, obstacles = [], headerBottom = 0, preferredSide = null, margin = 12, gap = 14 }) {
  const width = Math.min(bubble.width, Math.max(180, viewportWidth - margin * 2));
  const height = Math.min(bubble.height, Math.max(120, viewportHeight - headerBottom - margin * 2));
  const bounds = { left: margin, right: viewportWidth - margin, top: Math.max(margin, headerBottom + margin), bottom: viewportHeight - margin };
  const centerX = launcher.left + launcher.width / 2;
  const centerY = launcher.top + launcher.height / 2;
  const options = [
    { side: "above", x: centerX - width / 2, y: launcher.top - height - gap, preference: 0 },
    { side: "left", x: launcher.left - width - gap, y: centerY - height / 2, preference: 1 },
    { side: "right", x: launcher.right + gap, y: centerY - height / 2, preference: 1 },
    { side: "below", x: centerX - width / 2, y: launcher.bottom + gap, preference: 2 },
  ];
  let best = null;
  for (const option of options) {
    const left = clamp(option.x, bounds.left, Math.max(bounds.left, bounds.right - width));
    const top = clamp(option.y, bounds.top, Math.max(bounds.top, bounds.bottom - height));
    const rect = { left, right: left + width, top, bottom: top + height };
    const displacement = Math.abs(left - option.x) + Math.abs(top - option.y);
    const sidePenalty = preferredSide && option.side !== preferredSide ? 2200 : 0;
    const contentOverlap = obstacles.reduce((sum, obstacle) => sum + intersectionArea(rect, obstacle) * (obstacle.weight || 1) * 10, 0);
    const cost = intersectionArea(rect, launcher) * 3 + intersectionArea(rect, target) * 5 + contentOverlap + displacement + option.preference * width * 0.025 + sidePenalty;
    if (!best || cost < best.cost) best = { left, top, width, height, side: option.side, cost };
  }
  return best;
}
