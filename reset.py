import os
import json
import random
import bcrypt
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL not found in .env")
    exit(1)

engine = create_engine(DATABASE_URL)

SCHEMA_SQL = """
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE TABLE Users (
    user_id SERIAL PRIMARY KEY,
    roll_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'Student' CHECK (role IN ('Student', 'Admin', 'Professor'))
);

CREATE TABLE Locations (
    location_id SERIAL PRIMARY KEY,
    building_name VARCHAR(50) NOT NULL,
    floor_number INT NOT NULL,
    room_number VARCHAR(20) NOT NULL,
    UNIQUE(building_name, floor_number, room_number)
);

CREATE TABLE Lab_Nodes (
    node_id SERIAL PRIMARY KEY,
    node_name VARCHAR(50) UNIQUE NOT NULL,
    node_type VARCHAR(50) NOT NULL,
    location_id INT NOT NULL REFERENCES Locations(location_id) ON DELETE RESTRICT,
    access_level VARCHAR(20) DEFAULT 'Student' CHECK (access_level IN ('Student', 'Professor')),
    status VARCHAR(20) DEFAULT 'Available' CHECK (status IN ('Available', 'Maintenance', 'Offline')),
    hardware_specs JSONB NOT NULL
);

CREATE TABLE Reservations (
    reservation_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    node_id INT NOT NULL REFERENCES Lab_Nodes(node_id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'Booked' CHECK (status IN ('Booked', 'Completed', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

CREATE INDEX idx_res_time_range ON Reservations USING btree (start_time, end_time);
CREATE INDEX idx_res_user ON Reservations USING btree (user_id);
CREATE INDEX idx_res_node ON Reservations USING btree (node_id);

CREATE TABLE Reservation_log (
    log_id SERIAL PRIMARY KEY,
    reservation_id INT NOT NULL,
    action VARCHAR(10) NOT NULL, 
    status VARCHAR(20) NOT NULL,
    action_by_user_id INT,
    event_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    previous_hash VARCHAR(64),
    block_hash VARCHAR(64) NOT NULL
);

-- Cryptographic Extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The Cryptographic Trigger Logic
CREATE OR REPLACE FUNCTION seal_reservation_audit()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    new_hash VARCHAR(64);
    payload TEXT;
    v_user_id_str VARCHAR;
BEGIN
    -- Get the hash of the last block
    SELECT block_hash INTO prev_hash FROM Reservation_log ORDER BY log_id DESC LIMIT 1;
    
    -- If log is empty, use the Genesis Hash
    IF prev_hash IS NULL THEN
        prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    -- Grab the user_id injected by Python's SET LOCAL command
    BEGIN
        v_user_id_str := current_setting('app.current_user_id', true);
        IF v_user_id_str IS NULL OR v_user_id_str = '' THEN
            v_user_id_str := 'SYSTEM';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_user_id_str := 'SYSTEM';
    END;

    -- Create the string payload EXACTLY as Python does: prev + id + action + status + user
    IF TG_OP = 'DELETE' THEN
        payload := prev_hash || OLD.reservation_id || TG_OP || OLD.status || v_user_id_str;
    ELSE
        payload := prev_hash || NEW.reservation_id || TG_OP || NEW.status || v_user_id_str;
    END IF;

    -- Generate SHA-256 hash
    new_hash := encode(digest(payload, 'sha256'), 'hex');

    -- Insert into Reservation_log
    IF TG_OP = 'DELETE' THEN
        INSERT INTO Reservation_log (reservation_id, action, status, action_by_user_id, previous_hash, block_hash)
        VALUES (OLD.reservation_id, TG_OP, OLD.status, NULLIF(v_user_id_str, 'SYSTEM')::INT, prev_hash, new_hash);
        RETURN OLD;
    ELSE
        INSERT INTO Reservation_log (reservation_id, action, status, action_by_user_id, previous_hash, block_hash)
        VALUES (NEW.reservation_id, TG_OP, NEW.status, NULLIF(v_user_id_str, 'SYSTEM')::INT, prev_hash, new_hash);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Attach the Trigger to Reservations table
DROP TRIGGER IF EXISTS audit_reservations_trigger ON Reservations;
CREATE TRIGGER audit_reservations_trigger
AFTER INSERT OR UPDATE OR DELETE ON Reservations
FOR EACH ROW EXECUTE FUNCTION seal_reservation_audit();
REVOKE UPDATE, DELETE ON Reservation_log FROM PUBLIC;
"""

