# Архитектура Pinchmap, фаза 1 (MVP)

> Входные документы: `docs/specs/pinchmap-phase-1-spec.md`, `.claude/BOUNDARIES.md`, `docs/specs/pinchmap-discovery.md`.
> Решения Р-1 … Р-7 в конце документа ждут подтверждения разработчика.

## Architecture

**Pattern**: модульные папки по `BOUNDARIES.md` в стиле «функциональное ядро, императивная оболочка». Это не гексагональная архитектура: портов и интерфейсов нет. Есть одна граница с хостом — объект колбэков, который `obsidian/` передаёт в `editor/`.

**Start with**: чистые модули `model/`, `format/`, `commands/`, `layout/` и `viewport/` без DOM и без Obsidian. Распознаватель жестов в `input/` — чистый автомат, к DOM его подключает тонкий адаптер. `render/` и `editor/` работают с обычным DOM без UI-фреймворка (Р-2). `obsidian/` — тонкий слой: плагин, `TextFileView`, команды, настройки, буфер обмена, меню.

**Key boundaries**:
- **Obsidian API** — импортирует только `src/obsidian/`. Остальные модули получают от него данные и колбэки.
- **Файл ↔ модель** — `format/`. Это главный риск порчи данных, поэтому здесь самое плотное покрытие unit-тестами и golden-фикстурами.
- **DOM-измерения ↔ раскладка**. Размеры нод измеряет `render/`, `layout/` получает их как `Map<NodeId, Size>`. Так раскладка остаётся чистой и тестируемой.
- **События устройства ↔ намерения** — `input/`. Адаптер DOM → `PointerSample`, дальше чистый `GestureRecognizer` → `Intent`.

**Dependency direction**: строго по `BOUNDARIES.md`: `model` ← `format` / `commands` / `layout`; `viewport` и `input` ни от чего не зависят; `render` → `model`, `layout`, `viewport`; `editor` → всё перечисленное; `obsidian` → всё. Обратных импортов нет. Каждый модуль отдаёт наружу только свой `index.ts`, глубокие импорты между модулями запрещены линтером.

---

### 1. Каркас проекта

| Что | Решение | Почему |
|---|---|---|
| Пакетный менеджер | **npm** (Р-6) | Так в официальном `obsidian-sample-plugin`, его понимают BRAT-инструкции и ревьюеры каталога |
| Сборка | **esbuild** по `esbuild.config.mjs` из sample plugin: вход `src/obsidian/main.ts` → `main.js` в корне, `format: "cjs"`, `target: "es2018"`; `external`: `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` и встроенные модули Node; sourcemap inline только в dev | Стандарт для плагинов Obsidian |
| TypeScript | `strict: true`, `noUncheckedIndexedAccess: true`, `isolatedModules: true`, `moduleResolution: "bundler"`, `lib: ["DOM", "ES2020"]`, `noEmit` (проверка типов через `tsc -noEmit -skipLibCheck`) | Строгость дешевле всего ввести с первого дня |
| Тесты | **Vitest**, по умолчанию `environment: "node"`; для DOM-адаптеров — `// @vitest-environment happy-dom` в заголовке файла | Быстро, нативный TS, фейковые таймеры для debounce и долгого нажатия |
| Где лежат тесты | рядом с кодом: `*.test.ts`; фикстуры формата в `src/format/__fixtures__/*.md` | Модуль и его тесты меняются вместе |
| Линтер | ESLint (flat config): `no-restricted-imports` запрещает `obsidian` везде, кроме `src/obsidian/**`; для каждого модуля override с разрешёнными соседями по `BOUNDARIES.md`; запрещены встроенные модули Node (`fs`, `path`, `electron`) — плагин мобильный, `isDesktopOnly: false` | Границы проверяет машина, а не ревью |
| Метаданные | `manifest.json` (`id: "pinchmap"`, `isDesktopOnly: false`), `versions.json`, `version-bump.mjs`, `styles.css` в корне | Нужны для BRAT и каталога |

**Как тестировать без Obsidian.** Пакет `obsidian` на npm содержит только типы, рантайма в нём нет. Случайный импорт `obsidian` в тестируемом коде упадёт в Vitest — страховка вдобавок к линтеру. Код из `obsidian/`, который нужно покрыть unit-тестами (debounce автосохранения), пишется в файле без импорта `obsidian`, например `src/obsidian/autosave.ts`: правило границ касается импорта пакета, а не папки. Остальное в `obsidian/` проверяется вручную.

**Как держать `obsidian/` тонким.** В `obsidian/` нет логики решений. `MapView` только переводит «текст файла ↔ `format.parse/serialize`», создаёт `MapEditor` и передаёт ему колбэки хоста:

