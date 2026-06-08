import { NextResponse } from "next/server";

import { restoreAgentStateLocally, trashAgentStateLocally } from "@/lib/agent-state/local";

export const runtime = "nodejs";

type TrashAgentStateRequest = {
  agentId: string;
};

type RestoreAgentStateRequest = {
  agentId: string;
  trashDir: string;
};

const isSafeAgentId = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const { agentId } = body as Partial<TrashAgentStateRequest>;
    const trimmed = typeof agentId === "string" ? agentId.trim() : "";
    if (!trimmed) {
      return NextResponse.json({ error: "agentId is required." }, { status: 400 });
    }
    if (!isSafeAgentId(trimmed)) {
      return NextResponse.json({ error: `Invalid agentId: ${trimmed}` }, { status: 400 });
    }

    const result = trashAgentStateLocally({ agentId: trimmed });
    return NextResponse.json({ result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to trash agent workspace/state.";
    console.error(message);
    const status =
      message.includes("Invalid request payload") ||
      message.includes("agentId is required") ||
      message.includes("trashDir is required") ||
      message.includes("Invalid agentId") ||
      message.includes("trashDir does not exist") ||
      message.includes("trashDir is not under") ||
      message.includes("Refusing to restore over existing path")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const { agentId, trashDir } = body as Partial<RestoreAgentStateRequest>;
    const trimmedAgent = typeof agentId === "string" ? agentId.trim() : "";
    const trimmedTrash = typeof trashDir === "string" ? trashDir.trim() : "";
    if (!trimmedAgent) {
      return NextResponse.json({ error: "agentId is required." }, { status: 400 });
    }
    if (!trimmedTrash) {
      return NextResponse.json({ error: "trashDir is required." }, { status: 400 });
    }
    if (!isSafeAgentId(trimmedAgent)) {
      return NextResponse.json({ error: `Invalid agentId: ${trimmedAgent}` }, { status: 400 });
    }

    const result = restoreAgentStateLocally({
      agentId: trimmedAgent,
      trashDir: trimmedTrash,
    });
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to restore agent state.";
    console.error(message);
    const status =
      message.includes("Invalid request payload") ||
      message.includes("agentId is required") ||
      message.includes("trashDir is required") ||
      message.includes("Invalid agentId")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
