from datetime import datetime, timedelta
from collections import defaultdict
import os
import json
import hashlib
import pandas as pd
import numpy as np
import joblib
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

# ── Surge Limit Helper ─────────────────────────────────────────
def _get_surge_max_hours(load: float) -> float:
    """Dynamic duration limits based on predicted load."""
    if load > 0.80:
        return 1.0
    if load > 0.50:
        return 4.0
    return 8.0

# --- GLOBAL TIMEZONE HELPER ---
def to_utc_str(time_str):
    """Parses UTC ISO strings from frontend for DB storage."""
    if not time_str:
        return time_str
    clean_str = time_str.replace("T", " ").replace("Z", "").split(".")[0]
    return clean_str

class LabSchedulerDB:
    def __init__(self):
        """Initialize and load the ML Predictor once."""
        self._ml_artifact = None
        self._load_ml_artifact()

    def _load_ml_artifact(self):
        try:
            # We use joblib to load the Gradient Boosting artifact
            self._ml_artifact = joblib.load("advanced_load_predictor.pkl")
            print("[ML] Gradient Boosting Model Active (ISO-DOW Aligned).")
        except Exception as e:
            print(f"[ML] WARNING: Model not loaded: {e}. Surge limits disabled.")
            self._ml_artifact = {}

    # --- AUTHENTICATION & USERS ---
    def register_user(self, roll_number, full_name, email, hashed_pw, role):
        with engine.begin() as conn:
            query = text("""
                INSERT INTO Users (roll_number, full_name, email, password_hash, role)
                VALUES (:roll, :name, :email, :pw, :role)
                RETURNING user_id, roll_number, full_name, email, role;
            """)
            res = conn.execute(query, {
                "roll": roll_number, "name": full_name,
                "email": email, "pw": hashed_pw, "role": role
            }).mappings().fetchone()
            return dict(res)

    def get_user_by_roll(self, roll_number):
        with engine.connect() as conn:
            query = text("SELECT * FROM Users WHERE roll_number = :roll")
            res = conn.execute(query, {"roll": roll_number}).mappings().fetchone()
            return dict(res) if res else None

    def get_all_users(self):
        with engine.connect() as conn:
            res = conn.execute(text("""
                SELECT user_id, roll_number, full_name, email, role 
                FROM Users ORDER BY full_name
            """)).mappings().all()
            return [dict(r) for r in res]

    # --- INFRASTRUCTURE ---
    def get_locations(self):
        with engine.connect() as conn:
            res = conn.execute(text("SELECT * FROM Locations")).mappings().all()
            return [dict(r) for r in res]

    def get_nodes_at_location(self, location_id):
        with engine.connect() as conn:
            res = conn.execute(
                text("SELECT * FROM Lab_Nodes WHERE location_id = :loc"),
                {"loc": location_id}
            ).mappings().all()
            return [dict(r) for r in res]

    # --- CORE BOOKING LOGIC ---
    def get_available_nodes(self, start_time, end_time, location_id=None):
        start_time = to_utc_str(start_time)
        end_time = to_utc_str(end_time)
        with engine.connect() as conn:
            base_query = """
                SELECT * FROM Lab_Nodes
                WHERE status = 'Available'
                AND node_id NOT IN (
                    SELECT node_id FROM Reservations
                    WHERE status = 'Booked'
                    AND (start_time < CAST(:end AS TIMESTAMP) AND end_time > CAST(:start AS TIMESTAMP))
                )
            """
            params = {"start": start_time, "end": end_time}
            if location_id:
                base_query += " AND location_id = :loc"
                params["loc"] = location_id
            res = conn.execute(text(base_query), params).mappings().all()
            return [dict(r) for r in res]

    def book_hardware(self, user_id, node_id, start_time, end_time):
        start_time = to_utc_str(start_time)
        end_time = to_utc_str(end_time)

        with engine.begin() as conn:
            # 1. Inject Context for Audit Ledger
            conn.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})

            # 1.5. Prevent Race Conditions (Concurrency Lock)
            # We lock the User row and the Node row for the duration of this transaction.
            # This forces concurrent booking attempts for the same user or same node to wait in line.
            conn.execute(text("SELECT user_id FROM Users WHERE user_id = :user FOR UPDATE"), {"user": user_id})
            node_exists = conn.execute(text("SELECT node_id FROM Lab_Nodes WHERE node_id = :node FOR UPDATE"), {"node": node_id}).fetchone()
            if not node_exists: raise ValueError("NodeNotFound")

            # 2. Guard: Max 1 active booking
            user_check = conn.execute(text("""
                SELECT reservation_id FROM Reservations
                WHERE user_id = :user AND status = 'Booked' AND end_time > CURRENT_TIMESTAMP
                FOR UPDATE;
            """), {"user": user_id}).fetchall()
            if user_check: raise ValueError("UserConflict")

            # 3. Guard: Concurrency check
            node_check = conn.execute(text("""
                SELECT reservation_id FROM Reservations
                WHERE node_id = :node AND status = 'Booked'
                AND start_time < CAST(:end AS TIMESTAMP) AND end_time > CAST(:start AS TIMESTAMP)
                FOR UPDATE;
            """), {"node": node_id, "start": start_time, "end": end_time}).fetchall()
            if node_check: raise ValueError("NodeConflict")

            # 4. Guard: ML Surge Check
            artifact = self._ml_artifact
            if artifact and "model" in artifact:
                node_info = conn.execute(
                    text("SELECT node_type, location_id FROM Lab_Nodes WHERE node_id = :nid"),
                    {"nid": node_id}
                ).mappings().fetchone()

                if node_info:
                    le, model = artifact["node_encoder"], artifact["model"]
                    nt_enc = le.transform([node_info["node_type"]])[0]
                    
                    start_dt_utc = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S")
                    end_dt_utc = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
                    
                    # Convert to IST for ML model which expects local time
                    start_dt = start_dt_utc + timedelta(hours=5, minutes=30)
                    end_dt = end_dt_utc + timedelta(hours=5, minutes=30)
                    
                    # Align with ISODOW (1-7)
                    dow = start_dt.isoweekday()
                    is_wk = 1 if dow >= 6 else 0
                    
                    # Features: [day, hour, loc, node_enc, is_weekend]
                    X_infer = pd.DataFrame(
                        [[dow, start_dt.hour, node_info["location_id"], nt_enc, is_wk]],
                        columns=["day_of_week", "hour_of_day", "location_id", "node_type_enc", "is_weekend"]
                    )
                    
                    load = float(np.clip(model.predict(X_infer)[0], 0.0, 1.0))
                    duration = (end_dt - start_dt).total_seconds() / 3600.0
                    limit = _get_surge_max_hours(load)

                    if duration > limit:
                        raise ValueError(f"SurgeConflict:{limit:.0f}")

            # 5. Execute Insertion
            res = conn.execute(text("""
                INSERT INTO Reservations (user_id, node_id, start_time, end_time, status)
                VALUES (:user, :node, CAST(:start AS TIMESTAMP), CAST(:end AS TIMESTAMP), 'Booked')
                RETURNING reservation_id;
            """), {"user": user_id, "node": node_id, "start": start_time, "end": end_time}).fetchone()
            return {"message": "Success", "reservation_id": res[0]}

    # --- RETRIEVAL ---
    def get_my_bookings(self, user_id):
        with engine.connect() as conn:
            query = text("""
                SELECT r.*, n.node_name, n.node_type, n.location_id, l.building_name,
                CASE WHEN r.status = 'Booked' AND r.end_time <= CURRENT_TIMESTAMP THEN 'Completed' ELSE r.status END AS status
                FROM Reservations r 
                JOIN Lab_Nodes n ON r.node_id = n.node_id 
                JOIN Locations l ON n.location_id = l.location_id
                WHERE r.user_id = :user ORDER BY r.start_time DESC LIMIT 100;
            """)
            res = conn.execute(query, {"user": user_id}).mappings().all()
            return [dict(r) for r in res]

    def get_all_bookings(self, status_filter=None):
        with engine.connect() as conn:
            query = """
                SELECT r.*, u.full_name, u.roll_number, u.role, n.node_name, n.node_type, l.building_name,
                CASE WHEN r.status = 'Booked' AND r.end_time <= CURRENT_TIMESTAMP THEN 'Completed' ELSE r.status END AS status
                FROM Reservations r
                JOIN Users u ON r.user_id = u.user_id
                JOIN Lab_Nodes n ON r.node_id = n.node_id
                JOIN Locations l ON n.location_id = l.location_id
            """
            if status_filter:
                query += f" WHERE r.status = '{status_filter}'"
            query += " ORDER BY r.start_time DESC LIMIT 200" # PROTECT AGAINST CRASHES
            res = conn.execute(text(query)).mappings().all()
            return [dict(r) for r in res]

    def cancel_booking(self, res_id, action_by_user_id):
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": action_by_user_id})
            conn.execute(
                text("UPDATE Reservations SET status = 'Cancelled' WHERE reservation_id = :id"),
                {"id": res_id}
            )

    # --- HEATMAP ENGINE ---
    # Inside db.py -> get_heatmap_predictions
    def get_heatmap_predictions(self, location_id=None, node_type=None):
        artifact = self._ml_artifact
        if not artifact or "model" not in artifact: return []
        
        le, model = artifact["node_encoder"], artifact["model"]
        with engine.connect() as conn:
            locs = [location_id] if location_id else [r[0] for r in conn.execute(text("SELECT DISTINCT location_id FROM Locations")).fetchall()]
            
            # --- THE FIX IS HERE ---
            if node_type:
                # CRASH PREVENTION: If frontend sends a type we don't know, return empty
                if node_type not in le.classes_:
                    return []
                types = [node_type]
            else:
                types = [t for t in [r[0] for r in conn.execute(text("SELECT DISTINCT node_type FROM Lab_Nodes")).fetchall()] if t in le.classes_]
            # -----------------------

        rows = []
        for day in range(1, 8):
            for hour in range(24):
                is_wk = 1 if day >= 6 else 0
                for loc in locs:
                    for nt in types:
                        # This le.transform will no longer crash!
                        rows.append([day, hour, loc, le.transform([nt])[0], is_wk])

        X_batch = pd.DataFrame(rows, columns=["day_of_week", "hour_of_day", "location_id", "node_type_enc", "is_weekend"])
        preds = np.clip(model.predict(X_batch), 0.0, 1.0)
        
        grid = defaultdict(list)
        for i, row in enumerate(rows): grid[(row[0], row[1])].append(preds[i])
        
        return [{"day": d, "hour": h, "load": round(sum(grid[(d, h)])/len(grid[(d, h)]), 4)} for d in range(1, 8) for h in range(24)]

    # --- CRYPTOGRAPHIC AUDIT ---
    def run_full_security_audit(self):
        with engine.connect() as conn:
            logs = conn.execute(text("SELECT * FROM Reservation_log ORDER BY log_id ASC")).mappings().all()
            active = conn.execute(text("SELECT reservation_id, status FROM Reservations")).mappings().all()

            if not logs: return {"audit_failed": False, "status": "Secure", "message": "Ledger is empty."}

            prev_hash = '0000000000000000000000000000000000000000000000000000000000000000'
            ledger_final_states = {}

            for block in logs:
                res_id, action, status, action_by = block['reservation_id'], block['action'], block['status'], block['action_by_user_id']
                action_by_str = str(action_by) if action_by is not None else 'SYSTEM'

                payload = f"{prev_hash}{res_id}{action}{status}{action_by_str}"
                if hashlib.sha256(payload.encode()).hexdigest() != block['block_hash']:
                    return {"audit_failed": True, "anomaly_type": "CRYPTOGRAPHIC_FRACTURE", "message": f"Mismatch at Block #{block['log_id']}"}

                prev_hash = block['block_hash']
                if action == 'DELETE': ledger_final_states.pop(res_id, None)
                else: ledger_final_states[res_id] = status

            actual_db_states = {r['reservation_id']: r['status'] for r in active}
            for res_id, logged_status in ledger_final_states.items():
                actual_status = actual_db_states.get(res_id)
                if actual_status is None: return {"audit_failed": True, "anomaly_type": "STATE_DESYNC_GHOST", "message": f"Res {res_id} missing from DB."}
                if logged_status != actual_status: return {"audit_failed": True, "anomaly_type": "STATE_DESYNC_MUTATION", "message": f"Res {res_id} status mismatch."}

            return {"audit_failed": False, "message": f"Verified {len(logs)} blocks successfully."}

    def add_node(self, name, node_type, loc_id, access, specs, status="Available"):
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO Lab_Nodes (node_name, node_type, location_id, access_level, hardware_specs, status)
                VALUES (:name, :type, :loc, :access, :specs, :status)
            """), {"name": name, "type": node_type, "loc": loc_id, "access": access, "specs": json.dumps(specs), "status": status})

    def delete_node(self, node_id):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM Lab_Nodes WHERE node_id = :id"), {"id": node_id})

db = LabSchedulerDB()