# Plan: x

## Goal

x

## Assumptions
- Repo is ready for focused orchestration work.

## Non-goals
- Product code changes are not made by the planner.

## Files likely to change
- plans/<slug>.md

## Execution checklist
- [ ] 1. Gather context
- [ ] 2. Execute work

## Acceptance criteria
- [ ] Plan is specific enough to start work.

## QA Scenarios
- [ ] Plan-only path leaves product code untouched.

## Verification matrix
| Check | Command/manual action | Evidence path |
|---|---|---|
| Plan file created | `node bin/dcc.mjs plan ...` | .dcc/evidence/<session-id>/task-17-plan-only.txt |

## Rollback plan
- Remove the generated plan and inactive metadata entry.

## Risks
- Overly broad task text can create an imprecise plan.

