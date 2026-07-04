---
title: Job T1.1 — Reviewer — Scanner HTTP client (submit+poll)
description: Verify conformance of the tester+coder output for submitScan/pollScan before the CTO commits and closes the T1.1 gate.
type: job
status: current
job_ref: T1.1_scanner-client
last_update: 2026-07-02
---

# JOB T1.1_scanner-client — rôle: reviewer

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.1-scanner-client`.
Dépend de : `T1.1_scanner-client_coder` VERIFIED.

## Objectif

Vérifier la conformité avant que le CTO ne commit et ne clôture le gate.

## Skills à invoquer explicitement

`shokunin-review` (chasse `any`, duplication, sur-ingénierie — en
particulier : pas de moteur de retry générique réinventé, pas de
détournement de `http.ts`), `code-review` (bugs de correction).

## Checklist bloquante

- [ ] `packages/validator/src/client/scanner-client.test.ts` non modifié par
      le Coder (diff vérifié contre le commit du job tester).
- [ ] `@filemeta` présent/à jour sur `scanner-client.ts` (règle d'or : un
      `.ts` livré sans `@filemeta` = job incomplet).
- [ ] Aucun `any`.
- [ ] `channel: "cli"` toujours présent dans le corps de `submitScan`,
      jamais optionnel/omissible.
- [ ] Retry sur `429` : exactement 1x, respecte `Retry-After`, pas de
      backoff exponentiel multi-tentatives.
- [ ] `404`/`410`/`5xx` : échec propre immédiat, aucun retry.
- [ ] Budget de polling 90s respecté (test avec horloge factice, pas un vrai
      sleep de 90s dans la suite).
- [ ] Erreurs typées par code contractuel (`ScanRequestError`,
      `ScanNotFoundError`, `ScanExpiredError`, `ScanRateLimitError`,
      `ScanServerError`) — chacune porte le `message` du contrat tel quel,
      jamais de stack trace brute exposée.
- [ ] `result` validé via `validateScanResult` (T1.0) réutilisé, pas
      redupliqué ; mismatch de version majeure → erreur explicite ; champ
      additif mineur toléré.
- [ ] `meta.links.audit` n'est jamais construit ni modifié ici (hors scope —
      c'est T1.2_attribution-module).
- [ ] Aucune dépendance ajoutée hors `LIBS_REGISTRY.md`.
- [ ] Aucun fichier hors scope touché (`schemas.ts`, `http.ts`, `cli.ts`,
      `types.ts`, `validator.ts` intacts).
- [ ] Tous les 15 cas de test du job tester sont couverts et VERTS.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.1_scanner-client_reviewer_report.md`

## Handoff

Une fois VERIFIED → le CTO commit, met à jour
`.shokunin/dashboard/project-dashboard.json` (`tasks[T1.1]` →
`status: done`, `evidenceStatus: verified`) et débloque
`T1.2_attribution-module` / `T2.0_scan-orchestrator` selon disponibilité.
