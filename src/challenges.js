"use strict";

const { password, database } = require("pg/lib/defaults");
const { validateMinio, validatePostgres, httpGet, friendlyHttpError } = require("./validators");

// ═══════════════════════════════════════════════════════════════════════════════
//  challenges.js  —  Planet & Challenge Configuration
//  ─────────────────────────────────────────────────────────────────────────────
//
//  Structure: array of PLANETS, each with one or more challenges[].
//
//  Planet fields:
//    name, icon, color, system, flavour   — atmosphere / UI
//    challenges[]                          — puzzles on this planet
//
//  Challenge fields:
//    id          unique integer across ALL planets
//    title       string
//    category    "Math"|"Strings"|"Logic"|"Algorithms"|"Data"|"Crypto"|"DevOps"|"Misc"
//    difficulty  "easy"|"medium"|"hard"|"expert"
//    points      number
//    description multiline string (\n supported; indented/box-drawing lines render in cyan)
//    examples    [{ input?, output, explanation? }]   optional
//    hints       string[]   revealed one at a time; each costs 10% of points
//    validator   async (answer: string) => { ok: boolean, message: string }
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightRed: "\x1b[91m",
  brightWhite: "\x1b[97m",
  yellow: "\x1b[33m",
};

const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, "");
const asInt = s => parseInt(String(s).trim().replace(/,/g, ""), 10);
const asFloat = (s, d = 2) => parseFloat(parseFloat(String(s).trim()).toFixed(d));

