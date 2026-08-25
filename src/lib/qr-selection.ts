export type Point = { x: number; y: number };
export type Selection = { start: Point; end: Point };
export type ImageRect = { x: number; y: number; width: number; height: number };

export function selectionToImageRect(
  selection: Selection,
  display: { width: number; height: number },
  image: { width: number; height: number },
): ImageRect {
  if (display.width <= 0 || display.height <= 0 || image.width <= 0 || image.height <= 0) {
    throw new Error("Screenshot dimensions must be positive.");
  }

  const left = clamp(Math.min(selection.start.x, selection.end.x), 0, display.width);
  const top = clamp(Math.min(selection.start.y, selection.end.y), 0, display.height);
  const right = clamp(Math.max(selection.start.x, selection.end.x), 0, display.width);
  const bottom = clamp(Math.max(selection.start.y, selection.end.y), 0, display.height);
  const scaleX = image.width / display.width;
  const scaleY = image.height / display.height;
  const x = Math.floor(left * scaleX);
  const y = Math.floor(top * scaleY);

  return {
    x,
    y,
    width: Math.max(1, Math.ceil(right * scaleX) - x),
    height: Math.max(1, Math.ceil(bottom * scaleY) - y),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
