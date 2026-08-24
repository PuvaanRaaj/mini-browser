/**
 * A cat and a kitten padding along the toolbar. They sit behind every control
 * and ignore pointer events, so the address bar occludes them as they pass and
 * nothing they do can get in the way of reading or clicking a URL.
 *
 * Colours come from CSS custom properties per variant. The tuxedo's "black" is
 * a dark charcoal rather than true black: on a #0a0a0b toolbar a black cat is
 * an invisible cat, so the coat keeps just enough lift to hold its shape and
 * the white markings do the rest.
 */
function Cat({
  className,
  scale,
  tabby,
}: {
  className: string;
  scale: number;
  tabby: boolean;
}) {
  return (
    <span className={className} style={{ ["--cat-scale" as string]: scale }}>
      <svg viewBox="0 0 40 24" aria-hidden="true">
        <path
          className="mini-cat-tail"
          d="M6 16 C1 15 2 9 5 8"
          fill="none"
          stroke="var(--cat-coat)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        <path
          className="mini-cat-coat"
          d="M7 17 C7 12 12 10 19 10 C26 10 30 12 30 16 L30 18 L7 18 Z"
        />
        <path
          className="mini-cat-coat"
          d="M28 12 C28 8 31 6 34 6 C37 6 39 8 39 12 C39 15 37 17 34 17 C31 17 28 15 28 12 Z"
        />
        <path className="mini-cat-coat" d="M30 7 L29.5 3 L33 5.5 Z" />
        <path className="mini-cat-coat" d="M36 5.5 L39.5 3 L39 7.5 Z" />

        {tabby ? (
          <g className="mini-cat-mark">
            <rect x="13" y="10.6" width="1.7" height="4.6" rx="0.85" />
            <rect x="17.5" y="10.2" width="1.7" height="5.2" rx="0.85" />
            <rect x="22" y="10.6" width="1.7" height="4.6" rx="0.85" />
            <rect x="33" y="6.4" width="1.5" height="3" rx="0.75" />
          </g>
        ) : null}

        {/* chest and muzzle */}
        <path
          className="mini-cat-white"
          d="M26 14 C28 14 29.5 15 30 18 L24 18 C24 16 24.5 14 26 14 Z"
        />
        <ellipse className="mini-cat-white" cx="36.5" cy="14" rx="2.6" ry="2" />

        {/* legs, each stepping on its own offset, with white socks */}
        <g className="mini-cat-leg mini-cat-leg-1">
          <rect className="mini-cat-coat" x="9" y="17" width="2.4" height="4.4" rx="1.2" />
          <rect className="mini-cat-white" x="9" y="20.6" width="2.4" height="2.4" rx="1.2" />
        </g>
        <g className="mini-cat-leg mini-cat-leg-2">
          <rect className="mini-cat-coat" x="14" y="17" width="2.4" height="4.4" rx="1.2" />
          <rect className="mini-cat-white" x="14" y="20.6" width="2.4" height="2.4" rx="1.2" />
        </g>
        <g className="mini-cat-leg mini-cat-leg-3">
          <rect className="mini-cat-coat" x="22" y="17" width="2.4" height="4.4" rx="1.2" />
          <rect className="mini-cat-white" x="22" y="20.6" width="2.4" height="2.4" rx="1.2" />
        </g>
        <g className="mini-cat-leg mini-cat-leg-4">
          <rect className="mini-cat-coat" x="27" y="17" width="2.4" height="4.4" rx="1.2" />
          <rect className="mini-cat-white" x="27" y="20.6" width="2.4" height="2.4" rx="1.2" />
        </g>
      </svg>
    </span>
  );
}

export function HeaderCats() {
  return (
    <div className="mini-cats" aria-hidden="true">
      <Cat className="mini-cat mini-cat-tuxedo" scale={0.8} tabby={false} />
      <Cat className="mini-cat mini-cat-ginger" scale={0.58} tabby />
    </div>
  );
}
