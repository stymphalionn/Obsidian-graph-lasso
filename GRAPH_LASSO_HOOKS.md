# Graph Lasso — internal hook notes (21Apr26)

Spike source: read-only review of [Extended Graph](https://github.com/ElsaTam/obsidian-extended-graph) (`src/helpers/graph.ts`, `src/pluginInstances.ts`, `src/ui/radialMenu.ts`). **No GPL code was copied**; this file documents behavior only.

## Finding the graph view

- `WorkspaceLeaf.view.getViewType()` is `"graph"` (global) or `"localgraph"` (local).
- Cast `leaf.view` to a narrow shape with `renderer` and engine accessors used by Extended Graph:
  - Global: `(view as GraphView).dataEngine` (not used by this plugin for hit-testing).
  - Local: `(view as LocalGraphView).engine`.

## Node identity and positions

- `view.renderer` is the graph renderer (Pixi-backed in Obsidian).
- `view.renderer.nodes` is an array of node objects; each has **`id`** (vault path / node key for files).
- Screen placement for hit-testing uses **`node.circle.getGlobalPosition()`** plus **`interactiveEl.getBoundingClientRect()`**.
- **Obsidian 1.12+ / PIXI 7:** the renderer exposes **`renderer.px.view`** (WebGL canvas). Map buffer coords to viewport with  
  `(nodePos.x * (b.width / pixiView.width) + b.left)` (same for `y`). If `px.view` is missing, fall back to dividing by `devicePixelRatio` once (older builds).

## Overlay attachment

- Overlay is **appended directly to** `renderer.interactiveEl` (set `position: relative` when needed) and framed local `0,0` to that element (`syncOverlayFrame`) — avoids wrapper drift and prevents covering **`.graph-controls`** (v0.4.9 hard fix).

## Risk

- All of the above is **undocumented public API**; Obsidian may rename `renderer`, `nodes`, or Pixi shapes at any time. The plugin degrades when `renderer.nodes` is missing or nodes lack `circle`.

## Post-selection chrome (v0.2+)

- After a non-empty note selection, an **SVG layer** draws **normalized** marquee/lasso geometry so it can survive `ResizeObserver` rescales.
- **Fill:** `rgba(255,255,255, selectionMaskOpacity)` (default **0.05**) on **additive** regions only.
- **Outline:** dual dashed strokes (`--text-normal` + `--background-primary`) with SVG `<animate stroke-dashoffset>` for **marching ants**; **subtract** regions use red/orange dashes, no fill.

## v0.3 — Toolbar, wheel, modifiers

- **Graph UI (v0.4.7+):** [`GraphLassoLeafToolbar`](src/graphToolbar.ts) — per-leaf [`Component`](https://docs.obsidian.md/Reference/TypeScript+API/Component) with `leaf.view.addChild`, **`ExtraButtonComponent`**, host = [`findGraphControlsHost`](src/graphDom.ts): **all** `.graph-controls` under the leaf, scored by visibility + visible `.graph-controls-button` children, **penalty** for `.is-close` (collapsed filters), so the pin lands on the **visible** strip—not only `contentEl`’s first match (often hidden). See [`HOWTO-graph-toolbar-button.md`](../HOWTO-graph-toolbar-button.md). Plugin keeps `Map<WorkspaceLeaf, GraphLassoLeafToolbar>`, `getLeavesOfType("graph"|"localgraph")`, staggered retries, `resize`, `onLayoutReady`. **One control**; icons: off `lasso-select`, on + lasso `lasso`, on + marquee `square`. **`is-close`** CSS in [`styles.css`](styles.css).
- **Ribbon:** [`graphLassoIcon.ts`](src/graphLassoIcon.ts) exports **`lasso`** for `addRibbonIcon`; `registerGraphLassoIcon()` is a no-op (built-in Lucide only).
- **Attach target:** [`resolveGraphLeafForTool`](src/graphAccess.ts) uses **active graph leaf** if focused, else the **last attached** graph leaf, else the **first** graph leaf — so the tool still attaches after the command palette when a graph tab stays open in a split.
- **Zoom:** `wheel` on the overlay is `preventDefault`’d and re-dispatched as a `WheelEvent` on `renderer.interactiveEl` so the graph zooms while the tool is on.
- **Shift / Alt:** second (and later) gestures merge file sets; chrome keeps an array of regions with `subtract: true` for Alt strokes.

## Debug log (v0.3.5+)

- **Settings:** “Debug log to file” / “Verbose debug”, or command **Graph Lasso: Toggle debug log to file**.
- **File:** `<vault>/.obsidian/plugins/graph-lasso/debug.log` (append, plain text).
- **CLI:** Command palette → **Graph Lasso: Copy debug log path** → `tail -f "<path>"`.
- **Events (info):** `plugin.load`, `tool.set`, `tryAttach.*`, `gesture.complete`, `menu.open`, `debug.setting`.
- **Events (verbose):** `ui.syncGraphLassoUi*`, `tryAttach.reuse`, `overlay.detachOverlayOnly` (needs Verbose debug).

## `.base` export (v0.3+)

- Minimal YAML matching vault samples: `views[].filters.or[]` with entries `file.path == "relative/path.md"`. Spiked from Obsidian UI–exported `.base` files (table view + `filters.or` list).
