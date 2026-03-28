const http = require("node:http");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { randomUUID } = require("node:crypto");
const path = require("node:path");

const LETTERS = "ABCDEFGHJKLMNOPQRST";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function coordToGtp(x, y, size) {
  if (x == null || y == null) {
    return "pass";
  }
  const column = LETTERS[x];
  const row = size - y;
  return `${column}${row}`;
}

function gtpToCoord(gtp, size) {
  if (!gtp || String(gtp).toLowerCase() === "pass") {
    return { pass: true };
  }
  const column = LETTERS.indexOf(String(gtp)[0].toUpperCase());
  const row = Number(String(gtp).slice(1));
  if (column < 0 || Number.isNaN(row)) {
    return { pass: true };
  }
  return { x: column, y: size - row };
}

function withCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

class KataGoClient {
  constructor() {
    const localEigenDir = path.join(__dirname, "tools", "katago", "engine-eigen");
    const localOpenclDir = path.join(__dirname, "tools", "katago", "engine");
    const defaultDir = localEigenDir;
    this.bin = process.env.KATAGO_BIN || path.join(defaultDir, "katago.exe");
    this.model = process.env.KATAGO_MODEL || path.join(defaultDir, "kata1.bin.gz");
    this.config = process.env.KATAGO_CONFIG || path.join(defaultDir, "analysis_example.cfg");
    this.rules = process.env.KATAGO_RULES || "Chinese";
    this.komi = Number(process.env.KATAGO_KOMI || 7.5);
    this.defaultVisits = clamp(Number(process.env.KATAGO_VISITS || 20), 10, 20000);
    this.analysisPVLen = clamp(Number(process.env.KATAGO_PV_LEN || 24), 4, 64);
    this.defaultMaxTime = clamp(Number(process.env.KATAGO_MAX_TIME || 2.5), 0.2, 30);
    this.ready = false;
    this.startError = "KataGo is starting up...";
    this.pending = new Map();
    this.child = null;
    this.requestQueue = Promise.resolve();

    this.start();
  }

