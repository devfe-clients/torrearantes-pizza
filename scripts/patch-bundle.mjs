import { readFileSync, writeFileSync } from 'fs';

const path = '.vercel/output/functions/__server.func/_ssr/server-DXbEhFTg2.mjs';
let content = readFileSync(path, 'utf8');

content = content.replace(
  'var defaultCsrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });',
  'var defaultCsrfMiddleware; function getDefaultCsrfMiddleware() { if (!defaultCsrfMiddleware) defaultCsrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }); return defaultCsrfMiddleware; }'
);

content = content.replace(
  '[defaultCsrfMiddleware]',
  '[getDefaultCsrfMiddleware()]'
);

writeFileSync(path, content);
console.log('✅ Bundle patched!');