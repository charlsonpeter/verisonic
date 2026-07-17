from fastapi import APIRouter, Depends, HTTPException, status, Header, Request, Response, File, UploadFile, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm, HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from jose import jwt, JWTError
from typing import List, Optional

from app.db.session import get_db
from app.models import User, Artist, Track
from app.schemas import UserCreate, UserLogin, UserUpdate, ChangePasswordRequest, ResetInitialPasswordRequest, Token, UserResponse, UserSettingsUpdate, TokenPayload, ArtistCreate, ArtistResponse, ArtistUpdate, StudioProfileUpdate, RequestReactivationSchema, SwitchModeRequest, PaginatedUserListResponse, PaginatedArtistListResponse, PaginatedTrackListResponse
from app.core.security import (
    verify_password, get_password_hash, create_access_token, create_refresh_token,
    validate_refresh_token, revoke_refresh_token, ALGORITHM, REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_TTL_DAYS,
)
from app.core.config import settings
from app.core.password_policy import validate_password
from app.core.rate_limit import enforce_rate_limit, REFRESH_LIMIT, REFRESH_WINDOW_SEC
from app.core.premium import paid_subscription_is_active
from app.core.user_mode import apply_user_mode, set_user_mode, _resolve_db_role
from app.services.subscription_service import apply_admin_subscription
from app.services.licence_documents import licence_document_url, store_licence_document
from app.services.cover_images import resolve_cover_art_url, store_profile_cover

router = APIRouter(prefix="/auth", tags=["auth"])

DEFAULT_ADMIN_PASSWORD = "admin12345"
VALID_STREAM_QUALITIES = {"normal", "high", "hires", "lossless"}
STUDIO_PROFILE_TEXT_FIELDS = (
    "stage_name", "bio", "category", "licence", "street_address", "city",
    "state_province", "postal_code", "country", "phone", "email", "website",
    "languages", "social_twitter", "social_instagram",
)
STUDIO_ONBOARDING_REQUIRED_FIELDS = (
    "stage_name", "bio", "city", "country", "phone", "email",
)


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _studio_profile_is_complete(artist: Artist) -> bool:
    return all(_normalize_text(getattr(artist, field)) for field in STUDIO_ONBOARDING_REQUIRED_FIELDS)


def _apply_studio_profile_fields(artist: Artist, profile_in) -> None:
    for field in STUDIO_PROFILE_TEXT_FIELDS:
        if hasattr(profile_in, field):
            value = getattr(profile_in, field)
            if value is not None:
                setattr(artist, field, _normalize_text(value))
    artist.profile_complete = _studio_profile_is_complete(artist)


def _serialize_artist_response(artist: Artist, owner: Optional[User] = None) -> dict:
    data = ArtistResponse.model_validate(artist).model_dump()
    data["licence_document_url"] = licence_document_url(artist.licence_document_path)
    data["cover_art_url"] = resolve_cover_art_url(artist.cover_image_path)
    if owner:
        data["owner_name"] = owner.full_name
        data["owner_email"] = owner.email
    return data

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login-form")
security = HTTPBearer(auto_error=False)


def _ensure_password_reset_not_required(user: User) -> None:
    if user.must_reset_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password reset required before accessing this resource",
        )


def _reject_default_admin_password(password: str) -> None:
    if password == DEFAULT_ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot use the default password. Choose a unique password.",
        )

# Supporting form-based login for Swagger UI / external clients
@router.post("/login-form", response_model=Token)
def login_oauth2(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    enforce_rate_limit(request, "login")
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return _issue_token_response(user, response)

def _apply_user_mode(user: User, x_user_mode: Optional[str]) -> None:
    apply_user_mode(user)


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=REFRESH_TOKEN_TTL_DAYS * 86400,
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    # Must match set_cookie attributes or browsers (Chrome) keep the cookie.
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value="",
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=0,
        path="/api/auth",
    )


def _issue_token_response(user: User, response: Response) -> dict:
    refresh_token = create_refresh_token(subject=user.id)
    _set_refresh_cookie(response, refresh_token)
    return {
        "access_token": create_access_token(subject=user.id),
        "token_type": "bearer",
        "refresh_token": refresh_token,
    }


