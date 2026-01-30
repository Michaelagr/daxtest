/**
 * Supabase Client Configuration
 *
 * This file creates a connection to your Supabase database.
 * The NEXT_PUBLIC_ prefix means these variables are available in the browser.
 */

import { createClient } from '@supabase/supabase-js'

// Get the Supabase URL and key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create the Supabase client - this is what we use to query the database
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * TypeScript types for our database tables
 * These help catch errors when writing code
 */

// Option data from the options_snapshots table
export interface OptionSnapshot {
  quote_time: string           // When the price was quoted (ISO timestamp)
  crawl_time: string           // When we scraped the data (ISO timestamp)
  expiry_date: string          // Option expiration date (YYYY-MM-DD)
  monthly_weekly: string       // "monthly" or "weekly"
  option_type: string          // "CALL" or "PUT"
  strike: number               // Strike price
  last_trade: number | null    // Last traded price
  open_price: number | null    // Opening price
  high_price: number | null    // Daily high
  low_price: number | null     // Daily low
  daily_settlement: number | null  // Settlement price
  open_interest: number | null // Open contracts
  volume: number | null        // Daily volume
  last_price: number | null    // Most recent price
  bid: number | null           // Current bid
  ask: number | null           // Current ask
}

// Margin data (we'll add this table)
export interface OptionMargin {
  id?: number
  contract_date: string        // Expiry date (YYYYMMDD format from API)
  call_put_flag: string        // "C" or "P"
  exercise_price: number       // Strike price
  initial_margin: number       // Required initial margin in EUR
  premium_margin: number       // Premium margin in EUR
  updated_at?: string          // Last update timestamp
}

// Combined view for display (options with margins)
export interface OptionWithMargin extends OptionSnapshot {
  initial_margin?: number | null
  premium_margin?: number | null
}

// Bookmark for tracking favorite options
export interface Bookmark {
  id?: number
  user_id?: string             // User who bookmarked (for multi-user support)
  expiry_date: string
  strike: number
  option_type: string          // "CALL" or "PUT"
  created_at?: string
  notes?: string               // Optional user notes
}
