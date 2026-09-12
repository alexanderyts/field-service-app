// Per-street trace colors, cycled when several traced streets are drawn together (e.g. the
// territory mini-map's polylines). Kept apart from the app's semantic palette so trace lines
// stay visually distinct from status/category hues.
//
// (A schematic canvas renderer once lived here — `renderStreetsImage`, which drew traces onto
// an off-screen canvas to avoid the cross-origin "tainted canvas" risk of capturing real map
// tiles. It had no callers and was removed in 0.25.1; only these colors are still used.)

export const STREET_COLORS = ['#2f6f5e', '#d97a3e', '#6d5dd3', '#c1587a', '#3b82a6', '#a68a3b']
