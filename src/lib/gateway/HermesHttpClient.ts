"use client";

// ---------------------------------------------------------------------------
// HermesHttpClient — HTTP-based transport for Hermes API.
// Drop-in replacement for GatewayBrowserClient (WebSocket).
// Routes RPC methods to mock data or POST /api/hermes/...
// ---------------------------------------------------------------------------

type HermesHelloOk = {
  adapterType?: "hermes";
};

type PendingReq = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

// ---------------------------------------------------------------------------
// Mock agent data for demo — 3 agents in the office
// ---------------------------------------------------------------------------
const MOCK_AGENTS = [
  {
    id: "agent-athena",
    name: "Athena",
    avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%236366f1'/%3E%3Ctext x='50' y='68' font-size='48' text-anchor='middle' fill='white'%3E🦉%3C/text%3E%3C/svg%3E",
    role: "assistant",
    description: "Strategic advisor & research analyst",
    status: "online",
    model: "claude-sonnet-4-20250514",
  },
  {
    id: "agent-hermes",
    name: "Hermes",
    avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%23f59e0b'/%3E%3Ctext x='50' y='68' font-size='48' text-anchor='middle' fill='white'%3E⚡%3C/text%3E%3C/svg%3E",
    role: "assistant",
    description: "Hermes agent — general purpose assistant",
    status: "online",
    model: "claude-sonnet-4-20250514",
  },
  {
    id: "agent-midas",
    name: "Midas",
    avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%2310b981'/%3E%3Ctext x='50' y='68' font-size='48' text-anchor='middle' fill='white'%3E💰%3C/text%3E%3C/svg%3E",
    role: "assistant",
    description: "Financial analysis & data processing",
    status: "online",
    model: "claude-sonnet-4-20250514",
  },
];

class HermesHttpClient {
  private pending = new Map<string, PendingReq>();
  private _connected = false;
  private _stopped = false;
  private url: string;
  private token: string;
  private onHello: (hello: HermesHelloOk) => void;
  private onEvent: (event: any) => void;
  private onClose: (info: { code: number; reason: string }) => void;
  private onGap: (info: { expected: number; received: number }) => void;
  private _lastHello: HermesHelloOk | null = null;

  get connected() {
    return this._connected && !this._stopped;
  }

  constructor(opts: {
    url: string;
    token?: string;
    authScopeKey?: string;
    clientName?: string;
    disableDeviceAuth?: boolean;
    onHello: (hello: HermesHelloOk) => void;
    onEvent: (event: any) => void;
    onClose: (info: { code: number; reason: string }) => void;
    onGap: (info: { expected: number; received: number }) => void;
  }) {
    this.url = opts.url;
    this.token = opts.token || "";
    this.onHello = opts.onHello;
    this.onEvent = opts.onEvent;
    this.onClose = opts.onClose;
    this.onGap = opts.onGap;
  }

  start() {
    if (this._stopped) return;
    // Simulate async connection — always succeeds for HTTP transport
    this._connected = true;
    const hello: HermesHelloOk = { adapterType: "hermes" };
    this._lastHello = hello;
    this.onHello(hello);
  }

  stop() {
    if (this._stopped) return;
    this._stopped = true;
    this._connected = false;
    this.rejectAllPending(new Error("Hermes HTTP client stopped"));
    this.onClose({ code: 1000, reason: "client stopped" });
  }

  async request<T = unknown>(method: string, params: unknown): Promise<T> {
    if (this._stopped) {
      throw new Error("Gateway is not connected.");
    }

    // Handle mock methods locally
    const mockResult = this.tryMock(method, params);
    if (mockResult !== undefined) {
      return mockResult as T;
    }

    // For methods that need real HTTP calls
    return this.httpCall<T>(method, params);
  }

  getLastHello(): HermesHelloOk | null {
    return this._lastHello;
  }

  // -----------------------------------------------------------------------
  // Mock RPC responses
  // -----------------------------------------------------------------------
  private tryMock(method: string, params: unknown): unknown {
    switch (method) {
      case "connect":
        return { adapterType: "hermes", protocol: 3 };

      case "agents.list":
        return { agents: MOCK_AGENTS };

      case "sessions.preview":
        return { sessions: [] };

      case "sessions.list":
        return { sessions: [] };

      case "skills.status":
        return { skills: [] };

      case "chat.history":
        return { messages: [] };

      case "models.list":
        return {
          models: [
            { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic" },
            { id: "claude-haiku-3-20250313", name: "Claude Haiku 3", provider: "anthropic" },
          ],
        };

      case "presence.list":
        return { agents: MOCK_AGENTS.map((a) => ({ agentId: a.id, status: a.status })) };

      case "ping":
        return { pong: true };

      case "config.get":
        return { exists: false, config: {} };

      case "config.set":
        return { ok: true };

      default:
        return undefined; // not a mock — fall through to HTTP
    }
  }

  // -----------------------------------------------------------------------
  // Real HTTP call via Hermes API proxy
  // -----------------------------------------------------------------------
  private async httpCall<T>(method: string, params: unknown): Promise<T> {
    if (method === "chat.send") {
      return this.forwardChatSend(params as Record<string, unknown>) as unknown as T;
    }

    // Unknown method — return empty mock to avoid crashes
    console.warn(`[HermesHttpClient] No handler for "${method}", returning empty mock`);
    return {} as T;
  }

  private async forwardChatSend(params: Record<string, unknown>): Promise<{ ok: boolean; messageId?: string }> {
    try {
      const sessionKey = typeof params?.sessionKey === "string" ? params.sessionKey : "";
      const text = typeof params?.text === "string" ? params.text : "";
      const agentId = typeof params?.agentId === "string" ? params.agentId : "";

      // Extract agent name from session key or default
      const agentName = agentId || "assistant";

      const body = JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [
          { role: "user", content: text },
        ],
        max_tokens: 4096,
        stream: false,
      });

      const response = await fetch("/api/hermes/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      if (!response.ok) {
        console.error(`[HermesHttpClient] chat.send HTTP ${response.status}`);
        return { ok: false };
      }

      const data = await response.json();
      return {
        ok: true,
        messageId: crypto.randomUUID(),
      };
    } catch (err) {
      console.error("[HermesHttpClient] chat.send failed:", err);
      return { ok: false };
    }
  }

  private rejectAllPending(error: Error) {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const p of entries) p.reject(error);
  }
}

export { HermesHttpClient };
export type { HermesHelloOk };
