#!/usr/bin/env node

const keyIndex = process.argv.indexOf('--key');
if (keyIndex !== -1) {
  const key = process.argv[keyIndex + 1];
  if (!key || !/^[A-Za-z0-9_-]+$/.test(key)) {
    console.error('serve-question: --key must contain only letters, numbers, underscores, or hyphens');
    process.exit(1);
  }
}

await import('./serve-question.internal.mjs');
