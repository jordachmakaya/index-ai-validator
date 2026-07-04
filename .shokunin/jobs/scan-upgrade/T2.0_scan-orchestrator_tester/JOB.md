---
title: Job T2.0 — Tester — Scan orchestrator
description: Write failing tests (TDD) for scanUrl, which drives submitScan/pollScan (T1.1) through to a terminal state, attaches rewritten attribution links on success, and fails typed on a business-level "failed" status.
type: job
status: current
job_ref: T2.0_scan-orchestrator
last_update: 2026-07-03
---

# JOB T2.0_scan-orchestrator — rôle: tester

Sprint: T2. JobName: `scan-upgrade`. Branche : `job/T2.0-scan-orchestrator`
(créée depuis `job/T1.2-attribution-module` — dernière branche à jour de la
lignée post-incident, correctif `.gitignore` hérité. Toute la lignée
`T1.0→T1.1→T1.2→T2.0` se mergera sur `job/T1.1-scanner-client` en fin de
séance, **jamais sur `main`** — décision humaine explicite 2026-07-03).
Dépend de : `T1.1_scanner-client` VERIFIED et `T1.2_attribution-module`
VERIFIED (tous deux clos ce jour).

## Contexte (à lire avant tout)

- `.shokunin/planning/IMPLEMENTATION_PLAN.md` section `### T2.0_scan-orchestrator`
  (Grep uniquement cette section, le fichier couvre T1-T6).
- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §2 (cycle async — `queued`→
  `running`→`done`/`failed`, terminaux), §5 (`failureReason` = code `SCAN-NNN`
  si `failed`), §6 règle 2 (**la sortie `--json` = le `ScanStatus` intégral,
  tel reçu, aucun enrichissement, aucun champ ajouté** — cette règle motive
  le design ci-dessous : l'attribution ne modifie JAMAIS `status.meta.links.audit`).
- `.shokunin/brief/outbound/cli/CLI_UPGRADE_SPEC.md` §2.1 : la commande
  `scan` renvoie le payload scanner "tel quel (pass-through)" — aucune
  validation d'URL côté CLI avant l'appel réseau, le scanner gère lui-même
  le SSRF (`SCAN-002`).
- `packages/validator/src/client/scanner-client.ts` — `submitScan(url,
  options)`/`pollScan(scanId, options)` (T1.1, VERIFIED) : `submitScan` peut
  déjà renvoyer un état **terminal** (`done` en cache, ou `failed`) sans
  passer par poll ; `pollScan` boucle jusqu'à `done`/`failed` ou lève
  `ScanTimeoutError` au budget dépassé. Types déjà exportés :
  `ScanStatus`, `ScanProgressStep`. Erreurs déjà exportées (transport/HTTP) :
  `ScanRequestError`, `ScanNotFoundError`, `ScanExpiredError`,
  `ScanRateLimitError`, `ScanServerError`, `ScanTimeoutError`,
  `ScanResultSchemaError`, `ScanResponseShapeError` — **ce module ne les
  redéclare jamais, il les laisse simplement traverser**.
- `packages/validator/src/utils/attribution.ts` — `rewriteAttributionSrc(auditUrl,
  src: 'cli-report' | 'cli-terminal')` (T1.2, VERIFIED).
- `packages/validator/src/validator.ts` — style de référence pour un
  orchestrateur existant (`validateIndexAi`) : une fonction publique async,
  agrégation de sous-appels, pas de classe, pas d'état partagé.

## Design imposé par le CTO (ambiguïté du plan résolue ici, ne pas improviser)

Le plan de sprint dit "attache l'attribution... le JSON garde `src=cli-json`
tel quel" — cela signifie que `scanUrl` **ne peut pas** se contenter de
renvoyer le `ScanStatus` brut si l'appelant a aussi besoin des liens
réécrits : ce serait soit muter `meta.links.audit` (interdit, contrat §6
règle 2), soit forcer l'appelant (T2.1/T3.1) à rappeler
`rewriteAttributionSrc` lui-même (duplication d'intention). Le contrat de
`scanUrl` est donc :

```ts
export type ScanOutcome = {
  status: ScanStatus                              // brut, jamais muté — c'est CE qui est imprimé par --json
  auditLinks: { html: string; terminal: string }   // dérivés via rewriteAttributionSrc, jamais construits à la main
}

export class ScanFailedError extends Error {
  readonly code: string   // le failureReason du contrat (ex. "SCAN-002")
  constructor(message: string, code: string)
}

export async function scanUrl(options: ScanOptions): Promise<ScanOutcome>
```

Comportement :
- `submitScan` peut déjà renvoyer un état terminal (`done` en cache, ou
  `failed`) — dans ce cas, **ne pas appeler `pollScan`** (éviter un poll
  inutile).
- Si l'état terminal est `queued`/`running` (non terminal), appeler
  `pollScan(scanId, …)` qui boucle en interne jusqu'à un état terminal ou
  lève `ScanTimeoutError`.
- État terminal `done` → résoudre avec `{ status, auditLinks }`,
  `auditLinks.html = rewriteAttributionSrc(status.meta.links.audit,
  'cli-report')`, `auditLinks.terminal = rewriteAttributionSrc(status.meta.links.audit,
  'cli-terminal')`. `status` n'est jamais modifié.
- État terminal `failed` → **rejette** avec `new ScanFailedError(message,
  status.failureReason ?? 'SCAN-UNKNOWN')`, jamais un objet `ScanOutcome`
  qui prétendrait avoir réussi. Message dev-friendly (règle produit
  permanente 2026-07-03, voir `InvalidTargetUrlError`/`InvalidAuditUrlError`
  comme référence de qualité) : cite le `code`, explique que le scan a
  échoué côté serveur, suggère de consulter le registre `SCAN-NNN` ou de
  relancer un scan.
- Toute erreur typée levée par `submitScan`/`pollScan` (transport/HTTP —
  `ScanRequestError`, `ScanTimeoutError`, etc.) **traverse `scanUrl` sans
  être interceptée ni remplacée** — pas de `try/catch` qui avale ou
  transforme ces erreurs.
- `options.onProgress` (si fourni) est transmis tel quel à `pollScan` —
  aucune transformation, aucun throttling ajouté.
- `ScanOptions` (nouveau type, `types.ts`) : `{ target: string; baseUrl?:
  string; timeoutMs?: number; intervalMs?: number; budgetMs?: number;
  onProgress?: (progress: { currentStep: ScanProgressStep }) => void }`.
  `target` est transmis tel quel à `submitScan` (pas de normalisation
  d'URL côté CLI, cf. `CLI_UPGRADE_SPEC.md` §2.1).

## Objectif

Écrire les tests de `scanUrl` AVANT l'implémentation (TDD). Les tests
doivent échouer tant que le job Coder n'est pas fait.

## Périmètre

- Allowed files:
  - `packages/validator/src/scan.test.ts` (nouveau)
- Forbidden files: tout fichier de production (`scan.ts`, `types.ts`,
  `client/scanner-client.ts`, `utils/attribution.ts`).
- Libs autorisées : celles déjà dans `LIBS_REGISTRY.md` (`vitest`) — mock du
  module `client/scanner-client` via `vi.mock`, aucune nouvelle dépendance.
  **Ce job ne monte aucun serveur HTTP mock** (déjà couvert par T1.1) — il
  teste `scanUrl` en isolation avec `submitScan`/`pollScan` mockés, c'est le
  bon niveau (`test-patterns` : tester ce que `scanUrl` garantit à
  l'appelant, pas retester le transport HTTP déjà couvert par T1.1).

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/TEST_PATTERNS.md`
- `.shokunin/rules/RULE_Vitest.md`

## Skills à invoquer explicitement

`test-patterns` — comportement d'abord : teste ce que `scanUrl` garantit
(résultat structuré, attribution correcte, échec typé), pas les détails
internes de `submitScan`/`pollScan` (déjà testés en T1.1).

## Cas de test requis (minimum)

1. `submitScan` renvoie `queued` → `scanUrl` appelle `pollScan(scanId, …)` ;
   `pollScan` résout `done` (fixture `CONTRACT_SCANNER.md §9`, `meta.links.audit`
   avec `src=cli-json`) → `scanUrl` résout `{ status, auditLinks }` :
   `status` strictement égal à ce que `pollScan` a renvoyé (même
   `meta.links.audit`, `src=cli-json` intact), `auditLinks.html` contient
   `src=cli-report`, `auditLinks.terminal` contient `src=cli-terminal`,
   `scanId` préservé dans les deux.
2. `submitScan` renvoie directement `done` (cache, 200) → `pollScan` n'est
   **jamais appelé** (assertion sur le mock : 0 appel) → même structure de
   résolution que le cas 1.
3. `submitScan` renvoie `queued` → `pollScan` résout `failed` avec
   `failureReason: "SCAN-002"` → `scanUrl` **rejette** avec
   `ScanFailedError`, `error.code === "SCAN-002"`, message contient le code
   et n'est pas un message générique.
4. `submitScan` renvoie directement `failed` (cache d'un échec précédent) →
   `pollScan` **jamais appelé** → même rejet `ScanFailedError` que le cas 3.
5. `submitScan` rejette avec `ScanRequestError` (erreur HTTP transport,
   ex. `400 SCAN-001`) → `scanUrl` rejette avec **exactement la même
   instance/type d'erreur**, non catchée ni transformée.
6. `pollScan` rejette avec `ScanTimeoutError` (budget dépassé) → `scanUrl`
   rejette avec la même erreur, non catchée ni transformée.
7. `options.onProgress` fourni → transmis tel quel à `pollScan` (le mock de
   `pollScan` reçoit `options.onProgress` en argument, identité de fonction
   préservée, pas de wrapper).
8. `options.baseUrl`/`timeoutMs`/`intervalMs`/`budgetMs` fournis → transmis
   tel quels aux appels `submitScan`/`pollScan` mockés (assertions sur les
   arguments reçus par les mocks).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- scan.test`
- Proof required: coller la sortie Vitest montrant les nouveaux tests en
  échec (rouge — normal, l'implémentation n'existe pas encore).
- Session-fit: yes.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T2.0_scan-orchestrator_tester_report.md`

## Git verification (CTO, après ce job)

```bash
git checkout -b job/T2.0-scan-orchestrator job/T1.2-attribution-module
git status
git add packages/validator/src/scan.test.ts
git commit -m "test: add T2.0_scan-orchestrator coverage"
```

## Handoff

Une fois VERIFIED (tests rouges commités) → débloque
`T2.0_scan-orchestrator_coder`.
