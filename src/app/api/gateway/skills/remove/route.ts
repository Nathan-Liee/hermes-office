import { NextResponse } from "next/server";

import { removeSkillLocally } from "@/lib/skills/remove-local";
import type { RemovableSkillSource, SkillRemoveRequest } from "@/lib/skills/types";

export const runtime = "nodejs";

const REMOVABLE_SOURCES = new Set<RemovableSkillSource>([
  "ho3d-managed",
  "ho3d-workspace",
]);

const normalizeRequired = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
};

const normalizeRemoveRequest = (body: unknown): SkillRemoveRequest => {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request payload.");
  }

  const record = body as Partial<Record<keyof SkillRemoveRequest, unknown>>;
  const sourceRaw = normalizeRequired(record.source, "source");
  if (!REMOVABLE_SOURCES.has(sourceRaw as RemovableSkillSource)) {
    throw new Error(`Unsupported skill source for removal: ${sourceRaw}`);
  }

  return {
    skillKey: normalizeRequired(record.skillKey, "skillKey"),
    source: sourceRaw as RemovableSkillSource,
    baseDir: normalizeRequired(record.baseDir, "baseDir"),
    workspaceDir: normalizeRequired(record.workspaceDir, "workspaceDir"),
    managedSkillsDir: normalizeRequired(record.managedSkillsDir, "managedSkillsDir"),
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const removeRequest = normalizeRemoveRequest(body);

    const result = removeSkillLocally(removeRequest);

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove skill.";
    const status =
      message.includes("required") ||
      message.includes("Invalid request payload") ||
      message.includes("Unsupported skill source") ||
      message.includes("Refusing to remove") ||
      message.includes("not a directory")
        ? 400
        : 500;
    if (status >= 500) {
      console.error(message);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
