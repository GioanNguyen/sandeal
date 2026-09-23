import { PLATFORMS } from "@/lib/format";

export function PlatformBadge({ platform, inline = false }: { platform: string; inline?: boolean }) {
  const p = PLATFORMS[platform] ?? { label: platform, color: "#666" };
  return (
    <span className={`platform${inline ? " platform-inline" : ""}`}>
      <span className="dot" style={{ background: p.color }} aria-hidden="true" />
      {p.label}
    </span>
  );
}
