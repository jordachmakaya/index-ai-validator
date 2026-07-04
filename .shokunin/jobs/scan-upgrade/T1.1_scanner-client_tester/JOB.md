---
title: Job T1.1 — Tester — Scanner HTTP client (submit+poll)
description: Write failing tests (TDD) for submitScan/pollScan against the async submit+poll cycle, retry-on-429, typed SCAN-NNN errors, and budget timeout, before any implementation exists.
type: job
status: current
job_ref: T1.1_scanner-client
last_update: 2026-07-02
---

# JOB T1.1_scanner-client — rôle: tester

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.1-scanner-client`
(à créer depuis `job/T1.0-pin-scanner-schema-clean`, commit `8741a5a` — T1.0
n'est pas encore mergé sur `main`, T1.1 dépend directement de son code).
Dépend de : `T1.0_pin-scanner-schema` VERIFIED (fournit `validateScanResult`,
`ScanResult`, `ScanResultSchemaValidationResult` dans `schemas.ts`).

## Contexte (à lire avant tout)

- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §2 (cycle async), §3 (POST
  /api/v1/scan), §4 (GET /api/v1/scan/{scanId}), §7 (schéma Error/codes
  SCAN-NNN), §8 (rate limits), §9 (fixtures JSON réelles — 202, done, failed).
- `.shokunin/brief/decisions/ADR_002_async-polling-contract.md` — pourquoi
  submit+poll et pas un endpoint synchrone.
- `.shokunin/planning/IMPLEMENTATION_PLAN.md` section `### T1.1_scanner-client`
  (Grep uniquement cette section, le fichier couvre T1-T6).
- `packages/validator/src/http.ts` + `http.test.ts` — **à lire pour le style
  de test (mock serveur `node:http` local), pas pour réutiliser le code** :
  `fetchTextWithPolicy` résout un problème différent (GET texte sur une cible
  arbitraire avec garde SSRF) — le client scanner fait du JSON POST/GET vers
  un hôte fixe et de confiance (`INDEX_AI_SCANNER_URL`), avec retry
  contractuel. `.shokunin/planning/LIBS_REGISTRY.md` a déjà acté : `fetch`
  natif, retry hand-rolled, pas de nouvelle lib.
- `packages/validator/src/schemas.ts` — signature exacte de
  `validateScanResult(payload: unknown): ScanResultSchemaValidationResult`
  à utiliser pour valider `result` quand `status: "done"`.

**Important** : ce job ne fait **aucun appel réseau live** contre
`agent-view.com`. Tout est testé contre un serveur `node:http` local éphémère
(même pattern que `http.test.ts`).

## Objectif

Écrire les tests de `submitScan` et `pollScan` AVANT l'implémentation (TDD).
Les tests doivent échouer tant que le job Coder n'est pas fait.

## Périmètre

- Allowed files:
  - `packages/validator/src/client/scanner-client.test.ts` (nouveau)
- Forbidden files: tout fichier de production (`client/scanner-client.ts` et
  tout fichier sous `client/`).
- Libs autorisées : celles déjà dans `LIBS_REGISTRY.md` (`vitest`,
  `node:http` du runtime pour le serveur mock) — aucune nouvelle dépendance.

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/TEST_PATTERNS.md`
- `.shokunin/rules/RULE_Vitest.md`

## Skills à invoquer explicitement

`test-patterns` — comportement d'abord : teste ce que `submitScan`/`pollScan`
garantissent à l'appelant (résultat typé, erreurs typées, respect du budget),
pas les détails internes de `fetch`.

## Cas de test requis (minimum)

Cycle nominal :
1. `submitScan(url)` → `202` avec fixture `ScanStatus` (`status: "queued"`,
   cf. `CONTRACT_SCANNER.md §9`) → résolu avec le `ScanStatus` typé.
2. `submitScan(url)` → `200` (cache, même forme que 202) → traité de façon
   identique au `202` (lire `scanId`/`status`, pas de traitement spécial).
3. Le corps envoyé par `submitScan` contient bien `{ url, channel: "cli" }`
   — vérifier que `channel` est **toujours** présent (assertion sur la
   requête reçue par le mock serveur).
4. `pollScan(scanId)` → séquence `running` (avec `progress.currentStep`) puis
   `done` (avec `result`) → callback/valeur de progression exposée à chaque
   itération, arrêt immédiat sur `done`.
5. `pollScan(scanId)` → `failed` avec `failureReason: "SCAN-002"` → arrêt
   immédiat, pas de poll supplémentaire après un état terminal.

Erreurs contractuelles :
6. `submitScan` → `400` avec `{ code: "SCAN-001", message }` → rejette avec
   une erreur typée `ScanRequestError` portant le `message` du contrat tel
   quel (jamais de stack trace).
7. `submitScan`/`pollScan` → `429` avec header `Retry-After` → **1 retry
   maximum** respectant le délai indiqué, puis succès si le retry aboutit.
8. `429` → retry épuisé (deuxième `429`) → échec propre avec
   `ScanRateLimitError`, pas de boucle infinie, pas de backoff exponentiel
   multi-tentatives.
9. `pollScan` → `404` → `ScanNotFoundError` immédiat (pas de retry).
10. `pollScan` → `410` → `ScanExpiredError` immédiat, message suggérant un
    re-scan.
11. `pollScan` → `500` → `ScanServerError` immédiat.
12. Budget de polling dépassé (mock qui reste `running` au-delà de 90s
    simulés — utiliser les horloges factices Vitest, pas un vrai sleep) →
    abandon avec message clair (« scan timed out — server-side budget is
    90s »), jamais une boucle infinie.
13. `pollScan` → `done` avec `result` valide → validé via
    `validateScanResult` (T1.0), résultat typé `ScanResult` exposé tel quel.
14. `pollScan` → `done` avec `result` incompatible (version majeure de
    schéma différente) → erreur explicite distincte des erreurs réseau,
    jamais un parsing partiel silencieux.
15. `pollScan` → `done` avec `result` portant un champ additif inconnu (ex.
    `newField: true`) → toléré, pas d'erreur (lecture tolérante, cf.
    `CONTRACT_SCANNER.md §6 règle 4`).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- scanner-client`
- Proof required: coller la sortie Vitest montrant les nouveaux tests en
  échec (rouge — normal, l'implémentation n'existe pas encore).
- Session-fit: yes.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.1_scanner-client_tester_report.md`

## Git verification (CTO, après ce job)

```bash
git checkout -b job/T1.1-scanner-client job/T1.0-pin-scanner-schema-clean
git status
git add packages/validator/src/client/scanner-client.test.ts
git commit -m "test: add T1.1_scanner-client coverage"
```

## Handoff

Une fois VERIFIED (tests rouges commités) → débloque
`T1.1_scanner-client_coder`.
