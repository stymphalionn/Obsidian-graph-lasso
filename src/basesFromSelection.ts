import type { App, TFile } from "obsidian";
import { Modal, Notice, Setting, normalizePath } from "obsidian";

function yamlString(s: string): string {
	return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Build minimal `.base` YAML: table view with OR of file.path == … (Obsidian Bases filter syntax). */
export function buildBaseYamlFromPaths(paths: string[]): string {
	const lines: string[] = ["views:", "  - type: table", "    name: Graph selection", "    filters:", "      or:"];
	for (const p of paths) {
		lines.push(`        - file.path == ${yamlString(p)}`);
	}
	lines.push("    order:", "      - file.name", "      - file.folder");
	return lines.join("\n") + "\n";
}

export class CreateBaseFromSelectionModal extends Modal {
	constructor(
		app: App,
		readonly files: TFile[],
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Create Base from selection");
		let folder = "Graph Lasso";
		let basename = `Selection ${new Date().toISOString().slice(0, 10)}`;

		this.contentEl.createEl("p", {
			text: `Creates a .base file listing ${this.files.length} note(s) by path filter. Requires Obsidian 1.10+ with Bases enabled.`,
			cls: "setting-item-description",
		});

		new Setting(this.contentEl).setName("Folder (under vault root)").addText((t) => {
			t.setValue(folder);
			t.onChange((v) => (folder = v));
		});
		new Setting(this.contentEl).setName("Base name (no extension)").addText((t) => {
			t.setValue(basename);
			t.onChange((v) => (basename = v));
		});

		new Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("Create")
				.setCta()
				.onClick(async () => {
					const f = basename.trim();
					if (!f) {
						new Notice("Name required");
						return;
					}
					const dir = normalizePath(folder.trim().replace(/^\/+|\/+$/g, ""));
					const rel = dir ? `${dir}/${f}.base` : `${f}.base`;
					const existing = this.app.vault.getAbstractFileByPath(rel);
					if (existing) {
						new Notice(`Already exists: ${rel}`);
						return;
					}
					if (this.files.length === 0) {
						new Notice("No files selected");
						return;
					}
					if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
						try {
							await this.app.vault.createFolder(dir);
						} catch (e) {
							new Notice(`Could not create folder: ${e}`);
							return;
						}
					}
					const paths = this.files.map((x) => x.path);
					const body = buildBaseYamlFromPaths(paths);
					try {
						await this.app.vault.create(rel, body);
						new Notice(`Created ${rel}`);
						this.close();
					} catch (e) {
						new Notice(`Could not create Base: ${e}`);
					}
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function openCreateBaseFromSelection(app: App, files: TFile[]): void {
	new CreateBaseFromSelectionModal(app, files).open();
}
