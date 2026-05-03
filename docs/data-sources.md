# Fuentes abiertas de datos

Este documento sirve para registrar posibles fuentes abiertas de centros educativos antes de implementar un importador concreto.

## Criterios para elegir fuentes

- Licencia clara y compatible con reutilizacion.
- Datos descargables en formatos abiertos, como CSV, JSON o GeoJSON.
- Identificacion del centro, nombre y direccion.
- Municipio, provincia y comunidad autonoma.
- Coordenadas o informacion suficiente para geocodificar.
- Titularidad y niveles educativos, cuando esten disponibles.
- Fecha de actualizacion o version del conjunto de datos.

## Fuentes candidatas

Pendiente de evaluar. Posibles lugares donde buscar:

- Portales de datos abiertos de comunidades autonomas.
- Portales municipales de datos abiertos.
- Portal de datos abiertos del Gobierno de Espana.
- Catalogos estadisticos o educativos publicados por administraciones publicas.

## Formato CSV base del proyecto

El importador base espera un CSV local con estas columnas:

```csv
name,address,municipality,province,autonomous_region,ownership,education_levels,latitude,longitude
```

Notas:

- `education_levels` puede separar valores con `|` o `;`.
- `latitude` y `longitude` son obligatorias para importar un registro.
- Los registros sin coordenadas se saltan y se muestra un aviso.
- El importador no borra datos existentes salvo que se ejecute con `--truncate`.
