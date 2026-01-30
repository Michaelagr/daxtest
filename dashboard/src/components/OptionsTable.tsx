'use client'

/**
 * OptionsTable Component
 *
 * This is the main data table for displaying DAX options.
 * It uses TanStack Table for sorting, filtering, and pagination.
 *
 * Features:
 * - Sort by any column (click header)
 * - Filter by expiry, type (Call/Put), strike range
 * - Bookmark favorite options (click the star)
 * - Filter to show only bookmarked options
 * - Click row to see details/chart
 */

import { useState, useMemo, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
  FilterFn,
} from '@tanstack/react-table'
import { OptionWithMargin } from '@/lib/supabase'
import { BookmarkKey } from '@/lib/useBookmarks'

// Helper to format numbers nicely (e.g., 1234.56 -> "1,234.56")
function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return '-'
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Helper to format dates (e.g., "2024-01-19" -> "19.01.2024")
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('de-DE')
}

// Props for the OptionsTable component
interface OptionsTableProps {
  data: OptionWithMargin[]
  onRowClick?: (option: OptionWithMargin) => void
  isLoading?: boolean
  // Bookmark props
  isBookmarked?: (option: BookmarkKey) => boolean
  onToggleBookmark?: (option: BookmarkKey) => void
  bookmarkCount?: number
}

