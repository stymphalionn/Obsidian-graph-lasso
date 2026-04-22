/** Axis-aligned rectangle from two corners (client coordinates). */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number) {
	const left = Math.min(x1, x2);
	const right = Math.max(x1, x2);
	const top = Math.min(y1, y2);
	const bottom = Math.max(y1, y2);
	return { left, right, top, bottom };
}

export function pointInRect(px: number, py: number, r: ReturnType<typeof normalizeRect>) {
	return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
}

/** Ray-casting point-in-polygon; `poly` closed or open (we treat as closed). */
export function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
	if (poly.length < 3) return false;
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const pi = poly[i]!;
		const pj = poly[j]!;
		const xi = pi.x;
		const yi = pi.y;
		const xj = pj.x;
		const yj = pj.y;
		const intersect =
			yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

/** Ramer–Douglas–Peucker polyline simplification (screen space). */
export function simplifyPolyline(
	points: { x: number; y: number }[],
	epsilon: number,
): { x: number; y: number }[] {
	if (points.length <= 2) return points.slice();
	const sqEps = epsilon * epsilon;

	const distSq = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
		const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
		let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
		t = Math.max(0, Math.min(1, t));
		const projX = a.x + t * (b.x - a.x);
		const projY = a.y + t * (b.y - a.y);
		return (p.x - projX) ** 2 + (p.y - projY) ** 2;
	};

	const recurse = (start: number, end: number, keep: boolean[]) => {
		let maxDist = 0;
		let index = 0;
		for (let i = start + 1; i < end; i++) {
			const d = distSq(points[i]!, points[start]!, points[end]!);
			if (d > maxDist) {
				index = i;
				maxDist = d;
			}
		}
		if (maxDist > sqEps) {
			keep[index] = true;
			recurse(start, index, keep);
			recurse(index, end, keep);
		}
	};

	const keep = points.map(() => false);
	keep[0] = true;
	keep[points.length - 1] = true;
	recurse(0, points.length - 1, keep);
	return points.filter((_, i) => keep[i]);
}
