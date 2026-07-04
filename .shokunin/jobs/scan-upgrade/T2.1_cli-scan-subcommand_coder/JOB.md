---
title: Job T2.1 — Coder — CLI scan subcommand
description: Wire `index-ai scan <url>` into cli.ts per the CTO-specified design to make the tester's tests pass, without modifying them.
type: job
status: current
job_ref: T2.1_cli-scan-subcommand
last_update: 2026-07-03
---

# JOB T2.1_cli-scan-subcommand — rôle: coder

Sprint: T2. JobName: `scan-upgrade`. Branche : `job/T2.1-cli-scan-subcommand`.
Dépend de : `T2.1_cli-scan-subcommand_tester` VERIFIED (tests rouges
commités).

## Contexte (à lire avant tout)

- `packages/validator/src/cli.test.ts` — les tests écrits par le job
  tester (nouveaux, ajoutés à la suite des tests `validate` existants), à
  faire passer sans les modifier. Lis-les en premier.
- `.shokunin/jobs/scan-upgrade/T2.1_cli-scan-subcommand_tester/JOB.md`
  §"Design imposé par le CTO" — le contrat précis de la sous-commande
  `scan` (ne pas réinterpréter).
- `packages/validator/src/cli.ts` — pattern existant à étendre à
  l'identique (`CliRunDependencies`, `createProgram`, gestion d'erreur
  centralisée dans `runCli`).
- `packages/validator/src/scan.ts` (T2.0, VERIFIED) — `scanUrl`,
  `ScanOutcome`, `ScanFailedError`.
- `packages/validator/src/types.ts` — `ScanOptions`.

## Objectif

Faire passer les tests de `T2.1_cli-scan-subcommand_tester`, sans les
modifier.

## Périmètre

- Allowed files:
  - `packages/validator/src/cli.ts` (extension)
- Forbidden files: **`packages/validator/src/cli.test.ts` (NE PAS
  MODIFIER)**, et tout fichier hors de la liste ci-dessus — en particulier
  `scan.ts`, `types.ts`, `client/scanner-client.ts`, `utils/attribution.ts`,
  `utils/html-report.ts` (T3.1, hors scope), `utils/format.ts`.
- Libs autorisées : `commander` (déjà utilisée), `kleur` (déjà dans
  `LIBS_REGISTRY.md`, **première utilisation réelle** dans ce fichier —
  aucune nouvelle dépendance à installer, `kleur` est déjà un `dependency`
  du package). Aucune autre nouvelle dépendance.

## Tasks

- Étendre `CliRunDependencies` avec `scan?: CliScanRunner` (type `(options:
  ScanOptions) => Promise<ScanOutcome>`), défaut = `scanUrl` réel importé
  de `./scan`.
- Nouvelle sous-commande Commander `scan <url>` dans `createProgram` (ou
  fonction dédiée équivalente, au choix du Coder, cohérente avec le style
  existant) :
  - `--json` (booléen, réutilise la même sémantique que `validate`)
  - `--html <path>` (réutilise/factorise `validateHtmlPath` existant —
    même règle : extension `.html`, chemin non vide)
  - `--api-key <key>` (accepté, stocké nulle part, **aucun effet**)
  - `--timeout <ms>` (réutilise `parsePositiveInteger` existant, transmis à
    `ScanOptions.timeoutMs`)
- Construit `ScanOptions` : `target` (l'URL argument), `timeoutMs`, et
  `onProgress: (progress) => { /* écrit sur stderr, jamais stdout */ }`
  qui imprime une ligne `Scan progress: <currentStep>\n` à chaque appel.
- Appelle `scan(scanOptions)` (l'injection ou `scanUrl` réel par défaut) :
  - Succès (`ScanOutcome`) :
    - stdout `--json` → `JSON.stringify(outcome.status, null, 2)` + `\n`
      (le `status` **brut**, jamais enrichi).
    - stdout sans `--json` → résumé humain compact (fonction privée
      minimale dans `cli.ts` : `url`, `score`, `verdict`, comptage des
      findings par sévérité P0/P1/P2 — ne réutilise PAS `formatHumanResult`,
      forme de données différente).
    - stderr (toujours, `--json` ou non) → message humain coloré `kleur`
      citant score/verdict et `outcome.auditLinks.terminal` (jamais
      reconstruit à la main).
    - Si `--html <path>` fourni → écrit un HTML **minimal** (fonction
      privée dans `cli.ts`, PAS d'extension de `utils/html-report.ts` —
      hors scope, réservé à T3.1) : titre, `url`, `score`/`verdict`, lien
      `outcome.auditLinks.html`. Ce rendu est temporaire, remplacé
      visuellement par T3.1 plus tard — ne pas sur-investir dans le style.
  - Échec (`ScanFailedError`, ou toute erreur transport T1.1 comme
    `ScanRequestError`/`ScanTimeoutError`/etc.) → **ne rien catcher ici** :
    laisse l'erreur remonter jusqu'au `try/catch` déjà existant dans
    `runCli` (celui qui gère déjà les erreurs de `validate`). Aucun fichier
    HTML écrit dans ce cas (naturellement vrai si on n'écrit qu'après un
    succès).
- **Ne redéclare jamais** `ScanOptions`/`ScanOutcome`/`ScanFailedError` —
  importe-les depuis `./types`/`./scan`.

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/RULE_PNPM.md`

## Skills à invoquer explicitement (obligatoire, pas au jugement)

- `engineering-rules` — zéro `any`, pas d'erreur avalée silencieusement.
- `shokunin` — la plus petite extension correcte : réutilise
  `createProgram`/`parsePositiveInteger`/`validateHtmlPath` existants,
  n'invente pas de nouveau système de flags ou de rendu HTML complexe (ce
  sera fait par T3.1).
- `shokunin-filemeta` — `cli.ts` n'a pas de bloc `@filemeta` préexistant :
  **ne pas en ajouter un** (cohérence avec l'existant, ne pas improviser
  une convention absente sur un fichier qui ne l'a jamais eue).

## Exigence qualité (règle permanente, vérifiée par le reviewer)

**Aucun `@ts-expect-error`, `@ts-ignore`, commentaire `eslint-disable`, ni
`any`/`as any` dans `cli.ts`.** Ces échappatoires sont tolérées uniquement
dans les fichiers de test (`cli.test.ts`), jamais dans le code de
production. Si un type semble forcer l'un de ces contournements, c'est un
signal que le design/typage doit être corrigé — remonter au CTO plutôt que
de contourner.

## Règles strictes

- Commit: **INTERDIT** pour le Coder — le CTO commit après revue.
- Test files: **NE PAS MODIFIER** — si un test semble faux, arrêter et
  remonter au CTO.

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- cli.test`
- Proof required: coller la sortie Vitest montrant tous les tests désormais
  VERTS (nouveaux tests `scan` + tests `validate` existants toujours verts,
  aucune régression), plus `pnpm --filter @hardmachinelabs/index-ai-validator check`
  (typecheck) sans erreur.
- Session-fit: yes — si `cli.ts` devient difficile à tenir dans une seule
  session, signaler au CTO avant de scinder en un nouveau fichier (ce
  serait un changement de Scope à valider, pas une décision Coder).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T2.1_cli-scan-subcommand_coder_report.md`

## Git verification (CTO, après ce job)

```bash
git status
```
Vérifier explicitement que `cli.test.ts` n'apparaît PAS dans le diff. Si
modifié → job rejeté, retour au Tester/CTO.

## Handoff

Une fois VERIFIED → débloque `T2.1_cli-scan-subcommand_reviewer`.
