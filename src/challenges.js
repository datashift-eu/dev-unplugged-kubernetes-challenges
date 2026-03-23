"use strict";

const { password, database } = require("pg/lib/defaults");
const { validateMinio, validatePostgres, httpGet, friendlyHttpError } = require("./validators");

const MINIO = {
  endPoint:  "localhost",
  port:      9000,
  useSSL:    false,
  accessKey: "depot-admin",
  secretKey: "Vu3lD3p0tS3cr3t!",
};

const ARGO_API  = "http://localhost:2746";
const NAMESPACE = "argo";

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
  {
    name: "Archivon",
    icon: "📦",
    color: "\x1b[94m",   // brightBlue
    system: "Argo Reach",
    flavour: [
      "A vast automated sorting world, its surface covered in conveyor belts and",
      "processing silos. Cargoes arrive compressed, unreadable — a workflow engine",
      "once extracted them automatically, but the pipeline has gone dark.",
      "Four systems need rebuilding: the landing bucket, the processing template,",
      "the event trigger, and finally a live end-to-end run.",
    ].join(" "),

    challenges: [

      // ── Challenge 301 ─────────────────────────────────────────────────────────
      {
        id: 301,
        title: "Prepare the Landing Zone",
        category: "DevOps",
        difficulty: "easy",
        points: 20,

        description: [
          "The cargo sorting pipeline needs a MinIO bucket as its landing zone.",
          "Incoming compressed archives must arrive under one prefix;",
          "processed output must land under another.",
          "",
          "Create a bucket named 'drop-zone' with these two prefixes:",
          "",
          "  incoming/    ← zip files are uploaded here",
          "  processed/   ← workflow writes extracted files here",
          "",
          "MinIO is on localhost:9000 (credentials: depot-admin / Vu3lD3p0tS3cr3t!).",
          "Prefixes are just placeholder objects — upload a zero-byte object",
          "named 'incoming/.keep' and 'processed/.keep' to create them.",
          "",
          "Type 'done' when both prefixes exist.",
        ].join("\n"),

        examples: [
          { output: "mc cp /dev/null depot/drop-zone/incoming/.keep", explanation: "create the prefix" },
        ],

        hints: [
          "mc alias set depot http://localhost:9000 depot-admin 'Vu3lD3p0tS3cr3t!'",
          "mc mb depot/drop-zone",
          "echo '' | mc pipe depot/drop-zone/incoming/.keep\necho '' | mc pipe depot/drop-zone/processed/.keep",
        ],

        async validator(answer) {
          if (!answer.trim()) return { ok: false, message: "Type 'done' when ready." };

          return validateMinio({
            ...MINIO,
            checks: [
              {
                label: "drop-zone bucket exists",
                async run(client) {
                  const exists = await client.bucketExists("drop-zone");
                  return exists ? true : "Bucket 'drop-zone' not found. Run: mc mb depot/drop-zone";
                },
              },
              {
                label: "incoming/ prefix exists",
                async run(client) {
                  const keys = await listObjects(client, "drop-zone", "incoming/");
                  return keys.length > 0
                    ? true
                    : "No objects found under 'incoming/' — upload incoming/.keep to create the prefix.";
                },
              },
              {
                label: "processed/ prefix exists",
                async run(client) {
                  const keys = await listObjects(client, "drop-zone", "processed/");
                  return keys.length > 0
                    ? true
                    : "No objects found under 'processed/' — upload processed/.keep to create the prefix.";
                },
              },
            ],
          });
        },
      },

      // ── Challenge 302 ─────────────────────────────────────────────────────────
      {
        id: 302,
        title: "Deploy the Unzip Template",
        category: "DevOps",
        difficulty: "hard",
        points: 40,

        description: [
          "Deploy an Argo WorkflowTemplate named 'unzip-pipeline' in the argo namespace.",
          "It must accept two arguments and process a zip from MinIO:",
          "",
          "  Parameters:",
          "    bucket   — the source MinIO bucket  (default: drop-zone)",
          "    key      — the object key of the zip (e.g. incoming/payload.zip)",
          "",
          "The unzip app is provided. Build a docker image and call from WorkflowTemplate.",
          "",
          "  The workflow needs a MinIO secret wired in as env vars:",
          "    MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY",
          "",
          "Type 'done' when the WorkflowTemplate exists in the cluster.",
        ].join("\n"),

        examples: [
          { output: "workflowtemplate.argoproj.io/unzip-pipeline created" },
        ],

        hints: [
          "kubectl apply -f unzip-pipeline.yaml -n argo",
          "kubectl get workflowtemplate -n argo   ← verify it was created",
        ],

        async validator(answer) {
          if (!answer.trim()) return { ok: false, message: "Type 'done' when ready." };

          // Query the Argo Server API for the WorkflowTemplate
          let res;
          try {
            res = await httpGet(
              `${ARGO_API}/api/v1/workflow-templates/${NAMESPACE}/unzip-pipeline`
            );
          } catch (err) {
            if (err.code === "ECONNREFUSED" || err.code === "ETIMEOUT") {
              return {
                ok: false,
                message: `Cannot reach Argo Server at ${ARGO_API}. Run: kubectl port-forward svc/argo-server 2746:2746 -n argo`,
              };
            }
            return { ok: false, message: `Argo API error: ${err.message}` };
          }

          if (res.status === 404) {
            return {
              ok: false,
              message: "WorkflowTemplate 'unzip-pipeline' not found in namespace 'argo'. Did you kubectl apply it?",
            };
          }
          if (res.status !== 200) {
            return { ok: false, message: `Argo API returned HTTP ${res.status}: ${JSON.stringify(res.body)}` };
          }

          // Verify it has the expected entrypoint and arguments
          const spec = res.body?.spec || {};
          const tpls = spec.templates || [];
          const args = spec.arguments?.parameters || [];

          const hasBucketParam = args.some(p => p.name === "bucket");
          const hasKeyParam = args.some(p => p.name === "key");

          if (!hasBucketParam || !hasKeyParam) {
            return {
              ok: false,
              message: `WorkflowTemplate exists but is missing required parameters. Need: bucket, key. Found: ${args.map(p => p.name).join(", ") || "none"}`,
            };
          }

          if (tpls.length === 0) {
            return { ok: false, message: "WorkflowTemplate has no templates defined." };
          }

          return {
            ok: true,
            message: `WorkflowTemplate 'unzip-pipeline' found with ${tpls.length} template(s) and correct parameters ✓`,
          };
        },
      },

      // ── Challenge 303 ─────────────────────────────────────────────────────────
      {
        id: 303,
        title: "Wire the Event Trigger",
        category: "DevOps",
        difficulty: "hard",
        points: 50,

        description: [
          "The WorkflowTemplate is deployed but nothing triggers it.",
          "Set up Argo Events to watch MinIO and fire automatically:",
          "",
          "  EventSource  name : minio-drop-zone",
          "    watches bucket  : drop-zone",
          "    prefix filter   : incoming/",
          "    events          : s3:ObjectCreated:*",
          "",
          "  Sensor       name : unzip-sensor",
          "    dependency      : minio-drop-zone",
          "    trigger         : submit WorkflowTemplate 'unzip-pipeline'",
          "    pass key as     : key parameter  (from the event payload)",
          "",
          "Both must be in the argo namespace.",
          "Type 'done' when both exist and are in a healthy state.",
        ].join("\n"),

        examples: [
          { output: "eventsource.argoproj.io/minio-drop-zone created" },
          { output: "sensor.argoproj.io/unzip-sensor created" },
        ],

        hints: [
          "kubectl apply -f eventsource.yaml -f sensor.yaml -n argo",
          "kubectl get eventsource,sensor -n argo   ← check they exist",
        ],

        async validator(answer) {
          if (!answer.trim()) return { ok: false, message: "Type 'done' when ready." };

          // Check EventSource via Argo Events API
          let esRes;
          try {
            esRes = await httpGet(
              `${ARGO_API}/api/v1/event-sources/${NAMESPACE}/minio-drop-zone`
            );
          } catch (err) {
            if (err.code === "ECONNREFUSED" || err.code === "ETIMEOUT") {
              return {
                ok: false,
                message: `Cannot reach Argo Server at ${ARGO_API}. Run: kubectl port-forward svc/argo-server 2746:2746 -n argo`,
              };
            }
            return { ok: false, message: `Argo API error: ${err.message}` };
          }

          if (esRes.status === 404) {
            return {
              ok: false,
              message: "EventSource 'minio-drop-zone' not found in namespace 'argo'.",
            };
          }
          if (esRes.status !== 200) {
            return { ok: false, message: `EventSource API returned HTTP ${esRes.status}` };
          }

          // Verify the EventSource watches the right bucket
          const s3Config = esRes.body?.spec?.minio?.["drop-zone"] || {};
          if (s3Config.bucket?.name && s3Config.bucket.name !== "drop-zone") {
            return {
              ok: false,
              message: `EventSource is watching bucket '${s3Config.bucket?.name}' — expected 'drop-zone'.`,
            };
          }

          // Check Sensor
          let sensorRes;
          try {
            sensorRes = await httpGet(
              `${ARGO_API}/api/v1/sensors/${NAMESPACE}/unzip-sensor`
            );
          } catch (err) {
            return { ok: false, message: `Argo API error checking sensor: ${err.message}` };
          }

          if (sensorRes.status === 404) {
            return {
              ok: false,
              message: "Sensor 'unzip-sensor' not found. EventSource exists — now deploy the Sensor.",
            };
          }
          if (sensorRes.status !== 200) {
            return { ok: false, message: `Sensor API returned HTTP ${sensorRes.status}` };
          }

          // Verify the Sensor references the WorkflowTemplate
          const triggers = sensorRes.body?.spec?.triggers || [];
          const hasWorkflowTrigger = triggers.some(t =>
            t.template?.argoWorkflow?.source?.resource?.metadata?.name === "unzip-pipeline" ||
            JSON.stringify(t).includes("unzip-pipeline")
          );

          if (!hasWorkflowTrigger) {
            return {
              ok: false,
              message: "Sensor exists but doesn't appear to reference WorkflowTemplate 'unzip-pipeline'.",
            };
          }

          return {
            ok: true,
            message: "EventSource 'minio-drop-zone' and Sensor 'unzip-sensor' are deployed and wired ✓",
          };
        },
      },

      // ── Challenge 304 ─────────────────────────────────────────────────────────
      {
        id: 304,
        title: "The Live Run",
        category: "DevOps",
        difficulty: "expert",
        points: 100,

        description: [
          "Everything is in place. Time for a live end-to-end test.",
          "",
          "The validator will:",
          "  1. Upload a test zip to drop-zone/incoming/voyager-test.zip",
          "  2. Wait up to 90 seconds for Argo to pick it up and run",
          "  3. Check that drop-zone/processed/manifest.txt exists",
          "  4. Verify its contents are exactly: ARCHIVON_PAYLOAD",
          "",
          "You do not need to upload anything — the validator does it.",
          "Just make sure the full pipeline is running, then type 'done'.",
          "",
          "  Port-forwards required:",
          "    MinIO  : localhost:9000",
          "    Argo   : localhost:2746",
        ].join("\n"),

        examples: [
          { output: "processed/manifest.txt", explanation: "Expected object after workflow completes" },
        ],

        hints: [
          "Check workflow runs: kubectl get workflows -n argo",
          "Watch logs: kubectl logs -n argo -l workflows.argoproj.io/workflow -f",
          "If the workflow never starts: kubectl get eventsource,sensor,eventbus -n argo",
          "If the workflow fails: argo logs <workflow-name> -n argo",
        ],

        async validator(answer) {
          if (!answer.trim()) return { ok: false, message: "Type 'done' when the pipeline is ready." };

          let Minio;
          try { Minio = require("minio"); }
          catch { return { ok: false, message: "Missing dependency: npm install minio" }; }

          const client = new Minio.Client({
            endPoint: MINIO.endPoint,
            port: MINIO.port,
            useSSL: MINIO.useSSL,
            accessKey: MINIO.accessKey,
            secretKey: MINIO.secretKey,
          });

          // ── Step 1: verify bucket exists ──────────────────────────────────────
          try {
            const exists = await client.bucketExists("drop-zone");
            if (!exists) {
              return { ok: false, message: "Bucket 'drop-zone' not found — complete challenge 301 first." };
            }
          } catch (err) {
            return { ok: false, message: `Cannot reach MinIO: ${err.message}` };
          }

          // ── Step 2: clean up any previous test run ────────────────────────────
          try {
            await client.removeObject("drop-zone", "processed/manifest.txt");
          } catch { /* doesn't exist yet — fine */ }

          // ── Step 3: upload the test zip ───────────────────────────────────────
          const zip = buildTestZip();
          const zipKey = "incoming/voyager-test.zip";

          console.log("\n  ▶ Uploading test zip to drop-zone/incoming/voyager-test.zip ...");
          try {
            await putObject(client, "drop-zone", zipKey, zip);
          } catch (err) {
            return { ok: false, message: `Failed to upload test zip: ${err.message}` };
          }
          console.log("  ✔ Zip uploaded — waiting for Argo to process it ...");

          // ── Step 4: poll processed/ for up to 90 seconds ─────────────────────
          const POLL_INTERVAL = 5000;
          const TIMEOUT = 90_000;
          const start = Date.now();
          let found = false;

          while (Date.now() - start < TIMEOUT) {
            await sleep(POLL_INTERVAL);
            const elapsed = Math.round((Date.now() - start) / 1000);
            process.stdout.write(`\r  ⏳ Waiting... ${elapsed}s / 90s`);

            try {
              const keys = await listObjects(client, "drop-zone", "processed/manifest.txt");
              if (keys.includes("processed/manifest.txt")) { found = true; break; }
            } catch { /* keep polling */ }
          }
          process.stdout.write("\r" + " ".repeat(40) + "\r");

          if (!found) {
            return {
              ok: false,
              message: [
                "Timed out after 90s — processed/manifest.txt never appeared.",
                "Check: kubectl get workflows -n argo",
                "       kubectl get eventsource,sensor -n argo",
              ].join("\n  "),
            };
          }

          // ── Step 5: verify file contents ──────────────────────────────────────
          let content = "";
          try {
            content = await readObject(client, "drop-zone", "processed/manifest.txt");
          } catch (err) {
            return { ok: false, message: `Could not read processed/manifest.txt: ${err.message}` };
          }

          if (!content.includes("ARCHIVON_PAYLOAD")) {
            return {
              ok: false,
              message: `processed/manifest.txt exists but has wrong content.\nExpected: "ARCHIVON_PAYLOAD"\nGot:      "${content.trim()}"`,
            };
          }

          return {
            ok: true,
            message: "End-to-end pipeline confirmed ✓  Zip uploaded → workflow triggered → file extracted to processed/",
          };
        },
      },

    ], // end challenges
  }
];

