import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hermes API proxy — forwards /api/hermes/* requests to the configured
 * HERMES_API_URL, injecting the API key server-side so it stays secret.
 *
 * Usage:  POST /api/hermes/v1/chat/completions
 *         GET  /api/hermes/v1/models
 */
async function handler(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const apiUrl = (process.env.HERMES_API_URL || "").trim();
  const apiKey = (process.env.HERMES_API_KEY || "").trim();

  if (!apiUrl) {
    return NextResponse.json(
      { error: "HERMES_API_URL not configured. Set it in .env" },
      { status: 500 },
    );
  }

  const resolvedParams = await params;
  const path = resolvedParams.path.join("/");
  const queryString = request.nextUrl.searchParams.toString();
  const targetUrl = `${apiUrl.replace(/\/+$/, "")}/${path}${queryString ? `?${queryString}` : ""}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // Clone the original request body for forwarding
  let body: string | undefined;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json") || contentType.includes("text/")) {
    try {
      body = await request.text();
    } catch {
      body = undefined;
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...headers,
        // Don't forward host/origin from the proxy
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "127.0.0.1",
      },
      body: request.method !== "GET" && request.method !== "HEAD" ? body : undefined,
      signal: request.signal,
    });

    // Handle streaming responses (e.g., chat completions with streaming)
    const upstreamContentType = upstream.headers.get("content-type") || "";
    if (upstreamContentType.includes("text/event-stream") || upstreamContentType.includes("application/x-ndjson")) {
      // Pass through the stream
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: {
          "Content-Type": upstreamContentType,
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Regular JSON response
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstreamContentType || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hermes API proxy failed";
    console.error("[hermes-proxy]", message);
    return NextResponse.json(
      { error: message },
      { status: 502 },
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
