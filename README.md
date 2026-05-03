# Destino Docente

Herramienta en desarrollo para trabajar con datos de centros educativos y su componente geográfica.

## Infraestructura local

El proyecto usa PostgreSQL con PostGIS para desarrollo local.

### Requisitos

- Docker
- Docker Compose

### Arrancar la base de datos

1. Crea tu archivo local de variables a partir de la plantilla:

   ```powershell
   Copy-Item .env.example .env
   ```

   En macOS o Linux:

   ```bash
   cp .env.example .env
   ```

2. Cambia los valores de `.env` si necesitas otro usuario, puerto o contraseña local.

3. Levanta PostgreSQL con PostGIS:

   ```bash
   docker compose --env-file .env -f infra/docker-compose.yml up -d
   ```

4. Comprueba el estado del contenedor:

   ```bash
   docker compose --env-file .env -f infra/docker-compose.yml ps
   ```

La base de datos queda disponible en `localhost:5432` por defecto.

### Parar la base de datos

```bash
docker compose --env-file .env -f infra/docker-compose.yml down
```

Para eliminar también los datos locales persistidos:

```bash
docker compose --env-file .env -f infra/docker-compose.yml down -v
```

No subas el archivo `.env` al repositorio. Usa `.env.example` como referencia de las variables necesarias.
