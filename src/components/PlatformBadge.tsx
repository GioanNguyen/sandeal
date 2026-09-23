import { PLATFORMS } from "@/lib/format";

export function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS[platform] ?? { label: platform, color: "#666" };
  return <span className="badge" style={{ background: p.color }}>{p.label}</span>;
}
