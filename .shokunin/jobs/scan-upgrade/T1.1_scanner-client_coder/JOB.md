---
title: Job T1.1 — Coder — Scanner HTTP client (submit+poll)
description: Implement submitScan/pollScan against CONTRACT_SCANNER.md to make the tester's tests pass, without modifying them.
type: job
status: current
job_ref: T1.1_scanner-client
last_update: 2026-07-02
---

# JOB T1.1_scanner-client — rôle: coder

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.1-scanner-client`.
Dépend de : `T1.1_scanner-client_tester` VERIFIED (tests rouges commités).

## Contexte (à lire avant tout)

- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §2-§9 (contrat complet :
  cycle async, requêtes/réponses, schéma `ScanStatus`/`ScanResult`/`Error`,
  codes `SCAN-NNN`, rate limits).
- `.shokunin/brief/decisions/ADR_002_async-polling-contract.md`.
- `.shokunin/planning/LIBS_REGISTRY.md` — décision actée : `fetch` natif
  (Node ≥20), retry hand-rolled (pas de lib de resilience), validation via
  `ajv` déjà présent dans `schemas.ts`. **Aucune nouvelle dépendance.**
- `packages/validator/src/schemas.ts` — réutiliser
  `validateScanResult(payload: unknown): ScanResultSchemaValidationResult`
  et le type `ScanResult` déjà exportés (T1.0). Ne pas revalider le schéma
  autrement.
- `packages/validator/src/constants.ts` — `DEFAULT_TIMEOUT_MS` (10_000)
  existe déjà, cohérent avec le timeout 10s par requête recommandé par le
  contrat §1.
- `packages/validator/src/client/scanner-client.test.ts` — les tests écrits
  par le job tester, à faire passer sans les modifier.

**Important** : `packages/validator/src/http.ts` (`fetchTextWithPolicy`)
résout un problème différent (GET texte, cible arbitraire, garde SSRF) — ne
pas l'étendre ni le détourner pour ce client. Écrire un client JSON minimal
dédié dans `client/scanner-client.ts`, cohérent en style avec `http.ts`
(gestion d'erreur par code, pas d'exception qui fuit) mais sans dépendance
entre les deux fichiers.

## Objectif

Faire passer les tests de `T1.1_scanner-client_tester`, sans les modifier.

## Périmètre

- Allowed files:
  - `packages/validator/src/client/scanner-client.ts` (nouveau)
- Forbidden files: **`packages/validator/src/client/scanner-client.test.ts`
  (NE PAS MODIFIER)**, et tout fichier hors de la liste ci-dessus — en
  particulier `schemas.ts` (T1.0, verrouillé), `http.ts`, `cli.ts`,
  `types.ts`, `validator.ts` (hors scope, T2.0+ pour l'intégration).
- Libs autorisées : aucune nouvelle. `fetch`/`AbortController`/`setTimeout`
  natifs Node uniquement.

## Tasks (dérivées de `IMPLEMENTATION_PLAN.md` §T1.1)

- `submitScan(url, options): Promise<ScanStatus>` — `POST /api/v1/scan`,
  corps `{ url, channel: "cli" }` (`channel` **toujours** présent, jamais
  optionnel), timeout 10s, traite `202` et `200` (cache) de façon identique.
- `pollScan(scanId, options): Promise<ScanStatus>` — `GET
  /api/v1/scan/{scanId}` toutes les 2s (± jitter), **budget total 90s** puis
  abandon avec erreur claire (« scan timed out — server-side budget is
  90s ») ; s'arrête dès `done`/`failed` (états terminaux) ; expose
  `progress.currentStep` à l'appelant à chaque itération.
- **Retry 1x maximum sur `429`** respectant `Retry-After` (pas de backoff
  exponentiel multi-tentatives) ; sur `404`/`410`/`5xx` : échec propre
  immédiat, pas de retry.
- Erreurs typées par code contractuel : `ScanRequestError` (`SCAN-001/002/003`),
  `ScanNotFoundError` (`SCAN-404`), `ScanExpiredError` (`SCAN-410`, message
  suggérant un re-scan), `ScanRateLimitError` (`SCAN-429`), `ScanServerError`
  (`SCAN-500`) — chacune porte le `message` du contrat tel quel (déjà
  factuel/anglais, affichable directement), jamais une stack trace brute.
- Validation du `result` (si `done`) via `validateScanResult` (T1.0) —
  mismatch de version majeure → erreur explicite distincte des erreurs
  réseau/contrat, jamais de parsing partiel silencieux ; champs additifs
  mineurs tolérés (délégué à `validateScanResult`, ne pas dupliquer la
  logique de tolérance).
- Base URL configurable via `INDEX_AI_SCANNER_URL` (env, défaut
  `https://agent-view.com`).
- `channel: "cli"` est une constante fixe dans `submitScan`, jamais un
  paramètre optionnel exposé à l'appelant.

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/RULE_PNPM.md`

## Skills à invoquer explicitement (obligatoire, pas au jugement)

- `engineering-rules` — zéro `any`, erreurs jamais avalées, validation aux
  frontières (réponses HTTP jamais consommées sans vérifier `status`/forme).
- `shokunin` — la plus petite implémentation correcte et durable. Pas de
  moteur de retry générique, pas d'abstraction HTTP au-delà de ce que ce
  contrat exige (1 seul call-site externe).
- `api-resilience` — timeout par requête (10s), retry borné (1x, respecte
  `Retry-After`), pas de fallback qui invente des données, erreurs typées et
  jamais de stack trace exposée à l'utilisateur final.
- `shokunin-filemeta` — **obligatoire** : ajouter le bloc `@filemeta` en tête
  de `scanner-client.ts` (nouveau fichier significatif).

## Règles strictes

- Commit: **INTERDIT** pour le Coder — le CTO commit après revue.
- Test files: **NE PAS MODIFIER** — si un test semble faux, arrêter et
  remonter au CTO (job de correction de test séparé, jamais une modif
  silencieuse).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- scanner-client`
- Proof required: coller la sortie Vitest montrant tous les tests désormais
  VERTS, plus `pnpm --filter @hardmachinelabs/index-ai-validator check`
  (typecheck) sans erreur.
- Session-fit: yes (1 fichier nouveau, borderline si les cas d'erreur
  poussent le fichier trop loin — cf. plan : séparer les erreurs typées dans
  un second fichier si besoin, à valider avec le CTO avant de le faire).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.1_scanner-client_coder_report.md`

## Git verification (CTO, après ce job)

```bash
git status
```
Vérifier explicitement que `scanner-client.test.ts` n'apparaît PAS dans le
diff. Si modifié → job rejeté, retour au Tester/CTO.

## Handoff

Une fois VERIFIED → débloque `T1.1_scanner-client_reviewer`.
