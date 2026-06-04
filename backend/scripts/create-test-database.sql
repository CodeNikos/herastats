-- Base de datos dedicada al ambiente de pruebas / staging (Herastats).
-- Ejecutar conectado como superusuario de PostgreSQL, por ejemplo:
--   psql -U postgres -h localhost -f scripts/create-test-database.sql
--
-- Ajusta el nombre de usuario y contraseña según tu instalación.

CREATE DATABASE herastats_test
  WITH ENCODING 'UTF8';

-- Opcional: dar permisos al mismo usuario que usa desarrollo local.
-- GRANT ALL PRIVILEGES ON DATABASE herastats_test TO tu_usuario_app;
