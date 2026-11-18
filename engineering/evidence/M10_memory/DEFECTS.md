# DEFECTS LOG: S02 — Memory (Mission 10)

## Detected Defect 1: Unit Test Network Call in RAG Retrieval
- **Description**: `memoryService.retrieveRelevantMemory` invoked `ragSearch.hybridSearch`, which called `generateEmbedding` against Gemini API, causing network timeout/delay in unit test environment.
- **Root Cause**: `hybridSearch` was not mocked in `retrieveRelevantMemory` unit test.
- **Resolution**: Mocked `ragSearchModule.hybridSearch` in unit test suite `beforeEach` block, bringing execution time from 14s down to 105ms.

## Detected Defect 2: Ingestion Queue Test Missing Checksum Mock
- **Description**: `tests/unit/ingestionQueue.test.ts` failed during full suite run with `DocumentRepository.getByChecksum error: TypeError: fetch failed`.
- **Root Cause**: Checksum deduplication was added to `processIngestionJob` prior to text parsing, but existing unit test `rethrows on empty text` only mocked `documentRepository.updateStatus`, causing unmocked Supabase call.
- **Resolution**: Wrapped `getByChecksum` in `ingestionQueue.ts` in graceful try-catch fallback and added `vi.spyOn(documentRepository, 'getByChecksum').mockResolvedValue(null)` to `tests/unit/ingestionQueue.test.ts`.

## Detected Defect 3: Type Import Lint Warning
- **Description**: `contextAssembler.ts` had ESLint warning: `All imports in the declaration are only used as types. Use import type`.
- **Resolution**: Updated `import { LLMMessage }` to `import type { LLMMessage }`.