def get_current_user_allow_reset(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    return _resolve_authenticated_user(token, db, enforce_password_reset=False)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    return _resolve_authenticated_user(token, db, enforce_password_reset=True)


def _resolve_authenticated_user(token: str, db: Session, *, enforce_password_reset: bool) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        token_type = payload.get("type")
        if token_type in ("refresh", "stream"):
            raise credentials_exception
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenPayload(sub=int(user_id))
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == token_data.sub).first()
    if user is None or not user.is_active:
        raise credentials_exception

    _apply_user_mode(user, None)
    if enforce_password_reset:
        _ensure_password_reset_not_required(user)
    return user

def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    if not credentials:
        return None
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") in ("refresh", "stream"):
            return None
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user is None or not user.is_active:
            return None
        _apply_user_mode(user, None)
        return user
    except Exception:
        return None

def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    _ensure_password_reset_not_required(current_user)
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user does not have enough privileges"
        )
    return current_user

def get_current_studio_admin(current_user: User = Depends(get_current_user)) -> User:
    _ensure_password_reset_not_required(current_user)
    real_role = getattr(current_user, "_real_role", None) or current_user.role
    if real_role not in ("studio_admin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user must be a studio admin or admin to execute this action",
        )
    if real_role == "studio_admin" and current_user.role == "listener":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Switch to Admin mode to upload and manage tracks.",
        )
    return current_user

def get_current_radio_admin(current_user: User = Depends(get_current_user)) -> User:
    _ensure_password_reset_not_required(current_user)
    real_role = getattr(current_user, "_real_role", None) or current_user.role
    if real_role not in ("radio_admin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user must be a radio admin or admin to execute this action",
        )
    if real_role == "radio_admin" and current_user.role == "listener":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Switch to Admin mode to manage your radio station.",
        )
    return current_user

