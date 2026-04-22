import * as fs from "fs";
import * as path from "path";
import { FileSystemAdapter } from "obsidian";
import type { GraphLassoPluginApi } from "./pluginApi";
import type { GraphLassoSettings } from "./settings";

/** Plugin instance must expose Obsidian’s manifest.dir (desktop). */
export type DebugLogPlugin = GraphLassoPluginApi & { readonly manifest: { dir?: string } };

let seq = 0;
let pathWarned = false;

/**
 * `manifest.dir` is **vault-relative** (e.g. `.obsidian/plugins/graph-lasso`).
 * Resolve to an absolute filesystem path via the vault's adapter so `fs.*`
 * lands the file inside the plugin folder (not Electron's cwd).
 */
function resolveAbsolutePluginDir(plugin: DebugLogPlugin): string | null {
	const rel = plugin.manifest?.dir;
	if (!rel) return null;
	const adapter = plugin.app?.vault?.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return path.join(adapter.getBasePath(), rel);
	}
	// Mobile or non-filesystem adapter: nothing we can write to with `fs`.
	return null;
}

export function getGraphLassoDebugLogPath(plugin: DebugLogPlugin): string | null {
	const dir = resolveAbsolutePluginDir(plugin);
	if (!dir) return null;
	return path.join(dir, "debug.log");
}

/**
 * Append one line to `<plugin-dir>/debug.log` when **Settings → Debug log to file** is on.
 * **Verbose** lines require **Verbose debug** as well. Monitor with:
 * `tail -f "/path/to/vault/.obsidian/plugins/graph-lasso/debug.log"`
 */
export function logGraphLassoDebug(
	plugin: DebugLogPlugin,
	level: "info" | "verbose",
	event: string,
	detail?: Record<string, unknown>,
): void {
	const s = plugin.settings as GraphLassoSettings;
	if (!s.debugLogToFile) return;
	if (level === "verbose" && !s.debugVerbose) return;
	const file = getGraphLassoDebugLogPath(plugin);
	if (!file) {
		if (!pathWarned) {
			pathWarned = true;
			console.warn("[graph-lasso] debug.log path unresolved (non-filesystem adapter?)");
		}
		return;
	}
	const ts = new Date().toISOString();
	const id = ++seq;
	let extra = "";
	if (detail && Object.keys(detail).length > 0) {
		try {
			extra = ` ${JSON.stringify(detail)}`;
		} catch {
			extra = " [detail-serialize-error]";
		}
	}
	const line = `[${ts}] #${id} [${level}] ${event}${extra}`;
	try {
		fs.appendFileSync(file, `${line}\n`, "utf8");
	} catch (e) {
		if (!pathWarned) {
			pathWarned = true;
			console.warn("[graph-lasso] debug.log append failed", file, e);
		}
	}
}

export function clearGraphLassoDebugLog(plugin: DebugLogPlugin): boolean {
	const p = getGraphLassoDebugLogPath(plugin);
	if (!p) return false;
	try {
		fs.writeFileSync(p, "", "utf8");
		return true;
	} catch {
		return false;
	}
}
