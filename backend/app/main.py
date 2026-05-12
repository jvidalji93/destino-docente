from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.auth import (
    LoginRequest,
    RegisterRequest,
    login_user,
    logout_user,
    public_user,
    register_user,
    require_current_user,
)
from app.db import check_postgis_connection
from app.preferences import UserPreferencesPayload, get_user_preferences, update_user_preferences
from app.school_lists import (
    PatchSchoolListItemRequest,
    ReplaceSchoolListRequest,
    SchoolListItemPayload,
    add_school_list_item,
    delete_school_list_item,
    get_main_school_list,
    patch_school_list_item,
    replace_main_school_list,
)
from app.schools import find_nearby_schools


app = FastAPI(title="Destino Docente API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.post("/auth/register")
def auth_register(payload: RegisterRequest, response: Response) -> dict:
    return register_user(payload, response)


@app.post("/auth/login")
def auth_login(payload: LoginRequest, response: Response) -> dict:
    return login_user(payload, response)


@app.post("/auth/logout")
def auth_logout(request: Request, response: Response) -> dict[str, str]:
    return logout_user(request, response)


@app.get("/auth/me")
def auth_me(request: Request) -> dict:
    return public_user(require_current_user(request))


@app.get("/me/school-list")
def me_school_list(request: Request) -> dict:
    user = require_current_user(request)
    return get_main_school_list(user["id"])


@app.put("/me/school-list")
def me_replace_school_list(request: Request, payload: ReplaceSchoolListRequest) -> dict:
    user = require_current_user(request)
    return replace_main_school_list(user["id"], payload)


@app.post("/me/school-list/items")
def me_add_school_list_item(request: Request, payload: SchoolListItemPayload) -> dict:
    user = require_current_user(request)
    return add_school_list_item(user["id"], payload)


@app.patch("/me/school-list/items/{item_id}")
def me_patch_school_list_item(
    item_id: int,
    payload: PatchSchoolListItemRequest,
    request: Request,
) -> dict:
    user = require_current_user(request)
    return patch_school_list_item(user["id"], item_id, payload)


@app.delete("/me/school-list/items/{item_id}")
def me_delete_school_list_item(item_id: int, request: Request) -> dict:
    user = require_current_user(request)
    return delete_school_list_item(user["id"], item_id)


@app.get("/me/preferences")
def me_preferences(request: Request) -> dict:
    user = require_current_user(request)
    return get_user_preferences(user["id"])


@app.put("/me/preferences")
def me_update_preferences(request: Request, payload: UserPreferencesPayload) -> dict:
    user = require_current_user(request)
    return update_user_preferences(user["id"], payload)


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
