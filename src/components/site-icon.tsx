import { useEffect, useState } from "react";

import { hostnameOf } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * The page's own icon when we captured one, otherwise a letter badge. The src is
 * always a data URL that came from a site the user already visited, so nothing
 * is fetched while this renders.
 */
export function SiteIcon({
  favicon,
  url,
  title,
  isStartPage,
  className,
}: {
  favicon: string | null;
  url: string;
  title?: string;
  isStartPage?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [favicon]);

  // The start page has no site, so a letter would be meaningless — use the mark.
  if (isStartPage) {
    return (
      <span className={cn("mini-site-icon mini-site-icon-mark", className)} aria-hidden="true" />
    );
  }

  const letter =
    (hostnameOf(url) || title || "?").trim()[0]?.toUpperCase() ?? "?";

  if (!favicon || broken) {
    return <span className={cn("mini-site-icon", className)}>{letter}</span>;
  }

  return (
    <img
      className={cn("mini-site-icon mini-site-icon-img", className)}
      src={favicon}
      alt=""
      onError={() => setBroken(true)}
    />
  );
}
