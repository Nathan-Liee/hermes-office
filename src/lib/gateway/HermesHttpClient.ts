"use client";

// ---------------------------------------------------------------------------
// HermesHttpClient — HTTP-based transport for Hermes API.
// Drop-in replacement for GatewayBrowserClient (WebSocket).
// Routes RPC methods to mock data or POST /api/hermes/...
// ---------------------------------------------------------------------------
import { appendPackagedSkillsToMarketplace } from "@/lib/skills/catalog";

// ---------------------------------------------------------------------------
// localStorage chat history helpers
// ---------------------------------------------------------------------------
const HISTORY_PREFIX = "ho3d-chat-";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

const loadChatHistory = (sessionKey: string): ChatMessage[] => {
  try {
    const raw = localStorage.getItem(`${HISTORY_PREFIX}${sessionKey}`);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
};

const saveChatMessage = (sessionKey: string, msg: ChatMessage) => {
  try {
    const history = loadChatHistory(sessionKey);
    history.push(msg);
    localStorage.setItem(`${HISTORY_PREFIX}${sessionKey}`, JSON.stringify(history));
  } catch {
    // localStorage full or unavailable
  }
};

type HermesHelloOk = {
  adapterType?: "hermes";
};

type PendingReq = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

// ---------------------------------------------------------------------------
// Agent config — loaded from /agents.json (public file)
// ---------------------------------------------------------------------------
let agentConfigCache: AgentConfigEntry[] | null = null;

type AgentConfigEntry = {
  id: string;
  name: string;
  avatar?: string | null;
  avatarSeed?: string;
  role?: string;
  description?: string;
};

const fetchAgentConfig = async (): Promise<AgentConfigEntry[]> => {
  if (agentConfigCache) return agentConfigCache;
  try {
    const res = await fetch("/agents.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    agentConfigCache = (await res.json()) as AgentConfigEntry[];
    return agentConfigCache!;
  } catch (err) {
    console.warn("[HermesHttpClient] Failed to load agents.json:", err);
    // Fallback: one default agent
    return [{ id: "agent-hermes", name: "Hermes", role: "assistant", description: "Default agent" }];
  }
};

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
    const mockResult = await this.tryMock(method, params);
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
  private async tryMock(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "connect":
        return { adapterType: "hermes", protocol: 3 };

      case "agents.list": {
        const agents = await fetchAgentConfig();
        return {
          agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role || "assistant",
            description: a.description || "",
            status: "online",
            model: "claude-sonnet-4-20250514",
          })),
        };
      }

      case "sessions.preview":
        return { sessions: [] };

      case "sessions.list":
        return { sessions: [] };

      case "skills.status": {
        return {
          workspaceDir: "/",
          managedSkillsDir: "/",
          skills: appendPackagedSkillsToMarketplace([]),
        };
      }

      case "skills.install":
        return { ok: true, message: "HO3D local: skill install acknowledged (local mode)", stdout: "", stderr: "", code: 0 };

      case "skills.update":
        return { ok: true, skillKey: typeof params === "object" && params !== null ? (params as Record<string, unknown>).skillKey as string : "", config: {} };

      case "skills.remove":
        return { removed: true, removedPath: "", source: "openclaw-workspace" };

      case "skills.setAgentSkillEnabled":
        return { ok: true };

      case "chat.history": {
        const key = typeof params === "object" && params !== null ? (params as Record<string, unknown>).sessionKey as string || "" : "";
        const messages = loadChatHistory(key);
        return { messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.text,
          timestamp: m.timestamp,
        })) };
      }

      case "models.list":
        return {
          models: [
            { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic" },
            { id: "claude-haiku-3-20250313", name: "Claude Haiku 3", provider: "anthropic" },
          ],
        };

      case "presence.list": {
        const agentsList = await fetchAgentConfig();
        return { agents: agentsList.map((a) => ({ agentId: a.id, status: "online" })) };
      }

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
      const now = Date.now();

      // Save user message to localStorage
      const userMsgId = crypto.randomUUID();
      saveChatMessage(sessionKey, { id: userMsgId, role: "user", text, timestamp: now });

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
      const assistantText = data?.choices?.[0]?.message?.content || "";
      const assistantMsgId = crypto.randomUUID();
      saveChatMessage(sessionKey, {
        id: assistantMsgId,
        role: "assistant",
        text: assistantText,
        timestamp: Date.now(),
      });
      return {
        ok: true,
        messageId: assistantMsgId,
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
