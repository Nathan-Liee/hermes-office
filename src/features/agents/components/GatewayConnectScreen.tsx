import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { RunningAvatarLoader } from "@/features/agents/components/RunningAvatarLoader";

type GatewayConnectScreenProps = {
  gatewayUrl: string;
  token: string;
  status: GatewayStatus;
  error: string | null;
  onGatewayUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
};

export const GatewayConnectScreen = ({
  gatewayUrl,
  token,
  status,
  error,
  onGatewayUrlChange,
  onTokenChange,
  onConnect,
}: GatewayConnectScreenProps) => {
  const [showToken, setShowToken] = useState(false);

  const connectDisabled = status === "connecting";
  const connectLabel = connectDisabled ? "Connecting…" : "Connect";

  const statusDotClass =
    status === "connected"
      ? "ui-dot-status-connected"
      : status === "connecting"
        ? "ui-dot-status-connecting"
        : "ui-dot-status-disconnected";

  const statusCopy = useMemo(() => {
    if (status === "connecting") return "Connecting to Hermes API…";
    if (status === "connected") return "Connected to Hermes API.";
    return "Not connected.";
  }, [status]);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[820px] flex-1 flex-col gap-5">
      <div className="ui-card px-4 py-2">
        <div className="flex items-center gap-2">
          {status === "connecting" ? (
            <RunningAvatarLoader size={18} trackWidth={36} inline />
          ) : (
            <span className={`h-2.5 w-2.5 ${statusDotClass}`} />
          )}
          <p className="text-sm font-semibold text-foreground">{statusCopy}</p>
        </div>
      </div>

      <div className="ui-card px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-foreground/90">
            Hermes API URL
            <input
              className="ui-input h-10 rounded-md px-4 font-sans text-sm text-foreground outline-none"
              type="text"
              value={gatewayUrl}
              onChange={(event) => onGatewayUrlChange(event.target.value)}
              placeholder="ws://localhost:18789"
              spellCheck={false}
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-foreground/90">
            API Key (optional)
            <div className="relative">
              <input
                className="ui-input h-10 w-full rounded-md px-4 pr-10 font-sans text-sm text-foreground outline-none"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(event) => onTokenChange(event.target.value)}
                placeholder="optional"
                spellCheck={false}
              />
              <button
                type="button"
                className="ui-btn-icon absolute inset-y-0 right-1 my-auto h-8 w-8 border-transparent bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                aria-label={showToken ? "Hide token" : "Show token"}
                onClick={() => setShowToken((prev) => !prev)}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4 transition-transform duration-150" />
                ) : (
                  <Eye className="h-4 w-4 transition-transform duration-150" />
                )}
              </button>
            </div>
          </label>

          <button
            type="button"
            className="ui-btn-primary mt-1 h-11 w-full px-4 text-xs font-semibold tracking-[0.05em] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onConnect}
            disabled={connectDisabled || !gatewayUrl.trim()}
          >
            {connectLabel}
          </button>

          {status === "connecting" ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <RunningAvatarLoader size={16} trackWidth={32} inline />
              Connecting…
            </div>
          ) : null}

          {error ? <p className="ui-text-danger text-xs leading-snug">{error}</p> : null}
        </div>
      </div>
    </div>
  );
};
