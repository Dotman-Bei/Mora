import type { SVGProps } from "react";

// Outlined 24px icons in the Material style (frontend.md §6.4), drawn in
// currentColor so they follow the theme. Decorative unless given a title.

type P = SVGProps<SVGSVGElement>;
const s = (p: P) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
  ...p,
});

export const Icons = {
  /**
   * The Mora mark: the sender's rail, the payment held, the recipient's rail.
   * Same geometry as public/brand/mora-mark.svg: a 14x12 grid, drawn at
   * whole multiples (28x24 in the header) so every edge is a whole pixel.
   */
  Logo: (p: P) => (
    <svg width={28} height={24} viewBox="0 0 14 12" fill="currentColor" aria-hidden {...p}>
      <rect x="0" y="0" width="9" height="2" />
      <rect x="4" y="3" width="6" height="6" />
      <rect x="5" y="10" width="9" height="2" />
    </svg>
  ),
  send: (p: P) => (
    <svg {...s(p)}>
      <path d="M4 12h13M12 6l6 6-6 6" />
    </svg>
  ),
  link: (p: P) => (
    <svg {...s(p)}>
      <path d="M10 14l4-4M8.5 16.5l-2 2a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0M15.5 7.5l2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0" />
    </svg>
  ),
  inbox: (p: P) => (
    <svg {...s(p)}>
      <path d="M4 5h16v14H4zM4 13h4.5l1.5 2.5h4l1.5-2.5H20" />
    </svg>
  ),
  activity: (p: P) => (
    <svg {...s(p)}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  ),
  undo: (p: P) => (
    <svg {...s(p)}>
      <path d="M8 8H15a5 5 0 0 1 0 10h-5M8 8l3.5-3.5M8 8l3.5 3.5" />
    </svg>
  ),
  code: (p: P) => (
    <svg {...s(p)}>
      <path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5" />
    </svg>
  ),
  play: (p: P) => (
    <svg {...s(p)}>
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  ),
  api: (p: P) => (
    <svg {...s(p)}>
      <path d="M4 6h16v12H4zM8 10h3M8 14h8" />
    </svg>
  ),
  check: (p: P) => (
    <svg {...s(p)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  copy: (p: P) => (
    <svg {...s(p)}>
      <path d="M8 8h11v11H8zM5 16V5h11" />
    </svg>
  ),
  share: (p: P) => (
    <svg {...s(p)}>
      <path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 13v7h14v-7" />
    </svg>
  ),
  external: (p: P) => (
    <svg {...s(p)}>
      <path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" />
    </svg>
  ),
  arrowRight: (p: P) => (
    <svg {...s(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  close: (p: P) => (
    <svg {...s(p)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
};
