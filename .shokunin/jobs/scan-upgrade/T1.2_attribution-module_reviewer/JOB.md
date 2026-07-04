---
title: Job T1.2 — Reviewer — Attribution module (audit link rewrite)
description: Verify conformance of the tester+coder output for rewriteAttributionSrc before the CTO commits and closes the T1.2 gate.
type: job
status: current
job_ref: T1.2_attribution-module
last_update: 2026-07-03
---

# JOB T1.2_attribution-module — rôle: reviewer

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.2-attribution-module`
(créée depuis `job/T1.1-scanner-client`). Merge prévu en fin de séance sur
`job/T1.1-scanner-client`, **pas sur `main`**.
Dépend de : `T1.2_attribution-module_coder` VERIFIED.

## Objectif

Vérifier la conformité avant que le CTO ne commit et ne clôture le gate.

## Skills à invoquer explicitement

`shokunin-review` (chasse `any`, duplication, sur-ingénierie — en
particulier : pas de lib de parsing d'URL réinventée/ajoutée, pas de
détournement de `utils/url.ts`), `code-review` (bugs de correction).

## Checklist bloquante

- [ ] `packages/validator/src/utils/attribution.test.ts` non modifié par le
      Coder (diff vérifié contre le commit du job tester).
- [ ] `@filemeta` présent/à jour sur `attribution.ts` (règle d'or : un `.ts`
      livré sans `@filemeta` = job incomplet).
- [ ] Aucun `any`.
- [ ] `rewriteAttributionSrc` remplace **uniquement** le paramètre `src` —
      `scanId` et tout autre paramètre de l'URL préservés à l'identique,
      protocole/host/path inchangés.
- [ ] Paramètre `src` de la fonction restreint aux valeurs réécrivables
      (`'cli-report' | 'cli-terminal'`), dérivé du type union large
      (`AttributionSrc` ou équivalent) sans duplication manuelle — passer
      `'cli-json'` doit échouer à la compilation (vérifier le
      `// @ts-expect-error` du test, pas juste sa présence : confirmer avec
      `pnpm check` qu'il est bien nécessaire, pas un `@ts-expect-error`
      orphelin qui masquerait une régression de typage).
- [ ] `auditUrl` malformé → erreur typée explicite, aucun résultat
      silencieusement incorrect, aucun fallback inventé. **Message
      dev-friendly** (décision humaine 2026-07-03) : inclut la valeur reçue
      fautive entre guillemets, explique ce qui ne va pas, exemple si
      pertinent — même niveau de qualité que `InvalidTargetUrlError` dans
      `utils/url.ts`, jamais un message générique ("Invalid input") ni une
      stack trace brute.
- [ ] Aucune URL d'audit construite à la main ailleurs dans ce module —
      toujours dérivée du `auditUrl` reçu en paramètre (jamais de
      recomposition manuelle de query string par concaténation).
- [ ] Aucune dépendance ajoutée hors `LIBS_REGISTRY.md` (URL/URLSearchParams
      natifs uniquement).
- [ ] Aucun fichier hors scope touché (`client/scanner-client.ts`,
      `utils/url.ts`, `utils/html-report.ts`, `cli.ts`, `types.ts` intacts).
- [ ] Tous les cas de test du job tester sont couverts et VERTS (nominal
      `cli-report`/`cli-terminal`, préservation `scanId`/reste de l'URL,
      URL malformée, contrainte de type niveau compilation).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.2_attribution-module_reviewer_report.md`

## Handoff

Une fois VERIFIED → le CTO commit, met à jour
`.shokunin/dashboard/project-dashboard.json` (`tasks[T1.2]` →
`status: done`, `evidenceStatus: verified`) et débloque
`T2.0_scan-orchestrator` (si T1.1 déjà VERIFIED — c'est le cas) et
`T3.1_scan-html-report` (dépend aussi de `T3.0_html-brand-tokens`, non
démarré).
