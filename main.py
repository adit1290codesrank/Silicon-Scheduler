import os
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from dotenv import load_dotenv
from db import db

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class UserRegister(BaseModel):
    roll_number: str
    full_name: str
    email: str
    password: str
    role: str

class UserLogin(BaseModel):
    roll_number: str
    password: str

class BookingReq(BaseModel):
    node_id: int
    start_time: str
    end_time: str

class NodeCreate(BaseModel):
    node_name: str
    node_type: str
    location_id: int
    access_level: str
    hardware_specs: dict
    status: str = "Available"

# --- AUTH HELPERS ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except:
        raise HTTPException(status_code=401, detail="Invalid session")

def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# --- ROUTES ---

@app.post("/api/auth/register")
def register(payload: UserRegister):
    salt = bcrypt.gensalt()
    hashed_pw = bcrypt.hashpw(payload.password.encode('utf-8'), salt).decode('utf-8')
    try:
        user = db.register_user(
            payload.roll_number, payload.full_name,
            payload.email, hashed_pw, payload.role
        )
        token = create_access_token({"user_id": user["user_id"], "role": user["role"]})
        return {
            "token":       token,
            "user_id":     user["user_id"],
            "roll_number": user["roll_number"],
            "full_name":   user["full_name"],
            "email":       user["email"],
            "role":        user["role"],
        }
    except IntegrityError:
        raise HTTPException(status_code=400, detail="Roll number or email already registered.")

@app.post("/api/auth/login")
def login(payload: UserLogin):
    user = db.get_user_by_roll(payload.roll_number)
    if not user or not bcrypt.checkpw(
        payload.password.encode('utf-8'),
        user["password_hash"].encode('utf-8')
    ):
        raise HTTPException(status_code=401, detail="Invalid roll number or password.")
    token = create_access_token({"user_id": user["user_id"], "role": user["role"]})
    return {
        "token":       token,
        "user_id":     user["user_id"],
        "roll_number": user["roll_number"],
        "full_name":   user["full_name"],
        "email":       user["email"],
        "role":        user["role"],
    }

@app.get("/api/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    return user

@app.get("/api/locations")
def get_locations():
    return db.get_locations()

@app.get("/api/nodes")
def get_nodes(location_id: int):
    return db.get_nodes_at_location(location_id)

@app.get("/api/nodes/available")
def get_available(start_time: str, end_time: str, location_id: int = None):
    return db.get_available_nodes(start_time, end_time, location_id)

@app.post("/api/book")
def book(payload: BookingReq, user: dict = Depends(get_current_user)):
    try:
        return db.book_hardware(
            user["user_id"], payload.node_id,
            payload.start_time, payload.end_time
        )
    except ValueError as e:
        err_str = str(e)
        if "UserConflict" in err_str:
            raise HTTPException(status_code=409, detail="user_conflict")
        if "SurgeConflict" in err_str:
            try:
                max_hours = err_str.split(":")[1]
            except IndexError:
                max_hours = "?"
            raise HTTPException(status_code=409, detail=f"surge_conflict:{max_hours}")
        raise HTTPException(status_code=409, detail="node_conflict")

@app.get("/api/reservations/my")
def my_bookings(user: dict = Depends(get_current_user)):
    return db.get_my_bookings(user["user_id"])

@app.get("/api/reservations/all")
def all_bookings(status: str = None, user: dict = Depends(require_admin)):
    return db.get_all_bookings(status_filter=status)

@app.delete("/api/reservations/{res_id}")
def cancel_booking(res_id: int, user: dict = Depends(require_admin)):
    db.cancel_booking(res_id, user["user_id"])
    return {"message": "Cancelled"}

@app.post("/api/admin/nodes")
def add_node(payload: NodeCreate, user: dict = Depends(require_admin)):
    db.add_node(
        payload.node_name, payload.node_type, payload.location_id,
        payload.access_level, payload.hardware_specs, payload.status
    )
    return {"message": "Node created"}

@app.delete("/api/admin/nodes/{node_id}")
def delete_node(node_id: int, user: dict = Depends(require_admin)):
    db.delete_node(node_id)
    return {"message": "Node deleted"}

@app.get("/api/admin/users")
def get_all_users(user: dict = Depends(require_admin)):
    return db.get_all_users()

@app.get("/api/admin/audit")
def run_security_audit(user: dict = Depends(require_admin)):
    return db.run_full_security_audit()

# ==========================================
# PREDICTIVE LOAD HEATMAP
# ==========================================
@app.get("/api/predict/heatmap")
def get_heatmap(
    location_id: int = None,
    node_type: str = None,
    user: dict = Depends(get_current_user),
):
    """
    Returns a 7×24 matrix of predicted utilisation.
    Optional query params:
      - location_id: filter to a specific lab location
      - node_type:   filter to a specific hardware type (GPU, CPU, FPGA, …)
    When both are omitted, returns the AVERAGE across all combos (no longer MAX).
    """
    return db.get_heatmap_predictions(location_id=location_id, node_type=node_type)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
