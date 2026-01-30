# db_ingest.py
import os, json
import pandas as pd
import pytz
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def clean_german_number(value):
    """Convert German number format to float: 8.977,00 -> 8977.00"""
    if pd.isna(value) or value == '-' or value == '':
        return None
    if isinstance(value, (int, float)):
        return float(value)
    # Remove thousand separator (.) and replace decimal comma with dot
    cleaned = str(value).replace('.', '').replace(',', '.')
    try:
        return float(cleaned)
    except:
        return None

def prepare_df(df):
    df = df.copy()
    
    # Parse quote_time from date + time
    df['quote_time'] = pd.to_datetime(
        df['date'].astype(str) + ' ' + df['time'].astype(str),
        format='%Y-%m-%d %H:%M',
        errors='coerce'
    )
    
    # Convert to UTC
    berlin = pytz.timezone('Europe/Berlin')
    df['quote_time'] = df['quote_time'].dt.tz_localize(
        berlin, 
        ambiguous='infer', 
        nonexistent='shift_forward'
    ).dt.tz_convert('UTC')
    
    # Parse expiry_date (format: 21.11.2025)
    df['expiry_date'] = pd.to_datetime(
        df['contract_date'], 
        format='%d.%m.%Y',
        errors='coerce'
    ).dt.date
    
    # Clean numeric columns with German formatting
    numeric_cols = ['strike', 'last_trade', 'open', 'high', 'low', 
                    'daily_settlement', 'last_price', 'bid', 'ask']
    
    for col in numeric_cols:
        if col in df.columns:
            df[col] = df[col].apply(clean_german_number)
    
    # Clean integer columns
    int_cols = ['open_interest', 'volume']
    for col in int_cols:
        if col in df.columns:
            df[col] = df[col].apply(clean_german_number)
            df[col] = df[col].astype('Int64')  # Nullable integer
    
    # Rename to match database columns
    df = df.rename(columns={
        'open': 'open_price',
        'high': 'high_price',
        'low': 'low_price'
    })
    
    return df

def upsert_snapshots(df):
    df = prepare_df(df)
    
    records = []
    crawl_time = datetime.now(timezone.utc)
    
    for _, row in df.iterrows():
        raw = row.to_dict()

        # Helper function to convert pandas NA to None
        def safe_value(val):
            if pd.isna(val):
                return None
            return val
        
        
        rec = (
            row['quote_time'].to_pydatetime() if pd.notna(row['quote_time']) else None,
            crawl_time,
            row['expiry_date'],
            safe_value(row.get('monthly_weekly')),
            safe_value(row.get('option_type')),
            safe_value(row.get('strike')),
            safe_value(row.get('last_trade')),
            safe_value(row.get('open_price')),
            safe_value(row.get('high_price')),
            safe_value(row.get('low_price')),
            safe_value(row.get('daily_settlement')),
            safe_value(row.get('open_interest')),
            safe_value(row.get('volume')),
            safe_value(row.get('last_price')),
            safe_value(row.get('bid')),
            safe_value(row.get('ask')),
            json.dumps({k: None if pd.isna(v) else v for k, v in raw.items()}, default=str)
        )
        records.append(rec)

    if not records:
        print("No records to insert.")
        return

    insert_sql = """
    INSERT INTO options_snapshots
    (quote_time, crawl_time, expiry_date, monthly_weekly, option_type, strike,
     last_trade, open_price, high_price, low_price, daily_settlement, open_interest, volume, 
     last_price, bid, ask, raw)
    VALUES %s
    ON CONFLICT (quote_time, expiry_date, strike, option_type) 
    DO UPDATE SET
      last_trade = EXCLUDED.last_trade,
      open_price = EXCLUDED.open_price,
      high_price = EXCLUDED.high_price,
      low_price = EXCLUDED.low_price,
      daily_settlement = EXCLUDED.daily_settlement,
      open_interest = EXCLUDED.open_interest,
      volume = EXCLUDED.volume,
      last_price = EXCLUDED.last_price,
      bid = EXCLUDED.bid,
      ask = EXCLUDED.ask,
      raw = EXCLUDED.raw,
      crawl_time = EXCLUDED.crawl_time;
    """
    
    print(f"Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    try:
        execute_values(cur, insert_sql, records, page_size=1000)
        conn.commit()
        print(f"✅ Successfully inserted/updated {len(records)} rows")
    except Exception as e:
        conn.rollback()
        print(f"❌ Database error: {e}")
        raise
    finally:
        cur.close()
        conn.close()