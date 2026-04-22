import { Notice, Plugin, TFile, type App, type IconName, type WorkspaceLeaf } from "obsidian";
import type { GraphLassoPluginApi } from "./pluginApi";
import type { DebugLogPlugin } from "./debugLog";
import { clearGraphLassoDebugLog, getGraphLassoDebugLogPath, logGraphLassoDebug } from "./debugLog";
import { GRAPH_LASSO_ICON_ID, registerGraphLassoIcon } from "./graphLassoIcon";
import { GraphLassoLeafToolbar, removeAllGraphLassoInjections, type GraphToolbarHost } from "./graphToolbar";
import { SelectionController } from "./selectionController";
import { DEFAULT_SETTINGS, GraphLassoSettingTab, type GraphLassoSettings } from "./settings";

/** `app.commands` exists at runtime; typings vary by `obsidian` package version. */
type AppCommands = App & { commands: { executeCommandById(id: string): boolean } };

/** Matches `HOWTO-graph-toolbar-button.md` staggered retries. */
const TOOLBAR_RETRY_MS = [0, 80, 350, 800, 2000, 3500] as const;

export default class GraphLassoPlugin extends Plugin implements GraphLassoPluginApi {
	settings: GraphLassoSettings = DEFAULT_SETTINGS;
	selectionController!: SelectionController;
	statusBarItem!: HTMLElement;
	private ribbonIconRef: HTMLElement | null = null;
	private readonly graphToolbarBars = new Map<WorkspaceLeaf, GraphLassoLeafToolbar>();
	private readonly toolbarRetryTimerIds: number[] = [];

	/** Ensure command/ribbon toggles and toolbar button use the same sync path. */
	private toggleToolAndSyncChrome(): void {
		this.selectionController.toggleTool();
		this.scheduleGraphToolbarSync();
	}

	async onload() {
		registerGraphLassoIcon();
		await this.loadSettings();
		this.selectionController = new SelectionController(this);
		this.statusBarItem = this.addStatusBarItem();
		this.refreshRibbonIcon();

		const debugPlugin = (): DebugLogPlugin => this as unknown as DebugLogPlugin;

		this.addCommand({
			id: "toggle-graph-select-tool",
			name: "Toggle graph select tool (marquee/lasso)",
			callback: () => {
				logGraphLassoDebug(debugPlugin(), "info", "command.toggle-graph-select-tool", {});
				this.toggleToolAndSyncChrome();
			},
		});

		this.addCommand({
			id: "graph-select-use-marquee",
			name: "Use marquee selection (rectangle)",
			callback: async () => {
				logGraphLassoDebug(debugPlugin(), "info", "command.shape", { shape: "marquee" });
				this.settings.selectShape = "marquee";
				await this.saveSettings();
				this.selectionController.refreshToolHint();
				this.scheduleGraphToolbarSync();
				new Notice("Graph selection shape: marquee");
			},
		});

		this.addCommand({
			id: "graph-select-use-lasso",
			name: "Use lasso selection (freehand)",
			callback: async () => {
				logGraphLassoDebug(debugPlugin(), "info", "command.shape", { shape: "lasso" });
				this.settings.selectShape = "lasso";
				await this.saveSettings();
				this.selectionController.refreshToolHint();
				this.scheduleGraphToolbarSync();
				new Notice("Graph selection shape: lasso");
			},
		});

		this.addCommand({
			id: "debug-toggle-file-log",
			name: "Toggle debug log to file",
			callback: async () => {
				this.settings.debugLogToFile = !this.settings.debugLogToFile;
				await this.saveSettings();
				logGraphLassoDebug(debugPlugin(), "info", "debug.setting", {
					debugLogToFile: this.settings.debugLogToFile,
				});
				new Notice(
					this.settings.debugLogToFile
						? "Appending to debug.log. Use 'Copy debug log path' then tail -f."
						: "Debug log to file disabled.",
				);
			},
		});

		this.addCommand({
			id: "debug-copy-log-path",
			name: "Copy debug log path",
			callback: async () => {
				const p = getGraphLassoDebugLogPath(debugPlugin());
				if (!p) {
					new Notice("Plugin directory unknown; could not resolve debug.log path.");
					return;
				}
				try {
					await navigator.clipboard.writeText(p);
					new Notice(`Copied debug log path:\n${p}`);
				} catch {
					new Notice(`Debug log path (copy manually):\n${p}`);
				}
			},
		});

		this.addCommand({
			id: "debug-clear-log",
			name: "Clear debug log file",
			callback: () => {
				const ok = clearGraphLassoDebugLog(debugPlugin());
				new Notice(ok ? "debug.log cleared." : "Could not clear debug.log.");
			},
		});

		this.addSettingTab(new GraphLassoSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				logGraphLassoDebug(debugPlugin(), "verbose", "workspace.active-leaf-change", {
					active: this.app.workspace.getActiveFile()?.path ?? null,
				});
				this.selectionController.tryAttach();
				this.scheduleGraphToolbarSync();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				logGraphLassoDebug(debugPlugin(), "verbose", "workspace.layout-change", {});
				this.selectionController.tryAttach();
				this.scheduleGraphToolbarSync();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("resize", () => {
				this.scheduleGraphToolbarSync();
			}),
		);
		this.app.workspace.onLayoutReady(() => {
			window.setTimeout(() => this.scheduleGraphToolbarSync(), 50);
		});
		this.scheduleGraphToolbarSync();
		if (this.settings.debugLogToFile) {
			logGraphLassoDebug(debugPlugin(), "info", "plugin.load", { version: this.manifest.version });
		}
	}

