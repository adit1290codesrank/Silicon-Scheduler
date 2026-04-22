import joblib
import pandas as pd
import numpy as np
import warnings

# Silence the feature name warnings
warnings.filterwarnings("ignore", category=UserWarning)

def debug_heatmap_matrix():
    print("--- 🗺️ HEATMAP RAW DATA DEBUGGER ---")
    
    # 1. Load Artifact
    try:
        artifact = joblib.load("advanced_load_predictor.pkl")
        model = artifact["model"]
        le = artifact["node_encoder"]
        print("✅ Model Artifact Loaded.")
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        return

    # 2. Pick a specific Hardware Type to test
    # Change 'GPU Node' to whatever your specific DB label is
    target_node = "GPU Node" 
    location_id = 1
    
    try:
        nt_enc = le.transform([target_node])[0]
    except:
        print(f"❌ Error: '{target_node}' not found in model classes: {list(le.classes_)}")
        return

    print(f"--- 📊 PREDICTING 24x7 FOR: {target_node} (Loc: {location_id}) ---")
    print(f"{'Day':<10} | {'Hour':<5} | {'Load %':<10} | {'Status'}")
    print("-" * 45)

    # 3. Generate the 168 rows
    all_data = []
    for day in range(1, 8): # 1=Mon, 7=Sun
        for hour in range(24): # 0-23
            is_wk = 1 if day >= 6 else 0
            
            # Use the EXACT column names from training
            X = pd.DataFrame(
                [[day, hour, location_id, nt_enc, is_wk]],
                columns=["day_of_week", "hour_of_day", "location_id", "node_type_enc", "is_weekend"]
            )
            
            prediction = model.predict(X)[0]
            load_pct = max(0, prediction * 100)
            
            day_name = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day-1]
            status = "🟥" if load_pct > 70 else "🟨" if load_pct > 30 else "🟦"
            
            all_data.append(load_pct)
            
            # Print only specific snapshots to keep terminal clean
            if hour in [4, 14, 21]: # 4 AM, 2 PM, 9 PM
                print(f"{day_name:<10} | {hour:02d}:00 | {load_pct:>6.2f}%    | {status}")

    # 4. Global Stats
    print("-" * 45)
    print(f"TOTAL CELLS: {len(all_data)}")
    print(f"MAX LOAD:    {max(all_data):.2f}%")
    print(f"MIN LOAD:    {min(all_data):.2f}%")
    print(f"AVG LOAD:    {np.mean(all_data):.2f}%")
    
    if max(all_data) - min(all_data) < 5:
        print("\n⚠️ WARNING: The matrix is very 'flat'. Check your training data!")
    else:
        print("\n✅ Matrix has good contrast. The bug is likely in your React CSS/Mapping.")

if __name__ == "__main__":
    debug_heatmap_matrix()