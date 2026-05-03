from fastapi import FastAPI, HTTPException, Query

from app.db import check_postgis_connection
from app.schools import find_nearby_schools


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


@app.get("/schools/nearby")
def schools_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(..., gt=0, le=100),
) -> list[dict]:
    try:
        return find_nearby_schools(lat=lat, lng=lng, radius_km=radius_km)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not query nearby schools",
        ) from exc
