/**
 * Minimal inline SVG icon set (stroke style, 24px grid). Inlined to keep the
 * app fully self-contained — no icon font, no external requests.
 */

import type { JSX } from 'react';

const PATHS = {
  upload: 'M12 16V4m0 0 4 4m-4-4-4 4M4 20h16',
  filePlus:
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M12 12v6m-3-3h6',
  cursor: 'm5 3 14 7-6.5 1.5L9 18 5 3Z',
  text: 'M5 6V4h14v2M12 4v16m-3 0h6',
  pen: 'M12 19c2-6 6-9 8-9-1 4-4 8-8 9Zm0 0c-2 0-6-1-8-4 3-1 6 0 8 4ZM12 19c-1-6 0-11 2-15',
  highlighter: 'm9 11 4 4L20 8l-4-4-7 7Zm0 0-3 3 2 2-4 4h6l1-1 2-2',
  square: 'M4 5h16v14H4z',
  circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z',
  line: 'M5 19 19 5',
  arrow: 'M5 19 19 5m0 0h-8m8 0v8',
  image: 'M4 5h16v14H4zm4 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-4 6 5-5 4 4 3-3 4 4',
  signature: 'M4 17c2 0 2-6 4-6s1 8 3 8 2-10 4-10 1 8 5 8M4 21h16',
  rotateLeft: 'M8 6H4m0 0v4m0-4 3.5 3.5A8 8 0 1 1 5 15',
  rotateRight: 'M16 6h4m0 0v4m0-4-3.5 3.5A8 8 0 1 0 19 15',
  duplicate: 'M8 8h12v12H8zM4 16V4h12',
  trash: 'M4 7h16m-2 0-1 13H7L6 7m3 0V4h6v3m-5 4v6m4-6v6',
  scissors:
    'M6 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0 14 10M6 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 0L20 5',
  download: 'M12 4v12m0 0 4-4m-4 4-4-4M4 20h16',
  zip: 'M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M4 8h16m-8 3v3m0 0h2m-2 0h-2',
  undo: 'M8 5 4 9l4 4M4 9h10a6 6 0 0 1 0 12h-4',
  redo: 'm16 5 4 4-4 4m4-4H10a6 6 0 0 0 0 12h4',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5',
  question: 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4m0 3.5v.5',
  theme: 'M12 3a9 9 0 1 0 9 9c-5 2-11-4-9-9Z',
  broom: 'm13 3-2 8m0 0-6 8c3 2 9 2 13 0l-3-8m-4 0h4',
  check: 'm5 13 4 4L19 7',
  split: 'M12 4v16M4 8h5m-5 8h5m6-8h5m-5 8h5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3m-12 0h14v10H5V11Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 3',
  printer:
    'M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-10-3h10v7H7v-7Z',
  blankPage: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6',
  editText: 'M4 7V5h11v2M9 5v13m-2 0h4M14 21l6-6-2-2-6 6-.5 2.5 2.5-.5Z',
  removeObject: 'M5 5h14v14H5zM4 4l16 16',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...(className !== undefined ? { className } : {})}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
