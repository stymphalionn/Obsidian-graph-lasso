import type { App, TFile } from "obsidian";
import { Notice, getAllTags } from "obsidian";
import { TwoFieldPromptModal } from "./modals";

function normalizeTag(t: string): string {
	return t.replace(/^#/, "").trim();
}

export async function addTagToAllFiles(app: App, files: TFile[], tag: string): Promise<void> {
	const t = normalizeTag(tag);
	if (!t) {
		new Notice("Tag is empty");
		return;
	}
	for (const f of files) {
		await app.fileManager.processFrontMatter(f, (yaml: Record<string, unknown>) => {
			const cur = yaml.tags;
			const arr: string[] = Array.isArray(cur)
				? (cur as unknown[]).map((x) => String(x))
				: typeof cur === "string"
					? [cur]
					: [];
			const norm = arr.map((x) => normalizeTag(x));
			if (!norm.includes(t)) norm.push(t);
			yaml.tags = norm.length === 1 ? norm[0] : norm;
		});
	}
	new Notice(`Added tag “${t}” to ${files.length} file(s)`);
}

/** Add several distinct tags; one notice. */
export async function addTagsBulkToFiles(app: App, files: TFile[], tags: string[]): Promise<void> {
	const uniq = [...new Set(tags.map(normalizeTag).filter(Boolean))];
	if (uniq.length === 0) {
		new Notice("No tags to add");
		return;
	}
	for (const t of uniq) {
		for (const f of files) {
			await app.fileManager.processFrontMatter(f, (yaml: Record<string, unknown>) => {
				const cur = yaml.tags;
				const arr: string[] = Array.isArray(cur)
					? (cur as unknown[]).map((x) => String(x))
					: typeof cur === "string"
						? [cur]
						: [];
				const norm = arr.map((x) => normalizeTag(x));
				if (!norm.includes(t)) norm.push(t);
				yaml.tags = norm.length === 1 ? norm[0] : norm;
			});
		}
	}
	new Notice(`Added ${uniq.length} tag(s) to ${files.length} file(s)`);
}

export async function removeTagFromAllFiles(app: App, files: TFile[], tag: string): Promise<void> {
	const t = normalizeTag(tag);
	if (!t) return;
	for (const f of files) {
		await app.fileManager.processFrontMatter(f, (yaml: Record<string, unknown>) => {
			const cur = yaml.tags;
			if (cur === undefined) return;
			const arr: string[] = Array.isArray(cur)
				? (cur as unknown[]).map((x) => String(x))
				: typeof cur === "string"
					? [cur]
					: [];
			const next = arr.filter((x) => normalizeTag(x) !== t);
			if (next.length === 0) delete yaml.tags;
			else yaml.tags = next.length === 1 ? next[0] : next;
		});
	}
	new Notice(`Removed tag “${t}” from YAML in ${files.length} file(s) (body #tags unchanged)`);
}

export function aggregateOutgoingWikilinks(
	app: App,
	files: TFile[],
): Map<string, { count: number; sources: Set<string> }> {
	const m = new Map<string, { count: number; sources: Set<string> }>();
	for (const f of files) {
		const c = app.metadataCache.getCache(f.path);
		for (const l of c?.links ?? []) {
			const key = l.link;
			const row = m.get(key) ?? { count: 0, sources: new Set<string>() };
			row.count++;
			row.sources.add(f.path);
			m.set(key, row);
		}
	}
	return m;
}

export function aggregateIncomingResolved(
	app: App,
	targetPaths: Set<string>,
): { from: string; to: string }[] {
	const rl = app.metadataCache.resolvedLinks;
	const out: { from: string; to: string }[] = [];
	for (const [from, map] of Object.entries(rl)) {
		for (const to of Object.keys(map)) {
			if (targetPaths.has(to)) out.push({ from, to });
		}
	}
	return out;
}

export async function copyOutgoingWikilinksMarkdown(app: App, files: TFile[]): Promise<void> {
	const m = aggregateOutgoingWikilinks(app, files);
	const lines: string[] = [];
	for (const [link, { count }] of [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		lines.push(`- [[${link}]] (${count})`);
	}
	await navigator.clipboard.writeText(lines.join("\n") || "(no outgoing links)");
	new Notice(`Copied ${lines.length} wikilink line(s)`);
}

export async function copyOutgoingWikilinksTsv(app: App, files: TFile[]): Promise<void> {
	const m = aggregateOutgoingWikilinks(app, files);
	const lines = ["link\tcount\tsources"];
	for (const [link, { count, sources }] of [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		lines.push(`${link}\t${count}\t${[...sources].join("; ")}`);
	}
	await navigator.clipboard.writeText(lines.join("\n"));
	new Notice("Copied outgoing wikilinks (TSV)");
}

export async function copyIncomingResolvedTsv(app: App, files: TFile[]): Promise<void> {
	const targets = new Set(files.map((f) => f.path));
	const rows = aggregateIncomingResolved(app, targets);
	const lines = ["from_path\tto_path", ...rows.map((r) => `${r.from}\t${r.to}`)];
	await navigator.clipboard.writeText(lines.join("\n"));
	new Notice(`Copied ${rows.length} incoming link row(s)`);
}

export async function copyTitlesList(app: App, files: TFile[]): Promise<void> {
	const lines = files.map((f) => f.basename);
	await navigator.clipboard.writeText(lines.join("\n"));
	new Notice("Copied titles");
}

export async function copyPathTitleTagsTsv(app: App, files: TFile[]): Promise<void> {
	const lines = ["path\tbasename\ttags"];
	for (const f of files) {
		const c = app.metadataCache.getCache(f.path);
		const tags = c ? getAllTags(c) : null;
		const tagStr = tags?.join("; ") ?? "";
		lines.push(`${f.path}\t${f.basename}\t${tagStr}`);
	}
	await navigator.clipboard.writeText(lines.join("\n"));
	new Notice("Copied path / title / tags (TSV)");
}

export async function copyFrontmatterYamlSnippets(app: App, files: TFile[]): Promise<void> {
	const parts: string[] = [];
	for (const f of files) {
		const c = app.metadataCache.getCache(f.path);
		const fm = c?.frontmatter;
		const yaml = fm ? JSON.stringify(fm, null, 2) : "{}";
		parts.push(`--- ${f.path} ---\n${yaml}\n`);
	}
	await navigator.clipboard.writeText(parts.join("\n"));
	new Notice("Copied frontmatter JSON for each file");
}

export async function copyFirstLines(app: App, files: TFile[], n = 5): Promise<void> {
	const parts: string[] = [];
	for (const f of files) {
		const t = await app.vault.read(f);
		const head = t.split("\n").slice(0, n).join("\n");
		parts.push(`--- ${f.path} ---\n${head}\n`);
	}
	await navigator.clipboard.writeText(parts.join("\n"));
	new Notice(`Copied first ${n} lines per file`);
}

export function openBulkReplaceWikiModal(app: App, files: TFile[]): void {
	new TwoFieldPromptModal(app, "Replace wikilink text in bodies", "From (link name)", "To (link name)", async (from, to) => {
		if (!from || !to) return;
		let touched = 0;
		for (const f of files) {
			let body = await app.vault.read(f);
			if (!body.includes("[[")) continue;
			const next = body.split(`[[${from}|`).join(`[[${to}|`).split(`[[${from}]]`).join(`[[${to}]]`);
			if (next !== body) {
				await app.vault.modify(f, next);
				touched++;
			}
		}
		new Notice(`Updated wikilink text in ${touched} file(s)`);
	}).open();
}
