---
title: Job T1.2 — Coder — Attribution module (audit link rewrite)
description: Implement rewriteAttributionSrc against CONTRACT_SCANNER.md §6 rule 1 to make the tester's tests pass, without modifying them.
type: job
status: current
job_ref: T1.2_attribution-module
last_update: 2026-07-03
---

# JOB T1.2_attribution-module — rôle: coder

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.2-attribution-module`
(créée depuis `job/T1.1-scanner-client`, pas `main` — cf. note tester JOB.md
sur le correctif `.gitignore`). Merge prévu en fin de séance sur
`job/T1.1-scanner-client`, **pas sur `main`**.
Dépend de : `T1.2_attribution-module_tester` VERIFIED (tests rouges commités).

## Contexte (à lire avant tout)

- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §6 "Règles d'usage CLI
  (critiques)" règle 1 : `meta.links.audit` arrive **PRÉ-ATTRIBUÉ** avec
  `src=cli-json`. Réécrire uniquement le paramètre `src` — `cli-report` pour
  le rapport HTML, `cli-terminal` pour le message terminal. Ne jamais
  reconstruire l'URL à la main : toujours dériver de `meta.links.audit` reçu.
- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §9 — fixture réelle (URL
  `https://agent-view.com/audit?src=cli-json&scanId=…`).
- `packages/validator/src/utils/attribution.test.ts` — les tests écrits par
  le job tester, à faire passer sans les modifier.
- `packages/validator/src/utils/url.ts` — style de référence : classes
  d'erreur avec `override name`, usage de `URL`/`URLSearchParams` natifs. Ne
  pas importer/étendre ce fichier, il résout un problème différent
  (validation de cible de scan) — juste s'aligner sur le style.

## Objectif

Faire passer les tests de `T1.2_attribution-module_tester`, sans les
modifier.

## Périmètre

- Allowed files:
  - `packages/validator/src/utils/attribution.ts` (nouveau)
- Forbidden files: **`packages/validator/src/utils/attribution.test.ts` (NE
  PAS MODIFIER)**, et tout fichier hors de la liste ci-dessus — en
  particulier `client/scanner-client.ts` (T1.1, hors scope), `utils/url.ts`,
  `utils/html-report.ts`, `cli.ts`, `types.ts` (hors scope, T2.0+/T3.1 pour
  l'intégration).
- Libs autorisées : aucune nouvelle. `URL`/`URLSearchParams` natifs Node
  uniquement.

## Tasks (dérivées de `IMPLEMENTATION_PLAN.md` §T1.2)

- Type union exporté couvrant les 3 valeurs contractuelles possibles du
  paramètre `src` : `'cli-json' | 'cli-report' | 'cli-terminal'` (nom libre,
  ex. `AttributionSrc`).
- `rewriteAttributionSrc(auditUrl: string, src: 'cli-report' |
  'cli-terminal'): string` — paramètre `src` **restreint** aux 2 valeurs
  réécrivables (dérivé du type union large, ex. via `Exclude<AttributionSrc,
  'cli-json'>`, pas dupliqué à la main) : `'cli-json'` n'est **jamais**
  passée à cette fonction — c'est déjà la valeur reçue du scanner, une
  tentative de le faire doit échouer à la compilation.
- Parse `auditUrl` (URL absolue), remplace uniquement le paramètre `src`,
  conserve le reste de l'URL (dont `scanId` et tout autre paramètre présent)
  tel quel — pas de reconstruction manuelle de query string.
- `auditUrl` malformé (pas une URL absolue valide) → erreur typée explicite,
  jamais un résultat silencieusement incorrect ni un fallback qui invente
  une URL.

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/RULE_PNPM.md`

## Skills à invoquer explicitement (obligatoire, pas au jugement)

- `engineering-rules` — zéro `any`, erreurs jamais avalées, validation aux
  frontières (URL invalide jamais consommée silencieusement).
- `shokunin` — la plus petite implémentation correcte et durable : un seul
  fichier, réutilise `URL`/`URLSearchParams` du runtime, pas de lib de
  parsing d'URL, pas d'abstraction au-delà de ce que le contrat exige (1
  seule fonction publique).
- `shokunin-filemeta` — **obligatoire** : ajouter le bloc `@filemeta` en tête
  de `attribution.ts` (nouveau fichier significatif).

## Règles strictes

- Commit: **INTERDIT** pour le Coder — le CTO commit après revue.
- Test files: **NE PAS MODIFIER** — si un test semble faux, arrêter et
  remonter au CTO (job de correction de test séparé, jamais une modif
  silencieuse).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- attribution`
- Proof required: coller la sortie Vitest montrant tous les tests désormais
  VERTS, plus `pnpm --filter @hardmachinelabs/index-ai-validator check`
  (typecheck) sans erreur — y compris le `// @ts-expect-error` du test qui
  doit rester valide (pas de warning "unused ts-expect-error").
- Session-fit: yes (1 fichier nouveau, périmètre minime).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.2_attribution-module_coder_report.md`

## Git verification (CTO, après ce job)

```bash
git status
```
Vérifier explicitement que `attribution.test.ts` n'apparaît PAS dans le
diff. Si modifié → job rejeté, retour au Tester/CTO.

## Handoff

Une fois VERIFIED → débloque `T1.2_attribution-module_reviewer`.
