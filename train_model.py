import os
import pandas as pd
import joblib
from sqlalchemy import create_engine, text
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))

def train_load_predictor():
    print("--- 🧠 ML TRAINING: ISODOW-ALIGNED BOOSTING ---")

    query = text("""
    WITH Time_Skeleton AS (
        SELECT generate_series(
            CURRENT_DATE - INTERVAL '180 days', 
            CURRENT_DATE, 
            INTERVAL '1 hour'
        ) AS slot
    ),
    Node_Configs AS (
        SELECT DISTINCT node_type, location_id FROM Lab_Nodes
    ),
    Capacity AS (
        SELECT node_type, location_id, COUNT(*) as total_nodes
        FROM Lab_Nodes GROUP BY node_type, location_id
    ),
    Hourly_Usage AS (
        SELECT 
            ts.slot,
            nc.node_type,
            nc.location_id,
            COUNT(r.reservation_id) as active_bookings
        FROM Time_Skeleton ts
        CROSS JOIN Node_Configs nc
        LEFT JOIN Reservations r ON r.node_id IN (
            SELECT node_id FROM Lab_Nodes 
            WHERE node_type = nc.node_type AND location_id = nc.location_id
        )
        AND ts.slot >= r.start_time AND ts.slot < r.end_time
        GROUP BY ts.slot, nc.node_type, nc.location_id
    )
    SELECT 
        EXTRACT(ISODOW FROM h.slot) as day_of_week, -- 1=Mon, 7=Sun
        EXTRACT(HOUR FROM h.slot) as hour_of_day,
        h.location_id,
        h.node_type,
        LEAST(CAST(h.active_bookings AS FLOAT) / NULLIF(c.total_nodes, 0), 1.0) as utilization_rate
    FROM Hourly_Usage h
    JOIN Capacity c ON h.node_type = c.node_type AND h.location_id = c.location_id;
    """)

    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    if df.empty:
        print("❌ No data found.")
        return

    # 1. Feature Engineering
    df['is_weekend'] = df['day_of_week'].apply(lambda x: 1 if x >= 6 else 0)
    le = LabelEncoder()
    df['node_type_enc'] = le.fit_transform(df['node_type'])

    # 2. Features: [Day, Hour, Loc, Node_Enc, Weekend_Flag]
    X = df[['day_of_week', 'hour_of_day', 'location_id', 'node_type_enc', 'is_weekend']]
    y = df['utilization_rate']

    # 3. Aggressive Gradient Boosting
    model = GradientBoostingRegressor(n_estimators=300, learning_rate=0.08, max_depth=6, random_state=42)
    model.fit(X, y)

    # 4. Save Artifact
    artifact = {"model": model, "node_encoder": le}
    joblib.dump(artifact, "advanced_load_predictor.pkl")
    print(f"✅ Trained on {len(df)} points. Artifact saved.")

if __name__ == "__main__":
    train_load_predictor()