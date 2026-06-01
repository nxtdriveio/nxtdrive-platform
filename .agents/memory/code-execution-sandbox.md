---
name: code_execution sandbox env
description: Gotcha when probing env vars / reachability from the JS sandbox.
---

In the `code_execution` JS sandbox, `process.env` is undefined — reading
`process.env["X"]` throws `TypeError: Cannot read properties of undefined`.

**How to apply:** to read env vars, check secret existence, or probe network reachability,
use the `bash` tool (which has the env) or the `viewEnvVars` callback — not raw
`process.env` in the JS sandbox. Never print secret values regardless of tool.
