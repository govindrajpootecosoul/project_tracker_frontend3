'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getToken } from '@/lib/auth-client'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isChecking, setIsChecking] = useState(true)
  const [isInitialMount, setIsInitialMount] = useState(true)

  useEffect(() => {
    // Only run client-side checks
    if (typeof window === 'undefined') {
      setIsChecking(false)
      setIsInitialMount(false)
      return
    }

    // Fast synchronous check on mount
    const token = getToken()
    const isAuthPage = pathname?.startsWith('/auth')
    
    // Quick check - if authenticated and on auth page, redirect immediately
    if (token && isAuthPage) {
      router.push('/dashboard')
      setIsChecking(false)
      setIsInitialMount(false)
      return
    }
    
    // If not authenticated and not on auth page, middleware should handle redirect
    // But we can add an extra check here as a safety net
    if (!token && !isAuthPage && pathname !== '/') {
      // Only redirect if not already on root (which will redirect to signin)
      router.push('/auth/signin')
      setIsChecking(false)
      setIsInitialMount(false)
      return
    }
    
    // Mark as checked immediately to prevent flash
    setIsChecking(false)
    
    // Use a small delay to ensure router is ready, but don't block rendering
    const timer = setTimeout(() => {
      setIsInitialMount(false)
    }, 50)

    return () => clearTimeout(timer)
  }, [router, pathname])

  // Always return children to prevent hydration mismatch
  // The middleware will handle redirects if needed
  return <>{children}</>
}

