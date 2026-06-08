import fs from "node:fs";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const CONFIGURED_HO3D_PACKAGE_ROOT = process.env.HO3D_PACKAGE_ROOT?.trim() ?? "";

const HO3D_DIST_INDEX_RELATIVE_PATH = path.join("dist", "index.js");
const HO3D_DIST_DIRECTORY_RELATIVE_PATH = "dist";
const AUDIO_KIND = "audio.transcription";
const DEFAULT_VOICE_MIME = "audio/webm";
const DEFAULT_VOICE_BASENAME = "voice-note";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "audio/x-m4a": ".m4a",
  "audio/x-wav": ".wav",
};

type HO3DConfig = {
  tools?: {
    media?: {
      audio?: {
        enabled?: boolean;
      };
    };
  };
};

type MediaUnderstandingOutput = {
  kind?: string;
  text?: string;
  provider?: string;
  model?: string;
};

type MediaUnderstandingDecision = {
  outcome?: string;
  attachments?: Array<{
    attempts?: Array<{
      reason?: string;
    }>;
  }>;
};

type RunCapabilityResult = {
  outputs?: MediaUnderstandingOutput[];
  decision?: MediaUnderstandingDecision;
};

type HO3DConfigModule = {
  t: () => HO3DConfig;
};

type HO3DRunnerModule = {
  a: (params: {
    capability: "audio";
    cfg: HO3DConfig;
    ctx: Record<string, unknown>;
    attachments: {
      cleanup: () => Promise<void>;
    };
    media: Array<Record<string, unknown>>;
    providerRegistry: unknown;
    config: unknown;
  }) => Promise<RunCapabilityResult>;
  n: (attachments: Array<Record<string, unknown>>) => {
    cleanup: () => Promise<void>;
  };
  r: (ctx: Record<string, unknown>) => Array<Record<string, unknown>>;
  t: () => unknown;
};

type HO3DTranscriptionSdk = {
  loadConfig: HO3DConfigModule["t"];
  runCapability: HO3DRunnerModule["a"];
  createMediaAttachmentCache: HO3DRunnerModule["n"];
  normalizeMediaAttachments: HO3DRunnerModule["r"];
  buildProviderRegistry: HO3DRunnerModule["t"];
};

export type HO3DVoiceTranscriptionResult = {
  transcript: string | null;
  provider: string | null;
  model: string | null;
  decision: MediaUnderstandingDecision | null;
  ignored: boolean;
};

let sdkPromise: Promise<HO3DTranscriptionSdk> | null = null;
const nativeImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const resolveInstalledHO3DPackageRoot = (): string | null => {
  const packageDirName = ["open", "claw"].join("");
  const startDir = process.cwd();
  const visited = new Set<string>();
  let cursor: string | null = startDir;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const candidate = path.join(cursor, "node_modules", packageDirName);
    const indexPath = path.join(candidate, HO3D_DIST_INDEX_RELATIVE_PATH);
    if (fs.existsSync(indexPath)) {
      return candidate;
    }
    const parent = path.dirname(cursor);
    cursor = parent && parent !== cursor ? parent : null;
  }

  return null;
};

export const normalizeVoiceMimeType = (value: string | null | undefined): string => {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) return DEFAULT_VOICE_MIME;
  const [baseType] = trimmed.split(";", 1);
  return MIME_EXTENSION_MAP[baseType] ? baseType : trimmed.startsWith("audio/") ? baseType : DEFAULT_VOICE_MIME;
};

export const inferVoiceFileExtension = (
  fileName: string | null | undefined,
  mimeType: string | null | undefined,
): string => {
  const trimmedName = fileName?.trim() ?? "";
  const nameExtension = path.extname(trimmedName).toLowerCase();
  if (nameExtension && Object.values(MIME_EXTENSION_MAP).includes(nameExtension)) {
    return nameExtension;
  }
  return MIME_EXTENSION_MAP[normalizeVoiceMimeType(mimeType)] ?? MIME_EXTENSION_MAP[DEFAULT_VOICE_MIME];
};

export const sanitizeVoiceFileName = (
  fileName: string | null | undefined,
  mimeType: string | null | undefined,
): string => {
  const extension = inferVoiceFileExtension(fileName, mimeType);
  const rawBase = path.basename(fileName?.trim() || DEFAULT_VOICE_BASENAME, path.extname(fileName?.trim() || ""));
  const sanitizedBase =
    rawBase.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "") ||
    DEFAULT_VOICE_BASENAME;
  const normalizedBase = sanitizedBase.toLowerCase();
  return normalizedBase.endsWith(extension) ? normalizedBase : `${normalizedBase}${extension}`;
};

export const buildVoiceTranscriptionErrorMessage = (
  decision: MediaUnderstandingDecision | null | undefined,
): string => {
  if (!decision) return "HO3D did not return a transcript.";
  const outcome = decision.outcome?.trim() || "unknown";
  const reasons = (decision.attachments ?? [])
    .flatMap((attachment) => attachment.attempts ?? [])
    .map((attempt) => attempt.reason?.trim() ?? "")
    .filter(Boolean);
  const detail = reasons[0] ? ` ${reasons[0]}` : "";
  switch (outcome) {
    case "disabled":
      return `HO3D audio transcription is disabled.${detail}`.trim();
    case "no-attachment":
      return "HO3D did not receive any audio to transcribe.";
    case "scope-deny":
      return `HO3D blocked audio transcription for this request.${detail}`.trim();
    case "skipped":
      return `HO3D skipped audio transcription.${detail}`.trim();
    default:
      return `HO3D did not return a transcript.${detail}`.trim();
  }
};

