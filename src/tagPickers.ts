import type { App, TFile } from "obsidian";
import { Modal, Notice, Setting, getAllTags } from "obsidian";
import { addTagsBulkToFiles, removeTagFromAllFiles } from "./batchTagLinkClipboard";

function normalizeTag(t: string): string {
	return t.replace(/^#/, "").trim();
}

export function collectTagsUnion(app: App, files: TFile[]): string[] {
	const s = new Set<string>();
	for (const f of files) {
		const c = app.metadataCache.getCache(f.path);
		const tags = c ? getAllTags(c) : null;
		for (const t of tags ?? []) {
			s.add(normalizeTag(t));
		}
	}
	return [...s].sort((a, b) => a.localeCompare(b));
}

/** Add: pick from union of tags on selection + optional custom comma-separated tags. */
export class AddTagsPickerModal extends Modal {
	constructor(
		app: App,
		readonly files: TFile[],
		readonly unionTags: string[],
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`Add tags to ${this.files.length} note(s)`);
		const picked = new Set<string>();
		const wrap = this.contentEl.createDiv({ cls: "graph-lasso-tag-scroll" });
		wrap.style.maxHeight = "220px";
		wrap.style.overflow = "auto";
		for (const tag of this.unionTags) {
			new Setting(wrap).setName(`#${tag}`).addToggle((tg) =>
				tg.onChange((on) => {
					if (on) picked.add(tag);
					else picked.delete(tag);
				}),
			);
		}
		if (this.unionTags.length === 0) {
			wrap.createEl("p", { text: "No existing tags on these notes — use custom field below.", cls: "setting-item-description" });
		}
		let custom = "";
		new Setting(this.contentEl)
			.setName("Custom tags (comma-separated)")
			.setDesc("Added in addition to checked tags.")
			.addText((t) => t.onChange((v) => (custom = v)));

		new Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("Apply")
				.setCta()
				.onClick(async () => {
					const extra = custom
						.split(",")
						.map((x) => normalizeTag(x))
						.filter(Boolean);
					const all = [...picked, ...extra];
					if (all.length === 0) {
						new Notice("No tags selected");
						return;
					}
					await addTagsBulkToFiles(this.app, this.files, all);
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Remove: pick from union of tags appearing on any selected note. */
export class RemoveTagsPickerModal extends Modal {
	constructor(
		app: App,
		readonly files: TFile[],
		readonly unionTags: string[],
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`Remove tags from YAML (${this.files.length} notes)`);
		const picked = new Set<string>();
		const wrap = this.contentEl.createDiv({ cls: "graph-lasso-tag-scroll" });
		wrap.style.maxHeight = "220px";
		wrap.style.overflow = "auto";
		if (this.unionTags.length === 0) {
			wrap.createEl("p", { text: "No tags found on these notes.", cls: "setting-item-description" });
		}
		for (const tag of this.unionTags) {
			new Setting(wrap).setName(`#${tag}`).addToggle((tg) =>
				tg.onChange((on) => {
					if (on) picked.add(tag);
					else picked.delete(tag);
				}),
			);
		}
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("Remove checked from YAML")
				.setCta()
				.onClick(async () => {
					if (picked.size === 0) {
						new Notice("No tags checked");
						return;
					}
					for (const t of picked) {
						await removeTagFromAllFiles(this.app, this.files, t);
					}
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class RetagPickerModal extends Modal {
	constructor(
		app: App,
		readonly files: TFile[],
		readonly candidateTags: string[],
		readonly onApply: (fromTag: string, toTag: string, fixBody: boolean) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Retag (YAML + optional body)");
		let fromVal = this.candidateTags[0] ?? "";
		let toVal = "";
		let fixBody = false;

		if (this.candidateTags.length > 0) {
			new Setting(this.contentEl).setName("From tag").addDropdown((d) => {
				for (const t of this.candidateTags) d.addOption(t, `#${t}`);
				d.setValue(fromVal);
				d.onChange((v) => (fromVal = v));
			});
		} else {
			new Setting(this.contentEl).setName("From tag").addText((t) => t.onChange((v) => (fromVal = normalizeTag(v))));
		}

		new Setting(this.contentEl).setName("To tag").addText((t) => t.onChange((v) => (toVal = normalizeTag(v))));
		new Setting(this.contentEl)
			.setName("Replace #from in bodies")
			.setDesc("Literal #tag replace.")
			.addToggle((tg) => tg.onChange((v) => (fixBody = v)));

		new Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("Apply")
				.setCta()
				.onClick(async () => {
					const from = normalizeTag(fromVal);
					const to = normalizeTag(toVal);
					if (!from || !to) {
						new Notice("From and to tags required");
						return;
					}
					await this.onApply(from, to, fixBody);
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function openAddTagsPicker(app: App, files: TFile[]): void {
	const union = collectTagsUnion(app, files);
	new AddTagsPickerModal(app, files, union).open();
}

export function openRemoveTagsPicker(app: App, files: TFile[]): void {
	const union = collectTagsUnion(app, files);
	new RemoveTagsPickerModal(app, files, union).open();
}

export function openRetagPicker(app: App, files: TFile[]): void {
	const union = collectTagsUnion(app, files);
	new RetagPickerModal(app, files, union, async (from, to, fixBody) => {
		for (const f of files) {
			await app.fileManager.processFrontMatter(f, (yaml: Record<string, unknown>) => {
				const cur = yaml.tags;
				const arr: string[] = Array.isArray(cur)
					? (cur as unknown[]).map((x) => String(x))
					: typeof cur === "string"
						? [cur]
						: [];
				const norm = arr.map((x) => normalizeTag(x));
				const next = norm.map((x) => (x === from ? to : x));
				if (next.length === 0) delete yaml.tags;
				else yaml.tags = next.length === 1 ? next[0] : next;
			});
			if (fixBody) {
				const body = await app.vault.read(f);
				const needle = `#${from}`;
				const repl = `#${to}`;
				if (body.includes(needle)) await app.vault.modify(f, body.split(needle).join(repl));
			}
		}
		new Notice(`Retagged “${from}” → “${to}” on ${files.length} file(s)`);
	}).open();
}
