# Pinchmap

[![Release](https://img.shields.io/github/v/release/cutqxx/pinchmap?include_prereleases&label=release)](https://github.com/cutqxx/pinchmap/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Obsidian](https://img.shields.io/badge/Obsidian-1.5%2B-7c3aed)
![Platforms](https://img.shields.io/badge/platforms-iPad%20%C2%B7%20iPhone%20%C2%B7%20desktop-555)

**Mind maps for Obsidian that live in plain Markdown — and feel just as good under a finger as under a mouse.**

A Pinchmap map is an ordinary `.md` note: a nested list plus a small hidden JSON block for layout. Open it as a map, pinch, drag and type; open it as Markdown and it is still a readable outline. Nothing is locked into a proprietary format, and the file survives any number of open → edit → save round trips without changing a byte outside the map (except the node IDs added to the map's own list items).

[Русская версия ниже ↓](#по-русски)

---

## Features

- **Markdown is the source of truth.** Every node is a list item with a stable `^id`. Text before and after the list, other lists and extra frontmatter fields are left untouched.
- **Touch and mouse are equal citizens.** Pan with one finger or the mouse wheel, pinch or Ctrl+wheel to zoom, long-press or right-click for menus, Apple Pencil works like a finger.
- **Fast editing.** Double-tap or double-click to edit text; `Tab` adds a child, `Enter` a sibling, `F2` edits, arrows navigate. On iPhone and iPad a **Done** button sits above the keyboard and the canvas scrolls the edited node into view.
- **Automatic layout with manual overrides.** Branches grow to the right (or left), multiple roots stack vertically. Drag any node to place it by hand, drop it onto another node to change its parent, or reset it back to auto-layout.
- **Collapse, colour, copy.** Fold branches with a descendant counter, colour nodes with the six Obsidian Canvas colours, copy a branch as a nested list, paste lists or plain lines from anywhere, duplicate branches.
- **Multi-select.** Draw a selection rectangle (mouse drag, or long-press then drag on touch), Shift/Cmd-click to add or remove nodes, drag the whole group at once.
- **Undo / redo** for every change, including group moves and pastes, as single steps.
- **Theme-aware.** Colours, fonts and menus come from your Obsidian theme. English and Russian UI.

## The file format

```markdown
---
mindmap: true
---
- Main topic ^a1b2c3
	- Subtopic ^d4e5f6
	  continuation of a multi-line node
	- Another subtopic ^g7h8i9
- Second root ^m3n4o5

%%
```json
{
"version": 1,
"nodes": {
"d4e5f6": {"x": 40, "y": -20, "collapsed": true, "color": "red"}
},
"style": {}
}
```
%%
```

Only nodes with their own state (manual position, collapsed, colour, side) appear in the JSON. If the JSON is missing or damaged, the map simply opens with automatic layout.

## Installation

Pinchmap is in beta and not yet in the community plugin directory. Install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable **BRAT** from Community plugins.
2. Run **BRAT: Add a beta plugin for testing** and enter `cutqxx/pinchmap`.
3. Enable **Pinchmap** in Community plugins.

BRAT works on iPad and iPhone too. Use **BRAT: Check for updates** to get new versions.

Manual install: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/cutqxx/pinchmap/releases) into `<vault>/.obsidian/plugins/pinchmap/`.

## Getting started

- **New map** — command palette or the ribbon button. Creates `Untitled.md` (`Без названия.md` in Russian UI) in your new-notes folder.
- **Convert this note to a map** — turns an existing note's first list into a map (adds `mindmap: true` and node IDs, nothing else).
- **Open as Markdown / Open as map** — switch views at any time.

## Controls

| Action | Touch (iPad / iPhone) | Mouse & keyboard |
| --- | --- | --- |
| Pan | one-finger drag | wheel (Shift + wheel for horizontal), Space + drag, middle-button drag |
| Zoom | pinch | Ctrl/Cmd + wheel, Ctrl/Cmd + `=` / `-`, Ctrl/Cmd + `0` to fit |
| Select node | tap | click |
| Edit text | double-tap | double-click, `F2` |
| Finish editing | **Done** button, tap outside | `Esc`, Ctrl/Cmd + `Enter`, click outside |
| Add child / sibling | **+** buttons | `Tab` / `Enter`, **+** buttons |
| Add root | double-tap empty space, or long-press empty space → **Add node** | double-click empty space, or right-click empty space → **Add node** |
| Reset map to auto-layout | long-press empty space → **Reset map to auto-layout** | right-click empty space → **Reset map to auto-layout**, or the command palette |
| Node menu | long-press node | right-click node |
| Move / reparent | drag node (drop on another node to reparent) | same with mouse |
| Collapse / expand | tap the toggle | click the toggle, Ctrl/Cmd + `/` |
| Copy / paste / duplicate | node menu | Ctrl/Cmd + `C` / `V` / `D` |
| Delete branch | node menu | `Delete` / `Backspace` (deleting the last node leaves one empty root) |
| Multi-select | long-press empty space, then drag | drag on empty space, Shift/Cmd + click |
| Undo / redo | two-finger tap / three-finger tap on the canvas, undo / redo buttons in the view header | Ctrl/Cmd + `Z` / Ctrl/Cmd + Shift + `Z` or `Y`, header buttons |

The long-press duration is configurable in the plugin settings (0.2–2.0 s).

## Development

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

The code is split into framework-free modules — `model`, `format`, `commands`, `layout`, `viewport`, `input`, `render`, `editor` — with only `src/obsidian/` touching the Obsidian API. Boundaries are enforced by ESLint (see `.claude/BOUNDARIES.md`), and the core logic is covered by ~3500 Vitest tests. Specs and the manual test checklist live in [`docs/`](docs).

Every push runs lint, the tests and the build. Only a push to `main` publishes: a GitHub release named after `manifest.json`'s version, which BRAT picks up. Other branches publish nothing. Bump the version to release new code: the workflow refuses to overwrite a release whose tag points at another commit.

## Roadmap

Phase 1 (this release) covers the core editor. Next phases, in order: rich nodes (rendered Markdown, links, images), performance on 1000-node maps (then submission to the community directory), embedding maps in notes, appearance presets, search, and export to PNG / SVG / PDF / clean Markdown. See [`docs/specs/pinchmap-discovery.md`](docs/specs/pinchmap-discovery.md).

## License

[MIT](LICENSE)

---

## По-русски

**Pinchmap** — mind map для Obsidian, который хранится в обычной Markdown-заметке и одинаково удобен пальцами на iPhone и iPad и мышью с клавиатурой на компьютере.

Карта — это вложенный список с `^id` у каждого пункта и скрытый JSON-блок с раскладкой. Откройте файл как Markdown — это всё ещё читаемый список. Текст вне карты и лишние поля frontmatter не меняются.

**Что умеет:**
- автораскладка, несколько root, ручные сдвиги и перенос ноды к другому родителю перетаскиванием;
- сворачивание веток со счётчиком, шесть цветов Obsidian Canvas;
- копирование ветки как вложенного списка, вставка списков и строк, дублирование;
- выделение рамкой и Shift/Cmd+клик, перемещение группы;
- отмена и повтор любых изменений одним шагом;
- интерфейс на русском и английском.

**Установка через BRAT:** установите плагин BRAT, выполните **BRAT: Add a beta plugin for testing**, введите `cutqxx/pinchmap` и включите Pinchmap. Обновления — **BRAT: Check for updates**.

**Начало работы:** команда «Новая карта», «Превратить эту заметку в карту», «Открыть как Markdown» / «Открыть как карту». Управление — в таблице выше: долгое нажатие на iPad соответствует правому клику на компьютере.

Чек-лист ручной проверки — [`docs/manual-testing.md`](docs/manual-testing.md).
