#!/usr/bin/env node
import('../dist/http.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
