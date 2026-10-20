import { ALL_TESTS, runTest } from '../src/core/tests';

let failed = 0;
for (const t of ALL_TESTS) {
  const r = await runTest(t);
  console.log(`${r.status === 'pass' ? 'PASS' : 'FAIL'}  #${t.n} ${t.name} (${r.ms}ms)`);
  for (const l of r.log) console.log('      ' + l);
  if (r.status !== 'pass') failed++;
}
console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
