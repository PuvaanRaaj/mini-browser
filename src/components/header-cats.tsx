/**
 * A cat and a kitten padding along the toolbar. They sit behind every control
 * and ignore pointer events, so the address bar occludes them as they pass and
 * nothing they do can get in the way of reading or clicking a URL.
 */
function Cat({ className, scale }: { className: string; scale: number }) {
  return (
    <span className={className} style={{ ["--cat-scale" as string]: scale }}>
      <svg viewBox="0 0 40 24" aria-hidden="true">
        {/* tail, animated separately so it can flick */}
        <path
          className="mini-cat-tail"
          d="M6 16 C1 15 2 9 5 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* body */}
        <path d="M7 17 C7 12 12 10 19 10 C26 10 30 12 30 16 L30 18 L7 18 Z" />
        {/* head, ears and a notch for the muzzle */}
        <path d="M28 12 C28 8 31 6 34 6 C37 6 39 8 39 12 C39 15 37 17 34 17 C31 17 28 15 28 12 Z" />
        <path d="M30 7 L29.5 3 L33 5.5 Z" />
        <path d="M36 5.5 L39.5 3 L39 7.5 Z" />
        {/* legs, each stepping on its own offset */}
        <rect className="mini-cat-leg mini-cat-leg-1" x="9" y="17" width="2.4" height="6" rx="1.2" />
        <rect className="mini-cat-leg mini-cat-leg-2" x="14" y="17" width="2.4" height="6" rx="1.2" />
        <rect className="mini-cat-leg mini-cat-leg-3" x="22" y="17" width="2.4" height="6" rx="1.2" />
        <rect className="mini-cat-leg mini-cat-leg-4" x="27" y="17" width="2.4" height="6" rx="1.2" />
      </svg>
    </span>
  );
}

export function HeaderCats() {
  return (
    <div className="mini-cats" aria-hidden="true">
      <Cat className="mini-cat mini-cat-big" scale={0.8} />
      <Cat className="mini-cat mini-cat-kitten" scale={0.55} />
    </div>
  );
}
