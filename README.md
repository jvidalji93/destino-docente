# Destino Docente

Aplicacion en desarrollo para consultar centros educativos cercanos usando PostgreSQL/PostGIS, FastAPI, React, Vite y Leaflet.

## Requisitos Previos En Windows

Instala y comprueba que tienes disponibles estos comandos en PowerShell:

- Git: `git --version`
- Docker Desktop: `docker --version`
- Python 3.11 o superior: `python --version`
- Node.js 20 o superior: `node --version`

Docker Desktop debe estar arrancado antes de levantar la base de datos.

## Primer Arranque Local

Los comandos siguientes asumen que estas en la raiz del repositorio.

### 1. Crear el archivo `.env`

El proyecto no versiona `.env`. Crea tu copia local desde la plantilla:

```powershell
Copy-Item .env.example .env
```

Valores locales por defecto:

- Base de datos: `destino_docente`
- Usuario: `destino`
- Host: `localhost`
- Puerto local: `5433`

Si cambias `POSTGRES_PORT`, cambia tambien el puerto de `DATABASE_URL` en tu `.env`.

### 2. Levantar PostgreSQL/PostGIS

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d
```

Comprueba que el contenedor esta en marcha:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml ps
```

La base de datos queda disponible desde Windows en `localhost:5433`. Dentro del contenedor PostgreSQL escucha en `5432`.

### 3. Instalar dependencias del backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 4. Inicializar la base de datos

Desde `backend`, con el entorno virtual activado:

```powershell
$env:PYTHONPATH = "."
python -m scripts.init_db
```

Este script habilita PostGIS si no existe, crea la tabla `schools` y crea el indice espacial sobre `geom`.

### 5. Cargar datos de prueba

Desde `backend`, con el entorno virtual activado:

```powershell
$env:PYTHONPATH = "."
python -m scripts.seed_schools
```

El seed carga 5 centros educativos de prueba alrededor de Madrid.

### 6. Arrancar el backend

Desde `backend`, con el entorno virtual activado:

```powershell
uvicorn app.main:app --reload
```

La API queda disponible en:

```text
http://127.0.0.1:8000
```

Puedes probarla en otra terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/db/health
Invoke-RestMethod "http://127.0.0.1:8000/schools/nearby?lat=40.4168&lng=-3.7038&radius_km=5"
```

### 7. Instalar dependencias del frontend

Abre otra terminal en la raiz del repositorio:

```powershell
cd frontend
npm install
```

### 8. Arrancar el frontend

Desde `frontend`:

```powershell
npm run dev
```

Vite mostrara la URL local, normalmente:

```text
http://127.0.0.1:5173
```

## Probar La App De Extremo A Extremo

1. Docker Desktop esta arrancado.
2. PostgreSQL/PostGIS esta levantado con Docker Compose.
3. La base de datos fue inicializada con `python -m scripts.init_db`.
4. Los datos de prueba fueron cargados con `python -m scripts.seed_schools`.
5. El backend esta arrancado en `http://127.0.0.1:8000`.
6. El frontend esta arrancado en `http://127.0.0.1:5173`.
7. Abre el frontend en el navegador.
8. Usa los valores por defecto de Madrid o pulsa `Usar mi ubicacion`.
9. Pulsa `Buscar`.

Deberias ver centros educativos como puntos en el mapa y tambien en la tabla. La tabla permite ordenar resultados y descargar el CSV de los resultados visibles.

## Importar Datos Desde CSV

Todavia no hay una fuente abierta concreta implementada. Las fuentes candidatas y el formato base se documentan en `docs/data-sources.md`.

El importador base lee un CSV local con estas columnas:

```csv
name,address,municipality,province,autonomous_region,ownership,education_levels,latitude,longitude
```

Desde `backend`, con el entorno virtual activado:

```powershell
$env:PYTHONPATH = "."
python -m scripts.import_schools_csv ..\data\schools.csv
```

Los registros sin `latitude` o `longitude` se saltan y muestran un aviso. El importador no borra datos existentes; si quieres reemplazar todo el contenido de `schools`, usa la opcion explicita `--truncate`:

```powershell
$env:PYTHONPATH = "."
python -m scripts.import_schools_csv ..\data\schools.csv --truncate
```

## Comandos Utiles

Parar la base de datos:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml down
```

Parar la base de datos y borrar los datos locales:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml down -v
```

Salir del entorno virtual de Python:

```powershell
deactivate
```

## Notas

- No subas `.env` al repositorio.
- No hay login ni busqueda por direccion todavia.
- El frontend solo llama al backend local en `http://127.0.0.1:8000`.
