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
const LABELS: NodeMenuLabels = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", color: "Цвет", noColor: "Без цвета", colorNames: { red: "Красный", orange: "Оранжевый", yellow: "Жёлтый", green: "Зелёный", cyan: "Бирюзовый", purple: "Фиолетовый" }, collapse: "Свернуть", expand: "Развернуть", resetLayout: "Сброс", delete: "Удалить" };
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
    setColor: (id, color) => void calls.push(`color:${id}:${color}`),
    toggleCollapse: (id) => void calls.push(`toggleCollapse:${id}`),
    resetNodeLayout: (id) => void calls.push(`reset:${id}`),
    deleteNode: (id) => void calls.push(`delete:${id}`),
  };
});

describe("nodeMenuItems", () => {
  it("returns exactly addChild, addSibling, delete in that order with the injected labels", () => {
    const items = nodeMenuItems(MAP, "a", LABELS, actions);

    expect(items.map((item) => item.label)).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Цвет", "Удалить"]);
  });

  it("uses whatever labels are injected", () => {
    const items = nodeMenuItems(MAP, "a", { addChild: "x", addSibling: "y", color: "k", noColor: "n", colorNames: { red: "1", orange: "2", yellow: "3", green: "4", cyan: "5", purple: "6" }, collapse: "c", expand: "e", resetLayout: "r", delete: "z" }, actions);

    expect(items.map((item) => item.label)).toEqual(["x", "y", "k", "z"]);
  });

  it.each([
    [0, "addChild:a"],
    [1, "addSibling:a"],
    [3, "delete:a"],
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

describe("nodeMenuItems collapse item", () => {
  const PARENT = buildMindMap([
    { id: "r1", text: "Root", parentId: null },
    { id: "a", text: "A", parentId: "r1", state: { x: 5, y: 5 } },
    { id: "a1", text: "A1", parentId: "a" },
  ]);
  const COLLAPSED_PARENT = buildMindMap([
    { id: "r1", text: "Root", parentId: null },
    { id: "a", text: "A", parentId: "r1", state: { x: 5, y: 5, collapsed: true } },
    { id: "a1", text: "A1", parentId: "a" },
  ]);

  it("offers Collapse for an expanded node with children, between sibling and reset items", () => {
    const labels = nodeMenuItems(PARENT, "a", LABELS, actions).map((item) => item.label);

    expect(labels).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Цвет", "Свернуть", "Сброс", "Удалить"]);
  });

  it("offers Expand instead of Collapse for a collapsed node", () => {
    const labels = nodeMenuItems(COLLAPSED_PARENT, "a", LABELS, actions).map((item) => item.label);

    expect(labels).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Цвет", "Развернуть", "Сброс", "Удалить"]);
  });

  it("offers no collapse item for a node without children", () => {
    const labels = nodeMenuItems(PARENT, "a1", LABELS, actions).map((item) => item.label);

    expect(labels).not.toContain("Свернуть");
    expect(labels).not.toContain("Развернуть");
  });

  it("toggles the node when the collapse item is chosen", () => {
    nodeMenuItems(PARENT, "a", LABELS, actions)[3]?.onSelect();

    expect(calls).toEqual(["toggleCollapse:a"]);
  });
});

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
    shownMenus[0]?.items[3]?.onSelect();

    expect(shownMenus[0]?.items.map((item) => item.label)).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Цвет", "Удалить"]);
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

describe("nodeMenuItems colour submenu", () => {
  const COLOUR_LABELS = ["Красный", "Оранжевый", "Жёлтый", "Зелёный", "Бирюзовый", "Фиолетовый", "Без цвета"];
  const TREE = buildMindMap([
    { id: "r1", text: "Root", parentId: null, state: { color: "red" } },
    { id: "a", text: "A", parentId: "r1" },
    { id: "b", text: "B", parentId: "r1", state: { color: "cyan" } },
    { id: "odd", text: "Odd", parentId: "r1", state: { color: "magenta" } },
  ]);

  function submenuOf(map: typeof TREE, id: string): readonly MenuItem[] {
    const submenu = nodeMenuItems(map, id, LABELS, actions)[2]?.submenu;
    if (submenu === undefined) throw new Error("Color has no submenu");
    return submenu;
  }

  function checkedLabels(map: typeof TREE, id: string): string[] {
    return submenuOf(map, id).filter((item) => item.isChecked === true).map((item) => item.label);
  }

  it("offers the six colours in order and then no colour", () => {
    expect(submenuOf(TREE, "a").map((item) => item.label)).toEqual(COLOUR_LABELS);
  });

  it("puts the submenu on the Color item, which does nothing by itself", () => {
    const color = nodeMenuItems(TREE, "a", LABELS, actions)[2];

    color?.onSelect();

    expect(color?.label).toBe("Цвет");
    expect(calls).toEqual([]);
  });

  it("offers no submenu on the other items", () => {
    const others = nodeMenuItems(TREE, "a", LABELS, actions).filter((item) => item.label !== "Цвет");

    expect(others.map((item) => item.submenu)).toEqual(others.map(() => undefined));
  });

  it.each([
    [0, "red"],
    [1, "orange"],
    [2, "yellow"],
    [3, "green"],
    [4, "cyan"],
    [5, "purple"],
    [6, "undefined"],
  ])("submenu item %i sets colour %s on the node", (index, expected) => {
    submenuOf(TREE, "a")[index]?.onSelect();

    expect(calls).toEqual([`color:a:${expected}`]);
  });

  it("checks no-colour only, when the node has no own colour", () => {
    expect(checkedLabels(TREE, "a")).toEqual(["Без цвета"]);
  });

  it("does not check the inherited colour", () => {
    expect(checkedLabels(TREE, "a")).not.toContain("Красный");
  });

  it("checks only the node's own colour", () => {
    expect(checkedLabels(TREE, "b")).toEqual(["Бирюзовый"]);
  });

  it("checks no-colour for an unknown stored value", () => {
    expect(checkedLabels(TREE, "odd")).toEqual(["Без цвета"]);
  });

  it("marks every entry as either checked or unchecked", () => {
    expect(submenuOf(TREE, "b").map((item) => typeof item.isChecked)).toEqual(COLOUR_LABELS.map(() => "boolean"));
  });

  it("keeps the full order with every optional item present", () => {
    const full = buildMindMap([
      { id: "r1", text: "Root", parentId: null },
      { id: "a", text: "A", parentId: "r1", state: { x: 1, y: 2 } },
      { id: "a1", text: "A1", parentId: "a" },
    ]);

    expect(nodeMenuItems(full, "a", LABELS, actions).map((item) => item.label)).toEqual([
      "Добавить дочернюю", "Добавить соседнюю", "Цвет", "Свернуть", "Сброс", "Удалить",
    ]);
  });
});
