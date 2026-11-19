# DEFECTS LOG: S05 — Business Organs (Mission 12)

## Detected Defect 1: Unit Test Mock Missing Chained Method in Payment Deduplication
- **Description**: `tests/unit/businessOrgans.test.ts` failed during `recordPayment` test with `TypeError: supabase.from(...).select(...).eq(...).eq(...).maybeSingle is not a function`.
- **Root Cause**: The mock for table `'payments'` only defined a single `.eq()` and missed `.maybeSingle()`, but `recordPayment` calls `.eq('invoice_id', ...).eq('reference', ...).maybeSingle()`.
- **Resolution**: Updated `payments` mock in `businessOrgans.test.ts` to return `this` on `.eq()` and resolved `{ data: null, error: null }` on `.maybeSingle()`.

## Detected Defect 2: Project Progress Value Bounds
- **Description**: Projects could theoretically be assigned negative or over-100% progress without error.
- **Root Cause**: Missing boundary validation on `progressPercent`.
- **Resolution**: Added strict validation `progressPercent >= 0 && progressPercent <= 100` in `recordProjectProgress`.
