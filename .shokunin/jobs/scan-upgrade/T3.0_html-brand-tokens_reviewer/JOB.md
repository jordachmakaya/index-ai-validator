---
title: Job T3.0 — Reviewer — Tokens de marque dans html-report.ts
description: Verify the conformance of the visual design token refactoring in html-report.ts. Conduct code audits, review test results, and check visual output against the Agent View design specifications before the CTO finalizes the task.
type: job
status: current
job_ref: T3.0_html-brand-tokens
last_update: 2026-07-04
---

# JOB T3.0_html-brand-tokens — rôle: reviewer

Sprint: T3. JobName: `scan-upgrade`. Branche : `job/T3.0-html-brand-tokens`.
Dépend de : `T3.0_html-brand-tokens_coder` VERIFIED.

## Objectif

Vérifier la conformité de l'intégration des tokens visuels dans le rapport HTML avant fermeture du gate T3.0.

## Skills à invoquer explicitement

`shokunin-review` (conformance globale du harness, 5 gates), `code-review` (audit de qualité de code et absence de régressions structurelles).

## Checklist bloquante

- [ ] `packages/validator/src/utils/html-report.test.ts` non modifié par le Coder par rapport au commit du Tester (ou uniquement pour correction d'une erreur de typo/mock si motivée).
- [ ] La compilation TypeScript (`pnpm exec tsc --noEmit`) est 100% verte.
- [ ] Les tests unitaires (`pnpm exec vitest run html-report`) passent à 100% verts (4/4 cas requis au moins).
- [ ] **Aucune régression sur le contenu de validation** : les tests existants (validate et autres tests) restent au vert.
- [ ] Absence totale de `@ts-ignore`, `@ts-expect-error`, `eslint-disable` ou de type `any` dans les lignes modifiées/ajoutées de `html-report.ts`.
- [ ] **Conformité stricte aux couleurs de BRANDING.md** dans la feuille de style générée :
  - Canvas / Fond : `#010102`
  - Surface : `#0f1011`
  - Surface 2 : `#141516`
  - Hairlines : `#23252a`
  - Bleu Primaire : `#3B82F6` (Electric Blue)
  - Succès / Attention / Danger : `#10B981` / `#F59E0B` / `#EF4444`
- [ ] **Conformité typographique** : les polices Google Fonts `Outfit` (headings) et `Inter` (body) sont importées et configurées.
- [ ] **Hiérarchie & Tracking** : le tracking négatif (`letter-spacing`) est appliqué sur les titres (h1/h2/.hero-title).
- [ ] **Pas de dépendances sauvages** : aucune bibliothèque npm supplémentaire n'a été ajoutée.
- [ ] Conformance de structure : `node scripts/check-shokunin-structure.mjs` retourne 0 erreur et au plus 1 warning (`DASHBOARD_EMPTY` toléré).
- [ ] **Visual proof** : le Reviewer doit s'assurer que le Coder (ou lui-même en exécutant un rendu de test) a fourni une preuve visuelle (un fichier HTML généré ouvert localement) attestant de l'alignement esthétique "Mindset $500M product" (haute fidélité, pas de placeholder laid, contrastes WCAG respectés).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T3.0_html-brand-tokens_reviewer_report.md`

## Handoff

Une fois VERIFIED → le CTO valide le travail, effectue le merge (fast-forward) sur `job/T1.1-scanner-client`, met à jour `.shokunin/dashboard/project-dashboard.json` (tâche T3.0 à `status: done` et `evidenceStatus: verified`), et débloque le démarrage de la tâche suivante `T3.1_scan-html-report`.
