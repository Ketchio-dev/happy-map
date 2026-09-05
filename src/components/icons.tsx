/** One stroke set, one weight, one size box. Drawn inline so the interface has no emoji,
 *  no icon font, and no mismatched glyph weights. */
type P = { className?: string };
const s = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const Bolt = ({ className }: P) => (<svg {...s} className={className}><path d="M8.9 1.8 3.4 9.1h3.9l-.6 5.1 5.7-7.4H8.5z" /></svg>);
/** a building, not a snowflake: the indoor route is about being inside */
export const Indoor = ({ className }: P) => (<svg {...s} className={className}><path d="M2.2 14.2h11.6M3.6 14.2V3.1a.9.9 0 0 1 .9-.9h4.2a.9.9 0 0 1 .9.9v11.1M9.6 6.4h2.9a.9.9 0 0 1 .9.9v6.9M5.6 5h1.9M5.6 7.7h1.9M5.6 10.4h1.9M11 9.4h.9M11 11.7h.9" /></svg>);
export const Sun = ({ className }: P) => (<svg {...s} className={className}><circle cx="8" cy="8" r="2.9" /><path d="M8 1.6v1.3M8 13.1v1.3M14.4 8h-1.3M2.9 8H1.6M12.5 3.5l-.9.9M4.4 11.6l-.9.9M12.5 12.5l-.9-.9M4.4 4.4l-.9-.9" /></svg>);
export const Accessible = ({ className }: P) => (<svg {...s} className={className}><circle cx="8.4" cy="2.9" r="1.3" /><path d="M7.2 5.6v3.4h3l1.8 4M7.2 5.6 4.9 6.5M10.4 9.4a3.5 3.5 0 1 1-4-2.3" /></svg>);
export const Swap = ({ className }: P) => (<svg {...s} className={className}><path d="M4.8 2.6v10.8M4.8 13.4 2.4 11M4.8 13.4 7.2 11M11.2 13.4V2.6M11.2 2.6 8.8 5M11.2 2.6l2.4 2.4" /></svg>);
export const Warning = ({ className }: P) => (<svg {...s} className={className}><path d="M8 2.2 1.9 13.6h12.2z" /><path d="M8 6.3v3M8 11.4v.1" /></svg>);
export const Walk = ({ className }: P) => (<svg {...s} className={className}><circle cx="8.7" cy="2.8" r="1.3" /><path d="M7.6 5.4 5.9 7l1.1 2.2-1.3 4.4M8.5 9.1l1.8 1.4.8 3M7.6 5.4l2.2.7 1.4 2.1 1.8.5" /></svg>);
export const Train = ({ className }: P) => (<svg {...s} className={className}><rect x="3.6" y="2.3" width="8.8" height="9" rx="2" /><path d="M3.6 7.6h8.8M5.9 13.7 4.6 14.6M10.1 13.7l1.3.9M5.6 9.5v.1M10.4 9.5v.1M5.7 11.3h4.6" /></svg>);
export const Chevron = ({ className }: P) => (<svg {...s} className={className}><path d="m6.2 3.6 4.6 4.4-4.6 4.4" /></svg>);
export const Dot = ({ className }: P) => (<svg {...s} className={className}><circle cx="8" cy="8" r="3.2" /></svg>);
export const Stairs = ({ className }: P) => (<svg {...s} className={className}><path d="M2.2 13.6h3v-3h3v-3h3v-3h2.6" /></svg>);
export const Lift = ({ className }: P) => (<svg {...s} className={className}><rect x="3" y="2.2" width="10" height="11.6" rx="1.4" /><path d="M6 6.6l1.6-1.8 1.6 1.8M6 9.4 7.6 11.2 9.2 9.4" /></svg>);
export const Door = ({ className }: P) => (<svg {...s} className={className}><path d="M3.4 13.8V3.2a1 1 0 0 1 1-1h7.2a1 1 0 0 1 1 1v10.6M2 13.8h12M9.6 8.2v.1" /></svg>);
