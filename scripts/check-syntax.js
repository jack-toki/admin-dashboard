const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.js')) execFileSync(process.execPath, ['--check', full], { stdio: 'inherit' });
  }
}

walk(path.join(__dirname, '..', 'app'));
walk(path.join(__dirname, '..', 'lib'));
walk(path.join(__dirname, '..', 'test'));
console.log('syntax check ok');
