const fs = require('fs');
const path = require('path');

function mask(v) {
  if (!v) return 'none';
  if (v.length > 8) return `${v.slice(0,4)}...${v.slice(-4)}`;
  return '***short***';
}

const keys = [
  'BUILD_ANALYZER_GROQ_API_KEY',
  'CODE_REVIEWER_GROQ_API_KEY',
  'TEST_ANALYZER_GROQ_API_KEY',
  'DEPENDENCY_CHECKER_GROQ_API_KEY',
  'DEBATE_REASONER_GROQ_API_KEY',
  'GROQ_API_KEY',
];

console.log('Checking process.env for keys:');
for (const k of keys) {
  console.log(`${k}: present=${k in process.env} mask=${mask(process.env[k])}`);
}

// Also try to read .env in repo root
const envPath = path.resolve(__dirname, '..', '.env');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('\nParsed .env file entries:');
  for (const k of keys) {
    const re = new RegExp(`^${k}=(.*)$`, 'm');
    const m = envContent.match(re);
    const val = m ? m[1].trim() : null;
    console.log(`${k}: inFile=${Boolean(val)} mask=${mask(val)}`);
  }
} catch (err) {
  console.error('Could not read .env file at', envPath, err.message);
}
