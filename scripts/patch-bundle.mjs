import { readFileSync, writeFileSync, readdirSync } from 'fs';

const dir = '.vercel/output/functions/__server.func/_ssr/';

const files = readdirSync(dir);
const target = files.find(f => {
  if (!f.startsWith('server-') || !f.endsWith('2.mjs')) return false;
  return true;
});

if (!target) {
  console.log('⚠️  Arquivo para patch não encontrado — pode já estar corrigido.');
  process.exit(0);
}

const path = dir + target;
let content = readFileSync(path, 'utf8');

const before = 'var defaultCsrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });';
const after = 'var defaultCsrfMiddleware; function getDefaultCsrfMiddleware() { if (!defaultCsrfMiddleware) defaultCsrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }); return defaultCsrfMiddleware; }';

content = content.replace(before, after);
content = content.replace('[defaultCsrfMiddleware]', '[getDefaultCsrfMiddleware()]');

writeFileSync(path, content);
console.log(`✅ Bundle patched! (${target})`);