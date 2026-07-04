---
title: Job T2.1 — Tester — CLI scan subcommand
description: Write failing tests (TDD, dependency-injected like the existing validate command) for `index-ai scan <url>` — flags, progress on stderr, dev-friendly failure handling, and a minimal --html write pending T3.1's branded report.
type: job
status: current
job_ref: T2.1_cli-scan-subcommand
last_update: 2026-07-03
---

# JOB T2.1_cli-scan-subcommand — rôle: tester

Sprint: T2. JobName: `scan-upgrade`. Branche : `job/T2.1-cli-scan-subcommand`
(créée depuis `job/T1.1-scanner-client` — cette branche est désormais la
branche d'intégration, elle contient déjà T1.0/T1.1/T1.2/T2.0 VERIFIED,
poussée sur `origin`. Ne pas créer depuis `main` : correctif `.gitignore`
absent là-bas). Dépend de : `T2.0_scan-orchestrator` VERIFIED.

## Contexte (à lire avant tout)

- `.shokunin/planning/IMPLEMENTATION_PLAN.md` section `### T2.1_cli-scan-subcommand`.
- `.shokunin/brief/outbound/cli/CLI_UPGRADE_SPEC.md` §2.1 : `scan <url>` —
  "renvoie le payload JSON du scanner tel quel (pass-through)" ; flags
  `--json`/`--html` en parité avec `validate` ; `--api-key` réservé, sans
  effet (auth future, pas encore branchée côté scanner).
- `.shokunin/brief/outbound/cli/CONNECTED_PROJECT_DESIGN_UI.md` §"Scan
  Progress" : la philosophie de progression (`fetch`→`robots`→`render`→
  `checks`→`score`, "montrer le travail, pas un spinner muet") — ce texte
  décrit l'UI web du scanner ; pour le CLI, on en reprend l'esprit
  (afficher les étapes nommées au fil de l'eau), pas le composant visuel.
- `packages/validator/src/cli.ts` — **lis-le en entier**, c'est le pattern à
  suivre à l'identique : `runCli(argv, dependencies)`, `CliRunDependencies`
  (injection de `validate`), `createProgram()` (une sous-commande Commander
  par action), gestion d'erreur centralisée dans le `try/catch` de `runCli`
  (toute erreur non catchée par l'action → `exitCode: 2`, message formaté
  dans `stderr`).
- `packages/validator/src/cli.test.ts` — lis quelques tests représentatifs
  (ex. lignes ~340-380) pour voir le pattern d'injection `{ validate }` :
  **c'est le même pattern à reproduire pour `scan`**, pas un nouveau serveur
  HTTP mock à monter (le transport est déjà couvert par T1.1, l'orchestration
  par T2.0 — ce job teste le câblage CLI : parsing des flags, formatage,
  stdout/stderr, exit code).
- `packages/validator/src/scan.ts` (T2.0, VERIFIED) — `scanUrl(options:
  ScanOptions): Promise<ScanOutcome>`, `ScanFailedError`. `ScanOutcome =
  { status: ScanStatus; auditLinks: { html: string; terminal: string } }`.
- `packages/validator/src/client/scanner-client.ts` (T1.1, VERIFIED) —
  erreurs transport (`ScanRequestError`, `ScanTimeoutError`, etc.) qui
  peuvent traverser `scanUrl` sans être interceptées.

## Design imposé par le CTO (ambiguïté du plan résolue ici, ne pas improviser)

**1. Injection de dépendance, pas de serveur mock réseau.** Le plan mentionne
un "serveur mock local" pour les tests bout en bout — dans ce codebase,
cette discipline est déjà remplie par le pattern `CliRunDependencies`
existant (`{ validate }`). On l'étend symétriquement :

```ts
export type CliScanRunner = (options: ScanOptions) => Promise<ScanOutcome>

export type CliRunDependencies = {
  readonly validate?: CliValidationRunner
  readonly scan?: CliScanRunner   // nouveau, défaut : scanUrl réel
}
```

Les tests injectent `{ scan: mockScanFn }` dans `runCli(argv, { scan })`,
exactement comme les tests `validate` existants injectent `{ validate }`.
Aucun `node:http`/`sirv` à monter pour ce job.

**2. Sortie stdout (parité avec `validate`, contrat scanner respecté) :**
- `scan <url> --json` → stdout = `JSON.stringify(outcome.status, null, 2)`
  suivi d'un `\n` — le `ScanStatus` **brut et intégral tel reçu**, rien
  d'autre (contrat §6 règle 2 : zéro enrichissement, zéro texte promo dans
  les données).
