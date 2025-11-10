'use client'

import { AuthGuard } from './auth-guard'

export function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>
}

