# CHANGES: MISSION S06 — NERVOUS SYSTEM

## Modified Files
1. `src/worker/worker.ts`:
   - Added `JobStatus`, `VALID_JOB_TRANSITIONS`, `canTransitionJob()`, and `computeNextJobStatus()`.
   - Added error taxonomy `PermanentJobError`, `TransientJobError`, and `classifyJobError()`.
   - Added bounded exponential backoff capping at 1 hour (3,600,000 ms).
   - Added `registerHandler()` and `getRegisteredJobTypes()` for dynamic typed job handler mapping.
   - Added `inFlightClaims` slot reservation to guarantee atomic throttling under high-concurrency polling bursts.
   - Updated `/health` endpoint to embed queue metrics and added `/metrics` endpoint.
2. `src/execution/workflowRuntime.ts`:
   - Added `validateWorkflowDefinition()` with complete DAG cycle detection using graph coloring DFS.
   - Added `evaluateCondition()` providing safe, injection-free evaluation of step condition expressions and predicate functions.
   - Added step timeouts (`timeout_ms` wrapping tool execution with timeout promise race).
   - Added failure branch handling (`on_failure: 'continue'` and `on_failure: 'branch'`).
   - Added `resumeInterruptedRun()` to enable deterministic recovery from checkpoints after process crashes or worker restarts.
3. `src/api/routes/system.ts`:
   - Added `GET /api/system/queue` endpoint returning real-time queue depth, age of oldest queued job, retry counts, dead letter counts, and worker health.

## Newly Created Files
1. `src/worker/queueMetrics.ts`:
   - Canonical implementation of `getQueueMetrics(worker?: WorkerService)` querying Supabase `jobs` and extracting real-time operational telemetry.
2. `tests/unit/jobStateMachine.test.ts`:
   - Unit tests for S06-AC-01 (state transitions), S06-AC-02 (leases), S06-AC-03 (backoff & error classification), S06-AC-04 (typed handlers).
3. `tests/unit/workflowEngine.test.ts`:
   - Unit tests for S06-AC-05 (DAG validation & cycle detection), S06-AC-06 (conditions, timeouts, failure branches), S06-AC-07 (checkpoint resumption & idempotency).
4. `tests/unit/workerTelemetry.test.ts`:
   - Unit tests for S06-AC-08 (concurrency throttling & claim reservation), S06-AC-09 (queue metrics calculations).