export const shouldIgnoreVoiceTranscription = (params: {
  transcript: string | null | undefined;
  decision: MediaUnderstandingDecision | null | undefined;
}): boolean => {
  const transcript = params.transcript?.trim() ?? "";
  if (transcript) return false;
  const reasons = (params.decision?.attachments ?? [])
    .flatMap((attachment) => attachment.attempts ?? [])
    .map((attempt) => attempt.reason?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  return reasons.some((reason) =>
    [
      "missing text",
      "empty transcript",
      "no speech",
      "no audio detected",
      "no transcript text",
    ].some((snippet) => reason.includes(snippet)),
  );
};

const resolveHO3DPackageRoot = (): string => {
  const configuredCandidate = CONFIGURED_HO3D_PACKAGE_ROOT;
  if (configuredCandidate) {
    const indexPath = path.join(configuredCandidate, HO3D_DIST_INDEX_RELATIVE_PATH);
    if (fs.existsSync(indexPath)) return configuredCandidate;
    throw new Error("HO3D_PACKAGE_ROOT does not point to a valid HO3D installation.");
  }

  const installedCandidate = resolveInstalledHO3DPackageRoot();
  if (installedCandidate) {
    const indexPath = path.join(installedCandidate, HO3D_DIST_INDEX_RELATIVE_PATH);
    if (fs.existsSync(indexPath)) return installedCandidate;
  }

  throw new Error(
    "HO3D could not be resolved from the current Node runtime. Install the `ho3d` package or set HO3D_PACKAGE_ROOT.",
  );
};

const loadHO3DSdk = async (): Promise<HO3DTranscriptionSdk> => {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const packageRoot = resolveHO3DPackageRoot();
    const distDirectory = path.join(packageRoot, HO3D_DIST_DIRECTORY_RELATIVE_PATH);
    const distEntries = (await fsp.readdir(distDirectory)).sort();
    const configCandidates = distEntries.filter((entry) => /^config-.*\.js$/.test(entry));
    let loadConfig: HO3DTranscriptionSdk["loadConfig"] | null = null;

    for (const candidate of configCandidates) {
      const configModule = (await nativeImport(
        pathToFileURL(path.join(distDirectory, candidate)).href,
      )) as Partial<HO3DConfigModule>;
      if (typeof configModule.t === "function") {
        loadConfig = configModule.t;
        break;
      }
    }

    if (!loadConfig) {
      throw new Error("The installed HO3D runtime does not expose a loadConfig() module.");
    }

    const runnerCandidates = distEntries.filter((entry) => /^runner-.*\.js$/.test(entry));

    for (const candidate of runnerCandidates) {
      const runnerModule = (await nativeImport(
        pathToFileURL(path.join(distDirectory, candidate)).href,
      )) as Partial<
        HO3DRunnerModule
      >;
      if (
        typeof runnerModule.a === "function" &&
        typeof runnerModule.n === "function" &&
        typeof runnerModule.r === "function" &&
        typeof runnerModule.t === "function"
      ) {
        return {
          loadConfig,
          runCapability: runnerModule.a,
          createMediaAttachmentCache: runnerModule.n,
          normalizeMediaAttachments: runnerModule.r,
          buildProviderRegistry: runnerModule.t,
        };
      }
    }

    throw new Error("The installed HO3D runtime does not expose the audio transcription runner.");
  })().catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
};

export const transcribeVoiceWithHO3D = async (params: {
  buffer: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<HO3DVoiceTranscriptionResult> => {
  const sdk = await loadHO3DSdk();
  const cfg = sdk.loadConfig();
  if (cfg.tools?.media?.audio?.enabled === false) {
    throw new Error("HO3D audio transcription is disabled.");
  }

  const mimeType = normalizeVoiceMimeType(params.mimeType);
  const fileName = sanitizeVoiceFileName(params.fileName, mimeType);
  const tempDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "ho3d-voice-"));
  const tempPath = path.join(tempDirectory, `${randomUUID()}-${fileName}`);

  await fsp.writeFile(tempPath, params.buffer);

  const ctx: Record<string, unknown> = {
    Body: "",
    BodyForAgent: "",
    BodyForCommands: "",
    RawBody: "",
    CommandBody: "",
    ChatType: "direct",
    MediaPath: tempPath,
    MediaType: mimeType,
    MediaPaths: [tempPath],
    MediaTypes: [mimeType],
  };

  const media = sdk.normalizeMediaAttachments(ctx);
  const cache = sdk.createMediaAttachmentCache(media);

  try {
    const result = await sdk.runCapability({
      capability: "audio",
      cfg,
      ctx,
      attachments: cache,
      media,
      providerRegistry: sdk.buildProviderRegistry(),
      config: cfg.tools?.media?.audio,
    });

    const audioOutputs = (result.outputs ?? []).filter((output) => output.kind === AUDIO_KIND);
    const transcript = audioOutputs
      .map((output) => output.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!transcript) {
      if (shouldIgnoreVoiceTranscription({ transcript, decision: result.decision ?? null })) {
        return {
          transcript: null,
          provider: null,
          model: null,
          decision: result.decision ?? null,
          ignored: true,
        };
      }
      throw new Error(buildVoiceTranscriptionErrorMessage(result.decision ?? null));
    }

    const firstOutput = audioOutputs[0] ?? null;
    return {
      transcript,
      provider: firstOutput?.provider ?? null,
      model: firstOutput?.model ?? null,
      decision: result.decision ?? null,
      ignored: false,
    };
  } finally {
    await cache.cleanup().catch(() => undefined);
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    await fsp.rmdir(tempDirectory).catch(() => undefined);
  }
};
