import { isJsonObject, listNodesInDocumentOrder } from "../model";
import type { JsonObject, JsonValue, MindMap, NodeId, NodeState } from "../model";
import { findLastJsonBlock } from "./jsonBlockLocation";
import type { BlockRange } from "./jsonBlockLocation";

export type JsonStatus = "absent" | "readable" | "corrupt";

export type JsonLocation = "head" | "tail";

export interface JsonSource {
  readonly status: JsonStatus;
  readonly location: JsonLocation;
  readonly range: BlockRange | null;
  readonly extras: JsonObject;
  readonly lineEnding: string;
}

export interface ReadJson {
  readonly source: JsonSource;
  readonly states: ReadonlyMap<NodeId, NodeState>;
}

interface StatefulNode {
  readonly id: NodeId;
  readonly state: NodeState;
}

const NODES_KEY = "nodes";
const DEFAULT_VERSION = 1;
const DEFAULT_EXTRAS: JsonObject = { version: DEFAULT_VERSION, style: {} };

export function detectLineEnding(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function readJson(text: string, lineEnding: string, location: JsonLocation = "tail"): ReadJson {
  const located = findLastJsonBlock(text);
  if (located === null) {
    return unreadableJson("absent", lineEnding);
  }
  const parsed = parseJsonObject(located.body);
  if (parsed === null || !hasValidNodes(parsed)) {
    return unreadableJson("corrupt", lineEnding);
  }
  const { [NODES_KEY]: nodes, ...extras } = parsed;
  return {
    source: { status: "readable", location, range: located.range, extras, lineEnding },
    states: collectNodeStates(nodes),
  };
}

export function withJsonBlock(body: string, tail: string, map: MindMap, json: JsonSource): string {
  const statefulNodes = listStatefulNodes(map);
  const hasBlockToWrite = json.status !== "absent" || statefulNodes.length > 0;
  if (!hasBlockToWrite) return body + tail;
  const block = renderJsonBlock(statefulNodes, json);
  if (json.status === "readable" && json.range !== null) {
    return body + replaceRange(tail, json.range, block);
  }
  return appendBlock(body + tail, block, json.lineEnding);
}

export function withJsonBlockInHead(head: string, rest: string, map: MindMap, json: JsonSource): string {
  if (json.range === null) return head + rest;
  const block = renderJsonBlock(listStatefulNodes(map), json);
  return replaceRange(head, json.range, block) + rest;
}

function unreadableJson(status: "absent" | "corrupt", lineEnding: string): ReadJson {
  return { source: { status, location: "tail", range: null, extras: DEFAULT_EXTRAS, lineEnding }, states: new Map() };
}

function parseJsonObject(body: string): JsonObject | null {
  try {
    const value: unknown = JSON.parse(body);
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

function hasValidNodes(parsed: JsonObject): boolean {
  return parsed[NODES_KEY] === undefined || isJsonObject(parsed[NODES_KEY]);
}

function collectNodeStates(nodes: JsonValue | undefined): Map<NodeId, NodeState> {
  const states = new Map<NodeId, NodeState>();
  if (!isJsonObject(nodes)) return states;
  for (const [id, state] of Object.entries(nodes)) {
    if (isJsonObject(state) && Object.keys(state).length > 0) states.set(id, state);
  }
  return states;
}

function listStatefulNodes(map: MindMap): StatefulNode[] {
  return listNodesInDocumentOrder(map).flatMap(({ node }) =>
    node.state === undefined ? [] : [{ id: node.id, state: node.state }],
  );
}

function renderJsonBlock(nodes: readonly StatefulNode[], json: JsonSource): string {
  const { version = DEFAULT_VERSION, ...otherFields } = json.extras;
  const fields: string[][] = [
    [`"version": ${JSON.stringify(version)}`],
    renderNodesField(nodes),
    ...Object.entries(otherFields).map(([key, value]) => [`${JSON.stringify(key)}: ${JSON.stringify(value)}`]),
  ];
  const lines = ["%%", "```json", "{", ...joinWithCommas(fields), "}", "```", "%%"];
  return lines.join(json.lineEnding);
}

function renderNodesField(nodes: readonly StatefulNode[]): string[] {
  if (nodes.length === 0) return [`"${NODES_KEY}": {}`];
  const entries = nodes.map(({ id, state }) => [`${JSON.stringify(id)}: ${JSON.stringify(state)}`]);
  return [`"${NODES_KEY}": {`, ...joinWithCommas(entries), "}"];
}

function joinWithCommas(groups: readonly (readonly string[])[]): string[] {
  return groups.flatMap((group, groupIndex) => {
    const isLastGroup = groupIndex === groups.length - 1;
    return group.map((line, lineIndex) => (lineIndex === group.length - 1 && !isLastGroup ? `${line},` : line));
  });
}

function replaceRange(tail: string, range: BlockRange, block: string): string {
  const replaced = tail.slice(range.start, range.end);
  const closingEnding = /\r?\n$/.exec(replaced)?.[0] ?? "";
  return tail.slice(0, range.start) + block + closingEnding + tail.slice(range.end);
}

function appendBlock(text: string, block: string, lineEnding: string): string {
  const terminated = text === "" || text.endsWith("\n") ? text : text + lineEnding;
  const endsWithBlankLine = terminated === "" || /(^|\n)\r?\n$/.test(terminated);
  return terminated + (endsWithBlankLine ? "" : lineEnding) + block + lineEnding;
}
