/** Icônes au trait (24 × 24), héritent de la couleur du texte. */
type P = { className?: string };
const base = (className = "h-5 w-5") => ({
  className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IconPhone = ({ className }: P) => (
  <svg {...base(className)}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
);
export const IconUser = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
export const IconMenu = ({ className }: P) => (
  <svg {...base(className)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconClose = ({ className }: P) => (
  <svg {...base(className)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconArrow = ({ className }: P) => (
  <svg {...base(className)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconPin = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
export const IconClock = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconBag = ({ className }: P) => (
  <svg {...base(className)}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
);
export const IconScooter = ({ className }: P) => (
  <svg {...base(className)}><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M9 17h6l-2-7h-3M13 10h3l2 7M15 6h3" /></svg>
);
export const IconTable = ({ className }: P) => (
  <svg {...base(className)}><path d="M3 9h18M5 9v11M19 9v11M8 9V6a4 4 0 0 1 8 0v3" /></svg>
);
export const IconShield = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconFlame = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-3-2 2-3 4-3 7a6 6 0 0 0 6 6Z" /></svg>
);
export const IconCalendar = ({ className }: P) => (
  <svg {...base(className)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const IconLeaf = ({ className }: P) => (
  <svg {...base(className)}><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19 13 11" /></svg>
);
export const IconInstagram = ({ className }: P) => (
  <svg {...base(className)}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".5" fill="currentColor" /></svg>
);
export const IconFacebook = ({ className }: P) => (
  <svg {...base(className)}><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z" /></svg>
);
export const IconStar = ({ className }: P) => (
  <svg {...base(className)}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></svg>
);
