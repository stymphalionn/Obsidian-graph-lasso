# Graph Lasso

Obsidian **desktop** plugin: draw a **marquee** (rectangle) or **lasso** (freehand) on the **built-in** global/local graph, then **right-click** for batch actions on the selected notes.

Author: **Github/Stymphalionn** ([github.com/stymphalionn](https://github.com/stymphalionn))

## Usage

1. Open the **Graph** or **Local graph** view and focus that tab.
2. Turn on the tool: **command palette** → *Toggle graph select tool*, or enable **Show ribbon button** in settings.
3. A single **graph control** button is injected into `.graph-controls` (same strip as settings / timelapse, Extended Graph–style): **click toggles** the tool on/off. The **icon switches** (dashed lasso when off, filled lasso or square when on) to show state and the current **marquee vs lasso** mode.
4. **Drag** to select. **Mouse wheel** zooms the graph (forwarded to the graph canvas). Hold **Space** to pan through the overlay.
5. **Shift + drag** adds notes to the current selection (multiple marching-ants regions). **Alt + drag** subtracts notes inside the new region (red dashed outline for subtract shapes).
6. **Right-click** for **tags** (pick from tags on the selection), **find & replace** in note bodies (preview then apply), **create a `.base`** from the selection (Obsidian **Bases**), links, clipboard, delete, etc.
7. After a successful selection, a **white mask (default 5% opacity)** fills each additive region; **Escape** clears everything.

Default shape is **lasso**; change in **settings** or **command palette** (*Graph select: use marquee / lasso*).

## Settings

- **Show ribbon button** — optional left ribbon toggle (off by default; graph toolbar is primary).
- Mask opacity, lasso simplify, sequential-open delay.

## Touch

`touch-action: manipulation` helps trackpads; **Space** still bypasses the overlay for pan when needed.

## Develop

```bash
npm install
npm run dev
```

Copy `manifest.json`, `main.js`, and `styles.css` into `.obsidian/plugins/graph-lasso/` in your vault (or symlink), then reload Obsidian.

See [`OTHER_LASSO_TOOLS.md`](OTHER_LASSO_TOOLS.md) for how this compares to lasso/marquee tools elsewhere.

## Caveats

Uses **undocumented** graph internals (`view.renderer.nodes`, Pixi `circle` positions). A future Obsidian update may break selection until the plugin is updated.

**Graph toolbar** placement relies on finding a control whose label matches *Animate* / *timelapse*; if your Obsidian build’s DOM differs, the bar may fall back to the view header.

**Bases:** *Create .base from selection* writes YAML with `file.path == "…"` filters. Requires a recent Obsidian with **Bases**; empty or broken filters may need manual edit.

**Tags:** Remove only edits **YAML `tags:`** unless retag enables body `#tag` replace. **Find & replace** is literal / whole-word options—not full regex.

## License

MIT
