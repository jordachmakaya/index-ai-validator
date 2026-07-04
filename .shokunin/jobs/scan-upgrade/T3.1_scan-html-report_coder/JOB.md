# Job Specification — Coder — T3.1_scan-html-report

## Rôle
Coder (sous-agent)

## Objectif
Implémenter la génération du rapport HTML pour la commande `scan` (`formatScanHtmlReport`) dans `packages/validator/src/utils/html-report.ts`, et brancher cette implémentation dans la commande CLI `scan` (`packages/validator/src/cli.ts`) pour remplacer le placeholder.

## Spécifications de l'Implémentation

**1. Rendu HTML du Scan :**
- Exposer la fonction `formatScanHtmlReport(result: ScanResult): string` (ou similaire).
- Utiliser la même charte graphique et les variables CSS introduites en T3.0 (`--bg: #010102`, `--surface-1: #0f1011`, `--hairline: #23252a`, etc.) pour préserver l'identité de marque "Agent View / Linear".
- Injecter les métriques, checks, et verdicts du `ScanResult` sous forme sémantique.
- S'assurer que chaque donnée externe insérée est échappée via `escapeHtml(...)`.

**2. CTA contextuel (BRANDING.md) :**
- Success (score >= 80%) : Message positif sur la préparation à l'IA.
- Warn (score 50%-79%) : Suggestion d'optimisation.
- Danger (score < 50%) : Alerte critique sur l'illisibilité par l'IA.

**3. Lien d'attribution (T1.2) :**
- Utiliser le module d'attribution pour réécrire `meta.links.audit` avec `src=cli-report`.

**4. Câblage CLI :**
- Mettre à jour `cli.ts` pour que l'option `--html` de la sous-commande `scan` écrive le fichier HTML en appelant cette nouvelle fonction de rendu sur le `ScanResult` final.

## Périmètre
- Allowed files:
  - `packages/validator/src/utils/html-report.ts`
  - `packages/validator/src/cli.ts`
- Forbidden files: tous les autres fichiers du codebase.

## Skills à invoquer explicitement
`engineering-rules` + `shokunin` + `shokunin-filemeta` + `shokunin-docmeta`.

## Preuve
- Commande de typecheck : `pnpm --filter @hardmachinelabs/index-ai-validator check`
- Commande de tests : `pnpm --filter @hardmachinelabs/index-ai-validator test`
- Visual proof : Générer un rapport HTML à l'aide de la commande `scan --html test-scan.html` et documenter son design et son contenu dans le rapport.

## Rapport à produire
`.shokunin/jobs/scan-upgrade/T3.1_scan-html-report_coder_report.md` (contenant la sortie des commandes et la description du rendu visuel).
