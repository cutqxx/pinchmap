import type { Intent, WheelSample } from "./gestureRecognizer";

const WHEEL_ZOOM_SENSITIVITY = 0.002;

export function wheelToIntent(sample: WheelSample): Intent | null {
  if (sample.ctrlKey || sample.metaKey) return zoomIntent(sample);
  return panIntent(sample);
}

function zoomIntent(sample: WheelSample): Intent | null {
  if (sample.deltaY === 0) return null;
  return {
    type: "wheelZoom",
    center: { x: sample.x, y: sample.y },
    scaleDelta: Math.exp(-sample.deltaY * WHEEL_ZOOM_SENSITIVITY),
  };
}

function panIntent(sample: WheelSample): Intent | null {
  const horizontal = sample.shiftKey ? sample.deltaX || sample.deltaY : sample.deltaX;
  const vertical = sample.shiftKey ? 0 : sample.deltaY;
  if (horizontal === 0 && vertical === 0) return null;
  return { type: "wheelPan", dx: -horizontal, dy: -vertical };
}
