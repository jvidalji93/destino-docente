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

El backend usa FastAPI y lee la configuracion de base de datos desde las variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST` y `POSTGRES_PORT` definidas en `.env`.

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

### Probar endpoints

En otra terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/db/health
```

En macOS o Linux:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/db/health
```

Endpoints iniciales:

- `GET /health` comprueba que la API responde.
- `GET /db/health` comprueba que la API puede conectar con PostgreSQL y que PostGIS esta disponible.

### Inicializar base de datos

Con la base de datos local en marcha y el entorno virtual activado, ejecuta desde `backend`:

```powershell
$env:PYTHONPATH = "."
python -m scripts.init_db
```

Este script habilita PostGIS si no existe, crea la tabla `schools` y crea el indice espacial sobre `geom`.

### Cargar datos de prueba

Desde `backend`:

```powershell
$env:PYTHONPATH = "."
python -m scripts.seed_schools
```

El seed carga 5 centros educativos de prueba alrededor de Madrid.

### Buscar centros cercanos

Arranca FastAPI y prueba el endpoint:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/schools/nearby?lat=40.4168&lng=-3.7038&radius_km=5"
```

En macOS o Linux:

```bash
curl "http://127.0.0.1:8000/schools/nearby?lat=40.4168&lng=-3.7038&radius_km=5"
```

La respuesta incluye `id`, `name`, `address`, `municipality`, `province`, `ownership`, `education_levels`, `latitude`, `longitude` y `distance_km`, ordenados por distancia ascendente.

## Frontend local

El frontend usa React, Vite y Leaflet para consultar `GET /schools/nearby` y mostrar los centros en un mapa.

### Requisitos

- Node.js 20 o superior
- Backend local arrancado en `http://127.0.0.1:8000`

### Instalar dependencias

Desde la raiz del repositorio:

```powershell
cd frontend
npm install
```

### Arrancar el frontend

Desde `frontend`:

```powershell
npm run dev
```

Vite mostrara la URL local, normalmente `http://127.0.0.1:5173` o `http://localhost:5173`.

La pantalla permite introducir latitud, longitud y radio en kilometros. Al pulsar `Buscar`, llama a `http://127.0.0.1:8000/schools/nearby`, dibuja los centros devueltos como puntos en Leaflet y muestra una tabla con nombre, municipio, titularidad, niveles educativos y distancia.
