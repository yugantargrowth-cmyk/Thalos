# Canonical Ownership Map — Prevent Duplicate Implementations

The eight systems are conceptual product capabilities. The six layers are technical implementation owners. A capability may cross multiple layers, but each shared primitive has exactly one technical owner.

| Capability / artifact | Primary technical owner | Conceptual system using it | Rule |
|---|---|---|---|
| Model adapters, routing, context, planning, evaluation | L09 Intelligence | S01 Brain | One orchestrator and model-router implementation |
| Agent definitions, runtime, delegation contracts | L10 Agents | S01 Brain | Preserve nine agents; no duplicate agent framework |
| Tool schemas, dispatcher, permissions, side-effect execution | L11 Execution | S04 Hands, S07 Immune | One tool registry and execution gateway |
| Job queue, worker, workflow runtime, scheduler, retries | L11 Execution | S06 Nervous | One durable job/workflow runtime |
| Domain entities and business rules | L12 Business | S05 Business Organs | One canonical domain model |
| Database schema, repositories, RAG storage, memory persistence | L13 Persistence | S02 Memory, S03 Eyes & Ears | One persistence and data-access boundary |
| API bootstrap, config, hosting, health, logging, backups | L14 Runtime | S08 Body & Home | One runtime/deployment contract |
| Auth, approval policies, audit, secret handling | Cross-cutting security policy; enforcement in L11/L14 and DB | S07 Immune | One policy definition, enforced at every server boundary |
| Web/file research and source ingestion | Adapters in L11; durable storage in L13 | S03 Eyes & Ears | No second search or ingestion pipeline |
| Frontend IA and companion UI | Frontend application; consumes L09–L14 APIs | S08 Body & Home | One adaptive PWA, not separate desktop/mobile apps |

## Mission boundaries

### Conceptual system missions S01–S08
These missions own system-level outcomes, end-to-end contracts, cross-component integration and acceptance. They may fix glue code and user-facing flows. They must not create alternate versions of the technical primitives owned by L09–L14.

### Technical layer missions L09–L14
These missions own shared backend primitives, data contracts, services, adapters, workers and runtime infrastructure. They must expose stable interfaces and tests for conceptual system missions.

### Final E15
Owns whole-system integration, regression, threat review, operational validation, end-to-end scenarios and final evidence. It must not hide or silently rewrite unresolved mission failures.

## Conflict resolution

If a conceptual system requirement appears to require changing a technical primitive:
1. Identify the technical owner.
2. Propose the interface change.
3. Check downstream consumers.
4. Add compatibility tests.
5. Make the change in the owning layer or record a coordinated change.
6. Update both mission acceptance matrices.
7. Never duplicate the primitive to avoid touching its owner.
