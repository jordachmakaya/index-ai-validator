---
title: Job T3.0 — Tester — Tokens de marque dans html-report.ts
description: Write regression and assertion tests for the visual tokens update in the HTML validation report generator (html-report.ts). Ensures that the structural/data contents of validate --html are unchanged (no regression), while verifying the integration of Agent View/Linear CSS variables, fonts, and elevations.
type: job
status: current
job_ref: T3.0_html-brand-tokens
last_update: 2026-07-04
---

# JOB T3.0_html-brand-tokens — rôle: tester

Sprint: T3. JobName: `scan-upgrade`. Branche : `job/T3.0-html-brand-tokens`
(à créer depuis `job/T1.1-scanner-client` — notre unique branche d'intégration locale contenant tout le code validé).
Dépend de : Sprint T2 entièrement validé (fermé).

## Contexte (à lire avant tout)

- `.shokunin/planning/IMPLEMENTATION_PLAN.md` section `### T3.0_html-brand-tokens`.
- `.shokunin/brief/BRANDING.md` — La source unique des tokens (Canvas dark `#010102`, Surface dark `#0f1011`, Surface 2 `#141516`, Hairline `#23252a`, Primary `#3B82F6`, Accent/Secondary `#8B5CF6`, Success `#10B981`, Warning `#F59E0B`, Danger `#EF4444`).
- `DESIGN.md` (racine) — Pour l'élévation et la typographie (Outfit pour les titres avec tracking négatif, Inter pour le corps, JetBrains Mono pour les données).
- `packages/validator/src/utils/html-report.ts` — Le fichier contenant le générateur HTML existant `formatHtmlReport` (actuellement sans tests dédiés, importé par `cli.ts`).

## Design imposé par le CTO (ambiguïté du plan résolue ici, ne pas improviser)

**1. Stratégie de tests :**
Puisqu'il n'y a pas encore de fichier de test pour `html-report.ts`, ce job doit **créer** le fichier `packages/validator/src/utils/html-report.test.ts` contenant les tests de non-régression et de conformité des tokens.

**2. Non-régression de contenu (Contrainte stricte) :**
Le rapport HTML généré par `formatHtmlReport` doit conserver le même contenu sémantique qu'avant. Les assertions de test doivent vérifier que les données de la fixture de validation passée en paramètre (le score, la liste des checks, les messages, les priorités) sont toujours intégralement présentes dans le HTML généré.

**3. Conformité visuelle des tokens :**
Les assertions de test doivent analyser le HTML retourné par `formatHtmlReport` (par des assertions simples de chaîne de caractères ou de regex) pour s'assurer que :
- Les variables CSS de couleur sont définies avec les valeurs exactes de `BRANDING.md` (ex: `#010102` pour le fond, `#3B82F6` pour le primaire).
- La typographie Outfit (Google Font) et Inter sont incluses dans le style ou chargées via des balises `<link>` appropriées.
- Le tracking négatif (`letter-spacing`) est appliqué sur les éléments de titres.

## Objectif

Écrire les tests pour `formatHtmlReport` de manière à ce qu'ils échouent tant que les tokens de marque ne sont pas intégrés ou si le format de données s'est altéré. Les tests existants de la suite (`cli.test.ts`, etc.) doivent rester au vert.

## Périmètre

- Allowed files:
  - `packages/validator/src/utils/html-report.test.ts` [NEW]
- Forbidden files: `utils/html-report.ts` (implémentation, réservé au Coder), tout fichier hors `utils/`.
- Libs autorisées : celles déjà dans `LIBS_REGISTRY.md` (`vitest`).

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/TEST_PATTERNS.md`
- `.shokunin/rules/RULE_Vitest.md`

## Skills à invoquer explicitement

`test-patterns` — comportement d'abord : valider que l'HTML généré respecte le contrat visuel imposé tout en protégeant les données.

## Cas de test requis (minimum)

1. **Non-régression de contenu** : avec un résultat de validation fictif (contenant un score de readiness de 75%, 2 passes, 1 warn, et 1 fail), s'assurer que le HTML généré contient les labels des checks, le score de 75%, et les mentions exactes des erreurs trouvées.
2. **Couleurs de marque** : s'assurer que la chaîne HTML contient la définition CSS des variables avec les valeurs de `BRANDING.md` :
   - `--bg: #010102;`
   - `--surface-1: #0f1011;`
   - `--surface-2: #141516;`
   - `--hairline: #23252a;`
   - `--blue: #3b82f6;`
   - `--pass: #10b981;`
   - `--warn: #f59e0b;`
   - `--fail: #ef4444;`
3. **Typographie** : s'assurer que la police Google Fonts `Outfit` (utilisée pour les titres) et la police `Inter` sont référencées et configurées dans le bloc `<style>` (ex: `font-family: 'Outfit'` pour les headings).
4. **Hiérarchie et Tracking** : s'assurer que le style CSS définit une classe ou des propriétés sur les titres (`.hero-title` ou `h1`/`h2`) appliquant un tracking négatif (`letter-spacing: -0.02em` ou similaire issu de `DESIGN.md`).

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- html-report.test`
- Proof required: coller la sortie Vitest montrant les nouveaux tests en échec (rouge — les anciens styles sont toujours présents au lieu des tokens Agent View), et vérifier que les autres tests du projet restent verts.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T3.0_html-brand-tokens_tester_report.md`

## Git verification (CTO, après ce job)

```bash
git checkout -b job/T3.0-html-brand-tokens job/T1.1-scanner-client
git status
git add packages/validator/src/utils/html-report.test.ts
git commit -m "test: add T3.0_html-brand-tokens coverage"
```

## Handoff

Une fois VERIFIED (tests rouges commis, reste vert) → débloque `T3.0_html-brand-tokens_coder`.
