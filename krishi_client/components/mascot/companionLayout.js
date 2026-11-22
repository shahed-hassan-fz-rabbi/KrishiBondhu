const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function intersectionArea(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

/** Place a compact speech bubble near Bondhu while avoiding its body and a tour spotlight target. */
export function placeCompanionBubble({ viewportWidth, viewportHeight, launcher, bubble, target = null, headerBottom = 0, preferredSide = null, margin = 12, gap = 14 }) {
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
    const cost = intersectionArea(rect, launcher) * 3 + intersectionArea(rect, target) * 5 + displacement + option.preference * width * 0.025 + sidePenalty;
    if (!best || cost < best.cost) best = { left, top, width, height, side: option.side, cost };
  }
  return best;
}
