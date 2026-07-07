from fastapi import APIRouter, Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm, HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from typing import List, Optional

from app.db.session import get_db
from app.models import User, Artist
from app.schemas import UserCreate, UserLogin, UserUpdate, ChangePasswordRequest, Token, UserResponse, TokenPayload, ArtistCreate, ArtistResponse
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, ALGORITHM
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login-form")
security = HTTPBearer(auto_error=False)

# Supporting form-based login for Swagger UI / external clients
@router.post("/login-form", response_model=Token)
def login_oauth2(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
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
    if x_user_mode == "listener" and user.role in ["admin", "radio_admin", "studio_admin"]:
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
            if x_user_mode == "listener" and user.role in ["admin", "radio_admin", "studio_admin"]:
                user.__dict__["role"] = "listener"
        return user
    except Exception:
        return None

def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user does not have enough privileges"
        )
    return current_user

def get_current_studio_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ["studio_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user must be a studio admin or admin to execute this action"
        )
    return current_user

def get_current_radio_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ["radio_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user must be a radio admin or admin to execute this action"
        )
    return current_user

@router.post("/register", response_model=UserResponse)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user (always as listener).
    """
    email = user_in.email.strip().lower()
    password = user_in.password.strip()
    
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
def login(user_in: UserLogin, db: Session = Depends(get_db)):
    """
    Log in with email and password to receive access token.
    """
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
        
    return {
        "access_token": create_access_token(subject=user.id),
        "token_type": "bearer",
        "refresh_token": create_refresh_token(subject=user.id)
    }

@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


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
        
    current_user.hashed_password = get_password_hash(pw_in.new_password)
    db.commit()
    return {"detail": "Password updated successfully"}

@router.post("/refresh", response_model=Token)
def refresh_token(
    body: dict,
    db: Session = Depends(get_db)
):
    refresh_token = body.get("refresh_token")
    if not refresh_token:
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
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "refresh":
            raise credentials_exception
    except Exception:
        raise credentials_exception
        
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise credentials_exception
        
    return {
        "access_token": create_access_token(subject=user.id),
        "token_type": "bearer",
        "refresh_token": create_refresh_token(subject=user.id)
    }
