# GIT ISSUE DISCIPLINE — Shokunin

> Git is the durability layer for verified work.
> GitHub Issues are the remote tracking layer for planned work.
> Neither Git nor GitHub Issues are proof by themselves.
> VERIFIED ≠ DECLARED.

## 1. Why this exists

Shokunin projects are built by disposable agents.

Agents may change. Sessions may die. Context may saturate. Tools may fail.

The project must keep its own durable memory through:

* implementation plans;
* GitHub Issues;
* job files;
* branches;
* commits;
* reports;
* handoffs;
* proof artifacts.

This document defines how Git and GitHub Issues fit into the Shokunin workflow without giving agents uncontrolled authority over the repository.


>[!caution]
All Git operations are mandatory to run only from the identified code root or from a Git worktree explicitly created from that code root. Do not run `git` commands from the agent directory, `CLAUDE/`, parent folders, sibling folders, or any path whose repository identity has not been verified.


## 2. Core principle

```txt
No code on main.
No commit without proof.
No merge without review.
No push to main by agents.
One job = one branch = one report = one verified commit candidate.
```

Git is not a scratchpad.

A commit is a durable snapshot of verified work.

A GitHub Issue is not a PASS. It is only a tracked work item.

## 3. ID spine

Every unit of work must preserve the same ID across the whole workflow.

```txt
IMPLEMENTATION_PLAN task ID
  → GitHub Issue
  → job file
  → job branch
  → verified commit
  → report file
  → handoff reference
```

Example:

```txt
T1.2
  → GitHub Issue: T1.2 — Render gate honesty state
  → job file for T1.2
  → job/T1.2-render-gate-honesty
  → commit: T1.2: render gate honesty state
  → report file for T1.2
  → active handoff references T1.2
```

The task ID is the stable identity.

Do not rename task IDs after GitHub sync unless the owner explicitly accepts the migration cost.

## 4. Repository authority model

### `main`

`main` is stable.

Rules:

* agents do not code on `main`;
* agents do not commit directly to `main`;
* agents do not push to `main`;
* agents do not merge into `main`;
* only the owner can approve merge into `main`.

`main` represents the stable product line.

### `sprint/*`

A sprint branch is the integration branch for a verified sprint.

Examples:

```txt
sprint/S0-contract-foundation
sprint/S1-read-only-project-view
sprint/S2-health-and-honesty
```

Rules:

* the CTO may create or request the sprint branch;
* job branches are based on the active sprint branch;
* accepted job branches merge into the sprint branch;
* sprint branch is pushed at sprint close by default;
* sprint branch merges into `main` only after the sprint stop-check is VERIFIED and owner-approved.

### `job/*`

A job branch isolates one executable unit of work.

Examples:

```txt
job/T0.1-scaffold-nuxt
job/T0.2-zod-schemas
job/T1.2-render-gate-honesty
```

Rules:

* one job branch maps to one task ID;
* one job branch maps to one job file;
* one job branch maps to one report file;
* the coder works on the job branch;
* the coder may commit only after the required proof is produced;
* the coder does not merge the job branch.

## 5. Branch naming

Use:

```txt
sprint/<sprint-id>-<short-slug>
job/<task-id>-<short-slug>
fix/<task-id>-<short-slug>
```

Examples:

```txt
sprint/S0-contract-foundation
job/T0.1-scaffold-nuxt
job/T1.2-render-gate-honesty
fix/T1.2-gate-proof-resolution
```

Branch names must be:

* lowercase except task IDs if the project keeps them uppercase;
* short;
* stable;
* tied to a sprint or task ID;
* free of secrets or customer data.

## 6. Commit policy

Default rule:

```txt
One verified job = one commit candidate.
```

A commit is allowed only when:

* the job scope is complete;
* the required tests or proof commands have been run;
* the report exists;
* the report contains proof or proof pointers;
* the diff was inspected;
* `git status` was inspected;
* no secret or forbidden file is included;
* the commit message references the task ID.

