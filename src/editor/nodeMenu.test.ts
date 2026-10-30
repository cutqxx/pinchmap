import { beforeEach, describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { NodeId } from "../model";
import type { HitTarget, ScreenPoint } from "../input";
import { NodeMenu, nodeMenuItems } from "./nodeMenu";
import type { NodeMenuActions, NodeMenuLabels } from "./nodeMenu";
import type { MenuItem } from "./emptySpaceMenu";

const MAP = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
]);
const LABELS: NodeMenuLabels = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", delete: "Удалить" };
const NODE_A: HitTarget = { kind: "node", nodeId: "a" };

let calls: string[];
let shownMenus: { items: readonly MenuItem[]; at: ScreenPoint }[];
let actions: NodeMenuActions;

beforeEach(() => {
  calls = [];
  shownMenus = [];
  actions = {
    addChildTo: (id) => void calls.push(`addChild:${id}`),
    addSiblingTo: (id) => void calls.push(`addSibling:${id}`),
    deleteNode: (id) => void calls.push(`delete:${id}`),
  };
});

describe("nodeMenuItems", () => {
  it("returns exactly addChild, addSibling, delete in that order with the injected labels", () => {
    const items = nodeMenuItems(MAP, "a", LABELS, actions);

    expect(items.map((item) => item.label)).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Удалить"]);
  });

  it("uses whatever labels are injected", () => {
    const items = nodeMenuItems(MAP, "a", { addChild: "x", addSibling: "y", delete: "z" }, actions);

    expect(items.map((item) => item.label)).toEqual(["x", "y", "z"]);
  });

  it.each([
    [0, "addChild:a"],
    [1, "addSibling:a"],
    [2, "delete:a"],
  ])("item %i calls only its action with the node id", (index, expectedCall) => {
    nodeMenuItems(MAP, "a", LABELS, actions)[index]?.onSelect();

    expect(calls).toEqual([expectedCall]);
  });

  it("calls nothing until an item is chosen", () => {
    nodeMenuItems(MAP, "a", LABELS, actions);

    expect(calls).toEqual([]);
  });
});

function newMenu(map = MAP): NodeMenu {
  const canvasElement = { getBoundingClientRect: () => ({ left: 10, top: 20 }) } as HTMLElement;
  return new NodeMenu({
    canvasElement,
    labels: LABELS,
    actions,
    getMap: () => map,
    showMenu: (items, at) => {
      calls.push("showMenu");
      shownMenus.push({ items, at });
    },
    commitPendingEdit: () => void calls.push("commit"),
    selectNode: (id: NodeId) => void calls.push(`select:${id}`),
  });
}

describe("NodeMenu", () => {
  it("commits a pending edit, then selects the node, then shows the menu", () => {
    newMenu().requestMenu(NODE_A, { x: 5, y: 6 });

    expect(calls).toEqual(["commit", "select:a", "showMenu"]);
  });

  it("shows the menu at the client point including the canvas offset", () => {
    newMenu().requestMenu(NODE_A, { x: 5, y: 6 });

    expect(shownMenus[0]?.at).toEqual({ x: 15, y: 26 });
  });

  it("offers the three node items for the pressed node", () => {
    newMenu().requestMenu(NODE_A, { x: 5, y: 6 });
    shownMenus[0]?.items[2]?.onSelect();

    expect(shownMenus[0]?.items.map((item) => item.label)).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Удалить"]);
    expect(calls).toContain("delete:a");
  });

  it.each<HitTarget>([{ kind: "canvas" }, { kind: "add-child", nodeId: "a" }, { kind: "add-sibling", nodeId: "a" }])(
    "does nothing for a $kind target",
    (target) => {
      newMenu().requestMenu(target, { x: 5, y: 6 });

      expect(calls).toEqual([]);
    },
  );

  it("shows no menu and selects nothing for a node missing from the map", () => {
    newMenu().requestMenu({ kind: "node", nodeId: "ghost" }, { x: 5, y: 6 });

    expect(shownMenus).toEqual([]);
    expect(calls).not.toContain("select:ghost");
  });
});
