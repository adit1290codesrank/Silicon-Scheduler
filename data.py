import os
import random
import bcrypt
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))

def seed_database():
    with engine.begin() as conn:
        print("1. Creating Ghost User...")
        salt = bcrypt.gensalt()
        hashed_pw = bcrypt.hashpw(b"testpass", salt).decode('utf-8')
        
        user_res = conn.execute(text("""
            INSERT INTO Users (roll_number, full_name, email, password_hash, role)
            VALUES ('TEST-000', 'Historical Bot', 'bot@test.com', :pw, 'Student')
            ON CONFLICT (roll_number) DO UPDATE SET full_name = 'Historical Bot'
            RETURNING user_id;
        """), {"pw": hashed_pw}).fetchone()
        test_user_id = user_res[0]

        print("2. Fetching Nodes...")
        nodes = conn.execute(text("SELECT node_id, node_type, location_id FROM Lab_Nodes")).mappings().all()
        if not nodes:
            print("❌ ERROR: No Lab Nodes found.")
            return

        print("3. Generating 6 Months of High-Contrast Data...")
        conn.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": test_user_id})

        start_date = datetime.now() - timedelta(days=180)
        inserts = []

        for day_offset in range(180):
            current_day = start_date + timedelta(days=day_offset)
            is_weekend = current_day.weekday() >= 5
            
            # Lab open 8 AM to 11 PM
            for hour in range(8, 23): 
                for node in nodes:
                    ntype = node['node_type'].upper()
                    prob = 0.05 # Low base chance

                    # HIGH CONTRAST LOGIC
                    if 'GPU' in ntype or 'SUPER' in ntype:
                        # Busy nights/weekends (Researcher Pattern)
                        if is_weekend or hour > 17:
                            prob = 0.85 
                        elif 10 <= hour <= 16:
                            prob = 0.20
                    else:
                        # Busy midday weekdays (Academic Pattern)
                        if not is_weekend and 10 <= hour <= 16:
                            prob = 0.90
                        else:
                            prob = 0.10

                    if random.random() < prob:
                        start_time = current_day.replace(hour=hour, minute=0, second=0)
                        duration = random.choice([1, 2, 3])
                        end_time = start_time + timedelta(hours=duration)
                        
                        if end_time.day != start_time.day: 
                            end_time = start_time + timedelta(hours=1)

                        inserts.append({
                            "user": test_user_id,
                            "node": node['node_id'],
                            "start": start_time.strftime("%Y-%m-%d %H:%M:%S"),
                            "end": end_time.strftime("%Y-%m-%d %H:%M:%S"),
                            "status": "Completed"
                        })

        conn.execute(text("""
            INSERT INTO Reservations (user_id, node_id, start_time, end_time, status)
            VALUES (:user, :node, CAST(:start AS TIMESTAMP), CAST(:end AS TIMESTAMP), :status)
        """), inserts)

        print(f"✅ Injected {len(inserts)} patterns into the Ledger.")

if __name__ == "__main__":
    seed_database()