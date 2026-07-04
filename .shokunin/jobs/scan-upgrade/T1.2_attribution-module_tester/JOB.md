---
title: Job T1.2 — Tester — Attribution module (audit link rewrite)
description: Write failing tests (TDD) for rewriteAttributionSrc, which rewrites the src query param of the scanner-provided meta.links.audit URL for HTML and terminal contexts, before any implementation exists.
type: job
status: current
job_ref: T1.2_attribution-module
last_update: 2026-07-03
---

# JOB T1.2_attribution-module — rôle: tester

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.2-attribution-module`
(créée depuis `job/T1.1-scanner-client`, pas depuis `main` — **aucune
dépendance fonctionnelle sur T1.0/T1.1**, fichiers disjoints, cf.
`IMPLEMENTATION_PLAN.md` §Parallelization Sprint 1 ; la base de branche est un
choix d'hygiène git, pas une dépendance de code : `main` n'a pas encore le
correctif `.gitignore` post-incident — `.shokunin/`/`MEMORY.md`/`CLAUDE.md`/
`DESIGN.md`/`assets/` n'y sont pas exclus — donc toute nouvelle branche part
d'une branche qui a déjà le correctif, jamais de `main` directement, tant que
`main` n'est pas mis à jour). Merge prévu en fin de séance sur
`job/T1.1-scanner-client`, **pas sur `main`** (décision humaine explicite).
Dépend de : rien (fonctionnellement).

## Contexte (à lire avant tout)

- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §6 "Règles d'usage CLI
  (critiques)" règle 1 : `meta.links.audit` arrive **PRÉ-ATTRIBUÉ** avec
  `src=cli-json` depuis le scanner. Pour le rapport HTML, remplacer le
  paramètre par `src=cli-report` ; pour le message terminal,
  `src=cli-terminal`. Ne **jamais** construire l'URL d'audit à la main —
  toujours dériver de `meta.links.audit` reçu.
- `.shokunin/brief/outbound/CONTRACT_SCANNER.md` §9 — fixture réelle à
  réutiliser telle quelle comme donnée de test :
  `https://agent-view.com/audit?src=cli-json&scanId=3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01`
- `.shokunin/planning/IMPLEMENTATION_PLAN.md` section `### T1.2_attribution-module`
  (Grep uniquement cette section, le fichier couvre T1-T6).
- `packages/validator/src/utils/url.ts` — **à lire pour le style** (classes
  d'erreur avec `override name`, usage de la classe native `URL`/
  `URLSearchParams`, pas de dépendance de parsing d'URL) — pas de logique à
  réutiliser directement, ce module résout un problème différent (validation/
  normalisation de cible de scan, pas réécriture de query param).

**Important** : ce module ne fait **aucun appel réseau**. Il ne fait que
parser/réécrire une chaîne d'URL déjà reçue en mémoire.

## Objectif

Écrire les tests de `rewriteAttributionSrc` AVANT l'implémentation (TDD). Les
tests doivent échouer tant que le job Coder n'est pas fait.

## Périmètre

- Allowed files:
  - `packages/validator/src/utils/attribution.test.ts` (nouveau)
- Forbidden files: tout fichier de production (`utils/attribution.ts`).
- Libs autorisées : celles déjà dans `LIBS_REGISTRY.md` (`vitest`) + `URL`/
  `URLSearchParams` natifs Node — aucune nouvelle dépendance.

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/TEST_PATTERNS.md`
- `.shokunin/rules/RULE_Vitest.md`

## Skills à invoquer explicitement

`test-patterns` — comportement d'abord : teste ce que `rewriteAttributionSrc`
garantit à l'appelant (URL réécrite, `scanId` et reste de l'URL préservés à
l'identique), pas les détails internes de parsing.

## Cas de test requis (minimum)

Réécriture nominale (fixture réelle `CONTRACT_SCANNER.md §9`) :
1. `rewriteAttributionSrc(auditUrl, 'cli-report')` sur
   `https://agent-view.com/audit?src=cli-json&scanId=3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01`
   → retourne une URL avec `src=cli-report`, `scanId` inchangé, même
   origine/chemin.
2. `rewriteAttributionSrc(auditUrl, 'cli-terminal')` sur la même fixture →
   `src=cli-terminal`, `scanId` inchangé.
3. Le reste de l'URL (protocole, host, path, tout paramètre additionnel
   présent) est préservé à l'identique — seul le paramètre `src` change de
   valeur, aucun autre paramètre n'est ajouté/retiré/réordonné de façon
   observable dans le résultat.
4. Un `auditUrl` malformé (pas une URL absolue valide) → échoue de façon
   explicite (erreur typée ou exception claire, jamais un résultat
   silencieusement incorrect) — pas de fallback qui invente une URL.

Contrat de type (niveau compilation, pas seulement runtime) :
5. `rewriteAttributionSrc(auditUrl, 'cli-json')` **doit échouer à la
   compilation** — utiliser `// @ts-expect-error` dans le test pour
   documenter que `'cli-json'` n'est pas une valeur acceptée par le
   paramètre `src` (c'est la valeur déjà reçue du scanner, jamais réécrite).
   Si `// @ts-expect-error` ne produit pas d'erreur (le typage a régressé),
   `pnpm check` (typecheck) doit le signaler.
6. Le type union exporté (nom libre, ex. `AttributionSrc`) couvre bien les 3
   valeurs `'cli-json' | 'cli-report' | 'cli-terminal'` — un test peut
   vérifier son usage réel (ex. valeur `'cli-json'` assignable au type large
   mais pas au paramètre restreint de la fonction) plutôt que d'inspecter le
   type de façon abstraite.

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- attribution`
- Proof required: coller la sortie Vitest montrant les nouveaux tests en
  échec (rouge — normal, l'implémentation n'existe pas encore).
- Session-fit: yes.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.2_attribution-module_tester_report.md`

## Git verification (CTO, après ce job)

```bash
git checkout -b job/T1.2-attribution-module job/T1.1-scanner-client
git status
git add packages/validator/src/utils/attribution.test.ts
git commit -m "test: add T1.2_attribution-module coverage"
```

## Handoff

Une fois VERIFIED (tests rouges commités) → débloque
`T1.2_attribution-module_coder`.
