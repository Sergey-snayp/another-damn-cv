const paths = {
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  file: '<path d="M14 2H5v20h14V7Z"/><path d="M14 2v6h5M8 13h8M8 17h6"/>',
  settings: '<path d="m9 3 1-2h4l1 2 3 2 2-.2 2 4-1.5 2v3l1.5 2-2 4-2-.2-3 2-1 2h-4l-1-2-3-2-2 .2-2-4 1.5-2v-3L2 9l2-4 2 .2Z"/><circle cx="12" cy="12" r="3"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  flag: '<path d="M4 22V3c5-4 9 4 16 0v12c-7 4-11-4-16 0"/>',
  refresh: '<path d="M20 7V2l-3 3a9 9 0 1 0 3 13M20 2h-6"/>',
  bolt: '<path d="M13 2 3 14h8l-1 8L21 9h-8Z"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 13h18M10 13v3h4v-3"/>',
  location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  trash: '<path d="M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 11v6M14 11v6"/>',
};
export function icon(name, size = 20) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.file}</svg>`; }
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
