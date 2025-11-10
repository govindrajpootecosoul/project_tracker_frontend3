'use client'

import { apiClient } from './api'

// Helper function to set cookie
function setCookie(name: string, value: string, days: number = 7) {
  if (typeof window === 'undefined') return
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`
}

// Helper function to delete cookie
function deleteCookie(name: string) {
  if (typeof window === 'undefined') return
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`
}

export async function signIn(email: string, password: string) {
  try {
    const data = await apiClient.signIn(email, password)
    // Store user info and token
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('token', data.token)
      // Also store token in cookie for middleware
      setCookie('token', data.token, 7)
    }
    return { success: true, user: data.user, token: data.token }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to sign in' }
  }
}

export async function signUp(email: string, password: string, name?: string) {
  try {
    const data = await apiClient.signUp(email, password, name)
    // Store user info and token
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('token', data.token)
      // Also store token in cookie for middleware
      setCookie('token', data.token, 7)
    }
    return { success: true, user: data.user, token: data.token }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to sign up' }
  }
}

export function signOut() {
  apiClient.setToken(null)
  if (typeof window !== 'undefined') {
    // Clear all auth-related data
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    // Clear all cached API data
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('api_cache_')) {
        localStorage.removeItem(key)
      }
    })
    // Remove cookie
    deleteCookie('token')
    // Force redirect to signin page
    window.location.href = '/auth/signin'
  }
}

export function getToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token')
  }
  return null
}

export function setToken(token: string | null) {
  apiClient.setToken(token)
  if (token && typeof window !== 'undefined') {
    localStorage.setItem('token', token)
    setCookie('token', token, 7)
  } else if (typeof window !== 'undefined') {
    localStorage.removeItem('token')
    deleteCookie('token')
  }
}

