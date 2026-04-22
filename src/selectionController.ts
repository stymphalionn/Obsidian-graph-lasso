import type { TFile, WorkspaceLeaf } from "obsidian";
import { Notice } from "obsidian";
import { logGraphLassoDebug } from "./debugLog";
import type { DebugLogPlugin } from "./debugLog";
import type { GraphLassoPluginApi } from "./pluginApi";
import {
	collectFileNodes,
	getGraphLeafView,
	resolveGraphLeafDetailed,
	resolveGraphLeafForTool,
	type GraphLeafView,
} from "./graphAccess";
import { normalizeRect, pointInPolygon, pointInRect, simplifyPolyline } from "./geometry";
import {
	paintSelectionChrome,
	toNormalizedLasso,
	toNormalizedMarquee,
	type ChromeRegion,
	type NormalizedSelection,
} from "./selectionChrome";
import { showSelectionMenu } from "./selectionMenu";

type DragState =
	| { kind: "marquee"; x0: number; y0: number; x1: number; y1: number }
	| { kind: "lasso"; points: { x: number; y: number }[] };

function unionFiles(a: TFile[], b: TFile[]): TFile[] {
	const m = new Map<string, TFile>();
	for (const f of a) m.set(f.path, f);
	for (const f of b) m.set(f.path, f);
	return [...m.values()];
}

function forwardWheelToGraph(ev: WheelEvent, target: HTMLElement): void {
	const cloned = new WheelEvent("wheel", {
		deltaX: ev.deltaX,
		deltaY: ev.deltaY,
		deltaZ: ev.deltaZ,
		deltaMode: ev.deltaMode,
		clientX: ev.clientX,
		clientY: ev.clientY,
		screenX: ev.screenX,
		screenY: ev.screenY,
		ctrlKey: ev.ctrlKey,
		shiftKey: ev.shiftKey,
		altKey: ev.altKey,
		metaKey: ev.metaKey,
		bubbles: true,
		cancelable: true,
		view: window,
	});
	target.dispatchEvent(cloned);
}

function getUnderlyingGraphControlButton(
	clientX: number,
	clientY: number,
	overlay: HTMLElement | null,
): HTMLElement | null {
	const stack = document.elementsFromPoint(clientX, clientY);
	for (const el of stack) {
		if (!(el instanceof HTMLElement)) continue;
		if (overlay && (el === overlay || overlay.contains(el))) continue;
		const btn = el.closest(".graph-controls-button");
		if (btn instanceof HTMLElement) return btn;
	}
	return null;
}

