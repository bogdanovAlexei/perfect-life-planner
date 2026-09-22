import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const root = resolve('dist');
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; connect-src 'self' https://rzpfzrisasabacohnhgg.supabase.co wss://rzpfzrisasabacohnhgg.supabase.co https://cdn.jsdelivr.net; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob: https://cdn.jsdelivr.net; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function send(response, status, body) {
  response.writeHead(status, { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(body);
}

createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    send(response, 405, 'Méthode non autorisée');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  } catch {
    send(response, 400, 'Adresse invalide');
    return;
  }

  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = resolve(root, requestedPath);
  const pathFromRoot = relative(root, file);

  if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..' || isAbsolute(pathFromRoot) || !existsSync(file)) {
    send(response, 404, 'Fichier introuvable');
    return;
  }

  response.writeHead(200, {
    ...securityHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': types[extname(file)] || 'application/octet-stream',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!response.headersSent) send(response, 500, 'Erreur de lecture');
    else response.destroy();
  });
  stream.pipe(response);
}).listen(4173, '127.0.0.1', () => {
  console.log('PLP est disponible sur http://127.0.0.1:4173');
});
