#!/usr/bin/env node
// Bóc thư viện thành phần từ các template trong templates/ → component-library/
//   node scripts/build-components.js
'use strict';
const path = require('path');
const C = require('../lib/components.js');
const out = path.join(__dirname, '..', 'component-library');
const { summary, index } = C.buildLibrary(out);
console.log(`Thư viện: ${summary.total} mẫu — ${summary.pass} PASS, ${summary.fail} FAIL → ${path.relative(process.cwd(), out)}`);
for (const [t, c] of Object.entries(summary.chartTypesInTemplates)) console.log(`  ${t}: ${Object.entries(c).map(([k, n]) => `${k}×${n}`).join(', ')}`);
index.filter((c) => c.status === 'FAIL').forEach((c) => console.log('  ✗ ' + c.id + ': ' + c.issues.join('; ')));
process.exit(summary.fail ? 1 : 0);
