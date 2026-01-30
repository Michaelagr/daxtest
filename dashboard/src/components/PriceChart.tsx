'use client'

/**
 * PriceChart Component
 *
 * Displays price history for a specific option using Recharts.
 * Shows bid/ask spread and settlement prices over time.
 */

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts'
import { supabase } from '@/lib/supabase'

interface PriceChartProps {
  expiryDate: string
  strike: number
  optionType: string
}

interface PricePoint {
  time: string
  displayTime: string
  bid: number | null
  ask: number | null
  last_price: number | null
  daily_settlement: number | null
}

export default function PriceChart({ expiryDate, strike, optionType }: PriceChartProps) {
  const [data, setData] = useState<PricePoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('today')

  // Fetch price history from Supabase
  useEffect(() => {
    async function fetchHistory() {
      setIsLoading(true)
      setError(null)

      try {
        // Calculate date range based on selected time range
        const now = new Date()
        let startDate: Date

        switch (timeRange) {
          case 'today':
            startDate = new Date(now)
            startDate.setHours(0, 0, 0, 0)
            break
          case '7d':
            startDate = new Date(now)
            startDate.setDate(startDate.getDate() - 7)
            break
          case '30d':
            startDate = new Date(now)
            startDate.setDate(startDate.getDate() - 30)
            break
        }

        // Query historical data from options_snapshots
        const { data: history, error: queryError } = await supabase
          .from('options_snapshots')
          .select('quote_time, bid, ask, last_price, daily_settlement')
          .eq('expiry_date', expiryDate)
          .eq('strike', strike)
          .eq('option_type', optionType)
          .gte('quote_time', startDate.toISOString())
          .order('quote_time', { ascending: true })

        if (queryError) throw queryError

        // Format data for the chart
        const chartData: PricePoint[] = (history || []).map((row) => {
          const date = new Date(row.quote_time)
          return {
            time: row.quote_time,
            displayTime:
              timeRange === 'today'
                ? date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
            bid: row.bid,
            ask: row.ask,
            last_price: row.last_price,
            daily_settlement: row.daily_settlement,
          }
        })

        setData(chartData)
      } catch (err) {
        console.error('Error fetching price history:', err)
        setError(err instanceof Error ? err.message : 'Failed to load history')
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()
  }, [expiryDate, strike, optionType, timeRange])

  // Format tooltip values
  const formatTooltip = (value: number | null) => {
    if (value === null) return '-'
    return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="w-full">
      {/* Time Range Selector */}
      <div className="flex gap-2 mb-4">
        {(['today', '7d', '30d'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 py-1 text-sm rounded ${
              timeRange === range
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {range === 'today' ? 'Today' : range === '7d' ? '7 Days' : '30 Days'}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="h-64 flex items-center justify-center text-gray-500">
          Loading price history...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="h-64 flex items-center justify-center text-red-500">
          Error: {error}
        </div>
      )}

      {/* No Data State */}
      {!isLoading && !error && data.length === 0 && (
        <div className="h-64 flex items-center justify-center text-gray-500">
          No price history available for this time range.
        </div>
      )}

      {/* Chart */}
      {!isLoading && !error && data.length > 0 && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="displayTime"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => value.toFixed(0)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(value) => formatTooltip(value as number | null)}
                labelFormatter={(label) => `Time: ${label}`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Legend />

              {/* Bid/Ask spread area */}
              <Area
                type="monotone"
                dataKey="ask"
                stroke="none"
                fill="#fee2e2"
                fillOpacity={0.5}
                name="Ask"
              />
              <Area
                type="monotone"
                dataKey="bid"
                stroke="none"
                fill="#dcfce7"
                fillOpacity={0.5}
                name="Bid"
              />

              {/* Bid line */}
              <Line
                type="monotone"
                dataKey="bid"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                name="Bid"
              />

              {/* Ask line */}
              <Line
                type="monotone"
                dataKey="ask"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                name="Ask"
              />

              {/* Last price line */}
              <Line
                type="monotone"
                dataKey="last_price"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Last"
                strokeDasharray="5 5"
              />

              {/* Settlement line */}
              <Line
                type="monotone"
                dataKey="daily_settlement"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                name="Settlement"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend explanation */}
      <div className="mt-4 text-xs text-gray-500 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-500"></div>
          <span>Bid (what buyers offer)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-red-500"></div>
          <span>Ask (what sellers want)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-blue-500 border-dashed"></div>
          <span>Last traded price</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-purple-500"></div>
          <span>Daily settlement</span>
        </div>
      </div>
    </div>
  )
}
