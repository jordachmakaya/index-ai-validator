---
title: Job T1.0 — Tester — Pin ScanResult schema
description: Write failing tests (TDD) for validateScanResult against valid/invalid/tolerant ScanResult payloads, before any implementation exists.
type: job
status: current
job_ref: T1.0_pin-scanner-schema
last_update: 2026-07-02
---

# JOB T1.0_pin-scanner-schema — rôle: tester

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.0-pin-scanner-schema-clean`
(recréée après incident de sécurité — l'ancienne branche `job/T1.0-pin-scanner-schema`
avait `.shokunin/` tracké et a été poussée par erreur ; branche distante supprimée,
travail récupéré sur un commit unique `8741a5a`). Dépend de : rien — première tâche
du sprint.

## Contexte (à lire avant tout)

- `.shokunin/brief/ARCHITECTURE.md` §3 (Contrat de données) et §9.
- `.shokunin/brief/decisions/ADR_001_scan-external-dependency.md` — pourquoi le
  schéma est pinné/vendored, jamais fetché dynamiquement.
- `.shokunin/brief/decisions/ADR_002_async-polling-contract.md` — le contrat
  réel (`ScanStatus` enveloppe, `ScanResult` le payload utile).
- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §6 (interface TypeScript
  `ScanResult`) et §9 (fixtures JSON réelles — cas `done` et `failed`).

**Important** : le endpoint `GET /api/v1/schema/scan-result.json` peut ne pas
être disponible en production (le contrat est marqué `1.0-draft` au
2026-07-02). Ce job ne fait **aucun appel réseau live**.

## Objectif

Écrire les tests de `validateScanResult` AVANT l'implémentation (TDD). Les
tests doivent échouer tant que le job Coder n'est pas fait.

## Périmètre

- Allowed files:
  - `packages/validator/src/schemas.test.ts` (extension — ajouter les
    nouveaux cas, ne pas toucher aux tests existants de `validate`)
- Forbidden files: tout fichier de production (`schemas.ts`, tout fichier
  sous `packages/validator/src/schemas/`).
- Libs autorisées : celles déjà dans `LIBS_REGISTRY.md` (`vitest`, `ajv`,
  `ajv-formats` — aucune nouvelle dépendance pour ce job).

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/TEST_PATTERNS.md`
- `.shokunin/rules/RULE_Vitest.md`

## Skills à invoquer explicitement

`test-patterns` — comportement d'abord : teste ce que `validateScanResult`
doit garantir à l'appelant, pas les détails internes d'AJV.

## Cas de test requis (minimum)

1. Payload `ScanResult` valide (utiliser la fixture `done` de
   `CONTRACT_SCANNER.md §9`, section `result`) → succès, pas d'erreur.
2. Payload avec un champ requis manquant (ex. `score` absent) → erreur
   explicite retournée, jamais une exception non gérée.
3. Payload avec `dimensions` ne contenant pas exactement les 5 clés
   attendues → erreur explicite.
4. Payload avec un champ additif inconnu (ex. `newField: true` non prévu
   par le schéma) → **toléré, pas d'erreur** (lecture tolérante, cf.
   `CONTRACT_SCANNER.md §6 règle 4`).
5. Mismatch de `schemaVersion` majeure (ex. `"2.0"` reçu, schéma vendored
   `"1.0"` attendu) → erreur explicite et distincte des erreurs de champ
   manquant (message doit permettre de distinguer les deux causes).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- schemas`
- Proof required: coller la sortie Vitest montrant les 5 nouveaux tests en
  échec (rouge — normal, l'implémentation n'existe pas encore).
- Session-fit: yes.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.0_pin-scanner-schema_tester_report.md`

## Git verification (CTO, après ce job)

```bash
git status
git add packages/validator/src/schemas.test.ts
git commit -m "test: add T1.0_pin-scanner-schema coverage"
```

## Handoff

Une fois VERIFIED (tests rouges commités) → débloque
`T1.0_pin-scanner-schema_coder`.
