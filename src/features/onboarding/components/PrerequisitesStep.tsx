/**
 * PrerequisitesStep — Tells users what they need before connecting.
 */
import { CheckCircle2, ExternalLink } from "lucide-react";

const prerequisites = [
  {
    label: "HO3D installed",
    detail: "Install via npm, pnpm, or from source",
    link: "https://docs.ho3d.ai",
    linkLabel: "Installation docs",
  },
  {
    label: "Gateway running",
    detail: "Start with: ho3d gateway start",
    command: "ho3d gateway start",
  },
  {
    label: "Gateway URL and token",
    detail: "Found in ~/.ho3d/ho3d.json or your remote setup",
  },
  {
    label: "Node.js 20+",
    detail: "Required for running HO3D locally",
    link: "https://nodejs.org",
    linkLabel: "Download Node.js",
  },
] as const;

export const PrerequisitesStep = () => (
  <div className="space-y-2.5">
    <p className="text-[13px] leading-5 text-white/70">
      Make sure you have these ready before connecting. If you already have
      HO3D running, you can skip this step.
    </p>

    <div className="space-y-1.5">
      {prerequisites.map(({ label, detail, ...rest }) => (
        <div
          key={label}
          className="flex gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-white">{label}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-white/55">{detail}</p>
            {"command" in rest ? (
              <code className="mt-1 block rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                {rest.command}
              </code>
            ) : null}
            {"link" in rest && rest.link ? (
              <a
                href={rest.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[10px] leading-4 text-amber-300 hover:text-amber-200"
              >
                {rest.linkLabel ?? "Learn more"}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </div>

    <p className="text-[10px] leading-4 text-white/40">
      Need help? Check{" "}
      <a
        href="https://docs.ho3d.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-300/70 hover:text-amber-200"
      >
        docs.ho3d.ai
      </a>{" "}
      or{" "}
      <a
        href="https://discord.com/invite/clawd"
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-300/70 hover:text-amber-200"
      >
        join Discord
      </a>
      .
    </p>
  </div>
);
