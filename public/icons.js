// ============================================================
// icons.js — the single inline SVG icon set for ClinCog.
// One dictionary, stroke 1.5px, 20x20 viewBox, currentColor -
// no icon library dependency. Usage: ClinIcons.get("check")
// returns a ready-to-insert <svg> markup string.
//
// This is a starter set covering what the component library and
// styleguide need right now. Extend it here, in one place, as
// actual pages get rebuilt - never inline a one-off <svg> on a
// page itself.
// ============================================================

const ClinIcons = {
  _base: 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"',

  paths: {
    check: '<polyline points="4 10.5 8 14.5 16 6"/>',
    x: '<line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/>',
    "chevron-down": '<polyline points="5 7.5 10 12.5 15 7.5"/>',
    "chevron-right": '<polyline points="7.5 5 12.5 10 7.5 15"/>',
    "chevron-left": '<polyline points="12.5 5 7.5 10 12.5 15"/>',
    "arrow-up": '<line x1="10" y1="15" x2="10" y2="5"/><polyline points="5 9 10 4 15 9"/>',
    "arrow-down": '<line x1="10" y1="5" x2="10" y2="15"/><polyline points="5 11 10 16 15 11"/>',
    clock: '<circle cx="10" cy="10" r="7"/><polyline points="10 6 10 10 13 12"/>',
    "message-circle": '<path d="M17 9.5a7 7 0 1 1-3.1-5.8L17 3l-1 3.6a6.97 6.97 0 0 1 1 2.9Z"/>',
    "message-square": '<path d="M3 4h14v10H7l-4 4V4Z"/>',
    calendar: '<rect x="3" y="4.5" width="14" height="12" rx="1.5"/><line x1="3" y1="8" x2="17" y2="8"/><line x1="7" y1="2.5" x2="7" y2="5.5"/><line x1="13" y1="2.5" x2="13" y2="5.5"/>',
    layers: '<path d="M10 3 3 7l7 4 7-4-7-4Z"/><path d="M3 11l7 4 7-4"/>',
    grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>',
    book: '<path d="M4 4.5c1.5-1 4-1 6 0v11c-2-1-4.5-1-6 0v-11Z"/><path d="M16 4.5c-1.5-1-4-1-6 0v11c2-1 4.5-1 6 0v-11Z"/>',
    brain: '<path d="M8 4a2.5 2.5 0 0 0-2.5 2.5c0 .3 0 .6.1.9A2.5 2.5 0 0 0 4 9.7v.6a2.5 2.5 0 0 0 1 4.7 2.5 2.5 0 0 0 3 1.4V6.5A2.5 2.5 0 0 0 8 4Z"/><path d="M12 4a2.5 2.5 0 0 1 2.5 2.5c0 .3 0 .6-.1.9A2.5 2.5 0 0 1 16 9.7v.6a2.5 2.5 0 0 1-1 4.7 2.5 2.5 0 0 1-3 1.4V6.5A2.5 2.5 0 0 1 12 4Z"/>',
    info: '<circle cx="10" cy="10" r="7"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.3" r=".2" fill="currentColor"/>',
    help: '<circle cx="10" cy="10" r="7"/><path d="M7.8 7.5a2.2 2.2 0 0 1 4.3.7c0 1.5-2 1.7-2 3.2"/><circle cx="10" cy="14.3" r=".2" fill="currentColor"/>',
    menu: '<line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/>',
    sun: '<circle cx="10" cy="10" r="3.5"/><line x1="10" y1="2.5" x2="10" y2="4.5"/><line x1="10" y1="15.5" x2="10" y2="17.5"/><line x1="2.5" y1="10" x2="4.5" y2="10"/><line x1="15.5" y1="10" x2="17.5" y2="10"/>',
    moon: '<path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5Z"/>',
    send: '<path d="M17 3 3 9l6 2 2 6 6-14Z"/>',
    inbox: '<path d="M4 4h12l2 6v6H2v-6l2-6Z"/><path d="M2 10h4l1.5 2h5L14 10h4"/>',
    dot: '<circle cx="10" cy="10" r="4" fill="currentColor" stroke="none"/>',
    "bar-chart": '<line x1="5" y1="16" x2="5" y2="11"/><line x1="10" y1="16" x2="10" y2="6"/><line x1="15" y1="16" x2="15" y2="13"/>',
    target: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.5"/><circle cx="10" cy="10" r=".3" fill="currentColor"/>',
    "check-square": '<rect x="3.5" y="3.5" width="13" height="13" rx="2"/><polyline points="6.5 10 9 12.5 14 7"/>',
    sparkle: '<path d="M10 3v3M10 14v3M3 10h3M14 10h3M5.5 5.5l2 2M12.5 12.5l2 2M14.5 5.5l-2 2M7.5 12.5l-2 2"/>',
  },

  get(name, size = 20) {
    const p = this.paths[name];
    if (!p) return "";
    return `<svg width="${size}" height="${size}" ${this._base}>${p}</svg>`;
  },
};
