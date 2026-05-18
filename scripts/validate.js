#!/usr/bin/env node
// Validates the JS embedded in garden-almanac-v5.html.
// Run directly: node scripts/validate.js
// Used by: .git/hooks/pre-commit and .github/workflows/validate.yml
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.join(__dirname, '..', 'garden-almanac-v5.html');
const html = fs.readFileSync(file, 'utf8');
const start = html.indexOf('<script>') + '<script>'.length;
const end = html.lastIndexOf('</script>');

if (end <= start) {
  console.error('ERROR: Could not find <script> block in', file);
  process.exit(1);
}

try {
  new vm.Script(html.slice(start, end), { filename: 'garden-almanac-v5.html' });
  console.log('✓ JS syntax OK');
} catch (e) {
  console.error('✗ JS syntax error:', e.message);
  process.exit(1);
}
