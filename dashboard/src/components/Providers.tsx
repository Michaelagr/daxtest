'use client'

/**
 * Providers Component
 *
 * Wraps the app with all necessary context providers.
 * This is a client component because providers need client-side state.
 */

import { ReactNode } from 'react'
import { AuthProvider } from '@/lib/auth'

export default function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
