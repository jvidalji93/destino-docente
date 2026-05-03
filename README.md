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

La base de datos queda disponible en `localhost:5433` por defecto. Dentro del contenedor PostgreSQL sigue escuchando en el puerto `5432`.

### Parar la base de datos

```bash
docker compose --env-file .env -f infra/docker-compose.yml down
```

Para eliminar también los datos locales persistidos:

```bash
docker compose --env-file .env -f infra/docker-compose.yml down -v
```

No subas el archivo `.env` al repositorio. Usa `.env.example` como referencia de las variables necesarias.

## Backend local

El backend usa FastAPI y lee la configuracion de base de datos desde las variables definidas en `.env`.

### Requisitos

- Python 3.11 o superior
- Base de datos local levantada con Docker Compose

### Instalar dependencias

Desde la raiz del repositorio:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

En macOS o Linux:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Arrancar el backend

Con la base de datos local en marcha, ejecuta desde `backend`:

```bash
uvicorn app.main:app --reload
```

La API queda disponible por defecto en `http://127.0.0.1:8000`.

Endpoints iniciales:

- `GET /health` comprueba que la API responde.
- `GET /db/health` comprueba que la API puede conectar con PostgreSQL.
