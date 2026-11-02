const paths = {
  extension: 'M8 3h3a3 3 0 1 1 6 0h4v6a3 3 0 1 0 0 6v6h-6a3 3 0 1 0-6 0H3v-6a3 3 0 1 0 0-6V3h5Z',
  announcement: 'm4 9 16-5v16L4 15V9Zm0 0H2v6h2m3 1 2 6h3l-2-5M16 6v12',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 10h18c0-3-3-3-3-10Zm-8 13h4',
  flame: 'M13 3c1 5-4 5-2 9 2-1 3-2 3-4 4 3 6 6 4 10-1 2-3 3-6 3-5 0-8-4-6-9 1-2 3-3 4-6 0 3 1 4 1 4 2-2 3-4 2-7Z',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  sparkle: 'm12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-8l1-7Z',
  laptop: 'M5 4h14v13H5V4ZM2 20h20l-3-3H5l-3 3Z',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Zm2-3v6m10-6v6M3 11h18m-13 4h2m4 0h2',
  search: 'M21 21l-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z',
  plus: 'M12 5v14M5 12h14',
  options:
    'M3 6h4m4 0h10M3 18h10m4 0h4M11 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM17 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  board: 'M3 4h18v16H3V4ZM9 4v16m6-16v16',
  list: 'M4 5h16v4H4V5Zm0 10h16v4H4v-4Z',
  chart: 'M4 3v17h17M7 14l4-5 4 3 6-7',
  briefcase:
    'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 6h18v14H3V6Zm0 6h18m-9-2v4',
  saved: 'M6 3h12v18l-6-4-6 4V3Z',
  applied: 'm3 10 18-7-7 18-3-8-8-3Zm8 3L21 3',
  screening: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v5m0 3h.01',
  interview:
    'M14 5H7a4 4 0 0 0-4 4v3a4 4 0 0 0 3 3.9V20l5-4h3a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4Zm6 5a4 4 0 0 1 1 3v3l1 3-4-2',
  offer: 'M3 5h18v14H3V5Zm0 1 9 7 9-7',
  accepted: 'm5 12 4 4L19 6',
  rejected: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6 6 6m-6 0 6-6',
  declined: 'M4 12h16',
  dismissed: 'm6 6 12 12M6 18 18 6',
  eyeOff:
    'm3 3 18 18M10 5h2c5 0 9 7 9 7a17 17 0 0 1-4 4M6 6a21 21 0 0 0-3 3l-1 3s4 7 10 7c1 0 2 0 3-1M9 9a4 4 0 0 0 6 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  more: 'M4 12h.01M12 12h.01M20 12h.01',
  location:
    'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  archive: 'M4 8h16v13H4V8ZM3 3h18v5H3V3Zm6 9h6',
  restore: 'M4 8h16v13H4V8ZM3 3h18v5H3V3Zm9 11v-7m-3 3 3-3 3 3',
  upload: 'M12 16V3m-4 4 4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5',
  download: 'M12 3v13m-4-4 4 4 4-4M4 15v6h16v-6',
  manage: 'M9 5h12v16H9V5ZM3 3h12v2M3 3v12h6m3-2 2 2 4-4',
  check: 'm5 12 4 4L19 6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h5',
} as const;
export type DashboardIconName = keyof typeof paths;
export function DashboardIcon({
  name,
  size = 19,
  filled = false,
}: {
  name: DashboardIconName;
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