  start() {
    if (!this.model || !this.config) {
      this.startError = "Missing KATAGO_MODEL or KATAGO_CONFIG.";
      return;
    }

    // Fallback to OpenCL install if defaults point to missing files.
    if (!process.env.KATAGO_BIN && !process.env.KATAGO_MODEL && !process.env.KATAGO_CONFIG) {
      const openclBin = path.join(path.join(__dirname, "tools", "katago", "engine"), "katago.exe");
      const openclModel = path.join(path.join(__dirname, "tools", "katago", "engine"), "kata1.bin.gz");
      const openclCfg = path.join(path.join(__dirname, "tools", "katago", "engine"), "analysis_example.cfg");
      const fs = require("node:fs");
      if ((!fs.existsSync(this.bin) || !fs.existsSync(this.model) || !fs.existsSync(this.config))
        && fs.existsSync(openclBin) && fs.existsSync(openclModel) && fs.existsSync(openclCfg)) {
        this.bin = openclBin;
        this.model = openclModel;
        this.config = openclCfg;
      }
    }

    const args = ["analysis", "-model", this.model, "-config", this.config];
    this.child = spawn(this.bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.on("error", (error) => {
      this.ready = false;
      this.startError = `Failed to start KataGo: ${error.message}`;
      console.error(this.startError);
    });

    this.child.on("exit", (code, signal) => {
      this.ready = false;
      const reason = `KataGo exited (code=${code}, signal=${signal || "none"}).`;
      this.startError = reason;
      console.error(reason);
      for (const entry of this.pending.values()) {
        entry.reject(new Error(reason));
      }
      this.pending.clear();
    });

    const stdout = readline.createInterface({ input: this.child.stdout });
    stdout.on("line", (line) => {
      this.handleOutput(line);
    });

    const stderr = readline.createInterface({ input: this.child.stderr });
    stderr.on("line", (line) => {
      if (!this.ready && /Started, ready to begin handling requests/i.test(line)) {
        this.ready = true;
        this.startError = "";
      }
      if (line.trim()) {
        console.error(`[katago] ${line}`);
      }
    });
  }

  handleOutput(line) {
    if (!line || !line.trim()) {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (!parsed.id || !this.pending.has(parsed.id)) {
      return;
    }
    const entry = this.pending.get(parsed.id);
    entry.last = parsed;
    if (parsed.isDuringSearch === true) {
      return;
    }
    const hasMoveInfos = Array.isArray(parsed.moveInfos);
    const hasTerminalState = parsed.isDuringSearch === false || parsed.error != null;
    if (!hasMoveInfos && !hasTerminalState) {
      return;
    }
    this.pending.delete(parsed.id);
    entry.resolve(parsed);
  }

  async analyze(payload) {
    const job = this.requestQueue.then(() => this.analyzeInternal(payload));
    this.requestQueue = job.catch(() => {});
    return job;
  }

  async analyzeInternal(payload) {
    if (!this.child || this.child.killed || !this.ready) {
      throw new Error(this.startError || "KataGo is not ready yet. Wait a few seconds and retry.");
    }
    const size = clamp(Number(payload.size) || 19, 5, 25);
    const topN = clamp(Number(payload.topN) || 10, 1, 40);
    const nextPlayer = payload.nextPlayer === "W" ? "W" : "B";
    const stones = Array.isArray(payload.stones) ? payload.stones : [];
    const requestedVisits = clamp(Number(payload.maxVisits) || this.defaultVisits, 10, 20000);
    const requestedMaxTime = clamp(Number(payload.maxTime) || this.defaultMaxTime, 0.2, 30);

    const runQuery = async (maxVisits, maxTime) => {
      const queryId = randomUUID();
      const query = {
        id: queryId,
        boardXSize: size,
        boardYSize: size,
        rules: this.rules,
        komi: this.komi,
        initialPlayer: nextPlayer,
        initialStones: stones
          .filter((stone) => stone && (stone.color === "B" || stone.color === "W"))
          .map((stone) => [stone.color, coordToGtp(Number(stone.x), Number(stone.y), size)]),
        moves: [],
        analyzeTurns: [0],
        maxVisits,
        maxTime,
        analysisPVLen: Math.min(this.analysisPVLen, Math.max(8, topN * 2)),
        reportDuringSearchEvery: 0.15,
        includeOwnership: false,
      };

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pending.delete(queryId);
          reject(new Error("KataGo analysis timed out."));
        }, 90000);
        this.pending.set(queryId, {
          last: null,
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });
        this.child.stdin.write(`${JSON.stringify(query)}\n`);
      });
    };

    let response;
    try {
      response = await runQuery(requestedVisits, requestedMaxTime);
    } catch (error) {
      if (!/timed out/i.test(error.message) || requestedVisits <= 12) {
        throw error;
      }
      const retryVisits = Math.max(10, Math.floor(requestedVisits * 0.55));
      const retryMaxTime = Math.max(0.8, Math.min(requestedMaxTime, 1.6));
      response = await runQuery(retryVisits, retryMaxTime);
    }

    const moveInfos = Array.isArray(response.moveInfos) ? response.moveInfos : [];
    const moves = moveInfos.slice(0, topN).map((info, index) => {
      const coord = gtpToCoord(info.move, size);
      const scoreLead = Number(
        (Number.isFinite(Number(info.scoreLead))
          ? Number(info.scoreLead)
          : Number.isFinite(Number(info.winrate))
            ? (Number(info.winrate) - 0.5) * 100
            : 0).toFixed(2)
      );
      return {
        rank: index + 1,
        move: coord.pass ? "pass" : coordToGtp(coord.x, coord.y, size),
        scoreLead,
      };
    });

    return {
      source: "KataGo",
      moves,
    };
  }
}

const client = new KataGoClient();
const initialPort = Number(process.env.PORT || 8080);

const server = http.createServer(async (request, response) => {
  withCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      ok: client.ready,
      error: client.startError || null,
    }));
    return;
  }

  if (request.method === "POST" && request.url === "/analyze") {
    try {
      const payload = await readJson(request);
      const result = await client.analyze(payload);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const status = /not ready|starting up/i.test(error.message) ? 503 : 500;
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

function listenWithFallback(startPort, maxAttempts = 12) {
  let attempt = 0;
  let port = startPort;

  const tryListen = () => {
    server.listen(port, () => {
      console.log(`KataGo bridge listening on http://localhost:${port}`);
      if (port !== startPort) {
        console.log(`Port ${startPort} was busy, using ${port} instead.`);
      }
    });
  };

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE" && attempt < maxAttempts - 1 && !process.env.PORT) {
      attempt += 1;
      port = startPort + attempt;
      console.warn(`Port ${startPort + attempt - 1} in use, trying ${port}...`);
      setTimeout(tryListen, 80);
      return;
    }
    console.error(error);
    process.exit(1);
  });

  tryListen();
}

listenWithFallback(initialPort);
