import type { WorkspaceLeaf } from "obsidian";

/**
 * Graph UI lives under ItemView.contentEl; some builds/layouts only populate controls there.
 * Extended Graph and similar code use contentEl for `.graph-controls` queries.
 */
export function getGraphDomRoot(leaf: WorkspaceLeaf): HTMLElement {
	const view = leaf.view as { containerEl: HTMLElement; contentEl?: HTMLElement };
	return view.contentEl ?? view.containerEl;
}

/** Search roots for the timelapse strip: inner content first (Extended Graph pattern), then full leaf container. */
export function getGraphDomSearchRoots(leaf: WorkspaceLeaf): HTMLElement[] {
	const view = leaf.view as { containerEl: HTMLElement; contentEl?: HTMLElement };
	const roots: HTMLElement[] = [];
	if (view.contentEl) roots.push(view.contentEl);
	if (view.containerEl && view.containerEl !== view.contentEl) roots.push(view.containerEl);
	return roots.length ? roots : [view.containerEl];
}

function firstMatch(root: HTMLElement, selectors: string[]): HTMLElement | null {
	for (const sel of selectors) {
		const el = root.querySelector(sel);
		if (el) return el as HTMLElement;
	}
	return null;
}

/** Horizontal icon strip (settings, animate, …). */
export function findGraphControlStrip(root: HTMLElement): HTMLElement | null {
	const strip = firstMatch(root, [
		".graph-controls",
		".view-content .graph-controls",
		".workspace-leaf-content .graph-controls",
		".view-header .graph-controls",
	]);
	if (strip) return strip;

	const header = root.querySelector(".view-header");
	if (header) {
		const inHeader = header.querySelector(".graph-controls");
		if (inHeader) return inHeader as HTMLElement;
		const actions = header.querySelector(".view-actions");
		if (actions?.querySelector(".graph-controls-button")) return actions as HTMLElement;
	}

	return null;
}

/** True if the element plausibly paints to the screen (non‑zero box, not display:none, etc.). */
export function isGraphControlLikelyVisible(el: HTMLElement): boolean {
	const r = el.getBoundingClientRect();
	if (r.width < 2 || r.height < 2) return false;
	const cs = getComputedStyle(el);
	if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false;
	return true;
}

function collectTimelapseAnchors(root: HTMLElement): HTMLElement[] {
	const seen = new Set<HTMLElement>();
	const add = (sel: string) => {
		root.querySelectorAll(sel).forEach((n) => seen.add(n as HTMLElement));
	};
	/* Prefer explicit graph control buttons; `.mod-animate` alone can appear in duplicate trees. */
	add(".graph-controls-button.mod-animate");
	add("button.graph-controls-button.mod-animate");
	if (seen.size === 0) {
		add("button.mod-animate");
		add(".clickable-icon.mod-animate");
	}
	return [...seen];
}

function scoreTimelapseAnchor(el: HTMLElement): number {
	let s = 0;
	if (isGraphControlLikelyVisible(el)) s += 1_000_000;
	/**
	 * Obsidian keeps a **collapsed** `.graph-controls.is-close` (filters accordion) that still contains
	 * clone‑like control nodes in the DOM; the **visible** gear / timelapse stack lives in a different
	 * subtree. Deprioritize anchors inside the closed panel so we attach next to the wand you actually see.
	 */
	if (el.closest(".graph-controls.is-close")) s -= 750_000;
	const r = el.getBoundingClientRect();
	s += Math.min(r.width * r.height, 50_000);
	return s;
}

function pickBestTimelapseAnchor(candidates: HTMLElement[]): HTMLElement | null {
	const first = candidates[0];
	if (!first) return null;
	let best = first;
	let bestScore = scoreTimelapseAnchor(best);
	for (let i = 1; i < candidates.length; i++) {
		const c = candidates[i];
		if (!c) continue;
		const sc = scoreTimelapseAnchor(c);
		if (sc > bestScore) {
			best = c;
			bestScore = sc;
		}
	}
	return best;
}

function pickBestGraphControlButton(root: HTMLElement): HTMLElement | null {
	const buttons = Array.from(root.querySelectorAll(".graph-controls-button")) as HTMLElement[];
	if (buttons.length === 0) return null;
	const first = buttons[0];
	if (!first) return null;
	let best = first;
	let bestScore = scoreTimelapseAnchor(best);
	for (let i = 1; i < buttons.length; i++) {
		const c = buttons[i];
		if (!c) continue;
		const sc = scoreTimelapseAnchor(c);
		if (sc > bestScore) {
			best = c;
			bestScore = sc;
		}
	}
	return best;
}

/**
 * Canonical graph toolbar host per `HOWTO-graph-toolbar-button.md`:
 * **`view.contentEl.querySelector(".graph-controls")` first**, then `containerEl` fallback.
 * Do not pick among duplicate hosts by heuristics — that can attach to the wrong panel.
 */
export function findGraphControlsHost(leaf: WorkspaceLeaf): HTMLElement | null {
	const view = leaf.view as { contentEl?: HTMLElement; containerEl: HTMLElement };
	return (
		(view.contentEl?.querySelector(".graph-controls") as HTMLElement | null) ??
		(view.containerEl.querySelector(".graph-controls") as HTMLElement | null)
	);
}

/**
 * Element to insert after (sibling order). Parent should be the icon row.
 * @deprecated Prefer {@link findGraphToolbarAnchorForLeaf}; kept for single-root call sites.
 */
export function findGraphToolbarAnchor(root: HTMLElement): { anchor: HTMLElement; parent: HTMLElement } | null {
	return findGraphToolbarAnchorInRoot(root);
}

function findGraphToolbarAnchorInRoot(root: HTMLElement): { anchor: HTMLElement; parent: HTMLElement } | null {
	let anchor: HTMLElement | null = pickBestTimelapseAnchor(collectTimelapseAnchors(root));

	if (!anchor) anchor = pickBestGraphControlButton(root);

	if (!anchor) {
		const actions = root.querySelector(".view-header .view-actions") ?? root.querySelector(".view-actions");
		if (actions?.lastElementChild) anchor = actions.lastElementChild as HTMLElement;
	}

	const parent = anchor?.parentElement;
	if (!anchor || !parent) return null;
	return { anchor, parent };
}

/**
 * Search the **entire graph leaf** (`containerEl`). Do not stop at the first `.graph-controls` match in
 * `contentEl` — that is often the **collapsed** filters panel; the live timelapse button lives elsewhere.
 */
export function findGraphToolbarAnchorForLeaf(leaf: WorkspaceLeaf): { anchor: HTMLElement; parent: HTMLElement } | null {
	return findGraphToolbarAnchorInRoot(leaf.view.containerEl);
}

/** Left panel: Filters / Groups / Display / Forces accordion. */
export function findGraphControlsSectionsRoot(root: HTMLElement): HTMLElement | null {
	return firstMatch(root, [
		".graph-controls-sections",
		".graph-controls .graph-controls-sections",
		".view-content .graph-controls-sections",
	]);
}
