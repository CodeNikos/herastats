#!/usr/bin/env node
/**
 * Imprime checklist de variables para pegar en Seenode tras git push.
 * Uso: node scripts/print-seenode-env-checklist.js
 */
const crypto = require('crypto');

const site = 'https://www.herastats.com';
const salt = crypto.randomBytes(32).toString('hex');

console.log(`
=== SEENODE — Backend (Environment) ===
SITE_URL=${site}
FRONTEND_BASE_URL=${site}
CORS_ORIGIN=${site}
ANALYTICS_IP_SALT=${salt}
ANALYTICS_RETENTION_DAYS=90

(Revisar que sigan definidos: NODE_ENV=production, JWT_SECRET, DATABASE_URL, CLOUDINARY_*, SMTP_*)

=== SEENODE — Frontend (Environment, antes del build) ===
REACT_APP_SITE_URL=${site}
REACT_APP_API_URL=<tu URL backend existente>/api
# REACT_APP_GA4_MEASUREMENT_ID=G-XXXXXXXXXX

=== Redeploy manual (orden) ===
1. Backend → Redeploy (commit 379f2ad o posterior en main)
2. Logs: buscar "Tabla page_visits inicializada"
3. Frontend → Redeploy
4. Verificar:
   node scripts/verify-production-deploy.js <BACKEND_URL> ${site}

=== Search Console (manual) ===
- Verificar dominio en Google Search Console
- Enviar sitemap: <BACKEND_URL>/sitemap.xml (o proxy en Cloudflare)
- Actualizar Sitemap en frontend/public/robots.txt si usas otra URL
`);
