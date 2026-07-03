#!/usr/bin/env node
/**
 * @filemeta
 * type: script
 * title: A/B sample size calculator (two proportions)
 * description: Computes the required sample size per variant and expected duration for an A/B test from baseline rate, MDE, alpha and power - closed formula, zero dependencies (locked decision Q8: TypeScript-family, no Python).
 * job_ref: setup
 * functions: [main, zFromAlpha, sampleSizePerVariant]
 * classes: []
 * inputs: [--baseline, --mde, --alpha, --power, --traffic]
 * outputs: [console: n per variant, total, duration in days]
 * relations:
 *   - documents: coding-skills/ab-test-setup/SKILL.md
 * last_update: 2026-07-02
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), Number(arr[i + 1])] : null)).filter(Boolean),
);

const baseline = args.baseline;             // p1, ex: 0.12
const mde = args.mde;                       // delta ABSOLU, ex: 0.02 → p2 = 0.14
const alpha = args.alpha ?? 0.05;
const power = args.power ?? 0.8;
const dailyTraffic = args.traffic;          // optionnel: visiteurs/jour éligibles (toutes variantes)

if (!(baseline > 0 && baseline < 1) || !(mde > 0) || baseline + mde >= 1) {
  console.error('Usage: node scripts/ab-sample-size.mjs --baseline 0.12 --mde 0.02 [--alpha 0.05] [--power 0.8] [--traffic 5000]');
  process.exit(1);
}

/** Inverse normal CDF (Acklam approximation - amply sufficient for test design). @param {number} p */
function zQuantile(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

const p1 = baseline;
const p2 = baseline + mde;
const zAlpha = zQuantile(1 - alpha / 2);    // bilatéral
const zBeta = zQuantile(power);
const n = Math.ceil(((zAlpha + zBeta) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2);

console.log(`A/B sample size (two proportions, alpha=${alpha} two-sided, power=${power})`);
console.log(`  baseline p1=${p1}  target p2=${+p2.toFixed(6)}  (MDE absolu ${mde})`);
console.log(`  n par variante : ${n}`);
console.log(`  n total (A+B)  : ${n * 2}`);
if (dailyTraffic > 0) {
  const days = Math.ceil((n * 2) / dailyTraffic);
  console.log(`  durée estimée  : ${days} jour(s) à ${dailyTraffic} visiteurs/jour`);
  if (days > 45) console.log('  ⚠ > 45 jours : trafic insuffisant pour ce MDE — élargir le MDE ou refuser le test (gate 3)');
}
