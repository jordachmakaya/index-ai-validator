# Job Specification — Tester — T3.1_scan-html-report

## Rôle
Tester (sous-agent)

## Objectif
Écrire les cas de tests unitaires TDD (rouges) pour valider la génération du rapport HTML du scan (`formatScanHtmlReport(result: ScanResult): string` ou équivalent) dans `packages/validator/src/utils/html-report.test.ts`.

## Spécifications des Tests à écrire

**1. Non-régression de structure :**
Le rapport HTML du scan doit contenir :
- L'URL cible (`target`).
- La conformité globale.
- Le score de readiness (pourcentage).
- Les détails des checks (L1, L2a, etc.) présents dans le `ScanResult`.

**2. CTA contextuel au score (BRANDING.md §2) :**
- Vérifier que pour chaque palier de score (success >= 80%, warn 50%-79%, danger < 50%), le texte du CTA de recommandation généré correspond au branding défini.

**3. Lien d'attribution (T1.2) :**
- Vérifier que le lien d'audit (`meta.links.audit` ou similaire) généré dans le rapport HTML contient bien le paramètre `src=cli-report` (et non `cli-json` ou autre).

**4. Plain Speech (DOCS_IMPLEMENTATION_PLAN / RULES.md) :**
- S'assurer que le rapport généré ne contient pas de superlatifs interdits (ex. "premier", "meilleur", "révolutionnaire", etc.).

## Périmètre
- Allowed files: `packages/validator/src/utils/html-report.test.ts` (uniquement pour étendre la suite de tests).
- Forbidden files: tous les autres fichiers du codebase.

## Skills à invoquer explicitement
`test-patterns` (doctrine de tests TDD) + `shokunin-filemeta` + `shokunin-docmeta`.

## Preuve
- Commande de vérification : `pnpm --filter @hardmachinelabs/index-ai-validator test -- html-report.test`
- Sortie attendue : Échec de la compilation ou échec des nouveaux tests de scan (phase rouge TDD), sans casser les tests unitaires préexistants de `validate`.

## Rapport à produire
`.shokunin/jobs/scan-upgrade/T3.1_scan-html-report_tester_report.md` (contenant la preuve de l'exécution et de l'échec attendu).
