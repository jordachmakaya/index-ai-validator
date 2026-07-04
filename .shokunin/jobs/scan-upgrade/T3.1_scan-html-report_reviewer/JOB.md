# Job Specification — Reviewer — T3.1_scan-html-report

## Rôle
Reviewer (sous-agent, read-only)

## Objectif
Auditer la conformité de l'implémentation et de la couverture de tests pour T3.1_scan-html-report, et émettre un verdict final (PASS/FAIL).

## Checklist de Validation

- [ ] Les tests écrits par le Tester n'ont pas été altérés par le Coder.
- [ ] Le typecheck TypeScript compile à 100% propre (`tsc --noEmit`).
- [ ] La suite de tests Vitest complète passe à 100% verte.
- [ ] Aucun `@ts-ignore`, `@ts-expect-error`, `eslint-disable` ou type `any` n'est présent dans les lignes de code modifiées.
- [ ] Le rapport HTML du scan utilise correctement la charte graphique commune (T3.0).
- [ ] Le CTA contextuel est correct et n'utilise pas de superlatifs interdits (Plain Speech).
- [ ] Le lien d'attribution dans le rapport HTML est réécrit avec `src=cli-report`.
- [ ] Toutes les injections de données externes dans le template HTML sont échappées via `escapeHtml(...)` (sécurité XSS).
- [ ] Le câblage CLI dans `cli.ts` écrit correctement le rapport HTML généré.
- [ ] La structure Shokunin est respectée (0 erreur, 0 warning avec `check-shokunin-structure.mjs`).

## Périmètre
- Allowed files: aucun (rôle d'audit uniquement, lecture seule).

## Skills à invoquer explicitement
`shokunin-review` (audit de qualité de code) + `code-review` (audit de sécurité et correction) + `shokunin-filemeta` + `shokunin-docmeta`.

## Rapport à produire
`.shokunin/jobs/scan-upgrade/T3.1_scan-html-report_reviewer_report.md` (contenant le verdict détaillé et les preuves d'audit).