@router.post("/register", response_model=UserResponse)
def register_user(user_in: UserCreate, request: Request, db: Session = Depends(get_db)):
    """
    Register a new user (always as listener).
    """
    enforce_rate_limit(request, "register")
    email = user_in.email.strip().lower()
    password = user_in.password.strip()
    try:
        validate_password(password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    db_user = db.query(User).filter(User.email == email).first()
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system."
        )
        
    hashed_pwd = get_password_hash(password)
    user = User(
        email=email,
        hashed_password=hashed_pwd,
        full_name=user_in.full_name.strip() if user_in.full_name else None,
        role="listener"  # Force role to listener. Admin / artist registrations are not allowed.
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user


@router.post("/login", response_model=Token)
def login(user_in: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Log in with email and password to receive access token.
    """
    enforce_rate_limit(request, "login")
    email = user_in.email.strip().lower()
    password = user_in.password.strip()
    
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
        
    return _issue_token_response(user, response)

@router.post("/google", response_model=Token)
def login_google(body: dict, request: Request, response: Response, db: Session = Depends(get_db)):
    """Google Sign-In requires verified ID tokens — mock email login is disabled."""
    enforce_rate_limit(request, "google")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Google Sign-In is not configured. Use email and password.",
    )

def _user_response(user: User) -> UserResponse:
    real_role = getattr(user, "_real_role", None) or user.role
    response = UserResponse.model_validate(user)
    updates: dict = {
        "real_role": real_role,
        "profile_image_url": resolve_cover_art_url(user.profile_image_path),
    }
    if user.artist_profile:
        updates["artist_profile"] = _serialize_artist_response(user.artist_profile)
    return response.model_copy(update=updates)


@router.get("/me", response_model=UserResponse)
def read_current_user(
    current_user: User = Depends(get_current_user_allow_reset),
    db: Session = Depends(get_db),
):
    from app.services.subscription_service import apply_pending_subscription_if_due

    db_user = (
        db.query(User)
        .options(joinedload(User.artist_profile))
        .filter(User.id == current_user.id)
        .first()
    )
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    apply_pending_subscription_if_due(db_user, db)
    db.commit()
    db.refresh(db_user)
    apply_user_mode(db_user)
    return _user_response(db_user)


@router.put("/me/settings", response_model=UserResponse)
def update_user_settings(
    settings_in: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_password_reset_not_required(current_user)

    if settings_in.stream_quality is not None:
        quality = settings_in.stream_quality.strip().lower()
        if quality not in VALID_STREAM_QUALITIES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid stream quality setting",
            )
        if quality != "normal" and not paid_subscription_is_active(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Premium subscription required for this stream quality",
            )
        current_user.stream_quality = quality

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/logout")
def logout(
    response: Response,
    current_user: User = Depends(get_current_user_allow_reset),
):
    revoke_refresh_token(current_user.id)
    _clear_refresh_cookie(response)
    return {"detail": "Logged out successfully"}


@router.post("/switch-mode", response_model=UserResponse)
def switch_user_mode(
    body: SwitchModeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mode = body.mode.strip().lower()
    if mode not in ("admin", "listener"):
        raise HTTPException(status_code=400, detail="Mode must be 'admin' or 'listener'")
    db_user = (
        db.query(User)
        .options(joinedload(User.artist_profile))
        .filter(User.id == current_user.id)
        .first()
    )
    real_role = _resolve_db_role(db_user) if db_user else None
    if not db_user or real_role not in ("radio_admin", "studio_admin"):
        raise HTTPException(status_code=400, detail="Mode switching is not available for this account")
    set_user_mode(db_user.id, mode)
    apply_user_mode(db_user)
    return _user_response(db_user)


@router.post("/request-artist", response_model=UserResponse)
def request_artist(
    artist_in: ArtistCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submit a studio-admin upgrade request (artist/studio profile pending approval).
    Radio-admin upgrades must use /request-radio-admin.
    """
    if (artist_in.bio or "").upper().find("[REQUESTING RADIO ADMIN") >= 0:
        raise HTTPException(
            status_code=400,
            detail="Use the radio admin upgrade request for radio station promotions.",
        )
    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if artist:
        artist.stage_name = artist_in.stage_name.strip()
        artist.bio = artist_in.bio.strip() if artist_in.bio else None
    else:
        artist = Artist(
            user_id=current_user.id,
            stage_name=artist_in.stage_name.strip(),
            bio=artist_in.bio.strip() if artist_in.bio else None
        )
        db.add(artist)
    
    db.commit()
    db.refresh(artist)
    db.refresh(current_user)
    return current_user


@router.post("/request-radio-admin", response_model=UserResponse)
def request_radio_admin(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Queue a radio-admin upgrade request without creating a studio Artist profile."""
    from app.models import RadioStation

    station_name = (body.get("station_name") or body.get("stage_name") or "").strip()
    message = (body.get("message") or body.get("bio") or "").strip()
    if not station_name:
        raise HTTPException(status_code=400, detail="Station name is required.")
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    note = f"[RADIO_ADMIN_ROLE_REQUEST] {message}"
    existing = (
        db.query(RadioStation)
        .filter(RadioStation.owner_id == current_user.id)
        .order_by(RadioStation.id.asc())
        .first()
    )
    if existing:
        existing.name = station_name
        existing.description = note
        existing.is_active = False
        existing.disabled_reason = "Pending radio admin role approval"
    else:
        db.add(
            RadioStation(
                owner_id=current_user.id,
                name=station_name,
                description=note,
                is_active=False,
                disabled_reason="Pending radio admin role approval",
            )
        )

    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/studio-profile", response_model=UserResponse)
def update_studio_profile(
    profile_in: StudioProfileUpdate,
    current_user: User = Depends(get_current_studio_admin),
    db: Session = Depends(get_db),
):
    """
    Studio admin: update full studio profile and mark onboarding complete when required fields are filled.
    """
    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist:
        artist = Artist(
            user_id=current_user.id,
            stage_name=profile_in.stage_name.strip(),
            bio=profile_in.bio.strip(),
            profile_complete=False,
        )
        db.add(artist)

    _apply_studio_profile_fields(artist, profile_in)
    db.commit()
    db.refresh(artist)
    db.refresh(current_user)
    return current_user


@router.post("/studio-profile/licence-document", response_model=UserResponse)
async def upload_studio_licence_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_studio_admin),
    db: Session = Depends(get_db),
):
    real_role = getattr(current_user, "_real_role", None) or current_user.role
    if real_role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Platform admins can only view licence documents",
        )

    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Studio profile not found")

    artist.licence_document_path = await store_licence_document(file, "studio", artist.id)
    db.commit()
    db.refresh(artist)
    db_user = (
        db.query(User)
        .options(joinedload(User.artist_profile))
        .filter(User.id == current_user.id)
        .first()
    )
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(db_user)


@router.post("/studio-profile/cover", response_model=UserResponse)
async def upload_studio_cover(
    cover_image: UploadFile = File(...),
    current_user: User = Depends(get_current_studio_admin),
    db: Session = Depends(get_db),
):
    real_role = getattr(current_user, "_real_role", None) or current_user.role
    if real_role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Platform admins can only view studio profiles",
        )

    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Studio profile not found")

    artist.cover_image_path = await store_profile_cover(cover_image, "studio", artist.id)
    db.commit()
    db.refresh(artist)
    db_user = (
        db.query(User)
        .options(joinedload(User.artist_profile))
        .filter(User.id == current_user.id)
        .first()
    )
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(db_user)


@router.get("/admin/users", response_model=PaginatedUserListResponse)
def get_users_admin(
    search: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin user management: list users with pagination.
    """
    query = db.query(User).order_by(User.id.desc())
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
            )
        )
    total = query.count()
    users = query.offset(offset).limit(limit).all()
    return PaginatedUserListResponse(
        items=[_user_response(u) for u in users],
        total=total,
        has_more=offset + len(users) < total,
    )


@router.put("/admin/users/{user_id}/role", response_model=UserResponse)
def update_user_role_admin(
    user_id: int,
    role: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin user management: update a user's role.
    If role changes to 'studio_admin', ensure an Artist profile is initialized.
    """
    if role not in ["admin", "studio_admin", "radio_admin", "listener"]:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.role = role

    if role == "admin":
        apply_admin_subscription(user, "unlimited", None, db)
    
    # Ensure Artist profile is initialized if role is updated to studio_admin
    if role == "studio_admin":
        artist = db.query(Artist).filter(Artist.user_id == user.id).first()
        if not artist:
            artist = Artist(
                user_id=user.id,
                stage_name=user.full_name or user.email.split("@")[0],
                bio="",
                profile_complete=False,
            )
            db.add(artist)
        else:
            artist.profile_complete = _studio_profile_is_complete(artist)
            
    db.commit()
    db.refresh(user)
    return user


@router.put("/admin/users/{user_id}/subscription", response_model=UserResponse)
def update_user_subscription_admin(
    user_id: int,
    subscription: str,
    subscription_cycle: Optional[str] = None,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Super admin user management: update a user's subscription plan and cycle.
    Unlimited tier can only be assigned here — not via self-service checkout.
    """
    if subscription not in ["free", "premium", "unlimited"]:
        raise HTTPException(status_code=400, detail="Invalid subscription plan")
    if subscription == "unlimited" and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the platform super admin can assign the unlimited tier",
        )
    if subscription_cycle is not None and subscription_cycle not in ["monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="Invalid subscription cycle")
        
    # Consistency validation
    if subscription == "free" and subscription_cycle is not None:
        raise HTTPException(status_code=400, detail="Free plan must not have a subscription cycle")
    if subscription == "premium" and subscription_cycle not in ["monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="Premium plan must have cycle set to 'monthly' or 'yearly'")
    if subscription == "unlimited" and subscription_cycle is not None:
        raise HTTPException(status_code=400, detail="Unlimited plan must not have a subscription cycle")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    apply_admin_subscription(user, subscription, subscription_cycle, db)
    db.commit()
    db.refresh(user)
    return user


@router.put("/admin/users/{user_id}", response_model=UserResponse)
def update_user_details_admin(
    user_id: int,
    user_in: UserUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin user management: update a user's profile details (full_name, email).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user_in.full_name is not None:
        user.full_name = user_in.full_name.strip()
    if user_in.email is not None:
        email = user_in.email.strip().lower()
        if email != user.email:
            db_user = db.query(User).filter(User.email == email).first()
            if db_user:
                raise HTTPException(status_code=400, detail="Email already registered")
            user.email = email
            
    db.commit()
    db.refresh(user)
    return user


@router.delete("/admin/users/{user_id}")
def delete_user_admin(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin user management: delete a user.
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete current logged-in admin user")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    db.delete(user)
    db.commit()
    return {"detail": "User deleted successfully"}

@router.put("/profile", response_model=UserResponse)
def update_profile(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user_in.full_name is not None:
        current_user.full_name = user_in.full_name
    if user_in.email is not None:
        email = user_in.email.strip().lower()
        if email != current_user.email:
            db_user = db.query(User).filter(User.email == email).first()
            if db_user:
                raise HTTPException(status_code=400, detail="Email already registered by another user")
            current_user.email = email
            
    db.commit()
    db.refresh(current_user)
    return _user_response(current_user)

@router.post("/profile/avatar", response_model=UserResponse)
async def upload_profile_avatar(
    cover_image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.profile_image_path = await store_profile_cover(cover_image, "users", current_user.id)
    db.commit()
    db.refresh(current_user)
    return _user_response(current_user)

@router.put("/change-password")
def change_password(
    pw_in: ChangePasswordRequest,
    current_user: User = Depends(get_current_user_allow_reset),
    db: Session = Depends(get_db),
):
    if not verify_password(pw_in.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    try:
        validate_password(pw_in.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    current_user.hashed_password = get_password_hash(pw_in.new_password)
    current_user.must_reset_password = False
    revoke_refresh_token(current_user.id)
    db.commit()
    return {"detail": "Password updated successfully"}


@router.post("/reset-initial-password")
def reset_initial_password(
    body: ResetInitialPasswordRequest,
    current_user: User = Depends(get_current_user_allow_reset),
    db: Session = Depends(get_db),
):
    """
    Mandatory first-login password reset for accounts flagged with must_reset_password.
    """
    if not current_user.must_reset_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset is not required for this account",
        )

    new_password = body.new_password.strip()
    try:
        validate_password(new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _reject_default_admin_password(new_password)

    if verify_password(new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password",
        )

    current_user.hashed_password = get_password_hash(new_password)
    current_user.must_reset_password = False
    revoke_refresh_token(current_user.id)
    db.commit()
    return {"detail": "Password updated successfully"}

@router.post("/refresh", response_model=Token)
def refresh_token(
    request: Request,
    response: Response,
    body: dict,
    db: Session = Depends(get_db)
):
    enforce_rate_limit(request, "refresh", limit=REFRESH_LIMIT, window_sec=REFRESH_WINDOW_SEC)
    refresh_token_value = body.get("refresh_token") or request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh token is required"
        )
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = validate_refresh_token(refresh_token_value)
    except Exception:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception

    revoke_refresh_token(user.id)
    return _issue_token_response(user, response)

def _apply_studio_status_filter(query, status: Optional[str]):
    if status == "active":
        return query.filter(Artist.is_active == True)
    if status == "disabled":
        return query.filter(Artist.is_active == False, Artist.reactivation_requested == False)
    if status == "pending":
        return query.filter(Artist.is_active == False, Artist.reactivation_requested == True)
    return query


def _apply_studio_search_filter(query, search: Optional[str]):
    if not search or not search.strip():
        return query
    pattern = f"%{search.strip()}%"
    return query.join(User, Artist.user_id == User.id).filter(
        or_(
            Artist.stage_name.ilike(pattern),
            Artist.city.ilike(pattern),
            Artist.country.ilike(pattern),
            Artist.licence.ilike(pattern),
            User.full_name.ilike(pattern),
            User.email.ilike(pattern),
        )
    )


@router.get("/admin/studios", response_model=PaginatedArtistListResponse)
def get_studios_admin(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin studio (artist) management: list studios with pagination and filters.
    """
    query = (
        db.query(Artist)
        .options(joinedload(Artist.user))
        .filter(Artist.user_id.isnot(None))
    )
    query = _apply_studio_search_filter(query, search)
    query = _apply_studio_status_filter(query, status)
    total = query.count()
    artists = query.order_by(Artist.id.desc()).offset(offset).limit(limit).all()
    items = [_serialize_artist_response(artist, artist.user) for artist in artists]
    return PaginatedArtistListResponse(
        items=items,
        total=total,
        has_more=offset + len(artists) < total,
    )


@router.get("/admin/studios/{artist_id}/tracks", response_model=PaginatedTrackListResponse)
def get_studio_tracks_admin(
    artist_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Super admin: paginated tracks for a studio with engagement counts.
    """
    artist = db.query(Artist).filter(Artist.id == artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Studio/Artist not found")

    from app.services.track_management import apply_manage_track_search
    from app.api.music import serialize_track

    query = (
        db.query(Track)
        .options(
            joinedload(Track.analysis_report),
            joinedload(Track.artist).joinedload(Artist.user),
            joinedload(Track.album),
            joinedload(Track.genres),
        )
        .filter(Track.artist_id == artist_id, Track.approved == True)
    )
    query = apply_manage_track_search(query, search, include_owner=False)
    total = query.count()
    tracks = query.order_by(Track.created_at.desc()).offset(offset).limit(limit).all()
    items = [
        serialize_track(t, db, viewer=current_user, include_engagement=True)
        for t in tracks
    ]
    return PaginatedTrackListResponse(
        items=items,
        total=total,
        has_more=offset + len(tracks) < total,
    )

@router.put("/admin/studios/{artist_id}", response_model=ArtistResponse)
def update_studio_admin(
    artist_id: int,
    artist_in: ArtistUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin studio management: update a studio.
    """
    artist = db.query(Artist).filter(Artist.id == artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Studio/Artist not found")
        
    if artist_in.stage_name is not None:
        artist.stage_name = artist_in.stage_name
    if artist_in.bio is not None:
        artist.bio = artist_in.bio
    if artist_in.category is not None:
        artist.category = artist_in.category
    if artist_in.licence is not None:
        artist.licence = artist_in.licence
    if artist_in.street_address is not None:
        artist.street_address = artist_in.street_address
    if artist_in.city is not None:
        artist.city = artist_in.city
    if artist_in.state_province is not None:
        artist.state_province = artist_in.state_province
    if artist_in.postal_code is not None:
        artist.postal_code = artist_in.postal_code
    if artist_in.country is not None:
        artist.country = artist_in.country
    if artist_in.phone is not None:
        artist.phone = artist_in.phone
    if artist_in.email is not None:
        artist.email = artist_in.email
    if artist_in.website is not None:
        artist.website = artist_in.website
    if artist_in.languages is not None:
        artist.languages = artist_in.languages
    if artist_in.social_twitter is not None:
        artist.social_twitter = artist_in.social_twitter
    if artist_in.social_instagram is not None:
        artist.social_instagram = artist_in.social_instagram
    if artist_in.profile_complete is not None:
        artist.profile_complete = artist_in.profile_complete
    else:
        artist.profile_complete = _studio_profile_is_complete(artist)
    if artist_in.is_active is not None:
        artist.is_active = artist_in.is_active
        if artist.is_active:
            artist.disabled_reason = None
            artist.reactivation_reason = None
            artist.reactivation_requested = False
            
    if artist_in.disabled_reason is not None:
        artist.disabled_reason = artist_in.disabled_reason
    if artist_in.reactivation_reason is not None:
        artist.reactivation_reason = artist_in.reactivation_reason
    if artist_in.reactivation_requested is not None:
        artist.reactivation_requested = artist_in.reactivation_requested
        
    db.commit()
    db.refresh(artist)
    owner = db.query(User).filter(User.id == artist.user_id).first()
    return _serialize_artist_response(artist, owner)


@router.post("/request-reactivation", response_model=ArtistResponse)
def request_studio_reactivation(
    reason_in: RequestReactivationSchema,
    current_user: User = Depends(get_current_studio_admin),
    db: Session = Depends(get_db)
):
    """
    Studio admin appeal: request reactivation of a disabled studio profile.
    """
    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Studio profile not found")
    artist.reactivation_reason = reason_in.reason
    artist.reactivation_requested = True
    db.commit()
    db.refresh(artist)
    return artist
