import type { VisibleAreaSource } from "../editor";

export function createVisibleAreaSource(view: Window): VisibleAreaSource {
  const visual = view.visualViewport;
  if (visual == null) return createWindowFallback(view);
  return {
    read: () => ({
      left: visual.offsetLeft,
      top: visual.offsetTop,
      right: visual.offsetLeft + visual.width,
      bottom: visual.offsetTop + visual.height,
    }),
    subscribe: (onChange) => listenTo(visual, ["resize", "scroll"], onChange),
  };
}

function createWindowFallback(view: Window): VisibleAreaSource {
  return {
    read: () => ({
      left: 0,
      top: 0,
      right: view.innerWidth,
      bottom: view.innerHeight,
    }),
    subscribe: (onChange) => listenTo(view, ["resize"], onChange),
  };
}

function listenTo(
  target: EventTarget,
  events: readonly string[],
  listener: () => void,
): () => void {
  events.forEach((name) => target.addEventListener(name, listener));
  return () =>
    events.forEach((name) => target.removeEventListener(name, listener));
}
