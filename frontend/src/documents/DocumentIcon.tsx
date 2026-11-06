const paths = {
  search: 'M21 21l-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z',
  plus: 'M12 5v14M5 12h14',
  filters:
    'M4 6h3m4 0h9M4 18h9m4 0h3M11 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM17 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h5',
  upload: 'M12 16V3m-4 4 4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5',
  more: 'M12 4h.01M12 12h.01M12 20h.01',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  close: 'm6 6 12 12M6 18 18 6',
  history: 'M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7m2-5v6l4 2',
  arrow: 'M7 17 17 7M7 7h10v10',
  trash: 'M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 11v6M14 11v6',
} as const;

export function DocumentIcon({
  name,
  size = 20,
  filled = false,
}: {
  name: keyof typeof paths;
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