The coder must not commit partial guesses as final work.

### Commit message format

Use:

```txt
T1.2: render gate honesty state
```

Recommended commit body:

```txt
Task: T1.2
Issue: #<number or URL>
Job: <job file path>
Report: <report file path>
Proof:
- <command or proof summary>
```

Do not include secrets, tokens, private customer data, or long logs in the commit body.

## 7. Push policy

Default solo mode:

```txt
Commit after each verified job.
Push at sprint close.
```

Push earlier only when:

* another machine or agent must resume from remote;
* the work is too valuable to remain local;
* the owner requests remote review;
* a gate was closed and needs external traceability;
* a branch handoff requires remote availability.

Agents never push to `main`.

Pushing a job branch or sprint branch does not mean PASS.

## 8. Merge policy

### Coder

The coder may:

* create or use the assigned job branch;
* modify code within job scope;
* run tests and proof commands;
* write the report;
* commit verified job work.

The coder must not:

* merge branches;
* push to `main`;
* change sprint scope;
* alter locked decisions unless explicitly instructed;
* declare PASS without proof.

### CTO

The CTO may:

* verify the report and proof;
* inspect the diff;
* request changes;
* create follow-up jobs;
* merge accepted job branches into the active sprint branch;
* prepare sprint close;
* recommend push.

The CTO must not:

* declare PASS from prose;
* merge without proof;
* bypass locked owner decisions;
* merge into `main` without owner approval.

### Owner

The owner controls:

* creation of the project;
* locked intent;
* protected `main`;
* final sprint acceptance;
* merge into `main`;
* release/publish decisions;
* exceptional overrides.

## 9. GitHub Issue policy

GitHub Issues are generated or synced from `IMPLEMENTATION_PLAN.md`.

The generated issue body is owned by the plan.

Execution evidence belongs in:

* report files;
* issue comments;
* linked proof artifacts.

Correct:

```txt
Task scope changes → update IMPLEMENTATION_PLAN.md → sync issue body.
Proof output → write report and/or issue comment.
Review notes → report or issue comment.
```

Incorrect:

```txt
Manual scope edits directly in generated issue body.
Proof pasted into generated issue body.
PASS declared because an issue exists.
```

A GitHub Issue created from the plan is not a PASS.

PASS requires:

* implementation;
* tests or proof commands;
* typecheck/build when applicable;
* report;
* reproducible proof;
* CTO verification.

## 10. Plan sync discipline

Before syncing plan tasks to GitHub Issues:

* verify GitHub CLI authentication;
* verify the repo remote;
* verify required labels exist;
* verify the plan path;
* run dry-run first;
* inspect sprint count;
* inspect task count;
* inspect generated issue bodies;
* ensure no secrets appear;
* ensure task titles are not cut;
* ensure stable hidden markers are present.

Real sync happens only after clean dry-run.

Do not assume optional sync features exist.

If update mode is not supported by the project, treat sync as create/skip only.


## 10.1 Issue status discipline

GitHub Issue state must be pulled before acting on issue state.

Use issue status/check mode when:

- resuming after a handoff;
- preparing CTO review;
- preparing sprint close;
- checking whether the local plan and GitHub Issues are still aligned;
- detecting missing, duplicate, stale, orphan, or closed-but-still-planned issues.

The status check must report or detect:

- issue open / closed state;
- exact issue number or URL for each plan task;
- current labels;
- assignees;
- milestone;
- GitHub Project status when available;
- comments;
- proof signals in comments;
- accepted / blocked / changes_requested signals;
- divergence between generated issue body and `IMPLEMENTATION_PLAN.md`;
- missing issues;
- duplicate issues;
- orphan issues;
- closed issues that still exist in the plan.

Recommended status outputs:

