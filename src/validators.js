"use strict";

// ─────────────────────────────────────────────────────────────────────────────
//  validators.js
//
//  Native JS live validators — no kubectl, no subprocesses.
//  Each exported function returns the same shape the game expects:
//    { ok: boolean, message: string }
//
//  Dependencies (install once in your game folder):
//    npm install pg minio
//
//  Usage in a challenge:
//    const { validatePostgres, validateMinio } = require("./validators");
//
//    async validator(answer) {
//      if (!answer.trim()) return { ok: false, message: "Type 'done' when ready." };
//      return validatePostgres({ ... });
//    }
// ─────────────────────────────────────────────────────────────────────────────

// ─── POSTGRES VALIDATOR ───────────────────────────────────────────────────────

/**
 * validatePostgres(opts)
 *
 * Connects to a Postgres server and runs one or more SQL checks.
 * Each check is a { query, assert(rows) → true|string } pair.
 * Returns { ok: true } when ALL checks pass, { ok: false, message } otherwise.
 *
 * @param {object} opts
 *   host        string   default "localhost"
 *   port        number   default 5432
 *   user        string   default "postgres"
 *   password    string   the password to connect WITH (what you're testing)
 *   database    string   default "postgres"
 *   connectTimeoutMs  number  default 5000
 *   checks      Array<{ label, query, assert }>
 *     label    string    shown in error messages
 *     query    string    SQL to run
 *     assert   (rows: object[]) => true | string
 *              return true to pass, return an error string to fail
 */
async function validatePostgres(opts = {}) {
  // Lazy-require so the file can be loaded even if 'pg' isn't installed yet
  let Client;
  try {
    ({ Client } = require("pg"));
  } catch {
    return {
      ok:      false,
      message: "Missing dependency: run `npm install pg` in your game folder.",
    };
  }

  const {
    host               = "localhost",
    port               = 5432,
    user               = "postgres",
    password,
    database           = "postgres",
    connectTimeoutMs   = 5000,
    checks             = [],
  } = opts;

  const client = new Client({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: connectTimeoutMs,
    // Never prompt interactively
    ssl: false,
  });

  // ── Connect ─────────────────────────────────────────────────────────────────
  try {
    await client.connect();
  } catch (err) {
    return {
      ok:      false,
      message: friendlyPgError(err, { host, port, user, password }),
    };
  }

  // ── Run checks ──────────────────────────────────────────────────────────────
  try {
    for (const check of checks) {
      let rows;
      try {
        const result = await client.query(check.query);
        rows = result.rows;
      } catch (err) {
        return {
          ok:      false,
          message: `Query failed (${check.label}): ${err.message}`,
        };
      }

      const verdict = check.assert(rows);
      if (verdict !== true) {
        return {
          ok:      false,
          message: typeof verdict === "string"
            ? verdict
            : `Check "${check.label}" failed.`,
        };
      }
    }
  } finally {
    // Always release the connection
    try { await client.end(); } catch {}
  }

  return { ok: true, message: "All checks passed." };
}

// Map common pg error codes to friendly messages the player can act on
function friendlyPgError(err, { host, port, user, password }) {
  const code = err.code;
  if (code === "ECONNREFUSED")
    return `Cannot reach Postgres at ${host}:${port}. Is it running?`;
  if (code === "ETIMEDOUT" || code === "ECONNRESET")
    return `Connection to ${host}:${port} timed out. Is the host reachable?`;
  if (code === "28P01" || code === "28000")
    return `Authentication failed for user "${user}". Wrong password.`;
  if (code === "3D000")
    return `Database does not exist.`;
  if (code === "42501")
    return `Permission denied for user "${user}".`;
  return `Connection error: ${err.message}`;
}


// ─── MINIO VALIDATOR ─────────────────────────────────────────────────────────

/**
 * validateMinio(opts)
 *
 * Connects to a MinIO (or S3-compatible) server and runs one or more checks.
 * Each check receives the live MinIO client and returns true or an error string.
 *
 * @param {object} opts
 *   endPoint        string   default "localhost"
 *   port            number   default 9000
 *   useSSL          boolean  default false
 *   accessKey       string   the key to authenticate WITH
 *   secretKey       string   the secret to authenticate WITH
 *   connectTimeoutMs number  default 5000
 *   checks          Array<{ label, run(client) → Promise<true | string> }>
 *     label  string   shown in error messages
 *     run    async (minioClient) => true | string
 *            return true to pass, return an error string to fail
 */