- `scan <url>` (sans `--json`) → stdout = un résumé humain compact
  (fonction privée dans `cli.ts`, pas de nouveau module — le Scope de ce
  job est `cli.ts` uniquement) : au minimum `url`, `score`, `verdict`,
  nombre de findings par sévérité (P0/P1/P2). Analogue en esprit à
  `formatHumanResult` (`utils/format.ts`) mais **ne le réutilise pas**
  (forme de données différente, `ScanStatus` ≠ `ValidationResult`) — une
  petite fonction dédiée, minimale.

**3. Message humain stderr (kleur, attribution `cli-terminal`) — toujours
affiché après un scan `done`, que `--json` soit présent ou non :** une
ligne colorée (`kleur`) citant le score/verdict et
`outcome.auditLinks.terminal` (déjà attribué `src=cli-terminal` par T1.2/
T2.0, jamais reconstruit à la main). **Jamais dans stdout** — stdout reste
100 % parsable en mode `--json` (contrat §6 règle 2).

**4. Progression pendant le poll (stderr uniquement, jamais stdout) :**
`options.onProgress` passé à `scanUrl` écrit une ligne stderr à chaque
étape reçue, ex. `Scan progress: <currentStep>\n` (pas de spinner, pas de
contrôle de curseur ANSI — une ligne par étape suffit à "montrer le
travail").

**5. `--html <path>` — écriture minimale, PAS le rapport brandé (T3.1) :**
Le rapport HTML brandé du scan est le scope explicite de
`T3.0_html-brand-tokens`/`T3.1_scan-html-report` (pas encore construits).
Ce job écrit un HTML minimal, **directement dans `cli.ts`** (fonction
privée, pas d'extension de `utils/html-report.ts` — hors scope ici, cf.
Scope du plan `### T2.1_cli-scan-subcommand` = `cli.ts` uniquement) :
titre, `url`, `score`/`verdict` si `done`, lien vers
`outcome.auditLinks.html` (jamais construit à la main). Ce fichier sera
**remplacé** par le rendu brandé quand T3.1 sera fait — ce n'est pas la
version finale, juste un flag fonctionnel dès maintenant (le plan exige
`scan --json --html` → "fichier HTML écrit" comme critère d'acceptation
T2.1, avant même que T3.1 existe).
- Validation du chemin `--html` : réutilise la même logique que
  `validateHtmlPath` existante dans `cli.ts` (extension `.html`, non vide) —
  ne la duplique pas, factorise-la si besoin (mais ce choix appartient au
  Coder, pas un blocage du Tester).
- Si le scan échoue (`failed`/erreur transport), **aucun fichier HTML n'est
  écrit**.

**6. `--api-key <key>` :** flag accepté par Commander, stocké nulle part,
**aucun effet** (réservé, cf. `CLI_UPGRADE_SPEC.md` §2.1 — auth future côté
scanner, pas encore branchée).

**7. Gestion d'erreur :** aucune interception spéciale par type d'erreur
dans l'action `scan` — laisse `ScanFailedError`/`ScanRequestError`/
`ScanTimeoutError`/etc. traverser jusqu'au `try/catch` déjà existant dans
`runCli` (celui qui gère déjà `validate`), qui formate le message en
`stderr` et retourne `exitCode: 2`. Ne pas réinventer une gestion d'erreur
parallèle pour `scan` — **réutilise le mécanisme existant**, c'est déjà
"stderr clair + exit code non-zéro, jamais de crash" par construction.

**8. `--timeout <ms>` :** réutilise l'option Commander déjà définie pour
`validate` (même flag, même parsing `parsePositiveInteger`), transmis à
`scanUrl` via `ScanOptions.timeoutMs`.

## Objectif

Écrire les tests de la sous-commande `scan` AVANT l'implémentation (TDD).
Les tests doivent échouer tant que le job Coder n'est pas fait.

## Périmètre

- Allowed files:
  - `packages/validator/src/cli.test.ts` (extension — ajouter des tests,
    ne pas modifier/casser les tests `validate` existants)
- Forbidden files: `cli.ts` (implémentation, hors scope Tester), `scan.ts`,
  `types.ts`, `client/scanner-client.ts`, `utils/attribution.ts`,
  `utils/html-report.ts`.
- Libs autorisées : celles déjà dans `LIBS_REGISTRY.md` (`vitest`,
  `commander` déjà en place) — aucune nouvelle dépendance. Pas de nouveau
  serveur `node:http` pour ce job (cf. Design point 1).

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/TEST_PATTERNS.md`
- `.shokunin/rules/RULE_Vitest.md`

## Skills à invoquer explicitement

`test-patterns` — comportement d'abord : teste ce que la commande `scan`
garantit à l'utilisateur (flags, stdout/stderr, exit code), pas les
détails internes de `scanUrl` (déjà couvert par T2.0).

## Cas de test requis (minimum)

1. `scan <url> --json` avec `scan` mocké résolvant un `ScanOutcome` `done`
   → stdout = `JSON.stringify(outcome.status, null, 2)` exact (parsable,
   égal au `status` mocké), `exitCode === 0`.
2. `scan <url>` (sans `--json`) avec le même mock `done` → stdout contient
   `url`, `score`, `verdict` (résumé humain, pas de JSON brut).
3. Message stderr toujours présent après un `done` (avec et sans
   `--json`), contient `outcome.auditLinks.terminal` (pas juste `auditLinks.html`
   ni une URL reconstruite à la main).
4. `--api-key some-key` accepté sans erreur, sans effet observable
   (`scan` mocké reçoit les mêmes `ScanOptions` qu'sans le flag, à
   `target`/`baseUrl`/`timeoutMs` près).
5. `scan <url> --json --html <path>` → JSON stdout (identique au cas 1) ET
   un fichier HTML écrit contenant au minimum `url`, `outcome.auditLinks.html`
   (pas `auditLinks.terminal`).
6. `--html` avec chemin invalide (vide, extension non-`.html`) → erreur
   claire avant même d'appeler `scan` (mock jamais invoqué), `exitCode`
   non-zéro.
7. `scan` mocké qui **rejette** avec `ScanFailedError` → `exitCode !== 0`,
   `stderr` contient le message de l'erreur (dev-friendly, déjà garanti par
   T2.0), stdout vide, **aucun fichier HTML écrit** même si `--html` fourni.
8. `scan` mocké qui rejette avec `ScanRequestError`/`ScanTimeoutError`
   (erreur transport T1.1) → même comportement que le cas 7 (traverse sans
   traitement spécial).
9. Pendant le poll, `scan` mocké invoque `onProgress({ currentStep:
   'fetch' })` puis `onProgress({ currentStep: 'render' })` avant de
   résoudre → `stderr` contient les deux étapes dans l'ordre, **jamais dans
   stdout**.
10. `--timeout <ms>` transmis : le mock `scan` reçoit `options.timeoutMs`
    égal à la valeur fournie (assertion sur les arguments reçus par le
    mock).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- cli.test`
- Proof required: coller la sortie Vitest montrant les nouveaux tests en
  échec (rouge — normal, la sous-commande `scan` n'existe pas encore), ET
  confirmer que les tests `validate` existants restent VERTS (pas de
  régression introduite par l'extension du fichier).
- Session-fit: yes.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T2.1_cli-scan-subcommand_tester_report.md`

## Git verification (CTO, après ce job)

```bash
git checkout -b job/T2.1-cli-scan-subcommand job/T1.1-scanner-client
git status
git add packages/validator/src/cli.test.ts
git commit -m "test: add T2.1_cli-scan-subcommand coverage"
```

## Handoff

Une fois VERIFIED (tests rouges commités, tests `validate` existants
toujours verts) → débloque `T2.1_cli-scan-subcommand_coder`.
