'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth-client'

export default function Home() {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (token) {
      router.push('/dashboard')
    } else {
      // Always redirect to signin if not logged in
      router.push('/auth/signin')
    }
    setIsChecking(false)
  }, [router])

  // Show nothing while redirecting
  if (isChecking) {
    return null
  }

  return null
}


