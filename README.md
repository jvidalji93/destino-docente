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

### Inspeccionar la base de datos con Adminer

El entorno local incluye Adminer solo para desarrollo. Accede desde el navegador:

```text
http://localhost:8081
```

Datos de conexion:

- Sistema: `PostgreSQL`
- Servidor: `db`
- Usuario: valor de `POSTGRES_USER` en `.env`
- Contrasena: valor de `POSTGRES_PASSWORD` en `.env`
- Base de datos: valor de `POSTGRES_DB` en `.env`

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

Si ya tenias una base de datos creada antes de cambios de esquema, vuelve a ejecutar este comando. El script es idempotente y añade columnas e indices nuevos sin borrar datos existentes.

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
8. Usa los valores por defecto de Madrid o pulsa `Usar mi ubicación`.
9. Pulsa `Buscar`.

Deberias ver centros educativos como puntos en el mapa y tambien en la tabla. La tabla permite ordenar resultados y descargar el CSV de los resultados visibles.

## Importar Datos Desde CSV

Las fuentes abiertas candidatas y el formato base se documentan en `docs/data-sources.md`.

### Andalucía

Fuente oficial: Directorio de centros docentes no universitarios de Andalucía, Junta de Andalucía, curso 2024/2025.

Descarga el CSV original desde la raiz del repositorio:

```powershell
New-Item -ItemType Directory -Force data\raw\andalucia
Invoke-WebRequest -Uri "https://www.juntadeandalucia.es/datosabiertos/portal/dataset/e039df22-4b82-4d0d-9884-0ab5952e24e4/resource/b5924e81-0b53-4418-9d93-b1f39ba1ef65/download/da_centros.csv" -OutFile "data\raw\andalucia\da_centros.csv"
```

Si ya tienes `data\raw\andalucia\da_centros.csv`, transforma el CSV oficial al formato normalizado desde `backend`:

```powershell
$env:PYTHONPATH = "."
python -m scripts.transform_andalucia_schools
```

Para transformar solo una provincia:

```powershell
$env:PYTHONPATH = "."
python -m scripts.transform_andalucia_schools --province Almería
```

El CSV normalizado se genera en:

```text
data/processed/andalucia/andalucia_schools_normalized.csv
```

Importa el CSV normalizado:

```powershell
$env:PYTHONPATH = "."
python -m scripts.import_schools_csv ..\data\processed\andalucia\andalucia_schools_normalized.csv --source andalucia --dry-run
python -m scripts.import_schools_csv ..\data\processed\andalucia\andalucia_schools_normalized.csv --source andalucia
```

### Importador genérico

El importador generico lee un CSV local con estas columnas iniciales:

```csv
source_id;official_code;name;address;postal_code;municipality;province;autonomous_region;ownership;education_levels;latitude;longitude;phone;email;website
```

Desde `backend`, con el entorno virtual activado:

```powershell
$env:PYTHONPATH = "."
python -m scripts.import_schools_csv ..\data\raw\andalucia\centros.csv --source andalucia
```

Si la base ya existia antes de preparar el importador, ejecuta primero:

```powershell
$env:PYTHONPATH = "."
python -m scripts.init_db
```

Opciones utiles:

```powershell
python -m scripts.import_schools_csv ..\data\raw\andalucia\centros.csv --source andalucia --dry-run
python -m scripts.import_schools_csv ..\data\raw\andalucia\centros.csv --source andalucia --encoding utf-8-sig --delimiter ";"
```

Los registros sin `latitude` o `longitude` validas se saltan y muestran un aviso. El importador no borra datos existentes; si encuentra duplicados, actualiza la fila existente. El criterio de duplicado es `source + source_id`, despues `source + official_code`, y por ultimo `name + municipality + province`.

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
- No hay login ni búsqueda por dirección todavía.
- El frontend solo llama al backend local en `http://127.0.0.1:8000`.