```ts
interface MapHost {
  onMapChanged(): void;                 // → debounced save
  showMenu(items: MenuItem[], at: ScreenPoint): void;   // → obsidian Menu
  readClipboard(): Promise<string>;     // slice 16
  writeClipboard(text: string): void;   // slice 16
  notify(message: string): void;        // → new Notice()
}
```

Поля добавляются только тогда, когда их требует срез. В Slice 1 нужен только `onMapChanged`.

**Dev-цикл.** `npm run dev` запускает esbuild в режиме watch. Папка репозитория подключается симлинком в тестовое хранилище как `.obsidian/plugins/pinchmap`, для перезагрузки — плагин Hot Reload. На iPad сборка попадает через синхронизацию хранилища, позже — через BRAT из GitHub Release.

---

### 2. Технология отрисовки (Р-1)

**Рекомендация: DOM-ноды и SVG-связи в одном «мировом» слое, который двигается CSS-трансформацией.**

```
div.pinchmap-canvas            (touch-action:none; overflow:hidden; ловит события)
└─ div.pinchmap-world          (transform: translate(x,y) scale(z); transform-origin:0 0)
   ├─ svg.pinchmap-edges       (overflow:visible; path на каждую связь)
   └─ div.pinchmap-node[data-node-id]   (position:absolute; left/top из layout; max-width:300px; white-space:pre-wrap)
```

Почему так:
- **Ввод текста в ноде.** Обычный `<textarea>` поверх ноды внутри мирового слоя. Каретка, выделение, автокоррекция, IME и диктовка на iOS работают нативно.
- **Markdown в фазе 2.** `MarkdownRenderer.render` Obsidian рисует в `HTMLElement`, то есть прямо в div ноды. В чистом SVG нужен `foreignObject` с известными багами в WebKit/iOS; в Canvas2D рендер Markdown фактически невозможен.
- **Тема Obsidian.** CSS-переменные (`--background-primary`, `--color-red`, …) применяются напрямую.
- **Перенос по словам и ширина 300 px** даются браузером. Размеры измеряются через `offsetWidth/offsetHeight`, на них трансформация не влияет.
- **Перемещение и зум.** Одна запись `transform` у мирового слоя без перераскладки — композитная операция на GPU. На время жеста `will-change: transform`, после окончания снимается (иначе на iOS текст при 400 % мыльный).
- **Отсечение невидимого в фазе 3.** Элементы нод в `Map<NodeId, HTMLElement>`; отцеплять элементы и пути вне `viewport.visibleRect` (с запасом), размеры остаются в кэше.
- **Экспорт в фазе 7** — отдельная генерация из `layout` и стилей.

Цена: связи и ноды в двух технологиях (SVG и DOM); мелкий текст при отдалении рендерится браузером — для 200 нод приемлемо, проверяется гипотезой H1.

**Порядок кадра**: сначала все записи (текст, классы), потом все чтения (размеры), потом расчёт раскладки, потом все записи позиций. `render/` — запись и чтение, `layout/` — расчёт.

**Без UI-фреймворка (Р-2).** Вручную рисуются только ноды, связи, «+», индикатор свёртывания и рамка. Меню — `Menu` из Obsidian, кнопки Undo/Redo — `view.addAction()` в шапке вида.

---

### 3. Обработка ввода

**Только Pointer Events** (`pointerdown/move/up/cancel`) с `setPointerCapture`, плюс `wheel`, `keydown/keyup` и `contextmenu` (только для мыши).

Структура `input/`:
- `domPointerSource.ts` — тонкий адаптер: события контейнера → `PointerSample { pointerId, kind: 'touch'|'mouse', x, y, time, button, buttons, modifiers, target }`. `pen` → `'touch'`. `target` из `event.target.closest('[data-pinchmap-hit]')`: `{ kind: 'node'|'add-child'|'add-sibling'|'collapse'|'canvas', nodeId? }`.
- `gestureRecognizer.ts` — чистый автомат: `PointerSample`/`WheelSample` → `Intent` (`tap`, `doubleTap`, `longPress`, `dragStart/dragMove/dragEnd` с порогом 8 px, `pan`, `pinch { center, scaleDelta }`, `twoFingerTap`, `threeFingerTap`, `marquee…`). Таймеры — `setTimeout`, в тестах `vi.useFakeTimers()`. Длительность долгого нажатия — в конфиге.
- `keymap.ts` — чистая функция `(KeyChord, mode: 'navigate'|'editing') → Intent | null`.

Попадание по нажатию — DOM-цель (точна для «+» и индикатора). Цель перетаскивания (Slice 13) и рамка (Slice 17) — геометрия из `layout/`: `nodeAt(mapPoint)`, `nodesInside(rect)`.

