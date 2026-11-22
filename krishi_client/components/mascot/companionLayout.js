const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function intersectionArea(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

/** Find the least obstructive fixed position for the floating companion. */
export function chooseCompanionPosition({ viewportWidth, viewportHeight, size, obstacles = [], margin = 12 }) {
  const maxX = Math.max(margin, viewportWidth - size.width - margin);
  const maxY = Math.max(margin, viewportHeight - size.height - margin);
  const candidates = [
    { x: maxX, y: maxY, preference: 0 },
    { x: margin, y: maxY, preference: 1 },
    { x: maxX, y: margin + 58, preference: 1.2 },
    { x: margin, y: margin + 58, preference: 1.4 },
    { x: maxX, y: clamp((viewportHeight - size.height) / 2, margin, maxY), preference: 1.8 },
  ];
  let best = null;
  for (const candidate of candidates) {
    const rect = { left: candidate.x, top: candidate.y, right: candidate.x + size.width, bottom: candidate.y + size.height };
    const overlap = obstacles.reduce((sum, obstacle) => sum + intersectionArea(rect, obstacle) * (obstacle.weight || 1), 0);
    const cost = overlap + candidate.preference * 1000;
    if (!best || cost < best.cost) best = { x: candidate.x, y: candidate.y, cost };
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