async function validateMinio(opts = {}) {
  let Minio;
  try {
    Minio = require("minio");
  } catch {
    return {
      ok:      false,
      message: "Missing dependency: run `npm install minio` in your game folder.",
    };
  }

  const {
    endPoint         = "localhost",
    port             = 9000,
    useSSL           = false,
    accessKey,
    secretKey,
    connectTimeoutMs = 5000,
    checks           = [],
    isAvailable      = false,
    region           = "us-east-1",   // ← new
    pathStyle        = true,          // ← new
  } = opts;

  const client = new Minio.Client({ endPoint, port, useSSL, accessKey, secretKey, region, pathStyle });

  // ── Probe connectivity — distinguish unreachable from auth failure ──────────
  try {
    await withTimeout(client.listBuckets(), connectTimeoutMs);
  } catch (err) {
    const msg = err.message || "";
    const code = err.code   || "";

    // Network-level failures — service is not reachable at all
    if (
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT"    ||
      code === "ECONNRESET"   ||
      code === "ENOTFOUND"    ||
      code === "ETIMEOUT"     ||
      msg.includes("ECONNREFUSED")
    ) {
      return {
        ok:      false,
        message: `⚠  MinIO is not reachable at ${endPoint}:${port}. Is the service running and port-forwarded?`,
      };
    }
    if (isAvailable) {
      return {
        ok:      true,
        message: `⚠  Congrats MinIO is reachable.`,
      }
    }

    // Auth failures — service responded but rejected the credentials
    if (
      code.includes("InvalidAccessKeyId") ||
      code.includes("AccessDenied")       ||
      code.includes("SignatureDoesNotMatch") ||
      code.includes("403")                ||
      (err.code === "S3Error" && err.statusCode === 403)
    ) {
      return {
        ok:      false,
        message: `⚠  MinIO is reachable but rejected the credentials. Wrong key or secret.`,
      };
    }

    // Anything else — surface the raw error
    return {
      ok:      false,
      message: `MinIO error: ${msg}`,
    };
  }

  // ── Run checks ──────────────────────────────────────────────────────────────
  for (const check of checks) {
    let verdict;
    try {
      verdict = await withTimeout(check.run(client), connectTimeoutMs * 2);
    } catch (err) {
      return {
        ok:      false,
        message: `Check "${check.label}" threw: ${err.message}`,
      };
    }

    if (verdict !== true) {
      return {
        ok:      false,
        message: typeof verdict === "string" ? verdict : `Check "${check.label}" failed.`,
      };
    }
  }

  return { ok: true, message: "All checks passed." };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error(`Timed out after ${ms}ms`), { code: "ETIMEOUT" })),
      ms
    );
    promise.then(
      v  => { clearTimeout(timer); resolve(v); },
      e  => { clearTimeout(timer); reject(e);  }
    );
  });
}

function friendlyMinioError(err, { endPoint, port, accessKey }) {
  const msg = err.message || "";
  const code = err.code   || "";
  if (code === "ECONNREFUSED" || msg.includes("ECONNREFUSED"))
    return `Cannot reach MinIO at ${endPoint}:${port}. Is it running?`;
  if (code === "ETIMEOUT" || code === "ETIMEDOUT")
    return `Connection to ${endPoint}:${port} timed out.`;
  if (msg.includes("InvalidAccessKeyId") || msg.includes("AccessDenied") || msg.includes("403"))
    return `Invalid credentials for access key "${accessKey}".`;
  if (msg.includes("SignatureDoesNotMatch"))
    return `Wrong secret key for access key "${accessKey}".`;
  if (msg.includes("NoSuchBucket"))
    return `Bucket does not exist.`;
  if (msg.includes("NoSuchKey"))
    return `Object does not exist.`;
  return `MinIO error: ${msg}`;
}



// Helper: stream a MinIO object into a string
function readObject(client, bucket, key) {
  return new Promise((resolve, reject) => {
    let data = "";
    client.getObject(bucket, key, (err, stream) => {
      if (err) return reject(err);
      stream.on("data",  chunk => { data += chunk.toString(); });
      stream.on("end",   ()    => resolve(data));
      stream.on("error", reject);
    });
  });
}


// ─── Shared HTTP helper (no extra deps — uses built-in http module) ────────────
function httpGet(url, timeoutMs = 5000) {
  const { get } = require(url.startsWith("https") ? "https" : "http");
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: timeoutMs }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on("timeout", () => { req.destroy(); reject(Object.assign(new Error(`Request timed out after ${timeoutMs}ms`), { code: "ETIMEOUT" })); });
    req.on("error",   reject);
  });
}

function friendlyHttpError(err, url) {
  if (err.code === "ECONNREFUSED") return `Cannot reach the API at ${url} — is the port-forward running?`;
  if (err.code === "ETIMEOUT")     return `Request to ${url} timed out — is the pod running?`;
  return `HTTP error: ${err.message}`;
}


// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = { validatePostgres, validateMinio, httpGet, friendlyHttpError };

