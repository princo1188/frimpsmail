#!/usr/bin/env node

console.error(
  'bulk-create-users.cjs has been retired because it embedded production credentials. ' +
  'Use scripts/provision-mailboxes.mjs with environment-provided credentials instead.',
);
process.exitCode = 1;
