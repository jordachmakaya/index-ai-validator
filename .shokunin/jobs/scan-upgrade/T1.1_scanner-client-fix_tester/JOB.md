---
title: Job T1.1 — Tester fix — remove fake-timer/real-fetch hang in the 429 retry tests
description: Two of the 15 T1.1 tests hang (5s timeout) because vi.useFakeTimers() patches global setTimeout, which Node's real fetch (undici) also relies on internally for connection/keep-alive management, breaking the real retry fetch. Fix the 2 tests to use a tiny real Retry-After delay with real timers instead, without weakening what they assert.
type: job
status: current
job_ref: T1.1_scanner-client
last_update: 2026-07-02
---

# JOB T1.1_scanner-client — rôle: tester (correction ciblée)

Sprint: T1. JobName: `scan-upgrade`. Branche : `job/T1.1-scanner-client`.
Job de correction séparé, approuvé par le CTO (cf.
`.shokunin/jobs/scan-upgrade/T1.1_scanner-client_coder_report.md` §"Blocking
issue" — le Coder a correctement stoppé et remonté au lieu de contourner
silencieusement).

## Contexte

`packages/validator/src/client/scanner-client.test.ts` (commit `0b0422b`) a 2
tests sur 15 qui **hang** (timeout Vitest 5000ms, pas un échec d'assertion) :

- `submitScan > retries once after a 429 with Retry-After and succeeds if the retry lands`
- `pollScan > fails cleanly with ScanRateLimitError when the retry also gets a 429 (no infinite loop, no multi-attempt backoff)`

Root cause confirmée indépendamment par le CTO (reproduite, pas seulement
lue dans le rapport Coder) : `vi.useFakeTimers()` patche le `setTimeout`
global. Le `fetch()` natif de Node (implémenté via `undici`) utilise en
interne ce même `setTimeout` global pour la gestion de ses connexions
(keep-alive, timeouts internes). Quand le test avance le temps fake d'une
petite fenêtre (2100ms / 1100ms) pour déclencher le `sleep(retryAfterMs)`
interne du client, le **second** `fetch()` réel (la tentative de retry) ne
reçoit jamais sa résolution — le test se bloque jusqu'au timeout Vitest.
Le test du budget de 90s (`gives up after the 90s server-side polling
budget`) ne fait pas ce même chemin de code après le dernier fetch réel
(`pollScan` lève `ScanTimeoutError` de façon synchrone via la vérification
`Date.now() >= deadline`, sans attendre un fetch réel supplémentaire après
l'avance du temps), donc il n'est pas affecté par ce problème — **ne pas
généraliser sa forme aux deux tests cassés**.

Ce n'est PAS un bug de `scanner-client.ts` : le même chemin de code
429→sleep→retry est exercé et VERT ailleurs (le test `400`, les tests
`404`/`410`/`500`, la revue manuelle du code). Le problème est
spécifique au mélange horloge fake + I/O réseau réelle dans ces 2 tests.

## Objectif

Réécrire **uniquement** ces 2 tests pour qu'ils n'aient plus besoin de
`vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync` — utiliser un
`Retry-After` réel minuscule (ex. `'0'` ou `'0.05'`, secondes) avec des
timers réels, pour que le test attende ~0-50ms réels au lieu de simuler
2/1 secondes. **Les assertions comportementales ne changent pas** :
- Test 1 : exactement 1 retry après un `429` avec `Retry-After`, succès si
  le retry aboutit (`requestCount === 2`, `result.status === 'queued'`).
- Test 2 : exactement 1 retry après un `429`, échec propre avec
  `ScanRateLimitError` si le retry reçoit aussi un `429` (`requestCount === 2`,
  jamais 3+, jamais de boucle).

Ne pas affaiblir le test au point de ne plus prouver que le client respecte
réellement `Retry-After` — un délai réel non nul (même petit, ex. 50ms) et
une assertion que `requestCount` reste à 2 (jamais plus) sont suffisants
pour prouver l'absence de boucle/backoff multi-tentative.

## Périmètre

- Allowed files:
  - `packages/validator/src/client/scanner-client.test.ts` — **seulement**
    les 2 tests nommés ci-dessus. Ne touche à aucun des 13 autres tests.
- Forbidden files: `packages/validator/src/client/scanner-client.ts`
  (implémentation déjà VERIFIED sur 13/15, ne pas y toucher — le problème
  n'est pas là).
- Libs autorisées : aucune nouvelle. Retire simplement l'usage de
  `vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync` dans ces 2 tests
  précis ; garde `vi` importé s'il sert encore ailleurs dans le fichier
  (le test du budget 90s continue d'utiliser les fake timers, ne pas y
  toucher).

## Rules applicables

- `.shokunin/rules/RULES.md`
- `.shokunin/rules/CODE_STYLES.md`
- `.shokunin/rules/RULE_TypeScript.md`
- `.shokunin/rules/TEST_PATTERNS.md`
- `.shokunin/rules/RULE_Vitest.md`

## Skills à invoquer explicitement

`test-patterns` — le test doit rester un test de comportement observable
(retry borné, respect du délai, pas de boucle), pas un test d'implémentation
interne. Un délai réel court est un détail de fixture, pas un affaiblissement
du comportement testé.

## Preuve

- Test command: `pnpm --filter @hardmachinelabs/index-ai-validator test -- scanner-client`
- Proof required: coller la sortie Vitest montrant les 15 tests désormais
  VERTS (les 13 déjà verts + les 2 corrigés), sans timeout.
- Session-fit: yes (2 tests dans un seul fichier existant).

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T1.1_scanner-client-fix_tester_report.md`

## Git verification (CTO, après ce job)

```bash
git status
git diff packages/validator/src/client/scanner-client.test.ts
```
Vérifier explicitement que seuls les 2 tests nommés ont changé — aucune
autre modification dans ce fichier, aucun autre fichier touché.

## Handoff

Une fois VERIFIED (15/15 verts, diff limité aux 2 tests) → le CTO commit
(test fix), puis commit l'implémentation Coder déjà en place, puis lance
`T1.1_scanner-client_reviewer`.
