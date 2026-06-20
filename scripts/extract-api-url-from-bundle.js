const fs = require('fs');
const path = process.argv[2];
if (!path) {
  console.error('Usage: node extract-api-url-from-bundle.js path/to/main.js');
  process.exit(1);
}
const text = fs.readFileSync(path, 'utf8');
const matches = [...text.matchAll(/https:\/\/[a-zA-Z0-9.-]+\.seenode\.com[^"'\\s]*/g)];
console.log([...new Set(matches.map((m) => m[0]))].join('\n') || 'no seenode url found');
