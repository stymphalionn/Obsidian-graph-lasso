import { Component, ExtraButtonComponent, type App, type IconName, type WorkspaceLeaf } from "obsidian";
import { setIcon, setTooltip } from "obsidian";
import { isCoreGraphLeaf } from "./graphAccess";
import { findGraphControlsHost } from "./graphDom";
import type { GraphLassoSettings } from "./settings";

const PIN_CLASS = "graph-lasso-plugin-pin";
const SEP_CLASS = "graph-lasso-plugin-sep";
const HOST_MARK_CLASS = "graph-controls-graph-lasso";
const MOD_CLASS = "mod-graph-lasso";

export type GraphToolbarHost = {
	settings: GraphLassoSettings;
	saveSettings(): Promise<void>;
	/** Trigger the exact same toggle path as the command palette action. */
	requestToggleViaCommand(): void;
	selectionController: {
		readonly isToolActive: boolean;
		toggleTool(): void;
		refreshToolHint(): void;
		syncGraphChrome(): void;
	};
	logDebug?: (level: "info" | "verbose", event: string, detail?: Record<string, unknown>) => void;
};

function pinPresentation(
	isToolActive: boolean,
	shape: GraphLassoSettings["selectShape"],
): { icon: IconName; tooltip: string } {
	if (!isToolActive) {
		return {
			icon: "lasso-select" as IconName,
			tooltip: "Enable graph selection",
		};
	}
	if (shape === "marquee") {
		return {
			icon: "square" as IconName,
			tooltip: "Disable graph selection (rectangle)",
		};
	}
	return {
		icon: "lasso" as IconName,
		tooltip: "Disable graph selection (freehand lasso)",
	};
}

export function removeGraphLassoInjections(leaf: WorkspaceLeaf | null): void {
	if (!leaf) return;
	const view = leaf.view as { contentEl?: HTMLElement; containerEl: HTMLElement };
	for (const root of [view.contentEl, view.containerEl].filter(Boolean) as HTMLElement[]) {
		root.querySelectorAll(`.${PIN_CLASS}, .${SEP_CLASS}`).forEach((el) => el.remove());
	}
}

export function removeAllGraphLassoInjections(app: App): void {
	app.workspace.iterateAllLeaves((leaf) => removeGraphLassoInjections(leaf));
}

/**
 * Per-leaf toolbar child — matches `HOWTO-graph-toolbar-button.md` (Component + ExtraButtonComponent + host observer).
 */
export class GraphLassoLeafToolbar extends Component {
	private hostObserver: MutationObserver | null = null;
	private observedHost: HTMLElement | null = null;
	private inRefresh = false;

	constructor(
		private readonly leaf: WorkspaceLeaf,
		private readonly getToolbarHost: () => GraphToolbarHost,
	) {
		super();
	}

	onload(): void {
		this.refresh();
	}

	onunload(): void {
		this.hostObserver?.disconnect();
		this.hostObserver = null;
		this.observedHost = null;
		this.cleanupDom();
	}

	private cleanupDom(): void {
		const host = findGraphControlsHost(this.leaf);
		host?.querySelectorAll(`.${PIN_CLASS}, .${SEP_CLASS}`).forEach((n) => n.remove());
	}

	private attachHostObserver(): void {
		const host = findGraphControlsHost(this.leaf);
		if (!host) return;
		if (this.observedHost === host && this.hostObserver) return;

		this.hostObserver?.disconnect();
		this.observedHost = host;
		this.hostObserver = new MutationObserver(() => {
			if (!host.isConnected) {
				this.hostObserver?.disconnect();
				this.hostObserver = null;
				this.observedHost = null;
				return;
			}
			if (!this.inRefresh && !host.querySelector(`.${PIN_CLASS}`)) this.refresh();
		});
		this.hostObserver.observe(host, { childList: true });
	}

	/** HOWTO-style full rebuild: `<hr>` + `ExtraButtonComponent` on `.graph-controls`. */
	refresh(): void {
		if (!isCoreGraphLeaf(this.leaf) || this.leaf.isDeferred) return;

		const host = findGraphControlsHost(this.leaf);
		if (!host) return;

		this.inRefresh = true;
		try {
			host.addClass(HOST_MARK_CLASS);
			this.cleanupDom();

			const hr = host.createEl("hr");
			hr.addClass(SEP_CLASS);

			const toolbarHost = this.getToolbarHost();
			const { icon, tooltip } = pinPresentation(
				toolbarHost.selectionController.isToolActive,
				toolbarHost.settings.selectShape,
			);

			new ExtraButtonComponent(host)
				.setTooltip(tooltip, { placement: "top" })
				.setIcon(icon)
				.onClick(() => {
					const h = this.getToolbarHost();
					h.logDebug?.("info", "ui.pin-toggle", {
						willBecomeActive: !h.selectionController.isToolActive,
					});
					h.requestToggleViaCommand();
				})
				.then((c) => {
					c.extraSettingsEl.addClasses(["graph-controls-button", PIN_CLASS, MOD_CLASS]);
					c.extraSettingsEl.toggleClass("is-active", toolbarHost.selectionController.isToolActive);
				});

			toolbarHost.logDebug?.("info", "ui.pin-inserted", {
				viewType: this.leaf.view.getViewType(),
				hostClass: host.className,
				hostChildCount: host.children.length,
			});
		} finally {
			this.inRefresh = false;
		}

		this.attachHostObserver();
	}

	/** Update icon / tooltip when tool or shape changed without rebuilding the control. */
	syncPresentation(): void {
		if (!isCoreGraphLeaf(this.leaf) || this.leaf.isDeferred) return;
		const host = findGraphControlsHost(this.leaf);
		const pin = host?.querySelector(`.${PIN_CLASS}`) as HTMLElement | null;
		if (!pin) return;

		const toolbarHost = this.getToolbarHost();
		const { icon, tooltip } = pinPresentation(
			toolbarHost.selectionController.isToolActive,
			toolbarHost.settings.selectShape,
		);
		setIcon(pin, icon);
		setTooltip(pin, tooltip, { placement: "top" });
		pin.toggleClass("is-active", toolbarHost.selectionController.isToolActive);
	}

	/** Inject if missing; otherwise refresh presentation only. */
	syncOrRefresh(): void {
		if (!isCoreGraphLeaf(this.leaf) || this.leaf.isDeferred) return;
		const host = findGraphControlsHost(this.leaf);
		if (!host) return;
		if (!host.querySelector(`.${PIN_CLASS}`)) this.refresh();
		else this.syncPresentation();
	}
}