def populate_db():
    print("🚀 Initiating Database Reset & Seeding...")
    
    with engine.begin() as conn:
        print("🏗️ Rebuilding Schema...")
        conn.execute(text(SCHEMA_SQL))
            
        # --- 1. LOCATIONS ---
        print("🏢 Seeding Locations...")
        locs = [
            {"bldg": "CS Block", "flr": 1, "rm": "101"},
            {"bldg": "CS Block", "flr": 2, "rm": "204"},
            {"bldg": "AI Lab", "flr": 1, "rm": "105"}
        ]
        for l in locs:
            conn.execute(text("""
                INSERT INTO Locations (building_name, floor_number, room_number)
                VALUES (:bldg, :flr, :rm)
            """), {"bldg": l["bldg"], "flr": l["flr"], "rm": l["rm"]})

        # --- 2. LAB NODES ---
        print("💻 Seeding Lab Nodes...")
        nodes = [
            {"name": "Alpha-Server-01", "type": "Server", "loc": 1, "access": "Student", "status": "Available", "specs": {"CPU": "64-Core AMD", "RAM": "256GB"}},
            {"name": "Titan-GPU-Rig", "type": "GPU Node", "loc": 3, "access": "Student", "status": "Available", "specs": {"GPU": "4x RTX 6000 Ada", "VRAM": "192GB"}},
            {"name": "Research-Cluster", "type": "Cluster", "loc": 3, "access": "Professor", "status": "Available", "specs": {"Nodes": "12", "Network": "100Gbps"}},
            {"name": "Verilog-Board-A", "type": "FPGA", "loc": 2, "access": "Student", "status": "Maintenance", "specs": {"Logic Cells": "1.2M", "DSP Slices": "3000"}},
            {"name": "CAD-Station-01", "type": "Workstation", "loc": 2, "access": "Student", "status": "Available", "specs": {"CPU": "Intel i9", "GPU": "RTX A4000"}},
            {"name": "Param-Compute", "type": "Supercomputer", "loc": 3, "access": "Professor", "status": "Offline", "specs": {"TFLOPS": "500", "Architecture": "Cray EX"}},
            {"name": "Beta-Server-02", "type": "Server", "loc": 1, "access": "Student", "status": "Available", "specs": {"CPU": "32-Core Xeon", "RAM": "128GB"}},
            {"name": "ML-Rig-02", "type": "GPU Node", "loc": 3, "access": "Student", "status": "Available", "specs": {"GPU": "2x RTX 3050", "VRAM": "16GB"}}
        ]
        for n in nodes:
            conn.execute(text("""
                INSERT INTO Lab_Nodes (node_name, node_type, location_id, access_level, status, hardware_specs)
                VALUES (:name, :type, :loc, :access, :status, :specs)
            """), {
                "name": n["name"], "type": n["type"], "loc": n["loc"], 
                "access": n["access"], "status": n["status"], "specs": json.dumps(n["specs"])
            })

        # --- 3. ADMIN USER ---
        print("👤 Seeding Admin User...")
        salt = bcrypt.gensalt()
        admin_pw = bcrypt.hashpw(b"admin1290", salt).decode('utf-8')
        conn.execute(text("""
            INSERT INTO Users (roll_number, full_name, email, password_hash, role)
            VALUES ('ADMIN01', 'System Administrator', 'admin@silicon.edu', :pw, 'Admin')
        """), {"pw": admin_pw})

        # --- 4. TEST STUDENT USER ---
        print("🧪 Seeding Test Student...")
        test_pw = bcrypt.hashpw(b"testpass", bcrypt.gensalt()).decode('utf-8')
        test_user = conn.execute(text("""
            INSERT INTO Users (roll_number, full_name, email, password_hash, role)
            VALUES ('TEST01', 'Test Student', 'test@silicon.edu', :pw, 'Student')
            RETURNING user_id;
        """), {"pw": test_pw}).fetchone()
        test_uid = test_user[0]

        # --- 5. HISTORICAL RESERVATIONS (500) ---
        print("📊 Seeding 100 historical reservations...")
        conn.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": test_uid})

        available_nodes = conn.execute(
            text("SELECT node_id FROM Lab_Nodes WHERE status = 'Available'")
        ).fetchall()
        node_ids = [r[0] for r in available_nodes]

        inserts = []
        base_date = datetime.now() - timedelta(days=90)
        for i in range(100):
            day_offset = random.randint(0, 89)
            hour = random.randint(8, 20)
            duration = random.choice([1, 2, 3])
            start = (base_date + timedelta(days=day_offset)).replace(
                hour=hour, minute=0, second=0, microsecond=0
            )
            end = start + timedelta(hours=duration)
            inserts.append({
                "user": test_uid,
                "node": random.choice(node_ids),
                "start": start.strftime("%Y-%m-%d %H:%M:%S"),
                "end": end.strftime("%Y-%m-%d %H:%M:%S"),
            })

        conn.execute(text("""
            INSERT INTO Reservations (user_id, node_id, start_time, end_time, status)
            VALUES (:user, :node, CAST(:start AS TIMESTAMP), CAST(:end AS TIMESTAMP), 'Completed')
        """), inserts)

    print(f"✅ Database reset & seeded (Admin + Test Student + {len(inserts)} reservations)!")

if __name__ == "__main__":
    confirm = input("⚠️ This will WIPE the current database and rebuild it. Type 'YES' to continue: ")
    if confirm == "YES":
        populate_db()
    else:
        print("Aborted.")