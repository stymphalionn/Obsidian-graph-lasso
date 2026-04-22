import { App, PluginSettingTab, Setting } from "obsidian";
import type GraphLassoPlugin from "./main";

export interface GraphLassoSettings {
	/** Marquee axis-aligned rectangle vs freehand lasso */
	selectShape: "marquee" | "lasso";
	/** Pause between files when opening sequentially */
	sequentialDelayMs: number;
	/** RDP epsilon for lasso simplification (pixels) */
	lassoSimplifyEpsilon: number;
	/** White mask opacity inside the finished selection (0–1). */
	selectionMaskOpacity: number;
	/** Show ribbon icon; in-graph toolbar is primary when the tool is on. */
	showRibbonButton: boolean;
	/** Append trigger lines to `<plugin>/debug.log` for `tail -f` in a terminal. */
	debugLogToFile: boolean;
	/** Include high-frequency events (e.g. every graph UI sync, leaf resolution). */
	debugVerbose: boolean;
}

export const DEFAULT_SETTINGS: GraphLassoSettings = {
	selectShape: "lasso",
	sequentialDelayMs: 350,
	lassoSimplifyEpsilon: 8,
	selectionMaskOpacity: 0.05,
	showRibbonButton: false,
	debugLogToFile: false,
	debugVerbose: false,
};

export class GraphLassoSettingTab extends PluginSettingTab {
	plugin: GraphLassoPlugin;

	constructor(app: App, plugin: GraphLassoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("Selection").setHeading();

		new Setting(containerEl)
			.setName("Selection shape")
			.setDesc("While the select tool is on, drag draws this shape. Use commands to switch quickly.")
			.addDropdown((d) =>
				d
					.addOption("marquee", "Marquee (rectangle)")
					.addOption("lasso", "Lasso (freehand)")
					.setValue(this.plugin.settings.selectShape)
					.onChange(async (v) => {
						this.plugin.settings.selectShape = v as GraphLassoSettings["selectShape"];
						await this.plugin.saveSettings();
						this.plugin.selectionController?.refreshToolHint();
					}),
			);

		new Setting(containerEl)
			.setName("Sequential open delay (ms)")
			.setDesc("Delay between opens when using “open all sequentially”.")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(this.plugin.settings.sequentialDelayMs));
				t.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!Number.isNaN(n)) {
						this.plugin.settings.sequentialDelayMs = n;
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName("Lasso simplify (px)")
			.setDesc("Higher values simplify the drawn loop before hit-testing (smoother, less precise).")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(this.plugin.settings.lassoSimplifyEpsilon));
				t.onChange(async (v) => {
					const n = parseFloat(v);
					if (!Number.isNaN(n)) {
						this.plugin.settings.lassoSimplifyEpsilon = n;
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName("Show ribbon button")
			.setDesc("Graph toolbar appears on the graph pane when the tool is on; enable this for a left-ribbon shortcut too.")
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.showRibbonButton).onChange(async (v) => {
					this.plugin.settings.showRibbonButton = v;
					await this.plugin.saveSettings();
					this.plugin.refreshRibbonIcon();
				}),
			);

		new Setting(containerEl).setName("Debugging").setHeading();
		const configPath = `${this.app.vault.configDir}/plugins/graph-lasso/debug.log`;
		new Setting(containerEl)
			.setName("Debug log to file")
			.setDesc(
				`Append events to debug.log next to this plugin. In a terminal: tail -f ".../${configPath}". Use command "Copy debug log path".`,
			)
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.debugLogToFile).onChange(async (v) => {
					this.plugin.settings.debugLogToFile = v;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Verbose debug")
			.setDesc("Log workspace UI syncs and leaf-resolution detail (noisy). Requires debug log to file.")
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.debugVerbose).onChange(async (v) => {
					this.plugin.settings.debugVerbose = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Selection mask opacity")
			.setDesc("White fill inside the finished selection (marching-ants region). 0.05 = 5%.")
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.step = "0.01";
				t.setValue(String(this.plugin.settings.selectionMaskOpacity));
				t.onChange(async (v) => {
					const n = parseFloat(v);
					if (!Number.isNaN(n)) {
						this.plugin.settings.selectionMaskOpacity = Math.max(0, Math.min(1, n));
						await this.plugin.saveSettings();
						this.plugin.selectionController?.repaintChrome();
					}
				});
			});

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "After the timelapse wand, the pin turns selection on/off and changes icon by mode. Wheel zooms while the tool is on; space pans; shift adds; alt subtracts. Optional ribbon uses the pin icon.",
		});
	}
}
