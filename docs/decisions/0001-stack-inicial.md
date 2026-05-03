# 0001. Stack inicial

## Estado

Aceptada.

## Contexto

Destino Docente necesita almacenar datos relacionales de centros educativos y trabajar con información geográfica, como coordenadas, áreas de influencia, distancias y consultas por ubicación. El proyecto también necesita una API clara para exponer esos datos y una interfaz web interactiva con mapas.

## Decisión

Usaremos PostgreSQL con PostGIS como base de datos, FastAPI como framework de backend y React con Leaflet para el frontend.

## Motivos

### PostgreSQL + PostGIS

- PostgreSQL es una base de datos relacional sólida, ampliamente soportada y cómoda para desarrollo local.
- PostGIS añade tipos y funciones geoespaciales nativas, necesarias para consultas por distancia, intersecciones, puntos, polígonos y análisis de proximidad.
- Permite mantener en una misma base los datos tabulares y geográficos, evitando duplicar lógica espacial en la aplicación.
- Tiene buen soporte desde Python y encaja bien con futuras migraciones, scripts de carga y análisis de datos.

### FastAPI

- FastAPI permite construir APIs HTTP de forma rápida, tipada y con documentación automática.
- Encaja bien con Python, que es una buena opción para carga, limpieza y procesamiento de datos.
- Su modelo basado en tipos facilita validar entradas y salidas desde el inicio del proyecto.
- Es ligero para desarrollo local y puede crecer sin obligar a introducir complejidad prematura.

### React + Leaflet

- React facilita construir una interfaz web modular e interactiva.
- Leaflet es una librería madura y ligera para mapas web.
- La combinación React + Leaflet permite mostrar centros, capas, filtros y resultados geográficos sin depender de soluciones pesadas.
- Es una base suficiente para prototipar rápido y seguir evolucionando la experiencia de usuario.

## Consecuencias

- El entorno local necesita Docker para levantar PostgreSQL con PostGIS de forma reproducible.
- El backend y el frontend se implementarán más adelante, manteniendo por ahora solo la infraestructura inicial.
- Las decisiones futuras de modelos de datos, migraciones y carga de información deberán tener en cuenta las capacidades geoespaciales de PostGIS.