**Конфликты жестов iOS и Obsidian (H2), учесть с Slice 1 и проверить в Slice 5:**
- `touch-action: none` на `.pinchmap-canvas`.
- Боковые панели Obsidian на мобильных: `touchstart/touchmove` через `registerDomEvent` с `{ passive: false }`, `stopPropagation()`, для `touchmove` ещё `preventDefault()`. Спайк H2; запасной вариант — capture-фаза на контейнере вида.
- `gesturestart/gesturechange` (WebKit): `preventDefault()`.
- `-webkit-user-select: none; -webkit-touch-callout: none` на канвасе (не на `<textarea>` во время ввода).
- `pointercancel` сбрасывает автомат без намерений.
- Тап тремя пальцами — системный undo в iOS, возможно, не отключается; запасной путь — кнопки Undo/Redo в шапке. Риск H2.
- ПК: щипок на тачпаде = `wheel` с `ctrlKey`; Shift+колесо: при `deltaX === 0` брать `deltaY` как горизонталь; средняя кнопка — `preventDefault` на `pointerdown` (автопрокрутка Windows); пробел для перемещения отслеживается в автомате.
- Горячие клавиши: `keydown` на контейнере вида (`tabIndex = 0`) и `Scope` вида для Ctrl/Cmd-сочетаний. Перехват Ctrl/Cmd+0/=/− — спайк в Slice 11.

---

### 4. Состояние, команды, undo и поток обновлений

**Модель (Р-3).** Нормализованная неизменяемая модель:

```ts
type NodeId = string;
interface MapNode { readonly id: NodeId; readonly text: string; readonly parentId: NodeId | null;
  readonly childIds: readonly NodeId[]; readonly collapsed: boolean;
  readonly pinnedPosition?: Point; readonly color?: ColorName; readonly side?: 'left'; }
interface MindMap { readonly rootIds: readonly NodeId[]; readonly nodes: ReadonlyMap<NodeId, MapNode>; }
```

`parentId` и `childIds` меняются только через функции `model/`; у `model/` есть тест на инвариант согласованности.

**ID.** У каждой ноды в памяти всегда есть ID. `format/` при разборе выдаёт 6-символьный ID пунктам без `^id` и запоминает, что он ещё не записан. При первом сохранении с изменениями он дописывается в строку. Простановка ID не попадает в undo, открытие без правок файл не меняет.

**Без потерь.** `parseMapFile(text) → { map, source }`. `source` — непрозрачный `SourceLayout`: frontmatter, текст до и после списка, сырые строки каждого пункта по `NodeId`, единица отступа, положение JSON-блока. `serializeMapFile(map, source) → text` выводит исходные строки пункта байт в байт, если текст, глубина и ID не менялись, иначе пишет строку заново с отступом файла.

**Команды (Р-4).** Чистые функции `(map, args, ctx) → MindMap`; `ctx` — генератор ID. Undo/redo — снимки: `History { push(previous), undo(current), redo(current), canUndo, canRedo, clear() }`, глубина ограничена (≈200). Одна сессия ввода — одна запись: при входе запоминаем `base`, при завершении один `history.push(base)`. Новая нода, оставленная пустой, — `base` восстанавливается, в историю ничего не пишется.

**Что зависит от раскладки, решает `editor/`.** Сторону новой ветки первого уровня `editor` берёт из `layout.chooseSideForNewBranch(layoutResult, rootId)` и передаёт аргументом в команду.

**Поток обновлений (`editor/mapEditor.ts`):**

```
intent (input) ─► editor: map' = command(map)  [+ history.push]  ─► host.onMapChanged() ─► autosave (1 c debounce)
                         │
                         └► scheduleFrame()  (requestAnimationFrame)
                               1. render.syncContent(map, ui)
                               2. sizes = render.measure(dirtyIds)
                               3. layout = computeLayout(map, sizes)
                               4. render.place(layout, ui)
camera change (pan/zoom) ─► render.setCamera(camera)   // только transform
```

`ui` — `{ selection, editingId, dropTargetId, marquee }` из `editor/`.

**Сохранение и внешние изменения (`obsidian/`).** `MapView extends TextFileView`: `setViewData(data)` → `parseMapFile`, `getViewData()` → `serializeMapFile`. Свой `createDebouncedSave(save, 1000)` из `autosave.ts` (встроенный `requestSave` ≈2 с). При `onClose`/`onUnloadFile` отложенное сохранение выполняется принудительно. Перечитывание при изменении извне — через `setViewData`; поведение проверить спайком в Slice 3.

**Открытие файлов с `mindmap: true` (Р-5).** Патч `WorkspaceLeaf.prototype.setViewState` через `monkey-around` (как Kanban и Excalidraw): при `frontmatter.mindmap === true` и без флага «открыть как Markdown» подставляется тип `pinchmap-view`. Патч снимается в `onunload`.

