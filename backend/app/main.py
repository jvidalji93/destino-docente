from fastapi import FastAPI, HTTPException

from app.db import check_postgis_connection


app = FastAPI(title="Destino Docente API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/db/health")
def database_health() -> dict[str, str]:
    try:
        postgis_version = check_postgis_connection()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database or PostGIS check failed",
        ) from exc

    return {"status": "ok", "postgis_version": postgis_version}
