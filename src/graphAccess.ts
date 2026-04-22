import type { App, TFile, WorkspaceLeaf } from "obsidian";

/** Narrow view of Obsidian’s internal graph renderer (undocumented; may break on upgrades). */
export type GraphNodeInternal = {
	id: string;
	circle?: { getGlobalPosition(): { x: number; y: number } };
};

export type GraphRendererInternals = {
	interactiveEl: HTMLElement;
	nodes: GraphNodeInternal[];
	/** Present on core graph AQ renderer — WebGL view canvas (sibling of interactiveEl). */
	px?: { view: HTMLCanvasElement };
};

export type GraphLeafView = {
	renderer: GraphRendererInternals;
	getViewType(): string;
};

/** Core graph / local graph leaf by view type only (DOM + toolbar); does not require renderer internals. */
export function isCoreGraphLeaf(leaf: WorkspaceLeaf | null): boolean {
	if (!leaf) return false;
	const vt = leaf.view.getViewType();
	return vt === "graph" || vt === "localgraph";
}

export function getGraphLeafView(leaf: WorkspaceLeaf | null): GraphLeafView | null {
	if (!leaf) return null;
	if (!isCoreGraphLeaf(leaf)) return null;
	const view = leaf.view as unknown as GraphLeafView;
	const r = view.renderer;
	if (!r?.interactiveEl || !Array.isArray(r.nodes)) return null;
	return view;
}

/** How {@link resolveGraphLeafDetailed} chose the graph leaf. */
export type GraphLeafResolution = "active" | "preferred" | "first" | "none";

/**
 * Pick a graph leaf to attach to: active if it is a graph, else reuse `preferred` if still a graph,
 * else first graph/local graph leaf. Fixes command-palette / split focus where activeLeaf is not the graph.
 */
export function resolveGraphLeafDetailed(
	app: App,
	preferred: WorkspaceLeaf | null,
): { leaf: WorkspaceLeaf | null; via: GraphLeafResolution } {
	const active = app.workspace.activeLeaf;
	if (getGraphLeafView(active)) return { leaf: active, via: "active" };
	if (preferred && getGraphLeafView(preferred)) return { leaf: preferred, via: "preferred" };
	let found: WorkspaceLeaf | null = null;
	app.workspace.iterateAllLeaves((leaf) => {
		if (!found && getGraphLeafView(leaf)) found = leaf;
	});
	return { leaf: found, via: found ? "first" : "none" };
}

export function resolveGraphLeafForTool(app: App, preferred: WorkspaceLeaf | null): WorkspaceLeaf | null {
	return resolveGraphLeafDetailed(app, preferred).leaf;
}

/**
 * Map graph node to viewport (client) coordinates for hit-testing against pointer paths.
 * Uses WebGL canvas backing-store size vs interactive canvas CSS box when available (Obsidian 1.12 + PIXI 7).
 */
export function nodeScreenPosition(
	node: GraphNodeInternal,
	interactiveEl: HTMLElement,
	pixiView: HTMLCanvasElement | null | undefined,
): { x: number; y: number } | null {
	if (!node.circle) return null;
	const nodePos = node.circle.getGlobalPosition();
	const b = interactiveEl.getBoundingClientRect();
	if (pixiView && pixiView.width > 0 && pixiView.height > 0) {
		const sx = b.width / pixiView.width;
		const sy = b.height / pixiView.height;
		return {
			x: nodePos.x * sx + b.left,
			y: nodePos.y * sy + b.top,
		};
	}
	const dpr = window.devicePixelRatio || 1;
	return {
		x: nodePos.x / dpr + b.left,
		y: nodePos.y / dpr + b.top,
	};
}

export function collectFileNodes(
	view: GraphLeafView,
	predicate: (pos: { x: number; y: number }, node: GraphNodeInternal) => boolean,
	resolveFile: (path: string) => TFile | null,
): TFile[] {
	const pixiView = view.renderer.px?.view;
	const seen = new Set<string>();
	const out: TFile[] = [];
	for (const node of view.renderer.nodes) {
		const pos = nodeScreenPosition(node, view.renderer.interactiveEl, pixiView);
		if (!pos || !predicate(pos, node)) continue;
		const f = resolveFile(node.id);
		if (f && !seen.has(f.path)) {
			seen.add(f.path);
			out.push(f);
		}
	}
	return out;
}
