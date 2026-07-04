---
title: Job T3.0 — Coder — Tokens de marque dans html-report.ts
description: Implement the visual design system tokens (Agent View & Linear) in html-report.ts. Refactor the embedded CSS variables, typography, elevations, and hairline borders, ensuring that the generated validation HTML report matches the required visual quality bar while keeping the check data/content identical.
type: job
status: current
job_ref: T3.0_html-brand-tokens
last_update: 2026-07-04
---

# JOB T3.0_html-brand-tokens — rôle: coder

Sprint: T3. JobName: `scan-upgrade`. Branche : `job/T3.0-html-brand-tokens`.
Dépend de : `T3.0_html-brand-tokens_tester` VERIFIED (les tests de régression et d'assertions de tokens sont écrits et rouges).

## Contexte (à lire avant tout)

- `.shokunin/planning/IMPLEMENTATION_PLAN.md` section `### T3.0_html-brand-tokens`.
- `.shokunin/brief/BRANDING.md` — Contient les codes couleurs précis (Canvas `#010102`, Surface `#0f1011`, Surface 2 `#141516`, Hairline `#23252a`, Primary `#3B82F6`, Accent `#8B5CF6`, Success `#10B981`, Warning `#F59E0B`, Danger `#EF4444`).
- `DESIGN.md` (racine) — Spécifie la typographie (`Outfit` pour les headings, `Inter` pour le corps de texte) et le tracking négatif (ex: `-0.02em` ou `-0.03em`).
- `packages/validator/src/utils/html-report.ts` — Fichier à modifier.

## Spécification technique & Design imposé (ne pas improviser)

**1. Alignement des variables CSS (Tokens primitifs) :**
Dans le style du HTML généré, remplacez les variables CSS existantes par :
- `--bg: #010102;` (Canvas dark)
- `--surface-1: #0f1011;` (Surface dark / cartes principales)
- `--surface-2: #141516;` (Surface 2 / cartes imbriquées)
- `--surface-3: #18191a;` (Surface 3 / overlay)
- `--border: #23252a;` (Hairline)
- `--border-2: #34343a;` (Hairline strong)
- `--blue: #3b82f6;` (Primary brand blue)
- `--pass: #10b981;` (Success)
- `--warn: #f59e0b;` (Warning)
- `--fail: #ef4444;` (Danger)

**2. Intégration de la Typographie :**
- Incluez dans la balise `<head>` du HTML généré les balises `<link>` pour charger la famille de polices Google Fonts :
  `<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`
- Mettez à jour les variables de police dans `:root` :
  - `--sans: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;`
  - `--font-headings: 'Outfit', var(--sans);`
  - `--mono: 'JetBrains Mono', ui-monospace, monospace;`
- Configurez les éléments de titres (`h1`, `h2`, `.hero-title`, `.section-title`, `.logo`, etc.) pour utiliser `var(--font-headings)` avec du tracking négatif (ex: `letter-spacing: -0.02em` ou `-0.03em` pour les grands displays).

**3. Préservation sémantique absolue :**
Ne modifiez **aucune** logique Javascript de construction des données (les tableaux `ValidationCheck`, la fonction `getReadiness`, le calcul des métriques `ValidationMetrics`, etc.). L'HTML généré doit contenir exactement la même structure de données (les mêmes IDs, listes de checks et priorités) pour éviter toute régression sémantique.

**4. Éléments graphiques et styles (Mindset $500M) :**
- Utilisez des bordures hairline fines de 1px avec `--border` (`#23252a`) pour séparer les sections et border les cartes, au lieu de styles épais.
- Soignez le design de l'en-tête (logo, pill de version) et de la barre de progression/jauge de readiness pour qu'elle ait un aspect lisse et professionnel.
- Appliquez un léger effet d'ombre ou d'élévation conforme à la structure `DESIGN.md` (canvas sombre, cartes se détachant légèrement).

## Périmètre

- Allowed files:
  - `packages/validator/src/utils/html-report.ts` (modifications ciblées CSS/markup)
  - `packages/validator/src/cli.test.ts` (uniquement pour supprimer les assertions négatives `not.toContain('fonts.googleapis.com')` et `not.toContain('fonts.gstatic.com')` qui contredisent les exigences de tokens visuels)
- Forbidden files: tous les autres fichiers du codebase.
- Libs autorisées : aucune dépendance supplémentaire.

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/RULE_AgentReadProtocol.md`
- `.shokunin/rules/RULE_Logic.md` (si cluster)
- `.shokunin/rules/TEST_PATTERNS.md`

## Skills à invoquer explicitement

`engineering-rules` + `shokunin` + `shokunin-filemeta`.

## Preuve

- Commandes à exécuter :
  - `pnpm exec tsc --noEmit` (le typecheck doit être 100% propre)
  - `pnpm exec vitest run html-report` (les tests écrits par le Tester doivent passer à 100% VERTS)
  - `node scripts/check-shokunin-structure.mjs` (0 erreur, 0 warning attendus)
- Visual checking (HG) : Générer un fichier HTML temporaire à l'aide de la commande `validate` (ex. `pnpm --filter @hardmachinelabs/index-ai-validator build` puis exécution locale du CLI sur une URL ou un fichier de test existant en produisant du HTML), l'ouvrir dans un navigateur (ou via un screenshot si disponible), et **vérifier visuellement** le résultat. Le rapport de codeur doit inclure un diff textuel de la structure CSS modifiée et décrire le rendu visuel.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T3.0_html-brand-tokens_coder_report.md` (contenant la sortie du typecheck, les résultats de test et le descriptif visuel).

## Git verification (CTO, après ce job)

```bash
git status
git diff packages/validator/src/utils/html-report.ts
git add packages/validator/src/utils/html-report.ts
git commit -m "feat: implement T3.0_html-brand-tokens visual tokens"
```

## Handoff

Une fois VERIFIED (compilation ok, tests verts, validation visuelle faite) → débloque `T3.0_html-brand-tokens_reviewer`.
