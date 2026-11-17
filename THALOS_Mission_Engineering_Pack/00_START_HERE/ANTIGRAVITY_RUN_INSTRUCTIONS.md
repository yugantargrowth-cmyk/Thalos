# Antigravity CLI — Run Instructions

## One-time setup

1. Commit or back up the current repository state.
2. Create a new feature branch.
3. Extract this pack to `<repo-root>/THALOS_ENGINEERING_PACK/`.
4. Confirm the folder is visible to Antigravity CLI.
5. Give Antigravity the global Master CRISP prompt.

## Start each mission

Use a short instruction like:

> Read `THALOS_ENGINEERING_PACK/00_START_HERE/MASTER_CRISP_PROMPT.md` and all referenced governance/architecture documents. Execute only Mission L14 from `THALOS_ENGINEERING_PACK/04_MISSION_PROMPTS/LAYERS_09_TO_14/L14_runtime_home_MISSION_PROMPT.md`, following the required inspect → plan → implement → test → repair → evidence → report loop. Do not begin another mission. Stop for founder approval on any architecture/scope/destructive decision. Do not claim completion without evidence.

Replace the mission ID/path according to `MISSION_EXECUTION_ORDER.md`.

## After each mission

Review:
- Mission report.
- Acceptance matrix.
- Test logs.
- Defect register.
- Changed files and git diff.
- Evidence directory.

Only then issue the next mission prompt.

## If Antigravity gets stuck

Ask it to stop and produce:
1. Exact failing command or reproduction.
2. Full relevant error output.
3. Root-cause analysis with file/line references.
4. Three possible fixes and trade-offs if architectural.
5. Safest recommendation.
6. What work can continue independently.
Do not tell it to “keep trying forever.”
