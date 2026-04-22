import type { App, TFile } from "obsidian";
import { Modal, Notice, Setting } from "obsidian";

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countMatches(
	content: string,
	find: string,
	caseSensitive: boolean,
	wholeWord: boolean,
): number {
	if (!find) return 0;
	if (wholeWord) {
		const flags = caseSensitive ? "g" : "gi";
		const re = new RegExp(`\\b${escapeRe(find)}\\b`, flags);
		return (content.match(re) ?? []).length;
	}
	if (caseSensitive) {
		let c = 0;
		let i = 0;
		while ((i = content.indexOf(find, i)) !== -1) {
			c++;
			i += find.length;
		}
		return c;
	}
	const lower = content.toLowerCase();
	const f = find.toLowerCase();
	let c = 0;
	let i = 0;
	while ((i = lower.indexOf(f, i)) !== -1) {
		c++;
		i += f.length;
	}
	return c;
}

export function applyLiteralReplace(
	content: string,
	find: string,
	repl: string,
	caseSensitive: boolean,
	wholeWord: boolean,
): string {
	if (!find) return content;
	if (wholeWord) {
		const flags = caseSensitive ? "g" : "gi";
		const re = new RegExp(`\\b${escapeRe(find)}\\b`, flags);
		return content.replace(re, repl);
	}
	if (caseSensitive) return content.split(find).join(repl);
	const lower = find.toLowerCase();
	let out = "";
	let i = 0;
	while (i < content.length) {
		const idx = content.toLowerCase().indexOf(lower, i);
		if (idx === -1) {
			out += content.slice(i);
			break;
		}
		out += content.slice(i, idx) + repl;
		i = idx + find.length;
	}
	return out;
}

type PreviewRow = { file: TFile; count: number; snippet: string };

export class BulkFindReplaceModal extends Modal {
	constructor(
		app: App,
		readonly files: TFile[],
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`Find & replace in ${this.files.length} file(s)`);
		let find = "";
		let repl = "";
		let caseSens = false;
		let wholeWord = false;
		const previewEl = this.contentEl.createDiv({ cls: "graph-lasso-fr-preview" });
		previewEl.style.maxHeight = "240px";
		previewEl.style.overflow = "auto";
		previewEl.style.fontSize = "0.85em";
		previewEl.style.border = "1px solid var(--background-modifier-border)";
		previewEl.style.padding = "8px";
		previewEl.style.marginTop = "8px";

		const runPreview = async () => {
			previewEl.empty();
			if (!find.trim()) {
				previewEl.setText("Enter find text.");
				return;
			}
			const rows: PreviewRow[] = [];
			for (const f of this.files) {
				const t = await this.app.vault.read(f);
				const n = countMatches(t, find, caseSens, wholeWord);
				if (n > 0) {
					const idx = caseSens ? t.indexOf(find) : t.toLowerCase().indexOf(find.toLowerCase());
					const start = Math.max(0, idx - 20);
					const snippet = t.slice(start, start + 80).replace(/\n/g, " ");
					rows.push({ file: f, count: n, snippet });
				}
			}
			if (rows.length === 0) {
				previewEl.setText("No matches in selected files.");
				return;
			}
			const table = previewEl.createEl("table", { cls: "graph-lasso-fr-table" });
			const head = table.createEl("tr");
			head.createEl("th", { text: "File" });
			head.createEl("th", { text: "#" });
			head.createEl("th", { text: "Snippet" });
			for (const r of rows) {
				const tr = table.createEl("tr");
				tr.createEl("td", { text: r.file.basename });
				tr.createEl("td", { text: String(r.count) });
				tr.createEl("td", { text: r.snippet });
			}
			previewEl.createEl("p", {
				cls: "setting-item-description",
				text: `${rows.length} file(s) with matches — review then confirm below.`,
			});
		};

		new Setting(this.contentEl).setName("Find").addText((t) => t.onChange((v) => (find = v)));
		new Setting(this.contentEl).setName("Replace with").addText((t) => t.onChange((v) => (repl = v)));
		new Setting(this.contentEl)
			.setName("Case sensitive")
			.addToggle((tg) =>
				tg.onChange((v) => {
					caseSens = v;
				}),
			);
		new Setting(this.contentEl)
			.setName("Whole word")
			.setDesc("Word boundaries (ASCII-friendly).")
			.addToggle((tg) =>
				tg.onChange((v) => {
					wholeWord = v;
				}),
			);
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Preview").onClick(() => void runPreview()));

		new Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("Apply to all selected…")
				.setCta()
				.setWarning()
				.onClick(async () => {
					if (!find.trim()) {
						new Notice("Find text empty");
						return;
					}
					let changed = 0;
					for (const f of this.files) {
						const t = await this.app.vault.read(f);
						const next = applyLiteralReplace(t, find, repl, caseSens, wholeWord);
						if (next !== t) {
							await this.app.vault.modify(f, next);
							changed++;
						}
					}
					new Notice(`Updated ${changed} file(s)`);
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function openBulkFindReplace(app: App, files: TFile[]): void {
	new BulkFindReplaceModal(app, files).open();
}
