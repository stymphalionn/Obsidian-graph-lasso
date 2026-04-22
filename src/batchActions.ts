import type { App, TFile } from "obsidian";
import { Modal, Notice } from "obsidian";

function sleep(ms: number) {
	return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export async function openAllFiles(app: App, files: TFile[]) {
	for (const file of files) {
		const leaf = app.workspace.getLeaf("tab");
		await leaf.openFile(file);
	}
}

export async function openAllSequentially(app: App, files: TFile[], delayMs: number) {
	const leaf = app.workspace.getLeaf(false);
	if (!leaf) {
		new Notice("Graph Lasso: no active pane for sequential open");
		return;
	}
	for (const file of files) {
		await leaf.openFile(file);
		await sleep(Math.max(0, delayMs));
	}
}

export async function copyPathsToClipboard(files: TFile[]) {
	const text = files.map((f) => f.path).join("\n");
	await navigator.clipboard.writeText(text);
	new Notice(`Copied ${files.length} path(s)`);
}

class ConfirmDeleteModal extends Modal {
	constructor(
		app: App,
		readonly count: number,
		readonly onConfirm: () => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("p", {
			text: `Delete ${this.count} note(s) permanently? This cannot be undone.`,
		});
		const row = contentEl.createDiv({ cls: "graph-lasso-modal-buttons" });
		row.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		row.createEl("button", { text: "Delete all", cls: "mod-cta" }).addEventListener("click", async () => {
			await this.onConfirm();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

export function promptDeleteAll(app: App, files: TFile[]) {
	if (files.length === 0) return;
	new ConfirmDeleteModal(app, files.length, async () => {
		for (const f of files) {
			if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f);
		}
		new Notice(`Deleted ${files.length} file(s)`);
	}).open();
}
