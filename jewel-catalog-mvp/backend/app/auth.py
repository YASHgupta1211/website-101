"""Firebase identity verification for all user-owned API resources."""
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    uid: str
    email: str = ''
    name: str = ''
    phone: str = ''
    email_verified: bool = False


@lru_cache(maxsize=1)
def firebase_app():
    project_id = os.getenv('FIREBASE_PROJECT_ID', '').strip()
    if not project_id:
        raise HTTPException(status_code=503, detail='Account sign-in is not configured yet.')
    if os.getenv('APP_ENV') == 'production' and os.getenv('FIREBASE_AUTH_EMULATOR_HOST'):
        raise HTTPException(status_code=503, detail='Authentication configuration is invalid.')
    try:
        return firebase_admin.get_app('jewel-studio')
    except ValueError:
        try:
            return firebase_admin.initialize_app(
                credentials.ApplicationDefault(), {'projectId': project_id},
                name='jewel-studio',
            )
        except Exception:
            raise HTTPException(status_code=503, detail='Account verification is temporarily unavailable.')


def require_user(token: HTTPAuthorizationCredentials | None = Depends(bearer)) -> AuthUser:
    if token is None or token.scheme.lower() != 'bearer':
        raise HTTPException(status_code=401, detail='Sign in to continue.', headers={'WWW-Authenticate': 'Bearer'})
    app = firebase_app()
    try:
        claims = auth.verify_id_token(
            token.credentials, app=app, check_revoked=True, clock_skew_seconds=30,
        )
    except (auth.InvalidIdTokenError, auth.RevokedIdTokenError, auth.UserDisabledError, ValueError):
        raise HTTPException(status_code=401, detail='Your session has expired. Sign in again.', headers={'WWW-Authenticate': 'Bearer'})
    except Exception:
        raise HTTPException(status_code=503, detail='Account verification is temporarily unavailable.')
    uid = claims.get('uid')
    if not isinstance(uid, str) or not uid:
        raise HTTPException(status_code=401, detail='Invalid account session.')
    return AuthUser(
        uid=uid, email=claims.get('email') or '', name=claims.get('name') or '',
        phone=claims.get('phone_number') or '',
        email_verified=claims.get('email_verified') is True,
    )


def require_verified_user(user: AuthUser = Depends(require_user)) -> AuthUser:
    if not user.email_verified and not user.phone:
        raise HTTPException(status_code=403, detail='Verify your email address before using the studio.')
    return user
