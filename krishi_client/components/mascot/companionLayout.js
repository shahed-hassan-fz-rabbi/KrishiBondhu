const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function intersectionArea(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

export function getCompanionPositionBounds({ viewportWidth, viewportHeight, size, safeArea = {}, margin = 12 }) {
  const left = Math.max(margin, (safeArea.left || 0) + (safeArea.left ? margin : 0));
  const top = Math.max(margin, (safeArea.top || 0) + (safeArea.top ? margin : 0));
  const right = Math.min(viewportWidth - margin, (safeArea.right ?? viewportWidth) - (safeArea.right < viewportWidth ? margin : 0));
  const bottom = Math.min(viewportHeight - margin, (safeArea.bottom ?? viewportHeight) - (safeArea.bottom < viewportHeight ? margin : 0));
  return {
    minX: left,
    minY: top,
    maxX: Math.max(left, right - size.width),
    maxY: Math.max(top, bottom - size.height),
  };
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
  margin = 12,
}) {
  const { minX: left, minY: top, maxX, maxY } = getCompanionPositionBounds({ viewportWidth, viewportHeight, size, safeArea, margin });
  const clampPosition = (point) => ({
    x: clamp(point.x, left, maxX),
    y: clamp(point.y, top, maxY),
  });
  const overlapAt = (point) => {
    const rect = { left: point.x, top: point.y, right: point.x + size.width, bottom: point.y + size.height };
    return obstacles.reduce((sum, obstacle) => sum + intersectionArea(rect, obstacle) * (obstacle.weight || 1), 0);
  };
  const isSafe = (point) => overlapAt(point) < 1;

  for (const preferred of preferredPositions) {
    if (!preferred || !Number.isFinite(preferred.x) || !Number.isFinite(preferred.y)) continue;
    const point = clampPosition(preferred);
    if (isSafe(point)) return point;
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
    );
  }

  let best = null;
  for (const candidate of candidates) {
    const point = clampPosition(candidate);
    const overlap = overlapAt(point);
    const distanceFromDefault = Math.abs(point.x - defaultPoint.x) + Math.abs(point.y - defaultPoint.y);
    const cost = overlap + distanceFromDefault * 0.25;
    if (!best || cost < best.cost) best = { ...point, cost, overlap };
    if (overlap < 1) return point;
  }
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
