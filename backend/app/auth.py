import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

import psycopg
from fastapi import HTTPException, Request, Response, status
from psycopg.rows import dict_row
from pwdlib import PasswordHash
from pydantic import BaseModel

from app.config import (
    get_database_url,
    get_session_cookie_name,
    get_session_cookie_samesite,
    get_session_cookie_secure,
    get_session_expire_days,
)


password_hash = PasswordHash.recommended()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


def public_user(row: dict) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "is_active": row["is_active"],
    }


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> None:
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email")


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_cookie_settings() -> dict:
    max_age = get_session_expire_days() * 24 * 60 * 60
    return {
        "key": get_session_cookie_name(),
        "httponly": True,
        "secure": get_session_cookie_secure(),
        "samesite": get_session_cookie_samesite(),
        "max_age": max_age,
    }


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        value=token,
        **session_cookie_settings(),
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=get_session_cookie_name(),
        secure=get_session_cookie_secure(),
        samesite=get_session_cookie_samesite(),
    )


def create_session(connection: psycopg.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hash_session_token(token)
    expires_at = datetime.now(UTC) + timedelta(days=get_session_expire_days())

    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO user_sessions (user_id, session_token_hash, expires_at)
            VALUES (%s, %s, %s)
            """,
            (user_id, token_hash, expires_at),
        )

    return token


def get_user_by_session(request: Request) -> dict | None:
    token = request.cookies.get(get_session_cookie_name())
    if not token:
        return None

    token_hash = hash_session_token(token)
    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    users.id,
                    users.email,
                    users.display_name,
                    users.is_active
                FROM user_sessions
                JOIN users ON users.id = user_sessions.user_id
                WHERE user_sessions.session_token_hash = %s
                    AND user_sessions.expires_at > NOW()
                    AND users.is_active = TRUE
                """,
                (token_hash,),
            )
            user = cursor.fetchone()

            if user:
                cursor.execute(
                    """
                    UPDATE user_sessions
                    SET last_seen_at = NOW()
                    WHERE session_token_hash = %s
                    """,
                    (token_hash,),
                )

        connection.commit()

    return dict(user) if user else None


def require_current_user(request: Request) -> dict:
    user = get_user_by_session(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return user


def register_user(payload: RegisterRequest, response: Response) -> dict:
    email = normalize_email(payload.email)
    validate_email(email)
    validate_password(payload.password)

    display_name = payload.display_name.strip() if payload.display_name else None

    try:
        with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO users (email, password_hash, display_name)
                    VALUES (%s, %s, %s)
                    RETURNING id, email, display_name, is_active
                    """,
                    (email, password_hash.hash(payload.password), display_name),
                )
                user = cursor.fetchone()
                token = create_session(connection, user["id"])

            connection.commit()
    except psycopg.errors.UniqueViolation as exc:
        raise HTTPException(status_code=409, detail="Email already registered") from exc

    set_session_cookie(response, token)
    return public_user(user)


def login_user(payload: LoginRequest, response: Response) -> dict:
    email = normalize_email(payload.email)
    validate_email(email)

    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, email, password_hash, display_name, is_active
                FROM users
                WHERE email = %s
                """,
                (email,),
            )
            user = cursor.fetchone()

            if not user or not user["is_active"] or not password_hash.verify(
                payload.password,
                user["password_hash"],
            ):
                raise HTTPException(status_code=401, detail="Invalid email or password")

            token = create_session(connection, user["id"])

        connection.commit()

    set_session_cookie(response, token)
    return public_user(user)


def logout_user(request: Request, response: Response) -> dict[str, str]:
    token = request.cookies.get(get_session_cookie_name())

    if token:
        token_hash = hash_session_token(token)
        with psycopg.connect(get_database_url()) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM user_sessions WHERE session_token_hash = %s",
                    (token_hash,),
                )
            connection.commit()

    clear_session_cookie(response)
    return {"status": "ok"}
