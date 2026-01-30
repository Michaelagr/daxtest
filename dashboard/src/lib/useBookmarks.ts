'use client'

/**
 * useBookmarks Hook
 *
 * This hook manages bookmarked options.
 * For now, it stores bookmarks in localStorage (works without authentication).
 * Later, we'll upgrade it to use Supabase for cloud sync.
 */

import { useState, useEffect, useCallback } from 'react'

// A bookmark is identified by expiry + strike + type
export interface BookmarkKey {
  expiry_date: string
  strike: number
  option_type: string
}

// Full bookmark includes optional notes
export interface Bookmark extends BookmarkKey {
  notes?: string
  created_at: string
}

// Storage key for localStorage
const STORAGE_KEY = 'dax-options-bookmarks'

export function useBookmarks() {
  // State to hold all bookmarks
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setBookmarks(JSON.parse(stored))
      }
    } catch (error) {
      console.error('Error loading bookmarks:', error)
    }
  }, [])

  // Save bookmarks to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks))
    } catch (error) {
      console.error('Error saving bookmarks:', error)
    }
  }, [bookmarks])

  // Create a unique key for comparison
  const getKey = useCallback((b: BookmarkKey): string => {
    return `${b.expiry_date}-${b.strike}-${b.option_type}`
  }, [])

  // Check if an option is bookmarked
  const isBookmarked = useCallback(
    (option: BookmarkKey): boolean => {
      const key = getKey(option)
      return bookmarks.some((b) => getKey(b) === key)
    },
    [bookmarks, getKey]
  )

  // Toggle bookmark status
  const toggleBookmark = useCallback(
    (option: BookmarkKey) => {
      const key = getKey(option)
      const existing = bookmarks.find((b) => getKey(b) === key)

      if (existing) {
        // Remove bookmark
        setBookmarks((prev) => prev.filter((b) => getKey(b) !== key))
      } else {
        // Add bookmark
        const newBookmark: Bookmark = {
          ...option,
          created_at: new Date().toISOString(),
        }
        setBookmarks((prev) => [...prev, newBookmark])
      }
    },
    [bookmarks, getKey]
  )

  // Update notes for a bookmark
  const updateNotes = useCallback(
    (option: BookmarkKey, notes: string) => {
      const key = getKey(option)
      setBookmarks((prev) =>
        prev.map((b) => (getKey(b) === key ? { ...b, notes } : b))
      )
    },
    [getKey]
  )

  // Remove all bookmarks
  const clearBookmarks = useCallback(() => {
    setBookmarks([])
  }, [])

  return {
    bookmarks,
    isBookmarked,
    toggleBookmark,
    updateNotes,
    clearBookmarks,
  }
}
