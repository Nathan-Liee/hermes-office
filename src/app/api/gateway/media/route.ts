import { NextResponse } from "next/server";

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export const runtime = "nodejs";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const expandTildeLocal = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
};

const validateRawMediaPath = (raw: string): { trimmed: string; mime: string } => {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("path is required");
  if (trimmed.length > 4096) throw new Error("path too long");
  if (/[^\S\r\n]*[\0\r\n]/.test(trimmed)) throw new Error("path contains invalid characters");

  const ext = path.extname(trimmed).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`Unsupported media extension: ${ext || "(none)"}`);

  return { trimmed, mime };
};

const resolveAndValidateLocalMediaPath = (raw: string): { resolved: string; mime: string } => {
  const { trimmed, mime } = validateRawMediaPath(raw);

  const expanded = expandTildeLocal(trimmed);
  if (!path.isAbsolute(expanded)) {
    throw new Error("path must be absolute or start with ~/");
  }

  const resolved = path.resolve(expanded);

  const allowedRoot = path.join(os.homedir(), ".openclaw");
  const allowedPrefix = `${allowedRoot}${path.sep}`;
  if (!(resolved === allowedRoot || resolved.startsWith(allowedPrefix))) {
    throw new Error(`Refusing to read media outside ${allowedRoot}`);
  }

  return { resolved, mime };
};

const isWithinAllowedRoot = (targetPath: string, allowedRoot: string): boolean => {
  const relative = path.relative(allowedRoot, targetPath);
  if (!relative) return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

const readLocalMedia = async (
  resolvedPath: string,
  allowedRoot: string
): Promise<{ bytes: Buffer; size: number }> => {
  const entry = await fs.lstat(resolvedPath);
  if (entry.isSymbolicLink()) {
    throw new Error("symlinked media paths are not allowed");
  }

  const [realResolvedPath, realAllowedRoot] = await Promise.all([
    fs.realpath(resolvedPath),
    fs.realpath(allowedRoot).catch(() => path.resolve(allowedRoot)),
  ]);

  if (!isWithinAllowedRoot(realResolvedPath, realAllowedRoot)) {
    throw new Error(`Refusing to read media outside ${realAllowedRoot}`);
  }

  const stat = await fs.stat(realResolvedPath);
  if (!stat.isFile()) {
    throw new Error("path is not a file");
  }
  if (stat.size > MAX_MEDIA_BYTES) {
    throw new Error(`media file too large (${stat.size} bytes)`);
  }
  const buf = await fs.readFile(realResolvedPath);
  return { bytes: buf, size: stat.size };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPath = (searchParams.get("path") ?? "").trim();

    const { resolved, mime } = resolveAndValidateLocalMediaPath(rawPath);
    const allowedRoot = path.join(os.homedir(), ".openclaw");
    const { bytes, size } = await readLocalMedia(resolved, allowedRoot);
    const body = new Blob([Uint8Array.from(bytes)], { type: mime });
    return new Response(body, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(size),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch media";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
