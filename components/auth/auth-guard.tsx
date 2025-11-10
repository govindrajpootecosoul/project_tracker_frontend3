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

  useEffect(() => {
    // Only run client-side checks
    if (typeof window === 'undefined') {
      setIsChecking(false)
      return
    }

    const token = getToken()
    const isAuthPage = pathname?.startsWith('/auth')
    
    // If authenticated and on auth page, redirect to dashboard
    if (token && isAuthPage) {
      router.push('/dashboard')
    }
    // If not authenticated and not on auth page, middleware should handle redirect
    // But we can add an extra check here as a safety net
    else if (!token && !isAuthPage && pathname !== '/') {
      // Only redirect if not already on root (which will redirect to signin)
      router.push('/auth/signin')
    }
    
    setIsChecking(false)
  }, [router, pathname])

  // Show nothing while checking to prevent flash
  if (isChecking) {
    return null
  }

  return <>{children}</>
}

