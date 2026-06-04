#!/usr/bin/env node
/**
 * Genera valores seguros para variables de entorno de producción.
 * Uso: node scripts/generate-secrets.js
 */
const crypto = require('crypto');

const jwtSecret = crypto.randomBytes(48).toString('base64');

console.log('# Copia estos valores en Seenode (Environment) — no los commitees\n');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log('');
console.log('# Completar manualmente con tus credenciales reales:');
console.log('# CLOUDINARY_CLOUD_NAME');
console.log('# CLOUDINARY_API_KEY');
console.log('# CLOUDINARY_API_SECRET');
console.log('# SMTP_HOST');
console.log('# SMTP_USER');
console.log('# SMTP_PASS');
console.log('# SMTP_FROM');
