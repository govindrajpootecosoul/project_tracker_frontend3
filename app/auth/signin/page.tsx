'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { signIn, getToken } from '@/lib/auth-client'
import { apiClient } from '@/lib/api'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isForgotDialogOpen, setIsForgotDialogOpen] = useState(false)
  const [forgotStep, setForgotStep] = useState<'email' | 'code' | 'reset'>('email')
  const [forgotEmail, setForgotEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState('')
  const resetForgotState = () => {
    setForgotStep('email')
    setForgotEmail(email || '')
    setVerificationCode('')
    setNewPassword('')
    setConfirmPassword('')
    setForgotError('')
    setForgotSuccess('')
    setForgotLoading(false)
  }

  const closeForgotDialog = () => {
    setIsForgotDialogOpen(false)
    resetForgotState()
  }


  useEffect(() => {
    // Check if user is already logged in
    const token = getToken()
    if (token) {
      // User is logged in, redirect to dashboard
      router.push('/dashboard')
    }
    // If no token, stay on signin page (don't redirect)
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signIn(email, password)

      if (result.success && result.user) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(result.user))
          window.dispatchEvent(new Event('userLoggedIn'))
          const urlParams = new URLSearchParams(window.location.search)
          const redirectTo = urlParams.get('redirect') || '/dashboard'
          router.push(redirectTo)
        }
      } else {
        setError(result.error || 'Invalid email or password')
      }
    } catch (error: any) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSendResetCode = async () => {
    if (!forgotEmail) {
      setForgotError('Please enter your email.')
      return
    }
    setForgotLoading(true)
    setForgotError('')
    setForgotSuccess('')
    try {
      await apiClient.requestPasswordReset(forgotEmail)
      setForgotStep('code')
      setForgotSuccess('Verification code sent to your email.')
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to send verification code.')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 4) {
      setForgotError('Enter the 4-digit verification code.')
      return
    }
    setForgotLoading(true)
    setForgotError('')
    setForgotSuccess('')
    try {
      await apiClient.verifyPasswordResetCode(forgotEmail, verificationCode)
      setForgotStep('reset')
      setForgotSuccess('Code verified. Please create a new password.')
    } catch (err: any) {
      setForgotError(err?.message || 'Invalid verification code.')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      setForgotError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match.')
      return
    }
    setForgotLoading(true)
    setForgotError('')
    setForgotSuccess('')
    try {
      await apiClient.resetPassword(forgotEmail, verificationCode, newPassword)
      setForgotSuccess('Password updated successfully. You can now sign in.')
      setEmail(forgotEmail)
      closeForgotDialog()
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to update password.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="rounded-2xl shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access Project & Task Tracker
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => {
                      resetForgotState()
                      setIsForgotDialogOpen(true)
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              </div>
              {error && (
                <div className="text-sm text-destructive text-center">{error}</div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
              <div className="text-sm text-center text-muted-foreground">
                Don't have an account?{' '}
                <Link href="/auth/signup" className="text-primary hover:underline">
                  Sign up
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
        <Dialog open={isForgotDialogOpen}>
          <DialogContent
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Enter your email to receive a verification code and set a new password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {forgotStep === 'email' && (
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <Button className="w-full" onClick={handleSendResetCode} disabled={forgotLoading}>
                    {forgotLoading ? 'Sending...' : 'Send Verification Code'}
                  </Button>
                </div>
              )}
              {forgotStep === 'code' && (
                <div className="space-y-2">
                  <Label htmlFor="verification-code">Verification Code</Label>
                  <Input
                    id="verification-code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit code"
                    inputMode="numeric"
                  />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleVerifyCode} disabled={forgotLoading}>
                      {forgotLoading ? 'Verifying...' : 'Verify Code'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setForgotStep('email')
                        setForgotSuccess('')
                        setForgotError('')
                      }}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              )}
              {forgotStep === 'reset' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleResetPassword} disabled={forgotLoading}>
                      {forgotLoading ? 'Updating...' : 'Update Password'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setForgotStep('code')
                        setForgotSuccess('')
                        setForgotError('')
                      }}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              )}
              {forgotError && <p className="text-sm text-destructive text-center">{forgotError}</p>}
              {forgotSuccess && <p className="text-sm text-green-600 text-center">{forgotSuccess}</p>}
              <div className="flex justify-end pt-2">
                <Button variant="ghost" type="button" onClick={closeForgotDialog}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  )
}

