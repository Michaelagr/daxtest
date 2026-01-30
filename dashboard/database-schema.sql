-- =============================================================================
-- DAX OPTIONS DASHBOARD - DATABASE SCHEMA
-- =============================================================================
-- Run this SQL in your Supabase SQL Editor:
-- 1. Go to https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" in the left sidebar
-- 4. Paste this entire file and click "Run"
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE: options_snapshots
-- Stores price data scraped from Eurex
-- This is the main table that the price crawler writes to
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS options_snapshots (
    -- Timestamps
    quote_time TIMESTAMP WITH TIME ZONE NOT NULL,  -- When the price was quoted
    crawl_time TIMESTAMP WITH TIME ZONE NOT NULL,  -- When we scraped it

    -- Option identification
    expiry_date DATE NOT NULL,                     -- Expiration date
    monthly_weekly VARCHAR(10),                    -- "monthly" or "weekly"
    option_type VARCHAR(4) NOT NULL,               -- "CALL" or "PUT"
    strike NUMERIC NOT NULL,                       -- Strike price

    -- Price data
    last_trade NUMERIC,                            -- Last traded price
    open_price NUMERIC,                            -- Opening price
    high_price NUMERIC,                            -- Daily high
    low_price NUMERIC,                             -- Daily low
    daily_settlement NUMERIC,                      -- Settlement price
    last_price NUMERIC,                            -- Most recent price
    bid NUMERIC,                                   -- Current bid
    ask NUMERIC,                                   -- Current ask

    -- Volume data
    open_interest BIGINT,                          -- Open contracts
    volume BIGINT,                                 -- Daily volume

    -- Raw data backup
    raw JSONB,                                     -- Original scraped data

    -- Primary key: unique combination of time + option
    PRIMARY KEY (quote_time, expiry_date, strike, option_type)
);

-- Index for fast queries by expiry date
CREATE INDEX IF NOT EXISTS idx_snapshots_expiry ON options_snapshots(expiry_date);

-- Index for fast queries by option type
CREATE INDEX IF NOT EXISTS idx_snapshots_type ON options_snapshots(option_type);

-- Index for recent data queries
CREATE INDEX IF NOT EXISTS idx_snapshots_quote_time ON options_snapshots(quote_time DESC);

-- -----------------------------------------------------------------------------
-- TABLE: option_margins
-- Stores margin requirements from Deutsche Börse Prisma API
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS option_margins (
    id SERIAL PRIMARY KEY,

    -- Option identification (matches options_snapshots format)
    expiry_date DATE NOT NULL,           -- Converted from YYYYMMDD
    option_type VARCHAR(4) NOT NULL,      -- "CALL" or "PUT" (converted from C/P)
    strike NUMERIC NOT NULL,              -- Exercise price

    -- Margin values
    initial_margin NUMERIC,               -- Initial margin in EUR
    premium_margin NUMERIC,               -- Premium margin in EUR

    -- Metadata
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint: one margin record per option
    UNIQUE(expiry_date, option_type, strike)
);

-- Index for fast lookups when joining with options_snapshots
CREATE INDEX IF NOT EXISTS idx_margins_lookup
ON option_margins(expiry_date, option_type, strike);

-- -----------------------------------------------------------------------------
-- TABLE: bookmarks
-- Stores user's favorite/watched options
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookmarks (
    id SERIAL PRIMARY KEY,

    -- User identification (for future multi-user support)
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Option identification
    expiry_date DATE NOT NULL,
    option_type VARCHAR(4) NOT NULL,      -- "CALL" or "PUT"
    strike NUMERIC NOT NULL,

    -- User notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Each user can bookmark each option only once
    UNIQUE(user_id, expiry_date, option_type, strike)
);

-- Index for fast user bookmark lookups
CREATE INDEX IF NOT EXISTS idx_bookmarks_user
ON bookmarks(user_id);

-- -----------------------------------------------------------------------------
-- VIEW: latest_options
-- Gets only the most recent snapshot for each option
-- This avoids showing duplicate rows from different crawl times
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW latest_options AS
WITH ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY expiry_date, option_type, strike
            ORDER BY quote_time DESC
        ) as rn
    FROM options_snapshots
)
SELECT
    quote_time,
    crawl_time,
    expiry_date,
    monthly_weekly,
    option_type,
    strike,
    last_trade,
    open_price,
    high_price,
    low_price,
    daily_settlement,
    open_interest,
    volume,
    last_price,
    bid,
    ask
FROM ranked
WHERE rn = 1;

-- -----------------------------------------------------------------------------
-- VIEW: options_with_margins
-- Combines latest option prices with margin data
-- This is the main view used by the dashboard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW options_with_margins AS
SELECT
    o.quote_time,
    o.crawl_time,
    o.expiry_date,
    o.monthly_weekly,
    o.option_type,
    o.strike,
    o.last_trade,
    o.open_price,
    o.high_price,
    o.low_price,
    o.daily_settlement,
    o.open_interest,
    o.volume,
    o.last_price,
    o.bid,
    o.ask,
    m.initial_margin,
    m.premium_margin
FROM latest_options o
LEFT JOIN option_margins m ON
    o.expiry_date = m.expiry_date AND
    o.option_type = m.option_type AND
    o.strike = m.strike;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- Allows users to read all options but only manage their own bookmarks
-- -----------------------------------------------------------------------------

-- Enable RLS on options_snapshots (publicly readable)
ALTER TABLE options_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read options data
CREATE POLICY "Options are publicly readable" ON options_snapshots
    FOR SELECT USING (true);

-- Enable RLS on bookmarks (users can only see/edit their own)
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own bookmarks
CREATE POLICY "Users can view own bookmarks" ON bookmarks
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own bookmarks
CREATE POLICY "Users can create own bookmarks" ON bookmarks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own bookmarks
CREATE POLICY "Users can delete own bookmarks" ON bookmarks
    FOR DELETE USING (auth.uid() = user_id);

-- Policy: Users can update their own bookmarks
CREATE POLICY "Users can update own bookmarks" ON bookmarks
    FOR UPDATE USING (auth.uid() = user_id);

-- Make margins readable by everyone
ALTER TABLE option_margins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Margins are publicly readable" ON option_margins
    FOR SELECT USING (true);

-- =============================================================================
-- DONE! Your database is now ready for the dashboard.
-- =============================================================================