```txt
human-readable terminal report
optional JSON report for cockpit / handoff / audit

## 11. Job file requirements

Every job file should include:

```md
Task: T1.2
Issue: #<number or URL>
Base branch: sprint/S1-read-only-project-view
Job branch: job/T1.2-render-gate-honesty
Expected report: <report path>
Expected commit: one verified commit
Proof required:
- <command>
- <command>
```

The job file is the execution authority for the coder.

The GitHub Issue is tracking context, not execution authority.

## 12. Report file requirements

Every report file should include:

```md
Task: T1.2
Issue: #<number or URL>
Branch: job/T1.2-render-gate-honesty
Commit: <hash>
Status: ready_for_review | blocked | changes_requested | accepted

Proof:
- <command/output or pointer>

Files changed:
- <path>
- <path>

Notes:
- <short notes>

Risks:
- <known risk or none>
```

A report without proof is not ready for review.

## 13. Handoff requirements

Every handoff should include the active Git/Issue spine.

Minimum:

```md
Git / Issue state:
- Stable branch: main
- Active sprint branch: sprint/S1-read-only-project-view
- Active task: T1.2
- Issue: #<number or URL>
- Active job branch: job/T1.2-render-gate-honesty
- Last verified commit: <hash or none>
- Report: <report path>
- Merge status: pending | merged-to-sprint | blocked
- Push status: local-only | pushed
```

The next agent must know where the code state lives, not just where the project conversation stopped.

## 14. Worktree discipline

When using Git worktrees:

* one worktree per active branch;
* never share one worktree between two active agents;
* name worktree directories after the branch or task;
* check branch before editing;
* check `git status --short` before and after work;
* do not delete a worktree until its branch/report/commit status is known.

Before coding:

```bash
git branch --show-current
git status --short
```

If the branch is wrong or dirty unexpectedly, stop and report.

## 15. Job start checklist

Before a coder starts a job:

* [ ] Read the job file.
* [ ] Confirm task ID.
* [ ] Confirm issue number or URL if available.
* [ ] Confirm base sprint branch.
* [ ] Confirm job branch.
* [ ] Confirm working tree is clean or dirty only with expected files.
* [ ] Confirm proof commands.
* [ ] Confirm files that must not be touched.
* [ ] Do not rewrite the project plan.

If the job contradicts the repo state, stop and report to the CTO.

## 16. Job finish checklist

Before a coder finishes a job:

* [ ] Implementation stays inside job scope.
* [ ] Required tests/proof commands were run.
* [ ] Typecheck/build was run when required.
* [ ] Diff was inspected.
* [ ] `git status --short` was inspected.
* [ ] Report file was written.
* [ ] Commit was created only after proof.
* [ ] Report includes commit hash.
* [ ] Report includes changed files.
* [ ] Report includes proof.
* [ ] Job is ready for CTO review.

## 17. Sprint close checklist

Before a sprint branch is pushed or prepared for merge:

* [ ] All sprint jobs are accepted or explicitly deferred.
* [ ] Every accepted job has a report.
* [ ] Every accepted job has proof.
* [ ] Every accepted job has a commit.
* [ ] Accepted job branches are merged into the sprint branch.
* [ ] Sprint stop-check is VERIFIED.
* [ ] No declared-only gate is rendered as verified.
* [ ] `git status --short` is clean.
* [ ] `pnpm typecheck` is clean when applicable.
* [ ] `pnpm test` is green when applicable.
* [ ] `pnpm build` is green when applicable.
* [ ] Handoff is updated.
* [ ] Owner approves merge to `main`.

## 18. Failure rules

Stop and ask for owner/CTO review if:

* current branch is `main` and coding is requested;
* branch name does not match the job;
* working tree is unexpectedly dirty;
* proof command fails;
* report cannot be written;
* issue and task ID do not match;
* generated GitHub Issue body would overwrite human proof;
* a merge conflict appears;
* a secret appears in diff;
* the job requires scope expansion;
* the coder needs to change a locked decision.

## 19. Minimal rule

When in doubt, preserve reversibility.

```txt
Small branch.
Small diff.
Proof first.
Commit after proof.
Report before review.
Review before merge.
Owner before main.
```
