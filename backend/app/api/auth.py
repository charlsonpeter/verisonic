from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm, HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from typing import List, Optional

from app.db.session import get_db
from app.models import User, Artist
from app.schemas import UserCreate, UserLogin, UserUpdate, ChangePasswordRequest, ResetInitialPasswordRequest, Token, UserResponse, UserSettingsUpdate, TokenPayload, ArtistCreate, ArtistResponse, ArtistUpdate, RequestReactivationSchema
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, validate_refresh_token, revoke_refresh_token, ALGORITHM
from app.core.config import settings
from app.core.password_policy import validate_password
from app.core.rate_limit import enforce_rate_limit, REFRESH_LIMIT, REFRESH_WINDOW_SEC
from app.core.premium import paid_subscription_is_active
from app.services.subscription_service import apply_admin_subscription

router = APIRouter(prefix="/auth", tags=["auth"])

DEFAULT_ADMIN_PASSWORD = "admin12345"
VALID_STREAM_QUALITIES = {"normal", "high", "hires", "lossless"}

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
    return {
        "access_token": create_access_token(subject=user.id),
        "token_type": "bearer",
        "refresh_token": create_refresh_token(subject=user.id)
    }

def get_current_user(
    token: str = Depends(oauth2_scheme),
    x_user_mode: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenPayload(sub=int(user_id))
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.id == token_data.sub).first()
    if user is None:
        raise credentials_exception

    # Store original database role before override
    user._real_role = user.role
    if x_user_mode == "listener" and user.role in ["radio_admin", "studio_admin"]:
        user.__dict__["role"] = "listener"

    return user

def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_user_mode: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    if not credentials:
        return None
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user:
            user._real_role = user.role
            if x_user_mode == "listener" and user.role in ["radio_admin", "studio_admin"]:
                user.__dict__["role"] = "listener"
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
    if current_user.role not in ["studio_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user must be a studio admin or admin to execute this action"
        )
    return current_user

def get_current_radio_admin(current_user: User = Depends(get_current_user)) -> User:
    _ensure_password_reset_not_required(current_user)
    if current_user.role not in ["radio_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user must be a radio admin or admin to execute this action"
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
def login(user_in: UserLogin, request: Request, db: Session = Depends(get_db)):
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
        
    return {
        "access_token": create_access_token(subject=user.id),
        "token_type": "bearer",
        "refresh_token": create_refresh_token(subject=user.id)
    }

@router.post("/google", response_model=Token)
def login_google(body: dict, db: Session = Depends(get_db)):
    """
    Log in using Google Sign-In. Mocks backend OAuth verification for simple integration.
    """
    # Accept user info sent directly or decoded from mock id token
    email = body.get("email")
    name = body.get("name", "Google User")
    
    if not email:
        raise HTTPException(status_code=400, detail="Google authentication payload must include email")
        
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Register new listener automatically
        hashed_pwd = get_password_hash("GOOGLE_MOCK_LOGIN_SECRET_12345")
        user = User(
            email=email,
            hashed_password=hashed_pwd,
            full_name=name,
            role="listener"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
        
    return {
        "access_token": create_access_token(subject=user.id),
        "token_type": "bearer",
        "refresh_token": create_refresh_token(subject=user.id)
    }

@router.get("/me", response_model=UserResponse)
def read_current_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.subscription_service import apply_pending_subscription_if_due

    apply_pending_subscription_if_due(current_user, db)
    db.refresh(current_user)
    return current_user


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
def logout(current_user: User = Depends(get_current_user)):
    revoke_refresh_token(current_user.id)
    return {"detail": "Logged out successfully"}


@router.post("/request-artist", response_model=UserResponse)
def request_artist(
    artist_in: ArtistCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submit or update artist details for the currently logged-in user (listener).
    """
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


@router.get("/admin/users", response_model=List[UserResponse])
def get_users_admin(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin user management: list all users.
    """
    return db.query(User).all()


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
    
    # Ensure Artist profile is initialized if role is updated to studio_admin
    if role == "studio_admin":
        artist = db.query(Artist).filter(Artist.user_id == user.id).first()
        if not artist:
            artist = Artist(
                user_id=user.id,
                stage_name=user.full_name or user.email.split("@")[0],
                bio=""
            )
            db.add(artist)
            
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

    apply_admin_subscription(user, subscription, subscription_cycle)
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
    return current_user

@router.put("/change-password")
def change_password(
    pw_in: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
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
    current_user: User = Depends(get_current_user),
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
    body: dict,
    db: Session = Depends(get_db)
):
    enforce_rate_limit(request, "refresh", limit=REFRESH_LIMIT, window_sec=REFRESH_WINDOW_SEC)
    refresh_token_value = body.get("refresh_token")
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
    return {
        "access_token": create_access_token(subject=user.id),
        "token_type": "bearer",
        "refresh_token": create_refresh_token(subject=user.id)
    }

@router.get("/admin/studios", response_model=List[ArtistResponse])
def get_studios_admin(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin studio (artist) management: list all studios.
    """
    return db.query(Artist).all()

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
    return artist

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
