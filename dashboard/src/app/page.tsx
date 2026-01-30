'use client'

/**
 * DAX Options Dashboard - Main Page
 *
 * This is the main entry point for your options dashboard.
 * It fetches data from Supabase and displays it in a table.
 */

import { useState, useEffect } from 'react'
import { supabase, OptionWithMargin } from '@/lib/supabase'
import OptionsTable from '@/components/OptionsTable'
import PriceChart from '@/components/PriceChart'
import LoginForm from '@/components/LoginForm'
import { useBookmarks } from '@/lib/useBookmarks'
import { useAuth } from '@/lib/auth'

export default function Dashboard() {
  // Authentication
  const { user, isLoading: authLoading, signOut } = useAuth()

  // State for storing the options data
  const [options, setOptions] = useState<OptionWithMargin[]>([])

  // State for loading indicator
  const [isLoading, setIsLoading] = useState(true)

  // State for any errors
  const [error, setError] = useState<string | null>(null)

  // State for the last update time
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // State for selected option (for detail view/charts)
  const [selectedOption, setSelectedOption] = useState<OptionWithMargin | null>(null)

  // Bookmark management
  const { bookmarks, isBookmarked, toggleBookmark } = useBookmarks()

  // Fetch data from Supabase when the page loads (only if authenticated)
  useEffect(() => {
    fetchOptions()

    // Set up real-time subscription for updates
    const subscription = supabase
      .channel('options-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'options_snapshots' },
        () => {
          // When data changes, refresh the table
          console.log('Data changed, refreshing...')
          fetchOptions()
        }
      )
      .subscribe()

    // Cleanup subscription when component unmounts
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Function to fetch options data
  async function fetchOptions() {
    try {
      setIsLoading(true)
      setError(null)

      // Try to fetch from the combined view first
      // If it doesn't exist yet, fall back to just options_snapshots
      let { data, error: queryError } = await supabase
        .from('options_with_margins')
        .select('*')
        .order('expiry_date', { ascending: true })
        .order('strike', { ascending: true })

      // If the view doesn't exist, try the base table
      if (queryError && queryError.message.includes('does not exist')) {
        console.log('View not found, using base table')
        const result = await supabase
          .from('options_snapshots')
          .select('*')
          .order('expiry_date', { ascending: true })
          .order('strike', { ascending: true })

        data = result.data
        queryError = result.error
      }

      if (queryError) {
        throw queryError
      }

      setOptions(data || [])
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Error fetching options:', err)
      setError(err instanceof Error ? err.message : 'Failed to load options')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle clicking on a row
  function handleRowClick(option: OptionWithMargin) {
    setSelectedOption(option)
    console.log('Selected option:', option)
    // TODO: Open detail modal or chart view
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  // Show login form if not authenticated
  if (!user) {
    return <LoginForm />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-[1800px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">DAX Options Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Real-time option prices and margin requirements
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Last update time */}
              {lastUpdate && (
                <div className="text-sm text-gray-500">
                  Last updated: {lastUpdate.toLocaleTimeString('de-DE')}
                </div>
              )}

              {/* Refresh button */}
              <button
                onClick={fetchOptions}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Loading...' : 'Refresh'}
              </button>

              {/* User info and sign out */}
              <div className="flex items-center gap-3 pl-4 border-l">
                <span className="text-sm text-gray-600">{user.email}</span>
                <button
                  onClick={signOut}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <strong>Error:</strong> {error}
            <button
              onClick={fetchOptions}
              className="ml-4 text-red-600 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Options Table */}
        <OptionsTable
          data={options}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          isBookmarked={isBookmarked}
          onToggleBookmark={toggleBookmark}
          bookmarkCount={bookmarks.length}
        />

        {/* Selected Option Detail (placeholder for now) */}
        {selectedOption && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedOption(null)}>
            <div
              className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">Option Details</h2>
                <button
                  onClick={() => setSelectedOption(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Expiry:</span>
                  <span className="ml-2 font-medium">
                    {new Date(selectedOption.expiry_date).toLocaleDateString('de-DE')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className={`ml-2 font-medium ${selectedOption.option_type === 'CALL' ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedOption.option_type}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Strike:</span>
                  <span className="ml-2 font-medium">{selectedOption.strike?.toLocaleString('de-DE')}</span>
                </div>
                <div>
                  <span className="text-gray-500">Bid/Ask:</span>
                  <span className="ml-2 font-medium">
                    {selectedOption.bid?.toFixed(2) || '-'} / {selectedOption.ask?.toFixed(2) || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Last Price:</span>
                  <span className="ml-2 font-medium">{selectedOption.last_price?.toFixed(2) || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Volume:</span>
                  <span className="ml-2 font-medium">{selectedOption.volume?.toLocaleString('de-DE') || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Open Interest:</span>
                  <span className="ml-2 font-medium">{selectedOption.open_interest?.toLocaleString('de-DE') || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Initial Margin:</span>
                  <span className="ml-2 font-medium">
                    {selectedOption.initial_margin ? `€${selectedOption.initial_margin.toLocaleString('de-DE')}` : '-'}
                  </span>
                </div>
              </div>

              {/* Price History Chart */}
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Price History</h3>
                <PriceChart
                  expiryDate={selectedOption.expiry_date}
                  strike={selectedOption.strike}
                  optionType={selectedOption.option_type}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-8">
        <div className="max-w-[1800px] mx-auto px-4 py-4 text-center text-sm text-gray-500">
          DAX Options Dashboard - Data from Eurex &amp; Deutsche Börse Prisma
        </div>
      </footer>
    </div>
  )
}
