#!/usr/bin/env node
/**
 * Proxy local Hidrix: PWA (:8200) + API (:5080) en un solo puerto.
 * - /api/*  y /health  -> API
 * - resto              -> PWA (con fallback SPA a index.html)
 */
const http = require('http');

const LISTEN = Number(process.env.PROXY_PORT || 8300);
const API = process.env.API_ORIGIN || 'http://127.0.0.1:5080';
const PWA = process.env.PWA_ORIGIN || 'http://127.0.0.1:8200';
const EXPOSE_SWAGGER = process.env.PROXY_EXPOSE_SWAGGER === 'true';

function looksLikeStaticAsset(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/svg/') ||
    /\.(js|css|map|json|webmanifest|ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|txt)$/i.test(
      pathname
    )
  );
}

function forward(req, res, target, requestPath, options = {}) {
  const { spaFallback = false } = options;
  const url = new URL(requestPath, target);
  const headers = { ...req.headers, host: url.host };
  const opts = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers,
  };

  const upstream = http.request(opts, (up) => {
    if (
      spaFallback &&
      req.method === 'GET' &&
      (up.statusCode === 404 || up.statusCode === 403) &&
      !looksLikeStaticAsset(url.pathname)
    ) {
      up.resume();
      forward(req, res, target, '/index.html', { spaFallback: false });
      return;
    }

    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });

  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Bad gateway: ${err.message}`);
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    req.pipe(upstream);
    return;
  }

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const path = req.url || '/';
  const toApi =
    path === '/health' ||
    path.startsWith('/health?') ||
    path.startsWith('/api/') ||
    (EXPOSE_SWAGGER && path.startsWith('/swagger'));
  forward(req, res, toApi ? API : PWA, path, { spaFallback: !toApi });
});

server.listen(LISTEN, '0.0.0.0', () => {
  console.log(`Hidrix proxy :${LISTEN}  PWA=${PWA}  API=${API}`);
});
