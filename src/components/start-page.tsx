import { KeyRoundIcon } from "lucide-react";

import { Omnibox } from "@/components/omnibox";
import { modLabel } from "@/lib/mod";

export function StartPage({
  onNavigate,
  onAuthenticator,
}: {
  onNavigate: (value: string) => void;
  onAuthenticator: () => void;
}) {
  const mod = modLabel();

  return (
    <div className="mini-start">
      <Omnibox onSubmit={onNavigate} />
      <button
        type="button"
        className="mini-corner-ext"
        onClick={onAuthenticator}
        title={`Authenticator (${mod}+Shift+A)`}
        aria-label="Authenticator"
      >
        <KeyRoundIcon />
      </button>
    </div>
  );
}