export default function OptionsTable({
  data,
  onRowClick,
  isLoading,
  isBookmarked,
  onToggleBookmark,
  bookmarkCount = 0,
}: OptionsTableProps) {
  // State for sorting (which column, ascending/descending)
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'expiry_date', desc: false },
    { id: 'strike', desc: false },
  ])

  // State for column filters
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // State for global search
  const [globalFilter, setGlobalFilter] = useState('')

  // State for showing only bookmarked items
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)

  // Create a column helper for type safety
  const columnHelper = createColumnHelper<OptionWithMargin>()

  // Define columns with access to bookmark functions
  const columns = useMemo(
    () => [
      // Bookmark column (star icon)
      columnHelper.display({
        id: 'bookmark',
        header: () => <span title="Bookmarks">★</span>,
        cell: ({ row }) => {
          const option = row.original
          const bookmarked = isBookmarked?.({
            expiry_date: option.expiry_date,
            strike: option.strike,
            option_type: option.option_type,
          })

          return (
            <button
              className={`text-xl transition-colors ${
                bookmarked ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-300 hover:text-yellow-400'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleBookmark?.({
                  expiry_date: option.expiry_date,
                  strike: option.strike,
                  option_type: option.option_type,
                })
              }}
              title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
            >
              {bookmarked ? '★' : '☆'}
            </button>
          )
        },
        size: 40,
      }),

      // Expiry date
      columnHelper.accessor('expiry_date', {
        header: 'Expiry',
        cell: (info) => formatDate(info.getValue()),
        sortingFn: 'datetime',
      }),

      // Monthly or Weekly
      columnHelper.accessor('monthly_weekly', {
        header: 'Type',
        cell: (info) => (
          <span className={info.getValue() === 'monthly' ? 'text-blue-600' : 'text-purple-600'}>
            {info.getValue()}
          </span>
        ),
      }),

      // Call or Put
      columnHelper.accessor('option_type', {
        header: 'C/P',
        cell: (info) => (
          <span className={info.getValue() === 'CALL' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {info.getValue()}
          </span>
        ),
      }),

      // Strike price
      columnHelper.accessor('strike', {
        header: 'Strike',
        cell: (info) => formatNumber(info.getValue(), 0),
      }),

      // Bid price
      columnHelper.accessor('bid', {
        header: 'Bid',
        cell: (info) => formatNumber(info.getValue()),
      }),

      // Ask price
      columnHelper.accessor('ask', {
        header: 'Ask',
        cell: (info) => formatNumber(info.getValue()),
      }),

      // Last traded price
      columnHelper.accessor('last_price', {
        header: 'Last',
        cell: (info) => formatNumber(info.getValue()),
      }),

      // Daily settlement price
      columnHelper.accessor('daily_settlement', {
        header: 'Settlement',
        cell: (info) => formatNumber(info.getValue()),
      }),

      // Volume
      columnHelper.accessor('volume', {
        header: 'Volume',
        cell: (info) => formatNumber(info.getValue(), 0),
      }),

      // Open Interest
      columnHelper.accessor('open_interest', {
        header: 'Open Int.',
        cell: (info) => formatNumber(info.getValue(), 0),
      }),

      // Initial Margin (from margin data)
      columnHelper.accessor('initial_margin', {
        header: 'Init. Margin',
        cell: (info) => {
          const value = info.getValue()
          return value ? `€${formatNumber(value, 0)}` : '-'
        },
      }),

      // Premium Margin
      columnHelper.accessor('premium_margin', {
        header: 'Prem. Margin',
        cell: (info) => {
          const value = info.getValue()
          return value ? `€${formatNumber(value, 0)}` : '-'
        },
      }),
    ],
    [columnHelper, isBookmarked, onToggleBookmark]
  )

  // Filter data to show only bookmarked items if enabled
  const filteredData = useMemo(() => {
    if (!showBookmarkedOnly || !isBookmarked) return data

    return data.filter((option) =>
      isBookmarked({
        expiry_date: option.expiry_date,
        strike: option.strike,
        option_type: option.option_type,
      })
    )
  }, [data, showBookmarkedOnly, isBookmarked])

  // Create the table instance
  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 50, // Show 50 rows per page
      },
    },
  })

  // Get unique expiry dates for the filter dropdown
  const expiryDates = useMemo(() => {
    const dates = [...new Set(data.map((d) => d.expiry_date))]
    return dates.sort()
  }, [data])

  return (
    <div className="w-full">
      {/* Filter Controls */}
      <div className="mb-4 flex flex-wrap gap-4 items-center bg-gray-50 p-4 rounded-lg">
        {/* Bookmarked Only Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Watchlist</label>
          <button
            onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              showBookmarkedOnly
                ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-400'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            ★ {bookmarkCount} bookmarked
          </button>
        </div>

        {/* Expiry Date Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Expiry</label>
          <select
            className="border rounded px-3 py-2 text-sm bg-white"
            value={(table.getColumn('expiry_date')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('expiry_date')?.setFilterValue(e.target.value || undefined)}
          >
            <option value="">All</option>
            {expiryDates.map((date) => (
              <option key={date} value={date}>
                {formatDate(date)}
              </option>
            ))}
          </select>
        </div>

        {/* Call/Put Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Call/Put</label>
          <select
            className="border rounded px-3 py-2 text-sm bg-white"
            value={(table.getColumn('option_type')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('option_type')?.setFilterValue(e.target.value || undefined)}
          >
            <option value="">All</option>
            <option value="CALL">Calls Only</option>
            <option value="PUT">Puts Only</option>
          </select>
        </div>

        {/* Monthly/Weekly Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly/Weekly</label>
          <select
            className="border rounded px-3 py-2 text-sm bg-white"
            value={(table.getColumn('monthly_weekly')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('monthly_weekly')?.setFilterValue(e.target.value || undefined)}
          >
            <option value="">All</option>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {/* Global Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
          <input
            type="text"
            placeholder="Search all columns..."
            className="border rounded px-3 py-2 text-sm w-full"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Results count */}
      <div className="mb-2 text-sm text-gray-600">
        Showing {table.getFilteredRowModel().rows.length} of {filteredData.length} options
        {showBookmarkedOnly && ' (bookmarked only)'}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8 text-gray-500">
          Loading options data...
        </div>
      )}

      {/* The Table */}
      {!isLoading && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            {/* Table Header */}
            <thead className="bg-gray-100">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none"
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ width: header.getSize() }}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {/* Sort indicator */}
                        {{
                          asc: ' ↑',
                          desc: ' ↓',
                        }[header.column.getIsSorted() as string] ?? ''}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            {/* Table Body */}
            <tbody className="bg-white divide-y divide-gray-200">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-500">
                    {showBookmarkedOnly ? 'No bookmarked options yet. Click the ☆ to bookmark options.' : 'No options found.'}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const option = row.original
                  const bookmarked = isBookmarked?.({
                    expiry_date: option.expiry_date,
                    strike: option.strike,
                    option_type: option.option_type,
                  })

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-blue-50 cursor-pointer transition-colors ${
                        bookmarked ? 'bg-yellow-50' : ''
                      }`}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2 text-sm whitespace-nowrap">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            {'<<'}
          </button>
          <button
            className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {'<'}
          </button>
          <button
            className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {'>'}
          </button>
          <button
            className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            {'>>'}
          </button>
        </div>

        <div className="text-sm text-gray-600">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Rows per page:</span>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[25, 50, 100, 200].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
