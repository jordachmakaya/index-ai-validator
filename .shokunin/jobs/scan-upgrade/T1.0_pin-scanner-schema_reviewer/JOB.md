---
title: Job T1.0 — Reviewer — Pin ScanResult schema
description: Verify conformance of the tester+coder output for validateScanResult before the CTO commits and closes the T1.0 gate.
type: job
status: current
job_ref: T1.0_pin-scanner-schema
last_update: 2026-07-02
---

# JOB T1.0_pin-scanner-schema — rôle: reviewer

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.0-pin-scanner-schema-clean`.
Dépend de : `T1.0_pin-scanner-schema_coder` VERIFIED.

## Objectif

Vérifier la conformité avant que le CTO ne commit et ne clôture le gate.

## Skills à invoquer explicitement

`shokunin-review` (chasse `any`, duplication, sur-ingénierie), `code-review`
(bugs de correction).

## Checklist bloquante

- [ ] `packages/validator/src/schemas.test.ts` non modifié par le Coder
      (diff vérifié contre le commit du job tester).
- [ ] `@filemeta` présent/à jour sur `schemas.ts` (règle d'or : un `.ts`
      livré sans `@filemeta` = job incomplet).
- [ ] Aucun `any`.
- [ ] Les 5 cas de test (valide, champ manquant, dimensions incorrectes,
      champ additif toléré, version incompatible) sont bien couverts et
      VERTS.
- [ ] Aucune dépendance ajoutée hors `LIBS_REGISTRY.md`.
- [ ] Aucun fichier hors scope touché (`checks/`, `validator.ts`, `cli.ts`,
      `types.ts` intacts).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.0_pin-scanner-schema_reviewer_report.md`

## Handoff

Une fois VERIFIED → le CTO commit, met à jour
`.shokunin/dashboard/project-dashboard.json` (`tasks[T1.0]` → `status: done`,
`evidenceStatus: verified`) et débloque `T1.1_scanner-client` (dépend de la
fonction `validateScanResult` produite ici).
