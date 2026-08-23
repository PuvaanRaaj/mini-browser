import { useEffect, useRef, type FormEvent } from "react";

export function Omnibox({
  defaultValue = "",
  placeholder = "Enter URL or search...",
  autoFocus = true,
  onSubmit,
}: {
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = inputRef.current;
    if (!node || !autoFocus) return;
    node.focus();
    node.select();
  }, [autoFocus, defaultValue]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(String(data.get("q") ?? ""));
  };

  return (
    <form className="mini-omnibox-form" onSubmit={submit}>
      <input
        ref={inputRef}
        className="mini-omnibox"
        data-agent="omnibox"
        aria-label="Search or enter address"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="go"
      />
    </form>
  );
}
