const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const resolveUserPath = (input) => {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return path.resolve(trimmed.replace(/^~/, os.homedir()));
  }
  return path.resolve(trimmed);
};

const loadHermesConfig = (env = process.env) => {
  const apiUrl = (env.HERMES_API_URL || "").trim() || "http://localhost:20128/v1";
  const apiKey = (env.HERMES_API_KEY || "").trim() || "";
  return { apiUrl, apiKey };
};

const resolveStudioSettingsPath = (env = process.env) => {
  const stateDir = (env.OPENCLAW_STATE_DIR || "~/.openclaw").trim();
  return path.join(resolveUserPath(stateDir), "claw3d", "settings.json");
};

const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch { return null; }
};

const loadUpstreamGatewaySettings = (env = process.env) => {
  const settingsPath = resolveStudioSettingsPath(env);
  const parsed = readJsonFile(settingsPath);
  const gateway = parsed && typeof parsed === "object" ? parsed.gateway : null;
  const url = typeof gateway?.url === "string" ? gateway.url.trim() : "";
  const token = typeof gateway?.token === "string" ? gateway.token.trim() : "";
  return {
    url: url || "ws://localhost:18789",
    token,
    adapterType: "hermes",
    settingsPath,
  };
};

module.exports = {
  resolveStudioSettingsPath,
  loadUpstreamGatewaySettings,
  loadHermesConfig,
};
