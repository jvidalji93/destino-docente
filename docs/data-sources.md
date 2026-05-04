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

## Formato CSV inicial del proyecto

El importador base espera un CSV local con estas columnas:

```csv
source_id;official_code;name;address;postal_code;municipality;province;autonomous_region;ownership;education_levels;latitude;longitude;phone;email;website
```

Notas:

- `education_levels` puede separar valores con `|` o `;`.
- `latitude` y `longitude` son obligatorias para importar un registro.
- Los registros sin coordenadas se saltan y se muestra un aviso.
- La fuente se indica con `--source`, por ejemplo `--source andalucia`.
- El delimitador por defecto es `;`.
- La codificacion por defecto es `utf-8-sig`.
- El importador evita duplicados con este orden:
  - `source` + `source_id`, si `source_id` existe.
  - `source` + `official_code`, si `official_code` existe.
  - `name` + `municipality` + `province`.
