import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_MIND_MAP, getNode, readRootPosition } from "../model";
import type { MindMap, NodeId } from "../model";
import type { HitTarget, ScreenPoint } from "../input";
import type { Camera } from "../viewport";
import { EmptySpaceMenu } from "./emptySpaceMenu";
import type { MenuItem } from "./emptySpaceMenu";

const CANVAS: HitTarget = { kind: "canvas" };
const NODE: HitTarget = { kind: "node", nodeId: "a" };

let camera: Camera;
let calls: string[];
let shownMenus: { items: readonly MenuItem[]; at: ScreenPoint }[];
let created: ((map: MindMap, id: NodeId) => MindMap)[];
let menu: EmptySpaceMenu;

beforeEach(() => {
  camera = { x: 0, y: 0, zoom: 1 };
  calls = [];
  shownMenus = [];
  created = [];
  const canvasElement = { getBoundingClientRect: () => ({ left: 10, top: 20 }) } as HTMLElement;
  menu = new EmptySpaceMenu({
    canvasElement,
    addNodeLabel: "Add node",
    resetMapLayoutLabel: "Reset map to auto-layout",
    getCamera: () => camera,
    showMenu: (items, at) => {
      calls.push("showMenu");
      shownMenus.push({ items, at });
    },
    commitPendingEdit: () => void calls.push("commit"),
    createNode: (command) => {
      calls.push("create");
      created.push(command);
    },
    resetMapLayout: () => void calls.push("resetMapLayout"),
  });
});

function createdRootPosition(index = 0): ReturnType<typeof readRootPosition> {
  const command = created[index];
  if (command === undefined) throw new Error("no node created");
  const map = command(EMPTY_MIND_MAP, "new");
  return readRootPosition(getNode(map, "new").state);
}

describe("EmptySpaceMenu.requestMenu", () => {
  it("shows the add-node and reset-map items at the client point of a canvas press", () => {
    menu.requestMenu(CANVAS, { x: 140, y: 240 });

    expect(shownMenus).toHaveLength(1);
    expect(shownMenus[0]?.items.map((item) => item.label)).toEqual(["Add node", "Reset map to auto-layout"]);
    expect(shownMenus[0]?.at).toEqual({ x: 150, y: 260 });
  });

  it("does nothing for a node target", () => {
    menu.requestMenu(NODE, { x: 140, y: 240 });

    expect(calls).toEqual([]);
  });

  it("does nothing for a plus-button target", () => {
    menu.requestMenu({ kind: "add-child", nodeId: "a" }, { x: 140, y: 240 });

    expect(calls).toEqual([]);
  });

  it("creates nothing until the item is chosen", () => {
    menu.requestMenu(CANVAS, { x: 140, y: 240 });

    expect(created).toEqual([]);
  });

  it("commits the pending edit before creating the node when the item is chosen", () => {
    menu.requestMenu(CANVAS, { x: 140, y: 240 });

    shownMenus[0]?.items[0]?.onSelect();

    expect(calls).toEqual(["showMenu", "commit", "create"]);
  });

  it("creates the root at the rounded map point computed when the menu was requested", () => {
    camera = { x: 0, y: 0, zoom: 1 };
    menu.requestMenu(CANVAS, { x: 140.6, y: 240.4 });
    camera = { x: 500, y: 500, zoom: 2 };

    shownMenus[0]?.items[0]?.onSelect();

    expect(createdRootPosition()).toEqual({ x: 141, y: 240 });
  });

  it("creates an empty-text root", () => {
    menu.requestMenu(CANVAS, { x: 1, y: 2 });
    shownMenus[0]?.items[0]?.onSelect();

    const map = created[0]?.(EMPTY_MIND_MAP, "new");

    expect(map === undefined ? null : getNode(map, "new")).toMatchObject({ text: "", parentId: null });
  });
});

describe("EmptySpaceMenu.addRootAt", () => {
  it("commits the pending edit and creates a root at the map point", () => {
    menu.addRootAt({ x: 90, y: 90 });

    expect(calls).toEqual(["commit", "create"]);
    expect(createdRootPosition()).toEqual({ x: 90, y: 90 });
  });

  it("uses the camera current at the time of the call", () => {
    camera = { x: 0, y: 0, zoom: 1 };
    menu.addRootAt({ x: 100, y: 100 });
    camera = { x: 50, y: 0, zoom: 2 };
    menu.addRootAt({ x: 100, y: 100 });

    expect(createdRootPosition(0)).toEqual({ x: 100, y: 100 });
    expect(createdRootPosition(1)).toEqual({ x: 25, y: 50 });
  });
});

describe("EmptySpaceMenu reset-map item", () => {
  it("commits the pending text edit and then resets the map layout", () => {
    menu.requestMenu(CANVAS, { x: 140, y: 240 });
    calls = [];

    shownMenus[0]?.items[1]?.onSelect();

    expect(calls).toEqual(["commit", "resetMapLayout"]);
  });

  it("creates no node", () => {
    menu.requestMenu(CANVAS, { x: 140, y: 240 });

    shownMenus[0]?.items[1]?.onSelect();

    expect(created).toEqual([]);
  });
});

describe("EmptySpaceMenu.close", () => {
  function menuWithHandle(): { menu: EmptySpaceMenu; closed: () => number } {
    let closes = 0;
    const withHandle = new EmptySpaceMenu({
      canvasElement: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } as HTMLElement,
      addNodeLabel: "Add node",
      resetMapLayoutLabel: "Reset map to auto-layout",
      getCamera: () => camera,
      showMenu: () => ({ close: () => void (closes += 1) }),
      commitPendingEdit: () => undefined,
      createNode: () => undefined,
      resetMapLayout: () => undefined,
    });
    return { menu: withHandle, closed: () => closes };
  }

  it("closes the menu that was opened by the request", () => {
    const { menu: opened, closed } = menuWithHandle();
    opened.requestMenu(CANVAS, { x: 1, y: 1 });

    opened.close();

    expect(closed()).toBe(1);
  });

  it("closes the menu only once however often it is called", () => {
    const { menu: opened, closed } = menuWithHandle();
    opened.requestMenu(CANVAS, { x: 1, y: 1 });

    opened.close();
    opened.close();

    expect(closed()).toBe(1);
  });

  it("does nothing when no menu was opened", () => {
    const { menu: unopened, closed } = menuWithHandle();

    unopened.close();

    expect(closed()).toBe(0);
  });

  it("does nothing when the host returns no handle", () => {
    menu.requestMenu(CANVAS, { x: 1, y: 1 });

    expect(() => menu.close()).not.toThrow();
  });
});
