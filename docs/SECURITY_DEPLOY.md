# Despliegue seguro — Herastats

## Checklist pre-producción

### Secretos y credenciales

- [ ] Rotar **Cloudinary** y **JWT** si algún secreto estuvo en Git (`backend/env.example` eliminado; revisar historial con `git log -p`).
- [ ] `JWT_SECRET`: mínimo 32 caracteres aleatorios (`openssl rand -base64 48`). Distinto por entorno.
- [ ] `HERASTATS_SEED_DEFAULT_SUPERUSER=false` en producción (por defecto el código ya no siembra en prod sin opt-in).
- [ ] No commitear `.env`, `.env.test`, `.env.development.local`.

### Backend

- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN=https://tu-frontend.com` (sin `*` con credenciales)
- [ ] HTTPS delante del API (reverse proxy)
- [ ] SMTP configurado; no depender de enlaces de contraseña en consola
- [ ] `MIN_PASSWORD_LENGTH=10` (opcional, default en prod)

### Frontend

- [ ] `REACT_APP_API_URL=https://api.tudominio.com/api` en el build (`npm run build` falla si falta)
- [ ] `REACT_APP_GOOGLE_MAPS_API_KEY` con restricción por referrer en Google Cloud
- [ ] No publicar carpeta `build/` con claves embebidas sin restricciones

### Operación

- [ ] Desactivar registro público (bloqueado en `NODE_ENV=production`)
- [ ] Revisar usuarios bootstrap; cambiar contraseñas iniciales
- [ ] Rate limit activo en `/api/auth/login` y `/api/auth/set-password`

## Variables recomendadas

| Variable | Producción |
|----------|------------|
| `JWT_SECRET` | Obligatorio, ≥16 chars |
| `JWT_EXPIRES_IN` | Opcional, ej. `8h` |
| `HERASTATS_SEED_DEFAULT_SUPERUSER` | `false` |
| `CORS_ORIGIN` | Dominio(s) del SPA |
| `REACT_APP_API_URL` | URL pública del API |

## Seeds en desarrollo

Los usuarios bootstrap **requieren** contraseña por env:

```env
TEST_DEFAULT_SUPERUSER_EMAIL=admin@localhost
TEST_DEFAULT_SUPERUSER_PASSWORD=contraseña_segura_de_al_menos_10_caracteres
TEST_DEFAULT_ADMIN_PASSWORD=otra_contraseña_segura
```

## Respuesta ante filtración de credenciales

1. Rotar JWT → invalida todas las sesiones.
2. Rotar Cloudinary API secret.
3. Rotar clave Google Maps y acotar referrers.
4. Auditar logs de acceso y cuentas admin.
5. Purgar secretos del historial Git si aplica.

## CI

El workflow `.github/workflows/security-ci.yml` ejecuta tests y `scripts/check-secrets.js`.

## Seenode

Guía paso a paso: [SEENODE_DEPLOY.md](SEENODE_DEPLOY.md). Plantillas de env: `backend/.env.seenode.example`, `frontend/.env.seenode.example`.
