# Ambientes: desarrollo local y pruebas

Herastats puede usar **dos bases PostgreSQL** y **dos instancias de API** sin mezclar datos: una para uso habitual (“producción local”) y otra para pruebas.

## Resumen

| Aspecto        | Producción local (habitual) | Pruebas / staging local      |
|----------------|-----------------------------|------------------------------|
| Base de datos  | `herastats` (ejemplo)       | `herastats_test`             |
| API            | `http://localhost:5000`     | `http://localhost:5001`      |
| Env backend    | `backend/.env`              | `backend/.env.test`          |
| Frontend       | Selector **API → Producción** o default :5000 | Selector **API → Pruebas** o script / `.env` hacia :5001 |

## 1. Crear la base de datos de prueba

Ejecutar como superusuario de PostgreSQL, por ejemplo:

```bash
psql -U postgres -h localhost -f backend/scripts/create-test-database.sql
```

Ajusta permisos (`GRANT`) para el mismo `DB_USER` que uses en `.env`.

## 2. Configurar el backend de pruebas

```bash
cd backend
copy .env.test.example .env.test
# Editar .env.test: DB_*, JWT_SECRET distinto, credenciales Cloudinary/SMTP si aplica
```

Arranque:

```bash
npm run start:test
```

- Usa `ENV_FILE=.env.test` y el puerto recomendado **5001** (definido en la plantilla).

Desarrollo con recarga:

```bash
npm run dev:test
```

**Producción local** sigue siendo:

```bash
npm start
# o npm run dev
```

(con `backend/.env` por defecto).

### Variables importantes

- **`JWT_SECRET`**: distinto entre `.env` y `.env.test` para no reutilizar tokens.
- **`CORS_ORIGIN`**: orígenes permitidos, separados por coma. Por defecto en código: `http://localhost:3000`. Si corres React en otro puerto, añádelo aquí.
- **`CLOUDINARY_UPLOAD_PREFIX`**: en test/staging (ej. `staging`) las imágenes van a `staging/herastats/...` en Cloudinary.
- Ver listado completo en [backend/.env.example](../backend/.env.example).

### Seeds de usuarios (desarrollo / test)

**En producción (`NODE_ENV=production`)** el seed de superusuario está **desactivado** salvo `HERASTATS_SEED_DEFAULT_SUPERUSER=true` (no recomendado en servidores públicos). Ver [SECURITY_DEPLOY.md](SECURITY_DEPLOY.md).

En desarrollo, si el seed está activo, **debes definir contraseñas** en el `.env` (no hay contraseñas por defecto en el código):

| Variable | Efecto |
|----------|--------|
| `HERASTATS_SEED_DEFAULT_SUPERUSER=false` | No crea superusuario al arrancar (dev). |
| `HERASTATS_SEED_DEFAULT_SUPERUSER=true` | Opt-in en producción (evitar en prod real). |
| `TEST_DEFAULT_SUPERUSER_EMAIL` | Email del bootstrap (default `bootstrap@localhost`). |
| `TEST_DEFAULT_SUPERUSER_PASSWORD` | **Obligatoria** si el seed corre (mín. según `MIN_PASSWORD_LENGTH`). |
| `TEST_DEFAULT_SUPERUSER_ROLE` | Rol (`superuser` por defecto). |

### Usuario admin solo en entorno test

Si `NODE_ENV` **no** es `production` y `DB_NAME` **termina en `_test`**, se puede crear un admin de prueba si el correo no existe y defines `TEST_DEFAULT_ADMIN_PASSWORD`:

| Variable | Efecto |
|----------|--------|
| `HERASTATS_SEED_DEFAULT_TEST_ADMIN=false` | Desactiva el seed del admin. |
| `HERASTATS_SEED_DEFAULT_TEST_ADMIN=true` | Fuerza el seed aunque `DB_NAME` no termine en `_test`. |
| `TEST_DEFAULT_ADMIN_EMAIL` | Email (default `admin@localhost`). |
| `TEST_DEFAULT_ADMIN_PASSWORD` | **Obligatoria** si el seed corre. |
| `TEST_DEFAULT_ADMIN_ROLE` | `admin` \| `superuser` \| `anotador`. |

## 3. Configurar el frontend contra el API de pruebas

### Selector en pantalla (recomendado en desarrollo)

Con **`npm start`**, en la esquina inferior derecha aparece el control **«Entorno API»** (solo entorno `development`):

- Si el perfil elegido es **Pruebas** (rutas bajo `/test/...`), el control **se muestra siempre**, aunque hayas cerrado sesión al cambiar de entorno, para poder volver a Producción.
- Con perfil **Producción** solo lo ven **administrador** y **superusuario** (no **anotador** ni usuarios sin iniciar sesión).

- **Producción** fuerza `http://localhost:5000/api` (configurable con `REACT_APP_DEV_API_LOCAL`).
- **Pruebas** fuerza `http://localhost:5001/api` (configurable con `REACT_APP_DEV_API_TEST`).

Cuando eliges **Pruebas**, la barra del navegador usa el prefijo **`/test`** en todas las rutas de la SPA (por ejemplo `http://localhost:3000/test/home`). Con **Producción** las rutas van sin ese prefijo (`/home`). Es solo el enrutado del frontend; el puerto del API viene de las URLs base anteriores.

Es la misma aplicación compilada para producción respecto al código; cambia la URL visible y el backend al que llaman las peticiones. **Al cambiar se borra el token** y se navega recargando (los JWT no son intercambiables entre entornos).

Utilidades relacionadas en el código: [`frontend/src/config/appRoutes.js`](../frontend/src/config/appRoutes.js) (`appPath`, `appHref`) para `<a>` y `window.location` que no pasan por el `basename` de React Router; `navigate()` y `<Link>` ya respetan el prefijo automáticamente.

### Sin el selector (archivo env o script)

**Opción con script:**

```bash
cd frontend
npm install   # la primera vez, para instalar cross-env
npm run start:test-api
```

**Opción con archivo env:** copiar la plantilla y usar `npm start`:

```bash
cd frontend
copy .env.development.local.example .env.development.local
npm start
```

El valor debe ser exactamente `REACT_APP_API_URL=http://localhost:5001/api` (incluye `/api`).

Para volver al API en **5000**, usa solo `npm start` sin `.env.development.local` y sin `start:test-api`, y fuerza perfil **Producción** en el selector si estabas en Pruebas.

### Si ves `net::ERR_CONNECTION_REFUSED`

Suele ser un **desajuste de puerto**: el front por defecto llama a `http://localhost:5000/api`. Si solo tienes corriendo `npm run start:test` (API en **5001**), el puerto 5000 no tiene servidor y el navegador muestra conexión rechazada. Solución: arranca también `npm start` en el backend **o** usa `npm run start:test-api` / `.env.development.local` apuntando al **5001**.

## 4. Flujo típico

1. Terminal A: `cd backend && npm run start:test` (y/o `npm start` para API en 5000)
2. Terminal B: `cd frontend && npm start`
3. Usar el control **API** (abajo a la derecha) para elegir **Local** o **Pruebas**, o dejar **solo .env**.
4. Navegar a `http://localhost:3000` e iniciar sesión en el entorno elegido.

## 5. CI / tests automatizados (opcional)

Para integración continua se puede usar la misma base `herastats_test` (u otra `herastats_ci`) con un `.env` efímero y `JWT_SECRET` solo para CI. No ejecutar tests contra la base de datos de producción.