---

### 5. Дерево исходников и файлы для Slice 1

```
package.json  tsconfig.json  esbuild.config.mjs  vitest.config.ts  eslint.config.mjs
manifest.json  versions.json  version-bump.mjs  styles.css  .gitignore (main.js, node_modules)
src/
  model/      index.ts, mindMap.ts, nodeId.ts, mindMap.test.ts
  format/     index.ts, parseMapFile.ts, serializeMapFile.ts, sourceLayout.ts, frontmatter.ts,
              parseMapFile.test.ts, roundTrip.test.ts, __fixtures__/
  commands/   index.ts, setNodeText.ts, setNodeText.test.ts
  layout/     index.ts, computeLayout.ts, computeLayout.test.ts
  render/     index.ts, mapRenderer.ts, edgePath.ts
  input/      index.ts, gestureRecognizer.ts, domPointerSource.ts, gestureRecognizer.test.ts
  editor/     index.ts, mapEditor.ts, textEditSession.ts
  obsidian/   main.ts, mapView.ts, openMapFiles.ts, autosave.ts, autosave.test.ts
```

`viewport/` появляется в Slice 5; до этого `render/` ставит мировой слой со статическим сдвигом. Поздние модули заранее не создаются. `render/` в MVP unit-тестами не покрывается (критерии ручные), кроме чистых помощников (`edgePath.ts`).

Соглашения: CSS-классы с префиксом `pinchmap-`; в `render/` и `editor/` — чистые DOM API через `container.ownerDocument`, без хелперов Obsidian и глобального `document`.

---

## Evolution Triggers

- H1 не подтвердилась (200 нод на iPad дёргаются) → раньше срока ввести отсечение невидимого.
- Открытие или правка большой карты упирается в `computeLayout` → кэшировать габариты по веткам, пересчитывать только изменённую ветку и предков (фаза 3).
- Рендер Markdown или картинок (фаза 2) → внедряемый `renderNodeContent(el, text): Promise<void>` в `MapRenderer`.
- Снимки undo на 1000 нодах нагружают память → хранение изменений (patch/inverse) только в `History`.
- `mapEditor.ts` > ~300 строк → выделить `selection.ts`, `navigation.ts`, `dragController.ts`, `menus.ts` внутри `editor/`.
- `GestureRecognizer` обрастает флагами режимов → явный автомат состояний с таблицей переходов.
- Второй потребитель отрисовки (встраивание, фаза 4) → режим только для чтения в `MapRenderer`.
- Регулярные сборки для BRAT → GitHub Action, собирающая релиз по тегу.
- Перед каталогом (после фазы 3) → `eslint-plugin-obsidianmd` и сверка с правилами плагинов.

## Slice Order

Порядок срезов менять не нужно. Перенести три критерия, зависящие от более поздних срезов:

| Критерий | Сейчас в | Зависит от | Перенести в |
|---|---|---|---|
| Проверка H1: перемещение и зум без рывков | Slice 4 | перемещение и зум из Slice 5 | конец Slice 5 |
| После перезагрузки извне история undo/redo пуста | Slice 3 | `History` из Slice 10 | Slice 10 |
| Пункты «Копировать», «Вставить», «Дублировать» в порядке меню | Slice 15 | операции буфера из Slice 16 | Slice 16 |

Опционально (Р-7 б): поднять Slice 5 сразу после Slice 1 для ранней проверки H1 и H2 на iPad.

## Спайки

- Перечитывает ли `TextFileView` файл при изменении извне и как отличает собственную запись (Slice 3).
- Гасит ли `stopPropagation` на touch-событиях свайп боковых панелей Obsidian на iPad (Slice 5, H2).
- Можно ли перехватить Ctrl/Cmd+0/=/− раньше зума интерфейса Obsidian (Slice 11).

## Решения, которые нужно подтвердить разработчику

- **Р-1. Отрисовка:** (а) DOM-ноды + SVG-связи + CSS-трансформация · (б) чистый SVG · (в) Canvas2D + DOM-слой для ввода
- **Р-2. UI-фреймворк:** (а) без фреймворка · (б) Svelte/Preact
- **Р-3. Модель:** (а) нормализованная `Map<NodeId, MapNode>` · (б) вложенное дерево
- **Р-4. Undo:** (а) снимки неизменяемого состояния · (б) объекты-команды do/undo
- **Р-5. Открытие карт:** (а) патч `setViewState` через `monkey-around` · (б) событие `file-open`
- **Р-6. Пакетный менеджер:** (а) npm · (б) pnpm
- **Р-7. Порядок срезов:** (а) без изменений + перенос трёх критериев · (б) то же + Slice 5 сразу после Slice 1 · (в) всё как есть
