const http = require("node:http");
const next = require("next");

const { loadHermesConfig } = require("./studio-settings");

const resolvePort = () => {
  const raw = process.env.PORT?.trim() || "3000";
  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0) return 3000;
  return port;
};

const resolveHostname = () => {
  return process.env.HOST?.trim() || process.env.HOSTNAME?.trim() || "0.0.0.0";
};

async function main() {
  const dev = process.argv.includes("--dev");
  const hostname = resolveHostname();
  const port = resolvePort();

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  // Simple auth: optional STUDIO_ACCESS_TOKEN login form
  const handleAuth = (req, res) => {
    const url = req.url || "/";
    const token = process.env.STUDIO_ACCESS_TOKEN || "";

    if (!token) return false; // no auth configured, pass through

    if (url === "/" && req.method === "GET") {
      const cookieHeader = req.headers?.cookie || "";
      const cookies = {};
      for (const part of cookieHeader.split(";")) {
        const idx = part.indexOf("=");
        if (idx === -1) continue;
        cookies[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      }
      if (cookies["studio_access"] !== token) {
        res.statusCode = 302;
        res.setHeader("Location", "/auth/login");
        res.end();
        return true;
      }
      return false;
    }

    if (url === "/auth/login" && req.method === "GET") {
      res.setHeader("Content-Type", "text/html");
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Claw3D Login</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f172a;color:#f8fafc}.card{background:#1e293b;padding:2rem;border-radius:12px;width:320px}h1{text-align:center;margin-bottom:1.5rem}input{width:100%;padding:0.75rem;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f8fafc;font-size:1rem;box-sizing:border-box}button{width:100%;padding:0.75rem;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:1rem;cursor:pointer;margin-top:1rem}.error{color:#ef4444;margin-top:0.5rem;display:none}</style></head><body><div class="card"><h1>🔐 Claw3D</h1><form method="POST" action="/auth/login"><input type="password" name="token" placeholder="Access Token" required><button type="submit">Enter Studio</button></form></div></body></html>`);
      return true;
    }

    if (url === "/auth/login" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const match = body.match(/token=([^&]*)/);
        const submitted = match ? decodeURIComponent(match[1]) : "";
        if (submitted === token) {
          res.setHeader("Set-Cookie", `studio_access=${encodeURIComponent(submitted)}; Path=/; Max-Age=86400`);
          res.statusCode = 302;
          res.setHeader("Location", "/");
          res.end();
        } else {
          res.setHeader("Content-Type", "text/html");
          res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Claw3D Login</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f172a;color:#f8fafc}.card{background:#1e293b;padding:2rem;border-radius:12px;width:320px}h1{text-align:center;margin-bottom:1.5rem}input{width:100%;padding:0.75rem;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f8fafc;font-size:1rem;box-sizing:border-box}button{width:100%;padding:0.75rem;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:1rem;cursor:pointer;margin-top:1rem}.error{color:#ef4444;display:block;margin-top:0.5rem}</style></head><body><div class="card"><h1>🔐 Claw3D</h1><form method="POST" action="/auth/login"><input type="password" name="token" placeholder="Access Token" required><button type="submit">Enter Studio</button><p class="error">Wrong token. Try again.</p></form></div></body></html>`);
        }
      });
      return true;
    }

    return false;
  };

  const server = http.createServer((req, res) => {
    if (handleAuth(req, res)) return;
    handle(req, res);
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("error", onError);
      reject(err);
    };
    server.once("error", onError);
    server.listen(port, hostname, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const browserUrl = `http://${hostname === "0.0.0.0" || hostname === "::" ? "localhost" : hostname}:${port}`;
  console.info(`Claw3D (Hermes Office) running: ${browserUrl}`);

  const config = loadHermesConfig(process.env);
  if (config.apiUrl && config.apiKey) {
    console.info(`Hermes API: ${config.apiUrl}`);
  } else {
    console.info("Hermes API not configured — set HERMES_API_URL and HERMES_API_KEY in .env");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
