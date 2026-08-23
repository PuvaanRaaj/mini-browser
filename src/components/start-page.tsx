import { Omnibox } from "@/components/omnibox";

export function StartPage({ onNavigate }: { onNavigate: (value: string) => void }) {
  return (
    <div className="mini-start">
      <Omnibox onSubmit={onNavigate} />
    </div>
  );
}