	getGraphToolbarHost(): GraphToolbarHost {
		return {
			settings: this.settings,
			saveSettings: () => this.saveSettings(),
			/** Run the palette-registered toggle so logging + behavior match hotkeys / Command Palette. */
			requestToggleViaCommand: () => {
				const cmdId = `${this.manifest.id}:toggle-graph-select-tool`;
				const ran = (this.app as AppCommands).commands.executeCommandById(cmdId);
				if (!ran) {
					logGraphLassoDebug(this as unknown as DebugLogPlugin, "info", "ui.toolbar-toggle-fallback", {
						cmdId,
					});
					this.toggleToolAndSyncChrome();
				}
			},
			selectionController: this.selectionController,
			logDebug: (level, event, detail) =>
				logGraphLassoDebug(this as unknown as DebugLogPlugin, level, event, detail),
		};
	}

	scheduleGraphToolbarSync(): void {
		for (const id of this.toolbarRetryTimerIds) window.clearTimeout(id);
		this.toolbarRetryTimerIds.length = 0;
		for (const ms of TOOLBAR_RETRY_MS) {
			this.toolbarRetryTimerIds.push(window.setTimeout(() => this.syncAllGraphToolbars(), ms));
		}
		requestAnimationFrame(() => {
			this.syncAllGraphToolbars();
			requestAnimationFrame(() => this.syncAllGraphToolbars());
		});
	}

	syncAllGraphToolbars(): void {
		const wanted = new Set<WorkspaceLeaf>();
		for (const vt of ["graph", "localgraph"] as const) {
			for (const leaf of this.app.workspace.getLeavesOfType(vt)) {
				if (leaf.isDeferred) continue;
				wanted.add(leaf);
				let bar = this.graphToolbarBars.get(leaf);
				if (!bar) {
					bar = new GraphLassoLeafToolbar(leaf, () => this.getGraphToolbarHost());
					this.graphToolbarBars.set(leaf, bar);
					leaf.view.addChild(bar);
				} else {
					bar.syncOrRefresh();
				}
			}
		}
		for (const [leaf, bar] of [...this.graphToolbarBars.entries()]) {
			if (!wanted.has(leaf)) {
				try {
					leaf.view.removeChild(bar);
				} catch {
					/* leaf may be gone */
				}
				this.graphToolbarBars.delete(leaf);
			}
		}
	}

	/** Add/remove ribbon icon when setting changes. */
	refreshRibbonIcon(): void {
		if (this.settings.showRibbonButton) {
			if (!this.ribbonIconRef) {
				this.ribbonIconRef = this.addRibbonIcon(GRAPH_LASSO_ICON_ID as IconName, "Toggle graph select tool", () => {
					this.toggleToolAndSyncChrome();
				});
			}
		} else if (this.ribbonIconRef) {
			this.ribbonIconRef.remove();
			this.ribbonIconRef = null;
		}
	}

	onunload(): void {
		for (const id of this.toolbarRetryTimerIds) window.clearTimeout(id);
		this.toolbarRetryTimerIds.length = 0;
		for (const [leaf, bar] of [...this.graphToolbarBars.entries()]) {
			try {
				leaf.view.removeChild(bar);
			} catch {
				/* ignore */
			}
		}
		this.graphToolbarBars.clear();

		this.selectionController.suspendChromeSync();
		this.selectionController.setToolActive(false);
		this.selectionController.detach();
		removeAllGraphLassoInjections(this.app);
		if (this.ribbonIconRef) {
			this.ribbonIconRef.remove();
			this.ribbonIconRef = null;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<GraphLassoSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	resolveGraphFile(path: string): TFile | null {
		const af = this.app.vault.getAbstractFileByPath(path);
		return af instanceof TFile ? af : null;
	}
}
