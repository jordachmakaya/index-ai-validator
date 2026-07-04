---
title: Job T1.0 — Coder — Pin ScanResult schema
description: Vendor the ScanResult JSON Schema from CONTRACT_SCANNER.md and implement validateScanResult to make the tester's tests pass, without modifying them.
type: job
status: current
job_ref: T1.0_pin-scanner-schema
last_update: 2026-07-02
---

# JOB T1.0_pin-scanner-schema — rôle: coder

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.0-pin-scanner-schema-clean`.
Dépend de : `T1.0_pin-scanner-schema_tester` VERIFIED (tests rouges commités).

## Contexte (à lire avant tout)

- `.shokunin/brief/ARCHITECTURE.md` §3 (Contrat de données) et §9.
- `.shokunin/brief/decisions/ADR_001_scan-external-dependency.md`.
- `.shokunin/brief/decisions/ADR_002_async-polling-contract.md`.
- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §6 (interface TypeScript
  `ScanResult`) et §9 (fixtures).
- `packages/validator/src/schemas.test.ts` — les tests écrits par le job
  tester, à faire passer sans les modifier.

**Important** : le endpoint `GET /api/v1/schema/scan-result.json` peut ne pas
être disponible en production (contrat `1.0-draft`). Dériver le schéma JSON
manuellement de l'interface TypeScript `ScanResult` documentée dans
`CONTRACT_SCANNER.md §6` — aucun appel réseau live requis pour ce job.
Contraintes explicites à encoder dans le schéma : `dimensions` = exactement
5 entrées dans l'ordre fixe access/extractability/citability/safety/agent_layer ;
`findings[].severity` ∈ `P0`/`P1`/`P2` ; `score` entier 0-100 ;
`schemaVersion`/`engineVersion` requis ; champs additifs inconnus tolérés.

## Objectif

Faire passer les tests de `T1.0_pin-scanner-schema_tester`, sans les
modifier.

## Périmètre

- Allowed files:
  - `packages/validator/src/schemas/scan-result.schema.json` (nouveau —
    schéma JSON vendored, dérivé de `CONTRACT_SCANNER.md §6`)
  - `packages/validator/src/schemas.ts` (extension — ajouter
    `validateScanResult(payload: unknown): Result<ScanResult, SchemaError>`
    ou équivalent typé, cohérent avec le style déjà utilisé pour
    `index-ai.json`/`agent-index.json` dans ce même fichier)
- Forbidden files: **`packages/validator/src/schemas.test.ts` (NE PAS
  MODIFIER)**, et tout fichier hors de la liste ci-dessus — en particulier
  `checks/`, `validator.ts`, `cli.ts`, `types.ts` (Level 1/2a, hors scope,
  cf. `IMPLEMENTATION_PLAN.md` Q7).
- Libs autorisées : `ajv`, `ajv-formats` (déjà présentes,
  `LIBS_REGISTRY.md`) — **aucune nouvelle dépendance**. Si une dépendance
  semble nécessaire, arrêter et remonter au CTO avant d'installer quoi que
  ce soit.

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/RULE_PNPM.md`

## Skills à invoquer explicitement (obligatoire, pas au jugement)

- `engineering-rules` — zéro `any`, erreurs jamais avalées, validation aux
  frontières.
- `shokunin` — la plus petite implémentation correcte et durable, pas de
  sur-ingénierie (ex. ne pas construire un moteur de schéma générique, juste
  ce que ce contrat exige).
- `shokunin-filemeta` — **obligatoire** : ajouter/mettre à jour le bloc
  `@filemeta` en tête de `schemas.ts`.

## Règles strictes

- Commit: **INTERDIT** pour le Coder — le CTO commit après revue.
- Test files: **NE PAS MODIFIER** — si un test semble faux, arrêter et
  remonter au CTO (job de correction de test séparé, jamais une modif
  silencieuse).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- schemas`
- Proof required: coller la sortie Vitest montrant les 5 tests désormais
  VERTS, plus `pnpm --filter @hardmachinelabs/index-ai-validator check`
  (typecheck) sans erreur.
- Session-fit: yes (2 fichiers, extension ciblée d'un module existant).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.0_pin-scanner-schema_coder_report.md`

## Git verification (CTO, après ce job)

```bash
git status
```
Vérifier explicitement que `schemas.test.ts` n'apparaît PAS dans le diff.
Si modifié → job rejeté, retour au Tester/CTO.

## Handoff

Une fois VERIFIED → débloque `T1.0_pin-scanner-schema_reviewer`.
