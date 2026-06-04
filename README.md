# HeraStats - Sistema de Login con React y PostgreSQL

Un sistema de autenticación completo con React en el frontend y Node.js + PostgreSQL en el backend.

## Seguridad y despliegue

Ver [docs/SECURITY_DEPLOY.md](docs/SECURITY_DEPLOY.md) para checklist de producción, seeds y rotación de credenciales.

**Despliegue en Seenode:** guía completa en [docs/SEENODE_DEPLOY.md](docs/SEENODE_DEPLOY.md).

## 🚀 Características

- **Frontend**: React con diseño moderno y responsivo
- **Backend**: Node.js con Express
- **Base de datos**: PostgreSQL
- **Autenticación**: JWT (JSON Web Tokens)
- **Seguridad**: Contraseñas encriptadas con bcrypt
- **Validación**: Validación completa en frontend y backend

## 📋 Prerrequisitos

- Node.js (versión 16 o superior)
- PostgreSQL (versión 12 o superior)
- npm o yarn

## 🛠️ Instalación

### 1. Configurar la base de datos

```sql
-- Crear la base de datos
CREATE DATABASE herastats;

-- Crear un usuario (opcional)
CREATE USER herastats_user WITH PASSWORD 'tu_contraseña';
GRANT ALL PRIVILEGES ON DATABASE herastats TO herastats_user;
```

### 2. Configurar el backend

```bash
# Navegar al directorio del backend
cd backend

# Instalar dependencias
npm install

# Copiar el archivo de configuración
cp .env.example .env

# Editar el archivo .env con tus datos de PostgreSQL
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=herastats
# DB_USER=tu_usuario
# DB_PASSWORD=tu_contraseña
# JWT_SECRET=  # openssl rand -base64 48
# HERASTATS_SEED_DEFAULT_SUPERUSER=false  # recomendado fuera de dev local

# Iniciar el servidor
npm run dev
```

### 3. Configurar el frontend

```bash
# Navegar al directorio del frontend
cd fronted

# Instalar dependencias
npm install

# Iniciar la aplicación
npm start
```

## 🎯 Uso

1. **Registro**: Ve a `http://localhost:3000` y crea una nueva cuenta
2. **Login**: Inicia sesión con tus credenciales
3. **Dashboard**: Accede al panel principal después del login

## 📁 Estructura del proyecto

```
herastats/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js
│   │   ├── controllers/
│   │   │   └── authController.js
│   │   ├── models/
│   │   │   └── User.js
│   │   ├── routes/
│   │   │   └── auth.js
│   │   └── server.js
│   └── package.json
└── fronted/
    ├── src/
    │   ├── components/
    │   │   ├── LoginForm.js
    │   │   └── RegisterForm.js
    │   ├── hooks/
    │   │   └── useAuth.js
    │   ├── pages/
    │   │   ├── LoginPage.js
    │   │   └── Dashboard.js
    │   ├── services/
    │   │   └── authService.js
    │   ├── styles/
    │   │   └── index.css
    │   ├── App.js
    │   └── index.js
    └── package.json
```

## 🔧 API Endpoints

### Autenticación

- `POST /api/auth/register` - Registrar nuevo usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/verify` - Verificar token

### Ejemplo de uso de la API

```javascript
// Registro
const response = await fetch('http://localhost:5000/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Juan Pérez',
    email: 'juan@email.com',
    password: 'mi_contraseña'
  })
});

// Login
const response = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'juan@email.com',
    password: 'mi_contraseña'
  })
});
```

## 🛡️ Seguridad

- Contraseñas encriptadas con bcrypt
- Tokens JWT con expiración
- Validación de entrada en frontend y backend
- CORS configurado para desarrollo
- Headers de seguridad

## 🎨 Características del Frontend

- Diseño moderno y responsivo
- Formularios con validación en tiempo real
- Manejo de estados de carga
- Mensajes de error y éxito
- Navegación protegida
- Context API para estado global

## 🚀 Despliegue

Para producción, asegúrate de:

1. Cambiar el `JWT_SECRET` por una clave segura
2. Configurar variables de entorno de producción
3. Usar HTTPS
4. Configurar CORS para tu dominio
5. Implementar rate limiting
6. Usar un proxy reverso (nginx)

## 📝 Notas

- El sistema crea automáticamente la tabla de usuarios
- Los tokens JWT expiran en 24 horas
- Las contraseñas deben tener al menos 6 caracteres
- El sistema incluye validación de email

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request
