from typing import Optional

from fastapi import WebSocket
from jose import JWTError, jwt

from app.core.config import settings
from app.core.security import ALGORITHM
from app.db.session import SessionLocal
from app.models import User

AUTH_WS_SUBPROTOCOL_PREFIX = "verisonic."


def extract_ws_token(websocket: WebSocket, token_query: Optional[str] = None) -> Optional[str]:
    if token_query:
        return token_query
    protocol_header = websocket.headers.get("sec-websocket-protocol", "")
    for entry in protocol_header.split(","):
        entry = entry.strip()
        if entry.startswith(AUTH_WS_SUBPROTOCOL_PREFIX):
            return entry[len(AUTH_WS_SUBPROTOCOL_PREFIX) :]
    return None


async def accept_authenticated_websocket(websocket: WebSocket) -> None:
    """Accept the socket and echo the auth subprotocol so browsers complete handshake.

    Clients open with ``new WebSocket(url, ['verisonic.<jwt>'])``. If the server
    accepts without that subprotocol, the browser fails the connection.
    """
    subprotocols = websocket.scope.get("subprotocols") or []
    chosen = next(
        (p for p in subprotocols if isinstance(p, str) and p.startswith(AUTH_WS_SUBPROTOCOL_PREFIX)),
        None,
    )
    if chosen:
        await websocket.accept(subprotocol=chosen)
    else:
        await websocket.accept()


def resolve_ws_user(token: Optional[str]) -> Optional[User]:
    if not token:
        return None
    db = SessionLocal()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user is None or not user.is_active:
            return None
        return user
    except JWTError:
        return None
    finally:
        db.close()
