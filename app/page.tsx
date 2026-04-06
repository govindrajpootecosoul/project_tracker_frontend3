'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth-client'

/**
 * Fallback when `/` is reached without middleware redirect (e.g. client nav).
 * Middleware sends `/` → dashboard or signin using the `token` cookie.
 */
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const token = getToken()
    router.replace(token ? '/dashboard' : '/auth/signin')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Redirecting…
    </div>
  )
}
