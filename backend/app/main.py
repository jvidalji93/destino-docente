from fastapi import FastAPI, HTTPException

from app.db import check_database_connection


app = FastAPI(title="Destino Docente API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/db/health")
def database_health() -> dict[str, str]:
    try:
        is_connected = check_database_connection()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        ) from exc

    if not is_connected:
        raise HTTPException(status_code=503, detail="Database check failed")

    return {"status": "ok"}
