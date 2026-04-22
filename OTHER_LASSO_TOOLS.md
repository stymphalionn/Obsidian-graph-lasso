# What other “lasso” tools usually do (21Apr26)

Short survey of common patterns—not a feature checklist, but a sanity check for UX parity.

| Domain | Typical behavior |
|--------|-------------------|
| **Raster (Photoshop, GIMP)** | Lasso selects pixels; often **feather** + **anti-alias**; **marching ants** show selection; **Q** quick mask; modifiers add/subtract/intersect selection. |
| **Vector / UI (Figma, Illustrator)** | Selection is object-based; **shift** adds to selection; outline + fill dim outside (**mask** / **isolation mode**); rarely true freehand lasso on canvas—more marquee and direct select. |
| **Maps / GIS** | Polygon lasso defines a **geofence**; outputs are **lists**, **exports**, or **spatial filters**—closest analogy to “lasso notes then operate on set.” |
| **File managers (some)** | Rubber-band **marquee** over icons; **context menu** on selection batch (copy, delete, tag). Freehand lasso is uncommon here. |

**Graph Lasso (this plugin)** aligns with **GIS + file-manager**: region defines a **set of vault files**, then **batch actions** (tags, links metadata, clipboard). Visuals follow **marching ants + light mask** inside the region (design-tool cue) rather than pixel feathering.
