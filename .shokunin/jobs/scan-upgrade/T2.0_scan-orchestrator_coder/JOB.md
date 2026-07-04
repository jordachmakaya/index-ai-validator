---
title: Job T2.0 — Coder — Scan orchestrator
description: Implement scanUrl against the CTO-specified ScanOutcome/ScanFailedError design to make the tester's tests pass, without modifying them.
type: job
status: current
job_ref: T2.0_scan-orchestrator
last_update: 2026-07-03
---

# JOB T2.0_scan-orchestrator — rôle: coder

Sprint: T2. JobName: `scan-upgrade`. Branche : `job/T2.0-scan-orchestrator`.
Dépend de : `T2.0_scan-orchestrator_tester` VERIFIED (tests rouges commités).

## Contexte (à lire avant tout)

- `packages/validator/src/scan.test.ts` — les tests écrits par le job
  tester, à faire passer sans les modifier. Lis-le en premier : il fixe la
  surface exacte (`ScanOutcome`, `ScanFailedError`, `ScanOptions`,
  `scanUrl`).
- `.shokunin/jobs/scan-upgrade/T2.0_scan-orchestrator_tester/JOB.md`
  §"Design imposé par le CTO" — le contrat précis de `scanUrl` (ne pas
  réinterpréter, ne pas simplifier différemment).
- `packages/validator/src/client/scanner-client.ts` — `submitScan`,
  `pollScan`, type `ScanStatus`, type `ScanProgressStep`. Ne redéclare
  jamais ces types/erreurs, importe-les.
- `packages/validator/src/utils/attribution.ts` — `rewriteAttributionSrc`.
- `packages/validator/src/validator.ts` — style de référence (fonction
  publique async, agrégation de sous-appels, pas de classe).
- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §6 règle 2 : la sortie
  `--json` = le `ScanStatus` intégral tel reçu — `status` dans
  `ScanOutcome` ne doit **jamais** être muté (ni `meta.links.audit`, ni
  aucun autre champ).

## Objectif

Faire passer les tests de `T2.0_scan-orchestrator_tester`, sans les
modifier.

## Périmètre

- Allowed files:
  - `packages/validator/src/scan.ts` (nouveau)
  - `packages/validator/src/types.ts` (extension — ajouter uniquement
    `ScanOptions`, ne pas toucher aux types existants de `validate`)
- Forbidden files: **`packages/validator/src/scan.test.ts` (NE PAS
  MODIFIER)**, et tout fichier hors de la liste ci-dessus — en particulier
  `client/scanner-client.ts`, `utils/attribution.ts`, `schemas.ts`, `cli.ts`
  (hors scope, T2.1), `utils/html-report.ts`, `validator.ts`.
- Libs autorisées : aucune nouvelle.

## Tasks

- `ScanOptions` dans `types.ts` : `{ target: string; baseUrl?: string;
  timeoutMs?: number; intervalMs?: number; budgetMs?: number; onProgress?:
  (progress: { currentStep: ScanProgressStep }) => void }` — importe
  `ScanProgressStep` depuis `./client/scanner-client`, ne le redéclare pas.
- `scan.ts` exporte :
  - `type ScanOutcome = { status: ScanStatus; auditLinks: { html: string;
    terminal: string } }`
  - `class ScanFailedError extends Error` — `readonly code: string`,
    message dev-friendly citant le `code` (exigence produit permanente
    2026-07-03 : jamais de message générique, même niveau que
    `InvalidTargetUrlError`/`InvalidAuditUrlError`).
  - `async function scanUrl(options: ScanOptions): Promise<ScanOutcome>` :
    1. Appelle `submitScan(options.target, { baseUrl: options.baseUrl,
       timeoutMs: options.timeoutMs })`.
    2. Si le résultat est déjà terminal (`done` ou `failed`), **ne pas**
       appeler `pollScan`.
    3. Sinon, appelle `pollScan(result.scanId, { baseUrl: options.baseUrl,
       timeoutMs: options.timeoutMs, intervalMs: options.intervalMs,
       budgetMs: options.budgetMs, onProgress: options.onProgress })`, qui
       boucle en interne jusqu'à un état terminal ou lève
       `ScanTimeoutError` (laisser traverser, ne pas catcher).
    4. État terminal `failed` → lève `ScanFailedError` (jamais de retour
       `ScanOutcome` qui prétendrait un succès).
    5. État terminal `done` → retourne `{ status, auditLinks: { html:
       rewriteAttributionSrc(status.meta.links.audit, 'cli-report'),
       terminal: rewriteAttributionSrc(status.meta.links.audit,
       'cli-terminal') } }` — `status` non modifié.
  - Aucune interception des erreurs typées de `submitScan`/`pollScan`
    (transport/HTTP) : elles doivent traverser `scanUrl` sans `try/catch`
    qui les avale ou les remplace.

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/RULE_PNPM.md`

## Skills à invoquer explicitement (obligatoire, pas au jugement)

- `engineering-rules` — zéro `any`, pas d'erreur avalée, validation aux
  frontières déjà déléguée à `submitScan`/`pollScan`/`validateScanResult`
  (ne pas redupliquer).
- `shokunin` — la plus petite implémentation correcte : une seule fonction
  publique, pas de classe d'orchestration, pas d'abstraction au-delà de ce
  que le design du tester exige.
- `shokunin-filemeta` — **obligatoire** : ajouter le bloc `@filemeta` en
  tête de `scan.ts` (nouveau fichier significatif). `types.ts` existant
  n'a pas de bloc `@filemeta` préexistant — ne pas en ajouter un si le
  fichier n'en avait pas (cohérence avec l'existant, ne pas improviser une
  convention absente).

## Règles strictes

- Commit: **INTERDIT** pour le Coder — le CTO commit après revue.
- Test files: **NE PAS MODIFIER** — si un test semble faux, arrêter et
  remonter au CTO (job de correction de test séparé, jamais une modif
  silencieuse).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- scan.test`
- Proof required: coller la sortie Vitest montrant tous les tests désormais
  VERTS, plus `pnpm --filter @hardmachinelabs/index-ai-validator check`
  (typecheck) sans erreur.
- Session-fit: yes (2 fichiers, un nouveau + une extension minime).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T2.0_scan-orchestrator_coder_report.md`

## Git verification (CTO, après ce job)

```bash
git status
```
Vérifier explicitement que `scan.test.ts` n'apparaît PAS dans le diff. Si
modifié → job rejeté, retour au Tester/CTO.

## Handoff

Une fois VERIFIED → débloque `T2.0_scan-orchestrator_reviewer`.
