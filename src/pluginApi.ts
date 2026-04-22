import type { App, TFile } from "obsidian";
import type { GraphToolbarHost } from "./graphToolbar";
import type { GraphLassoSettings } from "./settings";

/** Narrow surface passed into `SelectionController` (avoids circular import with `main.ts`). */
export interface GraphLassoPluginApi {
	readonly app: App;
	/**
	 * Raw manifest.dir — **vault-relative** (e.g. `.obsidian/plugins/graph-lasso`).
	 * Resolve to an absolute disk path via `FileSystemAdapter.getBasePath()`
	 * before passing to `fs.*` calls (see `debugLog.ts`).
	 */
	readonly manifest: { dir?: string };
	settings: GraphLassoSettings;
	statusBarItem: HTMLElement;
	resolveGraphFile(path: string): TFile | null;
	saveSettings(): Promise<void>;

	/** HOWTO graph toolbar: host payload for `GraphLassoLeafToolbar`. */
	getGraphToolbarHost(): GraphToolbarHost;
	/** Staggered retries + rAF (layout timing). */
	scheduleGraphToolbarSync(): void;
	/** Enumerate `graph` / `localgraph` leaves and sync or create per-leaf toolbar components. */
	syncAllGraphToolbars(): void;
}
