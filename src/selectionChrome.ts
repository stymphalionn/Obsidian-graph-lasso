/**
 * Post-selection visual: semi-transparent fill inside the region + animated dashed outline
 * (common “marching ants” cue from design tools like Photoshop / Figma selection).
 */

export type NormalizedSelection =
	| { kind: "marquee"; nx: number; ny: number; nw: number; nh: number }
	| { kind: "lasso"; npts: { nx: number; ny: number }[] };

/** One drawn region; subtract uses a distinct stroke (no positive mask fill). */
export type ChromeRegion = { sel: NormalizedSelection; subtract: boolean };

export function toNormalizedMarquee(
	r: { left: number; top: number; right: number; bottom: number },
	ob: DOMRect,
): NormalizedSelection {
	const w = ob.width || 1;
	const h = ob.height || 1;
	return {
		kind: "marquee",
		nx: (r.left - ob.left) / w,
		ny: (r.top - ob.top) / h,
		nw: (r.right - r.left) / w,
		nh: (r.bottom - r.top) / h,
	};
}

export function toNormalizedLasso(pts: { x: number; y: number }[], ob: DOMRect): NormalizedSelection {
	const w = ob.width || 1;
	const h = ob.height || 1;
	return {
		kind: "lasso",
		npts: pts.map((p) => ({ nx: (p.x - ob.left) / w, ny: (p.y - ob.top) / h })),
	};
}

function dashAnimateEl(
	el: SVGElement,
	durSec: number,
	values: string,
): void {
	const anim = document.createElementNS("http://www.w3.org/2000/svg", "animate");
	anim.setAttribute("attributeName", "stroke-dashoffset");
	anim.setAttribute("values", values);
	anim.setAttribute("dur", `${durSec}s`);
	anim.setAttribute("repeatCount", "indefinite");
	el.appendChild(anim);
}

function paintOneRegion(
	svg: SVGSVGElement,
	sel: NormalizedSelection,
	maskOpacity: number,
	cssW: number,
	cssH: number,
	subtract: boolean,
): void {
	const fill = subtract
		? "none"
		: `rgba(255,255,255,${Math.max(0, Math.min(1, maskOpacity))})`;
	const strokeDark = subtract ? "#c92a2a" : "var(--text-normal)";
	const strokeLight = subtract ? "#ff922b" : "var(--background-primary)";

	const appendOutlinePair = (shapeEl: SVGRectElement | SVGPolygonElement) => {
		const dark = shapeEl.cloneNode(false) as SVGRectElement | SVGPolygonElement;
		dark.setAttribute("fill", fill);
		dark.setAttribute("stroke", strokeDark);
		dark.setAttribute("stroke-width", String(subtract ? 2 : 1));
		dark.setAttribute("stroke-dasharray", "4 4");
		svg.appendChild(dark);
		dashAnimateEl(dark, 0.45, "0;8");

		const light = shapeEl.cloneNode(false) as SVGRectElement | SVGPolygonElement;
		light.setAttribute("fill", "none");
		light.setAttribute("stroke", strokeLight);
		light.setAttribute("stroke-width", String(subtract ? 2 : 1));
		light.setAttribute("stroke-dasharray", "4 4");
		light.setAttribute("stroke-dashoffset", "4");
		svg.appendChild(light);
		dashAnimateEl(light, 0.45, "4;-4");
	};

	if (sel.kind === "marquee") {
		const x = sel.nx * cssW;
		const y = sel.ny * cssH;
		const rw = Math.max(1, sel.nw * cssW);
		const rh = Math.max(1, sel.nh * cssH);
		const proto = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		proto.setAttribute("x", String(x));
		proto.setAttribute("y", String(y));
		proto.setAttribute("width", String(rw));
		proto.setAttribute("height", String(rh));
		appendOutlinePair(proto);
	} else if (sel.npts.length >= 3) {
		const pts = sel.npts.map((p) => `${p.nx * cssW},${p.ny * cssH}`).join(" ");
		const proto = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		proto.setAttribute("points", pts);
		appendOutlinePair(proto);
	}
}

/** Clears and repaints all regions; hides svg when empty. */
export function paintSelectionChrome(
	svg: SVGSVGElement,
	regions: ChromeRegion[] | null,
	maskOpacity: number,
	cssW: number,
	cssH: number,
): void {
	while (svg.firstChild) svg.removeChild(svg.firstChild);
	if (!regions?.length || cssW < 1 || cssH < 1) {
		svg.style.display = "none";
		return;
	}
	svg.style.display = "block";
	svg.setAttribute("viewBox", `0 0 ${cssW} ${cssH}`);
	svg.setAttribute("width", String(cssW));
	svg.setAttribute("height", String(cssH));
	svg.style.pointerEvents = "none";
	svg.style.position = "absolute";
	svg.style.inset = "0";

	for (const r of regions) {
		paintOneRegion(svg, r.sel, maskOpacity, cssW, cssH, r.subtract);
	}
}