export class SelectionController {
	private overlay: HTMLDivElement | null = null;
	private overlayAbort: AbortController | null = null;
	private marqueeEl: HTMLDivElement | null = null;
	private lassoCanvas: HTMLCanvasElement | null = null;
	private lassoCtx: CanvasRenderingContext2D | null = null;
	private resizeObs: ResizeObserver | null = null;
	private parentEl: HTMLElement | null = null;
	private overlayMountEl: HTMLElement | null = null;
	private overlayCssWidth = 1;
	private overlayCssHeight = 1;
	private chromeSvg: SVGSVGElement | null = null;
	private chromeRegions: ChromeRegion[] = [];
	private toolActive = false;
	private spaceHeld = false;
	private drag: DragState | null = null;
	private selectedFiles: TFile[] = [];
	private attachedLeaf: WorkspaceLeaf | null = null;
	/** Stops graph pin injection during plugin unload (avoids re-adding UI after teardown). */
	private chromeSyncSuspended = false;
	private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
	private boundKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);

	constructor(readonly plugin: GraphLassoPluginApi) {}

	private dlog(level: "info" | "verbose", event: string, detail?: Record<string, unknown>): void {
		logGraphLassoDebug(this.plugin as DebugLogPlugin, level, event, detail);
	}

	refreshToolHint(): void {
		this.updateStatus();
		this.syncGraphChrome();
	}

	/** Sync HOWTO toolbar buttons on all graph leaves (presentation + inject-if-missing). */
	syncGraphChrome(): void {
		if (this.chromeSyncSuspended) return;
		this.plugin.syncAllGraphToolbars();
	}

	/** Call from Plugin.onunload before setToolActive(false) so pins are not re-inserted. */
	suspendChromeSync(): void {
		this.chromeSyncSuspended = true;
	}

	repaintChrome(): void {
		this.paintChrome();
	}

	setToolActive(on: boolean): void {
		this.toolActive = on;
		this.dlog("info", "tool.set", { on, shape: this.plugin.settings.selectShape });
		if (on) {
			document.addEventListener("keydown", this.boundKeyDown, true);
			document.addEventListener("keyup", this.boundKeyUp, true);
			this.tryAttach();
		} else {
			document.removeEventListener("keydown", this.boundKeyDown, true);
			document.removeEventListener("keyup", this.boundKeyUp, true);
			this.detach();
		}
		this.updateStatus();
		this.syncGraphChrome();
	}

	toggleTool(): void {
		this.setToolActive(!this.toolActive);
	}

	get isToolActive(): boolean {
		return this.toolActive;
	}

	private updateStatus(): void {
		const item = this.plugin.statusBarItem;
		if (!this.toolActive) {
			item.setText("");
			item.hide();
			return;
		}
		item.show();
		const shape = this.plugin.settings.selectShape === "lasso" ? "Lasso" : "Marquee";
		const onGraph = !!getGraphLeafView(resolveGraphLeafForTool(this.plugin.app, this.attachedLeaf));
		const hint = onGraph ? "wheel=zoom · Space=pan · Shift+= · Alt−" : "open a graph tab";
		item.setText(`Graph select: ${shape} (${hint})`);
	}

	private getActiveGraphView(): GraphLeafView | null {
		const leaf = resolveGraphLeafForTool(this.plugin.app, this.attachedLeaf);
		return getGraphLeafView(leaf);
	}

	tryAttach(): void {
		if (!this.toolActive) return;
		const { leaf, via } = resolveGraphLeafDetailed(this.plugin.app, this.attachedLeaf);
		const view = getGraphLeafView(leaf);
		if (!view) {
			this.dlog("info", "tryAttach.skip", { via, reason: "no_graph_view" });
			this.detachOverlayOnly();
			this.updateStatus();
			this.syncGraphChrome();
			return;
		}
		const interactiveEl = view.renderer.interactiveEl;
		const mount = interactiveEl.parentElement instanceof HTMLElement ? interactiveEl.parentElement : interactiveEl;
		if (this.overlay && this.parentEl === interactiveEl && this.overlayMountEl === mount) {
			this.attachedLeaf = leaf;
			this.syncOverlaySize(view);
			this.dlog("verbose", "tryAttach.reuse", { via, viewType: leaf?.view.getViewType() });
			this.updateStatus();
			this.syncGraphChrome();
			return;
		}
		this.detachOverlayOnly();
		this.parentEl = interactiveEl;
		this.overlayMountEl = mount;
		this.attachedLeaf = leaf;
		mount.addClass("graph-lasso-overlay-host");

		const overlay = document.createElement("div");
		overlay.className = "graph-lasso-overlay";
		Object.assign(overlay.style, {
			position: "absolute",
			left: "0",
			top: "0",
			width: "0",
			height: "0",
			zIndex: "20",
			touchAction: "manipulation",
			cursor: "crosshair",
		});

		const marquee = document.createElement("div");
		marquee.className = "graph-lasso-marquee";
		Object.assign(marquee.style, {
			display: "none",
			position: "absolute",
			border: "2px solid var(--interactive-accent)",
			background: "color-mix(in srgb, var(--interactive-accent) 25%, transparent)",
			pointerEvents: "none",
		});

		const canvas = document.createElement("canvas");
		canvas.className = "graph-lasso-lasso-canvas";
		Object.assign(canvas.style, {
			display: "none",
			position: "absolute",
			inset: "0",
			width: "100%",
			height: "100%",
			pointerEvents: "none",
		});

		const chrome = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		chrome.classList.add("graph-lasso-chrome");
		Object.assign(chrome.style, {
			position: "absolute",
			inset: "0",
			pointerEvents: "none",
		});

		overlay.appendChild(canvas);
		overlay.appendChild(marquee);
		overlay.appendChild(chrome);
		mount.appendChild(overlay);
		this.overlay = overlay;
		this.marqueeEl = marquee;
		this.lassoCanvas = canvas;
		this.lassoCtx = canvas.getContext("2d");
		this.chromeSvg = chrome;
		this.paintChrome();

		this.resizeObs = new ResizeObserver(() => {
			const v = this.getActiveGraphView();
			if (v) this.syncOverlaySize(v);
		});
		this.resizeObs.observe(interactiveEl);

		const ac = new AbortController();
		this.overlayAbort = ac;
		const opt = { signal: ac.signal, passive: false } as const;
		overlay.addEventListener("pointerdown", (e: PointerEvent) => this.onPointerDown(e, view), opt);
		overlay.addEventListener("pointermove", (e: PointerEvent) => this.onPointerMove(e, view), opt);
		overlay.addEventListener("pointerup", (e: PointerEvent) => this.onPointerUp(e, view), opt);
		overlay.addEventListener("pointercancel", () => this.cancelDrag(), { signal: ac.signal, passive: true });
		overlay.addEventListener("contextmenu", (e: MouseEvent) => this.onContextMenu(e), opt);
		overlay.addEventListener(
			"wheel",
			(ev: WheelEvent) => {
				ev.preventDefault();
				ev.stopPropagation();
				forwardWheelToGraph(ev, view.renderer.interactiveEl);
			},
			{ signal: ac.signal, passive: false },
		);

		this.syncOverlaySize(view);
		this.dlog("info", "tryAttach.attached", {
			via,
			viewType: leaf?.view.getViewType(),
			shape: this.plugin.settings.selectShape,
		});
		this.updateStatus();
		this.syncGraphChrome();
	}

	private detachOverlayOnly(): void {
		this.dlog("verbose", "overlay.detachOverlayOnly", {});
		this.overlayMountEl?.removeClass("graph-lasso-overlay-host");
		this.attachedLeaf = null;
		this.overlayAbort?.abort();
		this.overlayAbort = null;
		this.resizeObs?.disconnect();
		this.resizeObs = null;
		this.overlay?.remove();
		this.overlay = null;
		this.marqueeEl = null;
		this.lassoCanvas = null;
		this.lassoCtx = null;
		this.chromeSvg = null;
		this.parentEl = null;
		this.overlayMountEl = null;
		this.drag = null;
	}

	detach(): void {
		this.detachOverlayOnly();
	}

	/** Frame the overlay to the canvas box while mounting it on the surrounding positioned container. */
	private syncOverlayFrame(view: GraphLeafView): void {
		if (!this.overlay) return;
		const el = view.renderer.interactiveEl;
		const mount = this.overlayMountEl ?? el;
		const elRect = el.getBoundingClientRect();
		const mountRect = mount.getBoundingClientRect();
		this.overlay.setCssStyles({
			left: `${elRect.left - mountRect.left}px`,
			top: `${elRect.top - mountRect.top}px`,
			width: `${el.clientWidth}px`,
			height: `${el.clientHeight}px`,
		});
	}

	private syncOverlaySize(view: GraphLeafView): void {
		if (!this.lassoCanvas || !this.overlay) return;
		const el = view.renderer.interactiveEl;
		const w = el.clientWidth;
		const h = el.clientHeight;
		this.overlayCssWidth = Math.max(1, w);
		this.overlayCssHeight = Math.max(1, h);
		const dpr = window.devicePixelRatio || 1;
		this.lassoCanvas.width = Math.max(1, Math.floor(w * dpr));
		this.lassoCanvas.height = Math.max(1, Math.floor(h * dpr));
		this.lassoCanvas.style.width = `${w}px`;
		this.lassoCanvas.style.height = `${h}px`;
		if (this.lassoCtx) {
			this.lassoCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		this.syncOverlayFrame(view);
		this.paintChrome();
	}

	private paintChrome(): void {
		if (!this.chromeSvg) return;
		paintSelectionChrome(
			this.chromeSvg,
			this.chromeRegions.length ? this.chromeRegions : null,
			this.plugin.settings.selectionMaskOpacity,
			this.overlayCssWidth,
			this.overlayCssHeight,
		);
	}

	private clearSelectionForNewGesture(): void {
		this.selectedFiles = [];
		this.chromeRegions = [];
		this.paintChrome();
		this.clearDragPreview();
	}

	private applyPointerPassthrough(): void {
		if (!this.overlay) return;
		this.overlay.style.pointerEvents = this.spaceHeld ? "none" : "auto";
	}

	private onKeyDown(e: KeyboardEvent): void {
		if (e.code === "Space" && !e.repeat) {
			this.spaceHeld = true;
			this.applyPointerPassthrough();
			e.preventDefault();
		} else if (e.key === "Escape") {
			this.clearSelectionForNewGesture();
			e.preventDefault();
		}
	}

	private onKeyUp(e: KeyboardEvent): void {
		if (e.code === "Space") {
			this.spaceHeld = false;
			this.applyPointerPassthrough();
			e.preventDefault();
		}
	}

	private onPointerDown(e: PointerEvent, view: GraphLeafView): void {
		if (e.button !== 0) return;
		const underlyingGraphControl = getUnderlyingGraphControlButton(e.clientX, e.clientY, this.overlay);
		if (underlyingGraphControl) {
			underlyingGraphControl.click();
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		const augment =
			(e.shiftKey || e.altKey) && (this.selectedFiles.length > 0 || this.chromeRegions.length > 0);
		if (!augment) {
			this.clearSelectionForNewGesture();
		} else {
			this.clearDragPreview();
		}
		this.overlay?.setPointerCapture(e.pointerId);
		const { clientX, clientY } = e;
		if (this.plugin.settings.selectShape === "lasso") {
			this.drag = { kind: "lasso", points: [{ x: clientX, y: clientY }] };
			this.showLassoCanvas();
			this.drawLassoPreview();
		} else {
			this.drag = { kind: "marquee", x0: clientX, y0: clientY, x1: clientX, y1: clientY };
			this.showMarquee();
			this.updateMarquee(this.drag);
		}
	}

	private onPointerMove(e: PointerEvent, _view: GraphLeafView): void {
		if (!this.drag) return;
		e.preventDefault();
		e.stopPropagation();
		const { clientX, clientY } = e;
		if (this.drag.kind === "marquee") {
			this.drag.x1 = clientX;
			this.drag.y1 = clientY;
			this.updateMarquee(this.drag);
		} else {
			this.drag.points.push({ x: clientX, y: clientY });
			this.drawLassoPreview();
		}
	}

	private onPointerUp(e: PointerEvent, view: GraphLeafView): void {
		if (!this.drag || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		try {
			this.overlay?.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}

		const ob = this.overlay!.getBoundingClientRect();
		const resolve = (path: string) => this.plugin.resolveGraphFile(path);

		let gestureFiles: TFile[] = [];
		let norm: NormalizedSelection | null = null;

		if (this.drag.kind === "marquee") {
			const rect = normalizeRect(this.drag.x0, this.drag.y0, this.drag.x1, this.drag.y1);
			if (rect.right - rect.left < 3 && rect.bottom - rect.top < 3) {
				this.drag = null;
				this.clearDragPreview();
				return;
			}
			gestureFiles = collectFileNodes(view, (pos) => pointInRect(pos.x, pos.y, rect), resolve);
			if (gestureFiles.length > 0) norm = toNormalizedMarquee(rect, ob);
		} else {
			let pts = this.drag.points;
			if (pts.length < 3) {
				this.drag = null;
				this.clearDragPreview();
				return;
			}
			pts = simplifyPolyline(pts, this.plugin.settings.lassoSimplifyEpsilon);
			if (pts.length < 3) {
				this.drag = null;
				this.clearDragPreview();
				return;
			}
			gestureFiles = collectFileNodes(view, (pos) => pointInPolygon(pos.x, pos.y, pts), resolve);
			if (gestureFiles.length > 0) norm = toNormalizedLasso(pts, ob);
		}

		this.drag = null;
		this.clearDragPreview();

		const augment =
			(e.shiftKey || e.altKey) && (this.selectedFiles.length > 0 || this.chromeRegions.length > 0);

		if (!augment) {
			this.selectedFiles = gestureFiles;
			this.chromeRegions = norm && gestureFiles.length ? [{ sel: norm, subtract: false }] : [];
		} else if (e.shiftKey) {
			this.selectedFiles = unionFiles(this.selectedFiles, gestureFiles);
			if (norm && gestureFiles.length) this.chromeRegions.push({ sel: norm, subtract: false });
		} else if (e.altKey) {
			const rm = new Set(gestureFiles.map((f) => f.path));
			this.selectedFiles = this.selectedFiles.filter((f) => !rm.has(f.path));
			if (norm && gestureFiles.length) this.chromeRegions.push({ sel: norm, subtract: true });
		}

		this.paintChrome();

		let merge: "replace" | "add" | "subtract" = "replace";
		if (augment) merge = e.shiftKey ? "add" : "subtract";
		this.dlog("info", "gesture.complete", {
			shape: this.plugin.settings.selectShape,
			count: this.selectedFiles.length,
			merge,
		});

		if (this.selectedFiles.length === 0) {
			new Notice("No notes in selection.");
		} else {
			new Notice(`Selected ${this.selectedFiles.length} note(s) — right-click for actions`);
		}
	}

	private cancelDrag(): void {
		this.drag = null;
		this.clearDragPreview();
	}

	private onContextMenu(e: MouseEvent): void {
		if (this.selectedFiles.length === 0) return;
		e.preventDefault();
		e.stopPropagation();
		this.dlog("info", "menu.open", { count: this.selectedFiles.length });
		showSelectionMenu(this.plugin.app, e.clientX, e.clientY, this.selectedFiles, this.plugin.settings);
	}

	private showMarquee(): void {
		this.marqueeEl?.show();
		this.lassoCanvas?.hide();
	}

	private showLassoCanvas(): void {
		this.marqueeEl?.hide();
		this.lassoCanvas?.show();
	}

	private clearDragPreview(): void {
		if (this.marqueeEl) {
			this.marqueeEl.hide();
			this.marqueeEl.setCssStyles({
				left: "0",
				top: "0",
				width: "0",
				height: "0",
			});
		}
		if (this.lassoCtx && this.lassoCanvas) {
			this.lassoCtx.clearRect(0, 0, this.overlayCssWidth, this.overlayCssHeight);
		}
	}

	private updateMarquee(d: Extract<DragState, { kind: "marquee" }>): void {
		if (!this.marqueeEl || !this.overlay) return;
		const r = normalizeRect(d.x0, d.y0, d.x1, d.y1);
		const ob = this.overlay.getBoundingClientRect();
		this.marqueeEl.show();
		this.marqueeEl.setCssStyles({
			left: `${r.left - ob.left}px`,
			top: `${r.top - ob.top}px`,
			width: `${r.right - r.left}px`,
			height: `${r.bottom - r.top}px`,
		});
	}

	private drawLassoPreview(): void {
		if (!this.drag || this.drag.kind !== "lasso" || !this.lassoCtx || !this.overlay) return;
		const ctx = this.lassoCtx;
		const ob = this.overlay.getBoundingClientRect();
		ctx.clearRect(0, 0, this.overlayCssWidth, this.overlayCssHeight);
		const pts = this.drag.points;
		if (pts.length < 2) return;
		const p0 = pts[0];
		if (!p0) return;
		const accent =
			getComputedStyle(document.body).getPropertyValue("--interactive-accent").trim() || "#7c3aed";
		ctx.strokeStyle = accent;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(p0.x - ob.left, p0.y - ob.top);
		for (let i = 1; i < pts.length; i++) {
			const p = pts[i]!;
			ctx.lineTo(p.x - ob.left, p.y - ob.top);
		}
		ctx.stroke();
	}
}