// ── Helper used by challenge 304 ─────────────────────────────────────────────
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Build a minimal valid zip in memory (no deps — pure JS)
// Contains a single file "manifest.txt" with content "ARCHIVON_PAYLOAD"
function buildTestZip() {
  // Tiny but valid ZIP with one stored (uncompressed) file
  const filename    = Buffer.from("manifest.txt");
  const fileContent = Buffer.from("ARCHIVON_PAYLOAD\n");
  const now         = new Date();
  const dosDate     = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dosTime     = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

  // CRC-32
  let crc = 0xFFFFFFFF;
  for (const byte of fileContent) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0;

  const localHeader = Buffer.alloc(30 + filename.length);
  localHeader.writeUInt32LE(0x04034b50, 0);  // local file header signature
  localHeader.writeUInt16LE(20,          4);  // version needed
  localHeader.writeUInt16LE(0,           6);  // flags
  localHeader.writeUInt16LE(0,           8);  // compression: stored
  localHeader.writeUInt16LE(dosTime,    10);
  localHeader.writeUInt16LE(dosDate,    12);
  localHeader.writeUInt32LE(crc,        14);
  localHeader.writeUInt32LE(fileContent.length, 18);  // compressed size
  localHeader.writeUInt32LE(fileContent.length, 22);  // uncompressed size
  localHeader.writeUInt16LE(filename.length,    26);
  localHeader.writeUInt16LE(0,          28);  // extra field length
  filename.copy(localHeader, 30);

  const centralDir = Buffer.alloc(46 + filename.length);
  centralDir.writeUInt32LE(0x02014b50, 0);  // central dir signature
  centralDir.writeUInt16LE(20,          4);
  centralDir.writeUInt16LE(20,          6);
  centralDir.writeUInt16LE(0,           8);
  centralDir.writeUInt16LE(0,          10);
  centralDir.writeUInt16LE(dosTime,    12);
  centralDir.writeUInt16LE(dosDate,    14);
  centralDir.writeUInt32LE(crc,        16);
  centralDir.writeUInt32LE(fileContent.length, 20);
  centralDir.writeUInt32LE(fileContent.length, 24);
  centralDir.writeUInt16LE(filename.length,    28);
  centralDir.writeUInt16LE(0,          30);  // extra
  centralDir.writeUInt16LE(0,          32);  // comment
  centralDir.writeUInt16LE(0,          34);  // disk start
  centralDir.writeUInt16LE(0,          36);  // int attrs
  centralDir.writeUInt32LE(0,          38);  // ext attrs
  centralDir.writeUInt32LE(0,          42);  // local header offset
  filename.copy(centralDir, 46);

  const localHeaderSize = localHeader.length + fileContent.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);  // end of central dir signature
  eocd.writeUInt16LE(0,           4);
  eocd.writeUInt16LE(0,           6);
  eocd.writeUInt16LE(1,           8);  // total entries this disk
  eocd.writeUInt16LE(1,          10);  // total entries
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(localHeaderSize,   16);  // central dir offset
  eocd.writeUInt16LE(0,          20);

  return Buffer.concat([localHeader, fileContent, centralDir, eocd]);
}

// Stream a Buffer to MinIO as an object
function putObject(client, bucket, key, buffer) {
  const { Readable } = require("stream");
  const stream = Readable.from(buffer);
  return new Promise((resolve, reject) => {
    client.putObject(bucket, key, stream, buffer.length, (err, etag) => {
      if (err) reject(err); else resolve(etag);
    });
  });
}

// List objects under a prefix, return array of key strings
function listObjects(client, bucket, prefix) {
  return new Promise((resolve, reject) => {
    const keys   = [];
    const stream = client.listObjects(bucket, prefix, true);
    stream.on("data", obj => keys.push(obj.name));
    stream.on("end",  ()  => resolve(keys));
    stream.on("error", reject);
  });
}

module.exports = PLANETS;
