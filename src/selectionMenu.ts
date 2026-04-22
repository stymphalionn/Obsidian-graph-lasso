import type { App, TFile } from "obsidian";
import { Menu } from "obsidian";
import { openCreateBaseFromSelection } from "./basesFromSelection";
import {
	copyFirstLines,
	copyFrontmatterYamlSnippets,
	copyIncomingResolvedTsv,
	copyOutgoingWikilinksMarkdown,
	copyOutgoingWikilinksTsv,
	copyPathTitleTagsTsv,
	copyTitlesList,
	openBulkReplaceWikiModal,
} from "./batchTagLinkClipboard";
import { openBulkFindReplace } from "./bulkFindReplace";
import { copyPathsToClipboard, openAllFiles, openAllSequentially, promptDeleteAll } from "./batchActions";
import type { GraphLassoSettings } from "./settings";
import { openAddTagsPicker, openRemoveTagsPicker, openRetagPicker } from "./tagPickers";

export function showSelectionMenu(
	app: App,
	clientX: number,
	clientY: number,
	files: TFile[],
	settings: GraphLassoSettings,
) {
	const menu = new Menu();

	menu.addItem((item) => {
		item.setTitle(`Open all (${files.length})`).setIcon("files").onClick(() => {
			void openAllFiles(app, files);
		});
	});

	menu.addItem((item) => {
		item.setTitle("Open all sequentially (same pane)")
			.setIcon("list-ordered")
			.onClick(() => {
				void openAllSequentially(app, files, settings.sequentialDelayMs);
			});
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Tags: add…").setIcon("tag").onClick(() => openAddTagsPicker(app, files));
	});
	menu.addItem((item) => {
		item.setTitle("Tags: remove from YAML…").setIcon("minus").onClick(() => openRemoveTagsPicker(app, files));
	});
	menu.addItem((item) => {
		item.setTitle("Tags: retag…").setIcon("replace").onClick(() => openRetagPicker(app, files));
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Find & replace in note text…")
			.setIcon("search")
			.onClick(() => openBulkFindReplace(app, files));
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Links: copy outgoing wikilinks (Markdown list)")
			.setIcon("link")
			.onClick(() => void copyOutgoingWikilinksMarkdown(app, files));
	});
	menu.addItem((item) => {
		item.setTitle("Links: copy outgoing wikilinks (TSV)").setIcon("link").onClick(() => void copyOutgoingWikilinksTsv(app, files));
	});
	menu.addItem((item) => {
		item.setTitle("Links: copy incoming resolved (TSV)")
			.setIcon("link")
			.onClick(() => void copyIncomingResolvedTsv(app, files));
	});
	menu.addItem((item) => {
		item.setTitle("Links: bulk replace [[from]] → [[to]] in bodies…")
			.setIcon("pencil")
			.onClick(() => openBulkReplaceWikiModal(app, files));
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Bases: create .base from selection…")
			.setIcon("database")
			.onClick(() => openCreateBaseFromSelection(app, files));
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Copy: vault paths").setIcon("copy").onClick(() => void copyPathsToClipboard(files));
	});
	menu.addItem((item) => {
		item.setTitle("Copy: titles (one per line)").setIcon("heading").onClick(() => void copyTitlesList(app, files));
	});
	menu.addItem((item) => {
		item.setTitle("Copy: path + title + tags (TSV)").setIcon("grid").onClick(() => void copyPathTitleTagsTsv(app, files));
	});
	menu.addItem((item) => {
		item.setTitle("Copy: frontmatter as JSON blocks").setIcon("code").onClick(() => void copyFrontmatterYamlSnippets(app, files));
	});
	menu.addItem((item) => {
		item.setTitle("Copy: first 5 lines per file").setIcon("text").onClick(() => void copyFirstLines(app, files, 5));
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Delete all…").setIcon("trash").setWarning(true).onClick(() => {
			promptDeleteAll(app, files);
		});
	});

	menu.showAtPosition({ x: clientX, y: clientY });
}
