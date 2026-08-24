import type { WebAuthnPrompt } from "@/lib/types";

export function WebAuthnAccountDialog({
  prompt,
  onSelect,
}: {
  prompt: WebAuthnPrompt;
  onSelect: (credentialId: string | null) => void;
}) {
  return (
    <div className="mini-webauthn-backdrop" role="presentation">
      <section
        className="mini-webauthn-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mini-webauthn-title"
      >
        <p className="mini-webauthn-kicker">Passkey</p>
        <h2 id="mini-webauthn-title">Choose an account</h2>
        <p className="mini-webauthn-origin">Continue to {prompt.relyingPartyId}</p>
        <div className="mini-webauthn-accounts">
          {prompt.accounts.map((account) => (
            <button
              type="button"
              className="mini-webauthn-account"
              key={account.credentialId}
              onClick={() => onSelect(account.credentialId)}
            >
              <strong>{account.displayName}</strong>
              {account.name !== account.displayName ? <span>{account.name}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" className="mini-webauthn-cancel" onClick={() => onSelect(null)}>
          Cancel
        </button>
      </section>
    </div>
  );
}
