import type {
  EventFrame,
  GatewayConnectOptions,
  GatewayGapInfo,
  GatewayStatus,
} from "@/lib/gateway/GatewayClient";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import {
  sendAgentHandoffViaRuntime,
  sendDirectedAgentMessageViaRuntime,
} from "@/lib/runtime/agentMessaging";
import type { RuntimeCapability, RuntimeEvent, RuntimeProvider } from "@/lib/runtime/types";

const HERMES_RUNTIME_CAPABILITIES: ReadonlySet<RuntimeCapability> = new Set([
  "agents",
  "sessions",
  "chat",
  "agent-messages",
  "agent-handoffs",
  "streaming",
  "approvals",
  "config",
  "models",
  "skills",
  "cron",
  "files",
  "agent-roles",
]);

/* Inlined from the deleted @/lib/runtime/openclaw/normalizeGatewayEvent */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const coerceTimestamp = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const resolveTimestamp = (payload: Record<string, unknown> | null): number => {
  if (!payload) return Date.now();
  return (
    coerceTimestamp(payload.timestamp) ??
    coerceTimestamp(payload.createdAt) ??
    coerceTimestamp(payload.updatedAt) ??
    coerceTimestamp(payload.at) ??
    Date.now()
  );
};

const resolveChatText = (payload: Record<string, unknown> | null): string | null => {
  if (!payload) return null;
  const message = isRecord(payload.message) ? payload.message : null;
  const directText = typeof payload.text === "string" ? payload.text.trim() : "";
  if (directText) return directText;
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  return content || null;
};

const normalizeGatewayEvent = (frame: EventFrame): RuntimeEvent => {
  const payload = isRecord(frame.payload) ? frame.payload : null;
  const at = resolveTimestamp(payload);

  if (frame.event === "presence" || frame.event === "heartbeat") {
    return {
      type: "summary-refresh",
      at,
      frame,
    };
  }

  if (frame.event === "chat") {
    const state = typeof payload?.state === "string" ? payload.state.trim() : "";
    const runId = typeof payload?.runId === "string" ? payload.runId.trim() || null : null;
    const sessionKey =
      typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() || null : null;
    const text = resolveChatText(payload);
    if (state === "delta") {
      return {
        type: "chat.delta",
        at,
        frame,
        runId,
        sessionKey,
        text,
      };
    }
    if (state === "final") {
      return {
        type: "chat.final",
        at,
        frame,
        runId,
        sessionKey,
        text,
      };
    }
    if (state === "error") {
      return {
        type: "chat.error",
        at,
        frame,
        runId,
        sessionKey,
        text,
      };
    }
    if (state === "aborted") {
      return {
        type: "chat.aborted",
        at,
        frame,
        runId,
        sessionKey,
        text,
      };
    }
  }

  if (frame.event === "agent") {
    const stream = typeof payload?.stream === "string" ? payload.stream.trim() : "";
    const data = isRecord(payload?.data) ? payload.data : null;
    const phase = typeof data?.phase === "string" ? data.phase.trim() : "";
    if (stream === "lifecycle" && (phase === "start" || phase === "end" || phase === "error")) {
      return {
        type: "run.lifecycle",
        at,
        frame,
        runId: typeof payload?.runId === "string" ? payload.runId.trim() || null : null,
        sessionKey:
          typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() || null : null,
        phase,
      };
    }
  }

  return {
    type: "unknown",
    at,
    frame,
  };
};

export class HermesRuntimeProvider implements RuntimeProvider {
  readonly id = "hermes" as const;
  readonly label = "Hermes";
  readonly metadata = {
    id: this.id,
    label: this.label,
    runtimeName: "Hermes",
  } as const;
  readonly capabilities = HERMES_RUNTIME_CAPABILITIES;

  constructor(readonly client: GatewayClient) {}

  connect(options: GatewayConnectOptions): Promise<void> {
    return this.client.connect(options);
  }

  disconnect(): void {
    this.client.disconnect();
  }

  async call<T = unknown>(method: string, params: unknown): Promise<T> {
    switch (method) {
      case "agents.message":
        return (await sendDirectedAgentMessageViaRuntime(this.client, params as never)) as T;
      case "agents.handoff":
        return (await sendAgentHandoffViaRuntime(this.client, params as never)) as T;
      default:
        return this.client.call<T>(method, params);
    }
  }

  onStatus(handler: (status: GatewayStatus) => void): () => void {
    return this.client.onStatus(handler);
  }

  onGap(handler: (info: GatewayGapInfo) => void): () => void {
    return this.client.onGap(handler);
  }

  onEvent(handler: (event: EventFrame) => void): () => void {
    return this.client.onEvent(handler);
  }

  onRuntimeEvent(handler: (event: RuntimeEvent) => void): () => void {
    return this.client.onEvent((event) => {
      handler(normalizeGatewayEvent(event));
    });
  }
}