const PLANETS = [

  // ──────────────────────────────────────────────────────────────────────────
  {
    name: "Verdania",
    icon: "🟢",
    color: C.brightGreen,
    system: "Kepler-7 System",
    flavour: "You've come across a stranded voyager, help him out. He seems to be locked out of his ship's system.",
    challenges: [
      {
        id: 1,
        title: "I'm locked out!",
        category: "Storage",
        difficulty: "easy",
        points: 10,
        description: [
          "I need the database connection details! What's the username?",
        ].join("\n"),
        examples: [],
        hints: [
          "Look for secrets.",
          "It's base64 encoded",
          "...",
        ],
        async validator(answer) {
          if (answer === "p0stgr3s_user") return { ok: true, message: "Correct!" };
          return { ok: false, message: `Aaargh! Unable to connect...` };
        },
      },

      {
        id: 2,
        title: "I'm locked out! (Part II)",
        category: "Storage",
        difficulty: "easy",
        points: 15,
        description: [
          "Great, now what's the password?",
        ].join("\n"),
        examples: [
        ],
        hints: [
          "Look for secrets.",
          "It's base64 encoded",
          "...",
        ],
        async validator(answer) {
          if (answer === "p0stgr3s_password") return { ok: true, message: "Correct!" };
          return { ok: false, message: `Aaargh! Unable to connect...` };
        },
      },

      {
        id: 3,
        title: "I'm locked out! (Part III)",
        category: "Storage",
        difficulty: "easy",
        points: 10,
        description: [
          "Almost there, what port do I need to look at?",
        ].join("\n"),
        examples: [],
        hints: [],
        async validator(answer) {
          const got = asInt(answer);
          if (got === 5432) return { ok: true, message: "Correct!" };
          return { ok: false, message: `Aaargh! Unable to connect...` };
        },
      },
      {
        id: 4,
        title: "Reset connection details",
        category: "Storage",
        difficulty: "medium",
        points: 40,

        description: [
          "You're not the only traveller whose been trying to help me, but none succeeded! Thank you!",
          "I would like to change my connection details though, could you help me out?",
          "Set the user to `mission_control` and the password to `EenMoeilijkPasswoord123`, should be safe enough."
        ].join("\n"),

        examples: [],

        hints: [
          "Use ALTER USER in psql: ALTER USER postgres PASSWORD 'newpass';",
          "You can exec directly into the pod: kubectl exec -it <pod> -- psql -U postgres",
          "Or use kubectl exec with -c to run a one-liner without entering the pod.",
        ],

        /**
         * Validator: launches a Kubernetes Job that tries to connect to PostgreSQL
         * with the expected new password. If the connection succeeds, the job exits 0
         * (succeeded). If auth fails, it exits non-zero (failed).
         */
        async validator(answer) {
          if (!answer.trim()) return { ok: false, message: "Type 'done' when ready." };

          return validatePostgres({
            endPoint: "localhost",
            port: 5432,
            user: "mission_control",
            password: "EenMoeilijkPasswoord123",
            database: "mission_control",
            checks: [
              {
                label: "connection succeeds",
                query: "SELECT current_user AS u",
                assert: rows => rows[0]?.u === "mission_control" || "Unexpected user returned",
              },
            ],
          });
        }
      }
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    name: "Magenthos",
    icon: "🟣",
    color: C.brightMagenta,
    system: "Prime Expanse",
    flavour: "An iron-core world running a rogue object storage array. The depot's\n" +
      "two access terminals were locked down by the previous crew — wrong\n" +
      "ports, wrong credentials. Reconfigure both before the fuel manifest\n" +
      "can be retrieved.",
    challenges: [
      {
        id: 5,
        title: "Storage array port malfunction",
        category: "Storage", difficulty: "medium", points: 25,
        description: [
          "The storage array is broadcasting on the wrong port. External systems",
          "expect it on 9000, but it is currently unbound. Reconfigure the",
          "service and confirm the API is reachable on the correct port.",
          "Type 'done' when you're finished.",
        ].join("\n"),
        examples: [],
        hints: [
        ],
        async validator(answer) {
          if (!answer.trim()) {
            return { ok: false, message: "Type 'done' when the bucket exists." };
          }
          return await validateMinio({ isAvailable: true });
        },
      },
      {
        id: 6,
        title: "Collatz Champion",
        category: "Storage", difficulty: "medium", points: 30,
        description: [
          "The depot's access keys are still set to the factory defaults —",
          "a known vulnerability. Rotate the root credentials to the values",
          "issued by Mission Control:",
          "",
          "  Access key : depot-admin",
          "  Secret key : Vu3lD3p0tS3cr3t!",
          "",
          "The old keys must no longer work after the rotation.",
          "Type 'done' when you're finished.",
        ].join("\n"),
        examples: [],
        hints: [
          "Access and secret key can be set in the helm chart"
        ],
        async validator(answer) {
          if (!answer.trim()) {
            return { ok: false, message: "Type 'done' when the bucket exists." };
          }
          return await validateMinio({ accessKey: "depot-admin", secretKey: "Vu3lD3p0tS3cr3t!" });
        },
      }, {
        id: 7,
        title: "Provision the Fuel Manifest",
        category: "Storage",
        difficulty: "medium",
        points: 20,

        description: [
          "The storage array is online but has no buckets provisioned.",
          "Mission Control needs a bucket to store the fuel manifest.",
          "",
          "Create a bucket named:",
          "",
          "  fuel-manifest",
          "",
          "MinIO is reachable at localhost:9000.",
          "  Access key : depot-admin",
          "  Secret key : Vu3lD3p0tS3cr3t!",
          "",
          "Type 'done' when the bucket exists.",
        ].join("\n"),

        examples: [
        ],

        hints: [
          "Buckets can be created through the helm chart",
          "Or use the MinIO console at http://localhost:9001",
        ],

        async validator(answer) {
          if (!answer.trim()) {
            return { ok: false, message: "Type 'done' when the bucket exists." };
          }

          const { validateMinio } = require("./validators");

          return validateMinio({
            accessKey: "depot-admin",
            secretKey: "Vu3lD3p0tS3cr3t!",
            checks: [
              {
                label: "fuel-manifest bucket exists",
                async run(client) {
                  const exists = await client.bucketExists("fuel-manifest");
                  return exists
                    ? true
                    : "Bucket 'fuel-manifest' not found.";
                },
              },
            ],
          });
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    name: "Ferrox",
    icon: "🔴",
    color: C.brightRed,
    system: "Mission Control Sector",
    flavour: "A scorched industrial world humming with dormant infrastructure. The Mission Control API was abandoned mid-deployment — containers half-built, services unreachable, secrets unset. Four terminals stand between you and the final mission code.",
    challenges: [{
      id: 8,
      title: "Deploy Mission Control",
      category: "DevOps",
      difficulty: "easy",
      points: 20,
      description: [
        "Terminal 1 is dark. The API process never started. Get it running and reachable before anything else can be attempted.",
        "",
        "Deploy the Mission Control FastAPI application.The app must be running and reachable at localhost:8080.",
        "A Deployment and a Service are both required.",
        "",
        "  Namespace  : rest-api",
        "  Port       : 8080",
        "",
        "You need to build a docker image and push it to the registry running at localhost:5001.",
        "",
        "Type 'done' when app is running"
      ].join("\n"),

      examples: [
      ],

      hints: [],

      async validator(answer) {
        if (!answer.trim()) return { ok: false, message: "Type 'done' when the app is running." };

        let res;
        try {
          res = await httpGet("http://localhost:8080/health");
        } catch (err) {
          return { ok: false, message: friendlyHttpError(err, "http://localhost:8080/health") };
        }

        if (res.status !== 200) {
          return { ok: false, message: `/health returned HTTP ${res.status} — expected 200.` };
        }
        if (res.body?.status !== "ok") {
          return { ok: false, message: `Expected { status: "ok" }, got: ${JSON.stringify(res.body)}` };
        }

        return { ok: true, message: `/health returned status "ok" ✓` };
      },
    },
    {
      id: 9,
      title: "Inject the Mission Secret",
      category: "DevOps",
      difficulty: "medium",
      points: 30,
      description: [
        "The API is alive but refuses to serve classified data. The secret value was never injected — it sits in a vault, unwired. Link it.",
        "",
        "The API's /secret endpoint reads the MISSION_SECRET environment variable.",
        "It must be injected via a Kubernetes Secret — not hardcoded in the Deployment.",
        "",
        "Create a Secret and wire it into the Deployment:",
        "",
        "  Secret name : mission-secret",
        "  Key         : MISSION_SECRET",
        "  Value       : TopS3cr3tV4lu3",
        "",
        "Use secretKeyRef in your Deployment env block.",
        "Type 'done' when /secret returns the value.",
      ].join("\n"),

      examples: [
        { output: '{"secret":"TopS3cr3tV4lu3"}', explanation: "GET /secret response" },
      ],

      hints: [
      ],

      async validator(answer) {
        if (!answer.trim()) return { ok: false, message: "Type 'done' when ready." };

        let res;
        try {
          res = await httpGet("http://localhost:8080/secret");
        } catch (err) {
          return { ok: false, message: friendlyHttpError(err, "http://localhost:8080/secret") };
        }

        if (res.status === 500) {
          return {
            ok: false,
            message: "MISSION_SECRET is not set in the pod — did you add the secretKeyRef to the Deployment?",
          };
        }
        if (res.status !== 200) {
          return { ok: false, message: `/secret returned HTTP ${res.status}: ${JSON.stringify(res.body)}` };
        }
        if (res.body?.secret !== "TopS3cr3tV4lu3") {
          return {
            ok: false,
            message: `Wrong value — expected "TopS3cr3tV4lu3", got "${res.body?.secret}". Check the Secret's value.`,
          };
        }

        return { ok: true, message: `MISSION_SECRET injected correctly via secretKeyRef ✓` };
      },
    }, {
      id: 10,
      title: "Connect to the Database",
      category: "DevOps",
      difficulty: "medium",
      points: 40,

      description: [
        "The mission log is stored in a PostgreSQL instance in a neighbouring sector. Five environment variables stand between the API and the data. None of them are set.",
        "",
        "The API's /db endpoint connects to PostgreSQL using five env vars:",
        "",
        "  DB_HOST     DB_PORT     DB_NAME",
        "  DB_USER     DB_PASSWORD",
        "",
        "Store them in a Secret named `db-credentials` and wire them",
        "into the Deployment. The API must successfully open a connection.",
        "",
        "  Host     : postgres-postgresql.platform-storage.svc.cluster.local",
        "  Port     : 5432",
        "  Database : mission_control",
        "  User     : mission_control",
        "  Password : EenMoeilijkPasswoord123",
        "",
        "Type 'done' when /db returns { db: \"connected\" }.",
      ].join("\n"),

      examples: [
        { output: '{"db":"connected","host":"postgres-postgresql...","database":"mission_control"}', explanation: "GET /db response" },
      ],

      hints: [],

      async validator(answer) {
        if (!answer.trim()) return { ok: false, message: "Type 'done' when ready." };

        let res;
        try {
          res = await httpGet("http://localhost:8080/db", 10000); // longer timeout — real DB connect
        } catch (err) {
          return { ok: false, message: friendlyHttpError(err, "http://localhost:8080/db") };
        }

        if (res.status === 500) {
          const err = res.body?.error || "";
          if (err.includes("env vars missing")) {
            return {
              ok: false,
              message: "DB env vars are not set in the pod — did you wire up the db-credentials Secret?",
            };
          }
          return {
            ok: false,
            message: `Database connection failed: ${err}`,
          };
        }
        if (res.status !== 200) {
          return { ok: false, message: `/db returned HTTP ${res.status}: ${JSON.stringify(res.body)}` };
        }
        if (res.body?.db !== "connected") {
          return { ok: false, message: `Expected db="connected", got: ${JSON.stringify(res.body)}` };
        }

        return {
          ok: true,
          message: `Connected to ${res.body.database} on ${res.body.host} ✓`,
        };
      },
    },
    {
      id: 11,
      title: "Mission Accomplished",
      category: "DevOps",
      difficulty: "hard",
      points: 50,

      description: [
        "All systems are configured. The final terminal is ready to release the mission code — but only if everything is truly in order. One last check.",
        "",
        "Both the Secret and the database connection must be correctly",
        "configured before the final code can be retrieved.",
        "",
        "The /challenge4 endpoint checks both and returns the mission code",
        "only when everything is in order.",
        "",
        "No new configuration required — if challenges 2 and 3 are complete,",
        "this should light up. Type 'done' to retrieve the code.",
      ].join("\n"),

      examples: [
        { output: '{"status":"MISSION_ACCOMPLISHED","code":"ARG0-W1NS-K8S-R0CKS"}', explanation: "GET /challenge4 response when all env vars are set" },
      ],

      hints: [
        "Make sure both MISSION_SECRET and DB_HOST are set in the pod.",
        "kubectl exec -n mission-control deploy/mission-control-api -- env | grep -E 'MISSION_SECRET|DB_HOST'",
        "If either is missing, revisit challenges 2 and 3.",
      ],

      async validator(answer) {
        if (!answer.trim()) return { ok: false, message: "Type 'done' when ready." };

        let res;
        try {
          res = await httpGet("http://localhost:8080/challenge4");
        } catch (err) {
          return { ok: false, message: friendlyHttpError(err, "http://localhost:8080/challenge4") };
        }

        if (res.status === 400) {
          const { secret_ok, db_ok } = res.body;
          const missing = [
            !secret_ok && "MISSION_SECRET (challenge 2)",
            !db_ok && "DB_HOST (challenge 3)",
          ].filter(Boolean).join(" and ");
          return {
            ok: false,
            message: `Not ready — ${missing} ${!secret_ok && !db_ok ? "are" : "is"} still missing from the pod.`,
          };
        }
        if (res.status !== 200) {
          return { ok: false, message: `/challenge4 returned HTTP ${res.status}: ${JSON.stringify(res.body)}` };
        }
        if (res.body?.status !== "MISSION_ACCOMPLISHED") {
          return { ok: false, message: `Unexpected response: ${JSON.stringify(res.body)}` };
        }

        return {
          ok: true,
          message: `Mission code retrieved: ${res.body.code} ✓`,
        };
      },
    },
    ],
  },

];

module.exports = PLANETS;
