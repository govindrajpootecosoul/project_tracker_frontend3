'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { User, LogOut, Bell, Check, Bot, Loader2, GripVertical, UserCircle, Mail, Building2, Briefcase, Calendar, Shield, Key, CreditCard } from 'lucide-react'
import { signOut, getToken } from '@/lib/auth-client'
import { apiClient } from '@/lib/api'
import { format } from 'date-fns'
import { Badge as StatusBadge } from '@/components/ui/badge'

const USER_DETAILS_CACHE_KEY = 'api_cache_/auth/me'
const USER_DETAILS_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
let cachedUserDetails: any | null = null
let cachedUserDetailsTimestamp = 0

const readCachedUserDetails = (): any | null => {
  if (cachedUserDetails && Date.now() - cachedUserDetailsTimestamp < USER_DETAILS_CACHE_DURATION) {
    return cachedUserDetails
  }
  if (typeof window === 'undefined') {
    return cachedUserDetails
  }
  try {
    const cached = window.localStorage.getItem(USER_DETAILS_CACHE_KEY)
    if (!cached) return null
    const parsed = JSON.parse(cached)
    if (!parsed || typeof parsed !== 'object') return null
    const { data, timestamp } = parsed as { data: any; timestamp: number }
    if (!timestamp || Date.now() - timestamp > USER_DETAILS_CACHE_DURATION) {
      window.localStorage.removeItem(USER_DETAILS_CACHE_KEY)
      return null
    }
    cachedUserDetails = data
    cachedUserDetailsTimestamp = timestamp
    return data
  } catch (error) {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(USER_DETAILS_CACHE_KEY)
      }
    } catch {}
    return null
  }
}

interface Task {
  id: string
  title: string
  description?: string
  status: string
  priority: string
  dueDate?: string
  assignees: { user: { name?: string; email: string } }[]
  project?: { name: string } | null
  imageCount?: number
  videoCount?: number
}

interface AIResponse {
  success: boolean
  query: string
  action?: 'created' | 'query'
  type?: 'tasks' | 'under_review_tasks' | 'team_tasks' | 'dashboard' | 'projects' | 'credentials' | 'subscriptions' | 'team_management' | 'user_info'
  user?: string
  tasks?: Task[]
  data?: any // For different data types
  count?: number
  task?: Task
  message?: string
  requiresInput?: boolean
  inputType?: 'task_creation'
  fields?: {
    title?: { required: boolean; label: string }
    status?: { required: boolean; label: string; options: string[] }
    priority?: { required: boolean; label: string; options: string[] }
    assignee?: { required: boolean; label: string }
    dueDate?: { required: boolean; label: string }
  }
}

interface Notification {
  id: string
  userId: string
  type: 'REQUEST' | 'COMMENT' | 'INVITE' | 'TASK_ASSIGNED' | 'PROJECT_INVITE' | 'SUBSCRIPTION_INVITE'
  title: string
  message: string
  link?: string | null
  read: boolean
  readAt?: string | null
  createdAt: string
}

export function Navbar() {
  const router = useRouter()

  const [user, setUser] = useState<{
    id?: string
    name?: string
    email?: string
    role?: string
    employeeId?: string
    department?: string
    company?: string
    avatar?: string
    isActive?: boolean
    emailVerified?: string
    createdAt?: string
    hasCredentialAccess?: boolean
    hasSubscriptionAccess?: boolean
  } | null>(null)
  const [userDetails, setUserDetails] = useState<any>(null)
  const [isUserRefreshing, setIsUserRefreshing] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [acceptingTaskIds, setAcceptingTaskIds] = useState<Set<string>>(new Set())
  const [cancellingTaskIds, setCancellingTaskIds] = useState<Set<string>>(new Set())
  const [acceptedTaskIds, setAcceptedTaskIds] = useState<Set<string>>(new Set())
  const [respondingCollabRequestIds, setRespondingCollabRequestIds] = useState<Set<string>>(new Set())
  const [pendingCollabRequestIds, setPendingCollabRequestIds] = useState<Set<string>>(new Set())
  const [respondingProjectCollabRequestIds, setRespondingProjectCollabRequestIds] = useState<Set<string>>(new Set())
  const [pendingProjectCollabRequestIds, setPendingProjectCollabRequestIds] = useState<Set<string>>(new Set())
  const [cancelledProjectCollabRequestIds, setCancelledProjectCollabRequestIds] = useState<Set<string>>(new Set())
  const [respondingSubscriptionCollabRequestIds, setRespondingSubscriptionCollabRequestIds] = useState<Set<string>>(new Set())
  const [pendingSubscriptionCollabRequestIds, setPendingSubscriptionCollabRequestIds] = useState<Set<string>>(new Set())
  const [cancelledSubscriptionCollabRequestIds, setCancelledSubscriptionCollabRequestIds] = useState<Set<string>>(new Set())
  const [acceptedSubscriptionCollabRequestIds, setAcceptedSubscriptionCollabRequestIds] = useState<Set<string>>(new Set())
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    assignee: '',
    dueDate: '',
  })
  const [allUsers, setAllUsers] = useState<{ id: string; name?: string; email: string }[]>([])
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [buttonPosition, setButtonPosition] = useState(() => {
    // Initialize with default position if available
    if (typeof window !== 'undefined') {
      const savedPosition = localStorage.getItem('aiButtonPosition')
      if (savedPosition) {
        try {
          return JSON.parse(savedPosition)
        } catch (e) {
          // Fall through to default
        }
      }
      return { x: window.innerWidth - 80, y: window.innerHeight - 100 }
    }
    return { x: 0, y: 0 }
  })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 }) // Track initial mouse position
  const [hasMoved, setHasMoved] = useState(false) // Track if mouse actually moved
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  const loadCachedUserDetails = useCallback(() => readCachedUserDetails(), [])

  const deriveUserState = useCallback((details: any | null) => {
    if (!details) return null
    return {
      id: details.id,
      name: details.name,
      email: details.email,
      role: details.role,
      employeeId: details.employeeId,
      department: details.department,
      company: details.company,
      avatar: details.avatar,
      isActive: details.isActive,
      emailVerified: details.emailVerified,
      createdAt: details.createdAt,
      hasCredentialAccess: details.hasCredentialAccess,
      hasSubscriptionAccess: details.hasSubscriptionAccess,
    }
  }, [])

  const applyUserDetails = useCallback(
    (details: any, options?: { persist?: boolean; timestamp?: number }) => {
      if (!details) return
      cachedUserDetails = details
      cachedUserDetailsTimestamp = options?.timestamp ?? Date.now()
      setUserDetails(details)
      const derived = deriveUserState(details)
      if (derived) {
        setUser(prev => ({ ...(prev ?? {}), ...derived }))
        if (options?.persist !== false && typeof window !== 'undefined') {
          try {
            const existingStr = window.localStorage.getItem('user')
            const existing = existingStr ? JSON.parse(existingStr) : {}
            window.localStorage.setItem('user', JSON.stringify({ ...existing, ...derived }))
          } catch {
            // Ignore localStorage errors
          }
        }
      }
    },
    [deriveUserState]
  )

  // Fetch functions need to be defined before useEffect - wrapped in useCallback to prevent infinite loops
  const fetchNotifications = useCallback(async () => {
    try {
      const [notificationsResponse, collabRequests, projectCollabRequests, sentProjectCollabRequests, subscriptionCollabRequests, sentSubscriptionCollabRequests] = await Promise.all([
        apiClient.getNotifications(),
        apiClient.getCredentialCollaborationRequests().catch(() => []),
        apiClient.getProjectCollaborationRequests().catch(() => []),
        apiClient.getSentProjectCollaborationRequests().catch(() => []),
        apiClient.getSubscriptionCollaborationRequests().catch(() => []),
        apiClient.getSentSubscriptionCollaborationRequests().catch(() => []),
      ])
      const notificationsData = notificationsResponse as Notification[]
      setNotifications(notificationsData)
      if (Array.isArray(collabRequests)) {
        setPendingCollabRequestIds(new Set(collabRequests.map((request: any) => request.id)))
      } else {
        setPendingCollabRequestIds(new Set())
      }
      // Combine both received and sent requests to track all statuses
      const allProjectRequests = [
        ...(Array.isArray(projectCollabRequests) ? projectCollabRequests : []),
        ...(Array.isArray(sentProjectCollabRequests) ? sentProjectCollabRequests : []),
      ]
      
      const projectPendingIds = new Set<string>()
      const projectCancelledIds = new Set<string>()
      
      allProjectRequests.forEach((request: any) => {
        if (request.status === 'PENDING') {
          projectPendingIds.add(request.id)
        } else if (request.status === 'CANCELLED' || request.status === 'DECLINED') {
          projectCancelledIds.add(request.id)
        }
      })
      
      setPendingProjectCollabRequestIds(projectPendingIds)
      setCancelledProjectCollabRequestIds(projectCancelledIds)

      // Handle subscription collaboration requests
      const allSubscriptionRequests = [
        ...(Array.isArray(subscriptionCollabRequests) ? subscriptionCollabRequests : []),
        ...(Array.isArray(sentSubscriptionCollabRequests) ? sentSubscriptionCollabRequests : []),
      ]
      
      const subscriptionPendingIds = new Set<string>()
      const subscriptionCancelledIds = new Set<string>()
      const subscriptionAcceptedIds = new Set<string>()
      
      allSubscriptionRequests.forEach((request: any) => {
        const status = String(request.status || '').toUpperCase()
        if (status === 'PENDING') {
          subscriptionPendingIds.add(request.id)
        } else if (status === 'CANCELLED' || status === 'DECLINED') {
          subscriptionCancelledIds.add(request.id)
        } else if (status === 'ACCEPTED') {
          subscriptionAcceptedIds.add(request.id)
        }
      })
      
      setPendingSubscriptionCollabRequestIds(subscriptionPendingIds)
      setCancelledSubscriptionCollabRequestIds(subscriptionCancelledIds)
      setAcceptedSubscriptionCollabRequestIds(subscriptionAcceptedIds)
      
      // After fetching notifications, check which review requests have already been accepted
      const reviewNotifications = notificationsData.filter(
        n => n.type === 'REQUEST' && n.title === 'Task Review Requested' && n.link
      )
      
      // Fetch task details for each review notification to check if already accepted
      const acceptedIds = new Set<string>()
      await Promise.all(
        reviewNotifications.map(async (notification) => {
          const taskId = notification.link?.split('/tasks/')[1]
          if (!taskId) return
          
          try {
            const task = await apiClient.getTask(taskId) as any
            if (task && task.reviewStatus === 'UNDER_REVIEW') {
              acceptedIds.add(taskId)
            }
          } catch (error: any) {
            // Silently ignore 404 errors (task might have been deleted)
            // Only log unexpected errors (non-404)
            if (error?.message && !error.message.includes('not found') && !error.message.includes('404')) {
              console.warn('Failed to fetch task for notification:', taskId, error.message)
            }
            // Don't log anything for expected 404 errors
          }
        })
      )
      
      if (acceptedIds.size > 0) {
        setAcceptedTaskIds(prev => {
          const newSet = new Set(prev)
          acceptedIds.forEach(id => newSet.add(id))
          return newSet
        })
      }
      
      return notificationsData
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      return []
    }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await apiClient.getUnreadNotificationCount() as { count: number }
      setUnreadCount(data.count)
    } catch (error) {
      console.error('Failed to fetch unread count:', error)
    }
  }, [])

  const fetchAllUsers = useCallback(async () => {
    try {
      const data = await apiClient.getTeamUsers()
      setAllUsers(data as { id: string; name?: string; email: string }[])
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }, [])

  const fetchUserDetails = useCallback(
    async (options?: { force?: boolean }) => {
      try {
        const useCache = !options?.force
        if (useCache) {
          const cached = loadCachedUserDetails()
          if (cached) {
            applyUserDetails(cached, { persist: false, timestamp: cachedUserDetailsTimestamp })
            setIsUserRefreshing(false)
            return
          }
        }

        setIsUserRefreshing(true)
        const data = await apiClient.getUserRole(useCache)
        if (data) {
          applyUserDetails(data)
        }
      } catch (error) {
        console.error('Failed to fetch user details:', error)
      } finally {
        setIsUserRefreshing(false)
      }
    },
    [applyUserDetails, loadCachedUserDetails]
  )

  useEffect(() => {
    const cached = loadCachedUserDetails()
    if (cached) {
      applyUserDetails(cached, { persist: false, timestamp: cachedUserDetailsTimestamp })
      setIsUserRefreshing(false)
    } else {
      setIsUserRefreshing(true)
    }
    fetchNotifications()
    fetchUnreadCount()
    fetchAllUsers()
    
    // Load saved button position (update if window size changed)
    const savedPosition = localStorage.getItem('aiButtonPosition')
    if (savedPosition) {
      try {
        const pos = JSON.parse(savedPosition)
        // Validate position is within bounds
        if (pos.x >= 0 && pos.y >= 0 && pos.x <= window.innerWidth && pos.y <= window.innerHeight) {
          setButtonPosition(pos)
        } else {
          // Reset to default if saved position is invalid
          const defaultPos = { x: window.innerWidth - 80, y: window.innerHeight - 100 }
          setButtonPosition(defaultPos)
          localStorage.setItem('aiButtonPosition', JSON.stringify(defaultPos))
        }
      } catch (e) {
        // Use default position (bottom right)
        const defaultPos = { x: window.innerWidth - 80, y: window.innerHeight - 100 }
        setButtonPosition(defaultPos)
        localStorage.setItem('aiButtonPosition', JSON.stringify(defaultPos))
      }
    } else {
      // Default position (bottom right)
      const defaultPos = { x: window.innerWidth - 80, y: window.innerHeight - 100 }
      setButtonPosition(defaultPos)
      localStorage.setItem('aiButtonPosition', JSON.stringify(defaultPos))
    }
    
    // Poll for new notifications every 5 seconds for real-time updates
    const interval = setInterval(() => {
      fetchNotifications()
      fetchUnreadCount()
    }, 5000)
    
    // Check for token and fetch user details if token exists
    const checkTokenAndFetchUser = () => {
      const token = getToken()
      if (token) {
        fetchUserDetails({ force: true })
      } else {
        setUser(null)
        setUserDetails(null)
      }
    }

    // Initial check
    checkTokenAndFetchUser()

    // Listen for storage changes (when token is set/removed)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        checkTokenAndFetchUser()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    // Listen for custom login event (for same-tab login)
    const handleLogin = () => {
      checkTokenAndFetchUser()
    }
    window.addEventListener('userLoggedIn', handleLogin)
    
    // Listen for permission updates
    const handlePermissionUpdate = () => {
      fetchUserDetails({ force: true })
    }
    window.addEventListener('userPermissionsUpdated', handlePermissionUpdate)
    
    // Listen for notification refresh events (triggered when actions happen)
    const handleNotificationRefresh = () => {
      fetchNotifications()
      fetchUnreadCount()
    }
    window.addEventListener('refreshNotifications', handleNotificationRefresh)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('userLoggedIn', handleLogin)
      window.removeEventListener('userPermissionsUpdated', handlePermissionUpdate)
      window.removeEventListener('refreshNotifications', handleNotificationRefresh)
    }
  }, [loadCachedUserDetails, applyUserDetails, fetchUserDetails, fetchNotifications, fetchUnreadCount, fetchAllUsers])

  // Handle window resize to keep button in bounds
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined' && buttonPosition.x > 0 && buttonPosition.y > 0) {
        const maxX = window.innerWidth - 56 // Button width
        const maxY = window.innerHeight - 56 // Button height
        setButtonPosition((prev: { x: number; y: number }) => ({
          x: Math.max(0, Math.min(maxX, prev.x)),
          y: Math.max(0, Math.min(maxY, prev.y)),
        }))
      } else if (typeof window !== 'undefined') {
        // Initialize position if not set
        setButtonPosition({ x: window.innerWidth - 80, y: window.innerHeight - 100 })
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [buttonPosition])

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiClient.markNotificationAsRead(id)
      await fetchNotifications()
      await fetchUnreadCount()
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.markAllNotificationsAsRead()
      await fetchNotifications()
      await fetchUnreadCount()
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.link) return
    
    // Extract task ID from link (format: /tasks/:taskId)
    const taskIdMatch = notification.link.match(/\/tasks\/([a-fA-F0-9]{24})/)
    if (taskIdMatch && taskIdMatch[1]) {
      const taskId = taskIdMatch[1]
      
      // Mark notification as read
      if (!notification.read) {
        handleMarkAsRead(notification.id)
      }
      
      // Close notification popover
      setIsNotificationOpen(false)
      
      // Navigate to tasks page if not already there
      const currentPath = window.location.pathname
      if (!currentPath.startsWith('/tasks')) {
        router.push('/tasks')
        // Wait for navigation and page load, then dispatch event
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('showTaskFromNotification', { detail: { taskId } }))
        }, 800)
      } else {
        // If already on tasks page, dispatch event after a short delay to ensure page is ready
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('showTaskFromNotification', { detail: { taskId } }))
        }, 100)
      }
    } else {
      // For non-task links, navigate normally
      router.push(notification.link)
      setIsNotificationOpen(false)
      if (!notification.read) {
        handleMarkAsRead(notification.id)
      }
    }
  }

  const getCollabRequestIdFromNotification = useCallback((notification: Notification) => {
    if (!notification.link) return null
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      const url = new URL(notification.link, base)
      return url.searchParams.get('collabRequest')
    } catch {
      const match = notification.link.match(/collabRequest=([^&]+)/)
      return match ? match[1] : null
    }
  }, [])

  const getProjectCollabRequestIdFromNotification = useCallback((notification: Notification) => {
    if (!notification.link) return null
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      const url = new URL(notification.link, base)
      return url.searchParams.get('projectCollabRequest')
    } catch {
      const match = notification.link.match(/projectCollabRequest=([^&]+)/)
      return match ? match[1] : null
    }
  }, [])

  const getSubscriptionCollabRequestIdFromNotification = useCallback((notification: Notification) => {
    if (!notification.link) return null
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      const url = new URL(notification.link, base)
      return url.searchParams.get('subscriptionCollabRequest')
    } catch {
      const match = notification.link.match(/subscriptionCollabRequest=([^&]+)/)
      return match ? match[1] : null
    }
  }, [])

  const handleAcceptReviewRequest = async (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation()
    if (!notification.link) return
    
    // Extract task ID from link (format: /tasks/:taskId)
    const taskId = notification.link.split('/tasks/')[1]
    if (!taskId) return

    // Prevent double-clicks
    if (acceptingTaskIds.has(taskId)) return

    try {
      setAcceptingTaskIds(prev => new Set(prev).add(taskId))
      await apiClient.acceptReviewRequest(taskId, true)
      // Mark as accepted
      setAcceptedTaskIds(prev => new Set(prev).add(taskId))
      await fetchNotifications()
      await fetchUnreadCount()
      // Refresh tasks if on tasks page
      if (notification.link.startsWith('/tasks')) {
        // Dispatch event to refresh tasks
        window.dispatchEvent(new CustomEvent('refreshTasks'))
        // Also refresh after a short delay to ensure backend has updated
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('refreshTasks'))
        }, 500)
        // Navigate to tasks page if not already there, and switch to Under Review tab
        const currentPath = window.location.pathname
        if (currentPath !== '/tasks') {
          router.push('/tasks?tab=review')
        } else {
          // If already on tasks page, trigger a refresh and switch tab
          window.dispatchEvent(new CustomEvent('switchToReviewTab'))
        }
      }
      // Close notification popover
      setIsNotificationOpen(false)
    } catch (error: any) {
      console.error('Failed to accept review request:', error)
      alert(error.message || 'Failed to accept review request')
    } finally {
      setAcceptingTaskIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(taskId)
        return newSet
      })
    }
  }

  const handleCancelReviewRequest = async (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation()
    if (!notification.link) return
    
    // Extract task ID from link (format: /tasks/:taskId)
    const taskId = notification.link.split('/tasks/')[1]
    if (!taskId) return

    // Prevent double-clicks
    if (cancellingTaskIds.has(taskId)) return

    try {
      setCancellingTaskIds(prev => new Set(prev).add(taskId))
      await apiClient.acceptReviewRequest(taskId, false)
      await fetchNotifications()
      await fetchUnreadCount()
      // Refresh tasks if on tasks page
      if (notification.link.startsWith('/tasks')) {
        // Dispatch event to refresh tasks
        window.dispatchEvent(new CustomEvent('refreshTasks'))
      }
      // Close notification popover
      setIsNotificationOpen(false)
    } catch (error: any) {
      console.error('Failed to cancel review request:', error)
      alert(error.message || 'Failed to cancel review request')
    } finally {
      setCancellingTaskIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(taskId)
        return newSet
      })
    }
  }

  const handleCollabRequestResponse = async (e: React.MouseEvent, notification: Notification, accept: boolean) => {
    e.stopPropagation()
    const requestId = getCollabRequestIdFromNotification(notification)
    if (!requestId) {
      alert('Unable to process this collaboration request. Please open the credentials page to respond.')
      return
    }

    if (respondingCollabRequestIds.has(requestId)) {
      return
    }

    try {
      setRespondingCollabRequestIds(prev => new Set(prev).add(requestId))
      await apiClient.respondCredentialCollaborationRequest(requestId, accept)
      setPendingCollabRequestIds(prev => {
        const updated = new Set(prev)
        updated.delete(requestId)
        return updated
      })
      if (!notification.read) {
        handleMarkAsRead(notification.id)
      }
      await fetchNotifications()
      await fetchUnreadCount()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCredentials'))
      }
      if (accept) {
        router.push('/credentials')
      }
      setIsNotificationOpen(false)
    } catch (error: any) {
      console.error('Failed to respond to collaboration request:', error)
      alert(error.message || 'Failed to respond to collaboration request')
    } finally {
      setRespondingCollabRequestIds(prev => {
        const updated = new Set(prev)
        updated.delete(requestId)
        return updated
      })
    }
  }

  const handleProjectCollabRequestResponse = async (e: React.MouseEvent, notification: Notification, accept: boolean) => {
    e.stopPropagation()
    const requestId = getProjectCollabRequestIdFromNotification(notification)
    if (!requestId) {
      alert('Unable to process this project collaboration request. Please open the projects page to respond.')
      return
    }

    if (respondingProjectCollabRequestIds.has(requestId)) {
      return
    }

    try {
      setRespondingProjectCollabRequestIds(prev => new Set(prev).add(requestId))
      await apiClient.respondProjectCollaborationRequest(requestId, accept)
      setPendingProjectCollabRequestIds(prev => {
        const updated = new Set(prev)
        updated.delete(requestId)
        return updated
      })
      if (!accept) {
        setCancelledProjectCollabRequestIds(prev => new Set(prev).add(requestId))
      }
      if (!notification.read) {
        handleMarkAsRead(notification.id)
      }
      await fetchNotifications()
      await fetchUnreadCount()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshProjects'))
      }
      if (accept) {
        router.push('/projects')
      }
      setIsNotificationOpen(false)
    } catch (error: any) {
      console.error('Failed to respond to project collaboration request:', error)
      alert(error.message || 'Failed to respond to project collaboration request')
    } finally {
      setRespondingProjectCollabRequestIds(prev => {
        const updated = new Set(prev)
        updated.delete(requestId)
        return updated
      })
    }
  }

  const handleSubscriptionCollabRequestResponse = async (e: React.MouseEvent, notification: Notification, accept: boolean) => {
    e.stopPropagation()
    const requestId = getSubscriptionCollabRequestIdFromNotification(notification)
    if (!requestId) {
      alert('Unable to process this subscription collaboration request. Please open the subscriptions page to respond.')
      return
    }

    if (respondingSubscriptionCollabRequestIds.has(requestId)) {
      return
    }

    try {
      setRespondingSubscriptionCollabRequestIds(prev => new Set(prev).add(requestId))
      await apiClient.respondSubscriptionCollaborationRequest(requestId, accept)
      setPendingSubscriptionCollabRequestIds(prev => {
        const updated = new Set(prev)
        updated.delete(requestId)
        return updated
      })
      if (accept) {
        setAcceptedSubscriptionCollabRequestIds(prev => new Set(prev).add(requestId))
        setCancelledSubscriptionCollabRequestIds(prev => {
          const updated = new Set(prev)
          updated.delete(requestId)
          return updated
        })
      } else {
        setCancelledSubscriptionCollabRequestIds(prev => new Set(prev).add(requestId))
        setAcceptedSubscriptionCollabRequestIds(prev => {
          const updated = new Set(prev)
          updated.delete(requestId)
          return updated
        })
      }
      if (!notification.read) {
        handleMarkAsRead(notification.id)
      }
      await fetchNotifications()
      await fetchUnreadCount()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubscriptions'))
      }
      if (accept) {
        router.push('/subscriptions')
      }
      setIsNotificationOpen(false)
    } catch (error: any) {
      console.error('Failed to respond to subscription collaboration request:', error)
      alert(error.message || 'Failed to respond to subscription collaboration request')
    } finally {
      setRespondingSubscriptionCollabRequestIds(prev => {
        const updated = new Set(prev)
        updated.delete(requestId)
        return updated
      })
    }
  }

  const handleAIQuery = async (queryOverride?: string) => {
    const queryToUse = queryOverride || aiQuery
    if (!queryToUse.trim()) return

    try {
      setAiLoading(true)
      setAiResponse(null) // Clear previous response
      
      // Update the input field if using override
      if (queryOverride) {
        setAiQuery(queryOverride)
      }
      
      console.log('Sending AI query:', queryToUse.trim())
      const response = await apiClient.aiQuery(queryToUse.trim())
      console.log('AI response received:', response)
      const aiResp = response as AIResponse
      
      if (!aiResp.success) {
        throw new Error(aiResp.message || 'Failed to process query')
      }
      
      if (aiResp.requiresInput && aiResp.inputType === 'task_creation') {
        // Show task creation form
        setShowTaskForm(true)
        setAiResponse(aiResp)
        // Pre-fill form with extracted data if any
        if (aiResp.fields) {
          // Try to extract title from query
          const titleMatch = queryToUse.match(/(?:create|add|make|new)\s+(?:a\s+)?task\s+(?:called|named|titled|about)\s+"?([^"]+)"?/i)
          if (titleMatch && titleMatch[1]) {
            setTaskFormData(prev => ({ ...prev, title: titleMatch[1].trim() }))
          }
        }
      } else {
        setShowTaskForm(false)
        setAiResponse(aiResp)
        console.log('Setting AI response:', aiResp)
      }
    } catch (error: any) {
      console.error('Failed to process AI query:', error)
      // Show error in a user-friendly way
      setAiResponse({
        success: false,
        query: queryToUse,
        message: error.message || 'Failed to process query. Please try again.',
      })
      setShowTaskForm(false)
    } finally {
      setAiLoading(false)
    }
  }

  const handleCreateTaskFromForm = async () => {
    if (!taskFormData.title.trim()) {
      alert('Task title is required')
      return
    }

    try {
      setAiLoading(true)
      
      // Find assignee user ID
      let assigneeUserId: string | null = null
      if (taskFormData.assignee.trim()) {
        const user = allUsers.find(u => 
          u.email.toLowerCase().includes(taskFormData.assignee.toLowerCase()) ||
          (u.name && u.name.toLowerCase().includes(taskFormData.assignee.toLowerCase()))
        )
        if (user) {
          assigneeUserId = user.id
        }
      }

      // Build query for task creation
      let createQuery = `Create a task called "${taskFormData.title}"`
      if (assigneeUserId) {
        const assigneeUser = allUsers.find(u => u.id === assigneeUserId)
        createQuery += ` for ${assigneeUser?.name || assigneeUser?.email || taskFormData.assignee}`
      }
      createQuery += ` with status ${taskFormData.status} and priority ${taskFormData.priority}`
      if (taskFormData.dueDate) {
        createQuery += ` due ${taskFormData.dueDate}`
      }

      const response = await apiClient.aiQuery(createQuery)
      const aiResp = response as AIResponse
      
      if (aiResp.success && aiResp.action === 'created') {
        setAiResponse(aiResp)
        setShowTaskForm(false)
        setTaskFormData({
          title: '',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          assignee: '',
          dueDate: '',
        })
        setAiQuery('')
        // Refresh tasks if on tasks page
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tasks-refresh'))
        }
      } else {
        alert(aiResp.message || 'Failed to create task')
      }
    } catch (error: any) {
      console.error('Failed to create task:', error)
      alert(error.message || 'Failed to create task')
    } finally {
      setAiLoading(false)
    }
  }

  const getStatusBadgeColor = (status: string) => {
    const colors: { [key: string]: string } = {
      IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
      COMPLETED: 'bg-green-100 text-green-800',
      YTS: 'bg-blue-100 text-blue-800',
      ON_HOLD: 'bg-gray-100 text-gray-800',
      RECURRING: 'bg-purple-100 text-purple-800',
    }
    return colors[status] || colors.IN_PROGRESS
  }

  const getPriorityBadgeColor = (priority: string) => {
    const colors: { [key: string]: string } = {
      HIGH: 'bg-red-100 text-red-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      LOW: 'bg-green-100 text-green-800',
    }
    return colors[priority] || colors.MEDIUM
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return // Only handle left mouse button
    
    const target = e.target as HTMLElement
    
    // Store initial mouse position for movement detection
    setMouseDownPos({ x: e.clientX, y: e.clientY })
    setHasMoved(false) // Reset movement flag
    
    // Always allow dragging from grip icon
    if (target.closest('.drag-handle')) {
      setIsDragging(true)
      setDragStart({
        x: e.clientX - buttonPosition.x,
        y: e.clientY - buttonPosition.y,
      })
      e.preventDefault()
      e.stopPropagation()
      return
    }
    
    // Allow dragging by holding Shift key anywhere on button
    if (e.shiftKey) {
      setIsDragging(true)
      setDragStart({
        x: e.clientX - buttonPosition.x,
        y: e.clientY - buttonPosition.y,
      })
      e.preventDefault()
      e.stopPropagation()
      return
    }
    
    // If clicking on Bot icon, don't start dragging - let click handler open dialog
    if (target.closest('svg') || target.closest('.bot-icon')) {
      // Don't start dragging, let onClick handle it
      return
    }
    
    // Allow dragging by clicking and holding on the button (not on Bot icon)
    setIsDragging(true)
    setDragStart({
      x: e.clientX - buttonPosition.x,
      y: e.clientY - buttonPosition.y,
    })
    // Don't prevent default here - let click event fire if no movement
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return

      // Check if mouse actually moved (more than 5 pixels from initial position)
      const deltaX = Math.abs(e.clientX - mouseDownPos.x)
      const deltaY = Math.abs(e.clientY - mouseDownPos.y)
      
      if (deltaX > 5 || deltaY > 5) {
        setHasMoved(true) // Mark that we've actually moved
      }

      const newX = e.clientX - dragStart.x
      const newY = e.clientY - dragStart.y

      // Constrain to viewport bounds
      const maxX = window.innerWidth - 56
      const maxY = window.innerHeight - 56
      const minX = 0
      const minY = 0

      const constrainedX = Math.max(minX, Math.min(maxX, newX))
      const constrainedY = Math.max(minY, Math.min(maxY, newY))

      const newPosition = { x: constrainedX, y: constrainedY }
      setButtonPosition(newPosition)
      
      // Save position to localStorage on every move for better persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('aiButtonPosition', JSON.stringify(newPosition))
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return
      e.preventDefault()
      
      const touch = e.touches[0]
      
      // Check if touch actually moved (more than 5 pixels from initial position)
      const deltaX = Math.abs(touch.clientX - mouseDownPos.x)
      const deltaY = Math.abs(touch.clientY - mouseDownPos.y)
      
      if (deltaX > 5 || deltaY > 5) {
        setHasMoved(true) // Mark that we've actually moved
      }
      
      const newX = touch.clientX - dragStart.x
      const newY = touch.clientY - dragStart.y

      // Constrain to viewport bounds
      const maxX = window.innerWidth - 56
      const maxY = window.innerHeight - 56
      const minX = 0
      const minY = 0

      const constrainedX = Math.max(minX, Math.min(maxX, newX))
      const constrainedY = Math.max(minY, Math.min(maxY, newY))

      const newPosition = { x: constrainedX, y: constrainedY }
      setButtonPosition(newPosition)
      
      // Save position to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('aiButtonPosition', JSON.stringify(newPosition))
      }
    }

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false)
        // Reset movement flag after a short delay to allow onClick to check it
        setTimeout(() => {
          setHasMoved(false)
        }, 100)
      }
    }

    const handleTouchEnd = () => {
      if (isDragging) {
        setIsDragging(false)
        // Reset movement flag after a short delay
        setTimeout(() => {
          setHasMoved(false)
        }, 100)
      }
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false })
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)
      document.body.style.userSelect = 'none' // Prevent text selection while dragging
      document.body.style.cursor = 'grabbing' // Show grabbing cursor
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging, dragStart, buttonPosition, mouseDownPos])

  return (
    <nav className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-4">
        </div>
        
        <div className="flex items-center gap-4">
          {user && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAIDialogOpen(true)
                  setAiQuery('')
                  setAiResponse(null)
                  setShowTaskForm(false)
                  setTaskFormData({
                    title: '',
                    status: 'IN_PROGRESS',
                    priority: 'MEDIUM',
                    assignee: '',
                    dueDate: '',
                  })
                }}
                title="AI Assistant - Ask about tasks or create new tasks"
              >
                <Bot className="h-4 w-4 mr-2" />
                AI Assistant
              </Button>
              <Popover open={isNotificationOpen} onOpenChange={setIsNotificationOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold">Notifications</h3>
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleMarkAllAsRead}
                        className="text-xs"
                      >
                        Mark all as read
                      </Button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No notifications
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 border-b ${(notification.type === 'REQUEST' && notification.title === 'Task Review Requested') || (notification.type === 'PROJECT_INVITE' && notification.link?.includes('projectCollabRequest=')) || (notification.type === 'INVITE' && notification.link?.includes('subscriptionCollabRequest=')) || notification.link?.includes('collabRequest=') ? '' : 'cursor-pointer hover:bg-accent transition-colors'} ${
                            !notification.read ? 'bg-accent/50' : ''
                          }`}
                          onClick={() => {
                            const isTaskReview = notification.type === 'REQUEST' && notification.title === 'Task Review Requested'
                            const isProjectCollab = notification.type === 'PROJECT_INVITE' && notification.link?.includes('projectCollabRequest=')
                            const isSubscriptionCollab = notification.type === 'INVITE' && notification.link?.includes('subscriptionCollabRequest=')
                            const isCredCollab = notification.link?.includes('collabRequest=')
                            if (!isTaskReview && !isProjectCollab && !isSubscriptionCollab && !isCredCollab) {
                              handleNotificationClick(notification)
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{notification.title}</p>
                                {!notification.read && (
                                  <div className="h-2 w-2 rounded-full bg-primary" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {notification.message}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                              </p>
                              {notification.type === 'REQUEST' && notification.title === 'Task Review Requested' && (() => {
                                const taskId = notification.link?.split('/tasks/')[1] || ''
                                const isAccepted = acceptedTaskIds.has(taskId) || acceptingTaskIds.has(taskId)
                                
                                return (
                                  <div className="flex gap-2 mt-3">
                                    {isAccepted ? (
                                      <div className="flex-1 px-3 py-1.5 text-sm text-center bg-green-50 text-green-700 rounded-md border border-green-200">
                                        Accepted
                                      </div>
                                    ) : (
                                      <>
                                        <Button
                                          size="sm"
                                          onClick={(e) => handleAcceptReviewRequest(e, notification)}
                                          className="flex-1"
                                          disabled={acceptingTaskIds.has(taskId)}
                                        >
                                          {acceptingTaskIds.has(taskId) ? (
                                            <>
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              Accepting...
                                            </>
                                          ) : (
                                            'Accept'
                                          )}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => handleCancelReviewRequest(e, notification)}
                                          className="flex-1"
                                          disabled={cancellingTaskIds.has(taskId)}
                                        >
                                          {cancellingTaskIds.has(taskId) ? (
                                            <>
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              Cancelling...
                                            </>
                                          ) : (
                                            'Cancel'
                                          )}
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )
                              })()}
                              {notification.link?.includes('collabRequest=') && (() => {
                                const requestId = getCollabRequestIdFromNotification(notification)
                                if (!requestId) return null
                                const isProcessing = respondingCollabRequestIds.has(requestId)
                                const isPending = pendingCollabRequestIds.has(requestId)
                                if (!isPending) {
                                  return (
                                    <div className="mt-3 px-3 py-1.5 text-sm text-center bg-green-50 text-green-700 rounded-md border border-green-200">
                                      Accepted
                                    </div>
                                  )
                                }
                                return (
                                  <div className="flex gap-2 mt-3">
                                    <Button
                                      size="sm"
                                      onClick={(e) => handleCollabRequestResponse(e, notification, true)}
                                      className="flex-1"
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Processing...
                                        </>
                                      ) : (
                                        'Accept'
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => handleCollabRequestResponse(e, notification, false)}
                                      className="flex-1"
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? 'Please wait...' : 'Decline'}
                                    </Button>
                                  </div>
                                )
                              })()}
                              {(notification.type === 'PROJECT_INVITE' && notification.link?.includes('projectCollabRequest=')) && (() => {
                                const requestId = getProjectCollabRequestIdFromNotification(notification)
                                if (!requestId) return null
                                const isProcessing = respondingProjectCollabRequestIds.has(requestId)
                                const isPending = pendingProjectCollabRequestIds.has(requestId)
                                const isCancelled = cancelledProjectCollabRequestIds.has(requestId)
                                if (!isPending && !isCancelled) {
                                  return (
                                    <div className="mt-3 px-3 py-1.5 text-sm text-center bg-green-50 text-green-700 rounded-md border border-green-200">
                                      Accepted
                                    </div>
                                  )
                                }
                                if (isCancelled) {
                                  return (
                                    <div className="mt-3 px-3 py-1.5 text-sm text-center bg-red-50 text-red-700 rounded-md border border-red-200">
                                      Rejected
                                    </div>
                                  )
                                }
                                return (
                                  <div className="flex gap-2 mt-3">
                                    <Button
                                      size="sm"
                                      onClick={(e) => handleProjectCollabRequestResponse(e, notification, true)}
                                      className="flex-1"
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Processing...
                                        </>
                                      ) : (
                                        'Accept'
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => handleProjectCollabRequestResponse(e, notification, false)}
                                      className="flex-1"
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? 'Please wait...' : 'Cancel'}
                                    </Button>
                                  </div>
                                )
                              })()}
                              {(notification.type === 'INVITE' && notification.link?.includes('subscriptionCollabRequest=')) && (() => {
                                const requestId = getSubscriptionCollabRequestIdFromNotification(notification)
                                if (!requestId) return null
                                const isProcessing = respondingSubscriptionCollabRequestIds.has(requestId)
                                const isPending = pendingSubscriptionCollabRequestIds.has(requestId)
                                const isCancelled = cancelledSubscriptionCollabRequestIds.has(requestId)
                                const isAccepted = acceptedSubscriptionCollabRequestIds.has(requestId)
                                if (!isPending && !isCancelled) {
                                  return (
                                    <div className="mt-3 px-3 py-1.5 text-sm text-center bg-green-50 text-green-700 rounded-md border border-green-200">
                                      Accepted
                                    </div>
                                  )
                                }
                                if (isCancelled) {
                                  return (
                                    <div className="mt-3 px-3 py-1.5 text-sm text-center bg-red-50 text-red-700 rounded-md border border-red-200">
                                      Rejected
                                    </div>
                                  )
                                }
                                return (
                                  <div className="flex gap-2 mt-3">
                                    <Button
                                      size="sm"
                                      onClick={(e) => handleSubscriptionCollabRequestResponse(e, notification, true)}
                                      className="flex-1"
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Processing...
                                        </>
                                      ) : (
                                        'Accept'
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => handleSubscriptionCollabRequestResponse(e, notification, false)}
                                      className="flex-1"
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? 'Please wait...' : 'Cancel'}
                                    </Button>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover open={isProfileOpen} onOpenChange={setIsProfileOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    {user?.avatar ? (
                      <img 
                        src={user.avatar} 
                        alt={user.name || user.email} 
                        className="h-6 w-6 rounded-full"
                      />
                    ) : (
                      <UserCircle className="h-5 w-5" />
                    )}
                    <span className="hidden sm:inline">{user?.name || user?.email}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-4 border-b">
                    <div className="flex items-center gap-3">
                      {user?.avatar ? (
                        <img 
                          src={user.avatar} 
                          alt={user.name || user.email} 
                          className="h-12 w-12 rounded-full"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserCircle className="h-8 w-8 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{user?.name || 'User'}</h3>
                        <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                        {user?.role && (
                          <Badge className="mt-1" variant="secondary">
                            {user.role}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                    {isUserRefreshing && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Refreshing profile…</span>
                      </div>
                    )}
                    {userDetails ? (
                      <>
                        {userDetails.employeeId && (
                          <div className="flex items-center gap-3 text-sm">
                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-muted-foreground">Employee ID</p>
                              <p className="font-medium">{userDetails.employeeId}</p>
                            </div>
                          </div>
                        )}
                        {userDetails.department && (
                          <div className="flex items-center gap-3 text-sm">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-muted-foreground">Department</p>
                              <p className="font-medium">{userDetails.department}</p>
                            </div>
                          </div>
                        )}
                        {userDetails.company && (
                          <div className="flex items-center gap-3 text-sm">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-muted-foreground">Company</p>
                              <p className="font-medium">{userDetails.company}</p>
                            </div>
                          </div>
                        )}
                        {userDetails.emailVerified && (
                          <div className="flex items-center gap-3 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-muted-foreground">Email Verified</p>
                              <p className="font-medium">
                                {format(new Date(userDetails.emailVerified), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                        )}
                        {userDetails.createdAt && (
                          <div className="flex items-center gap-3 text-sm">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-muted-foreground">Member Since</p>
                              <p className="font-medium">
                                {format(new Date(userDetails.createdAt), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                        )}
                        {userDetails.isActive !== undefined && (
                          <div className="flex items-center gap-3 text-sm">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-muted-foreground">Status</p>
                              <Badge variant={userDetails.isActive ? "default" : "destructive"}>
                                {userDetails.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                          </div>
                        )}
                        {userDetails.hasCredentialAccess !== undefined && (
                          <div className="flex items-center gap-3 text-sm">
                            <Key className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-muted-foreground">Credential Access</p>
                              <Badge variant={userDetails.hasCredentialAccess ? "default" : "secondary"}>
                                {userDetails.hasCredentialAccess ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </div>
                          </div>
                        )}
                        {userDetails.hasSubscriptionAccess !== undefined && (
                          <div className="flex items-center gap-3 text-sm">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-muted-foreground">Subscription Access</p>
                              <Badge variant={userDetails.hasSubscriptionAccess ? "default" : "secondary"}>
                                {userDetails.hasSubscriptionAccess ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="py-6 text-sm text-muted-foreground text-center">
                        {isUserRefreshing ? 'Loading profile…' : 'Profile details not available.'}
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        signOut()
                        setIsProfileOpen(false)
                      }}
                      className="w-full gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
          {!user && (
            <Button
              variant="default"
              size="sm"
              onClick={() => router.push('/auth/signin')}
            >
              Sign In
            </Button>
          )}
        </div>
      </div>

      {/* AI Assistant Floating Button */}
      {user && typeof window !== 'undefined' && (
        <Button
          ref={buttonRef}
          className={`fixed h-14 w-14 rounded-full shadow-2xl z-[9999] bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 select-none ${
            isDragging ? 'cursor-grabbing scale-110 shadow-3xl' : 'cursor-move'
          }`}
          style={{
            left: `${buttonPosition.x > 0 ? buttonPosition.x : (window.innerWidth - 80)}px`,
            top: `${buttonPosition.y > 0 ? buttonPosition.y : (window.innerHeight - 100)}px`,
            transform: isDragging ? 'scale(1.1)' : undefined,
            touchAction: 'none', // Prevent touch scrolling on mobile
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={(e) => {
            // Support touch dragging on mobile
            const touch = e.touches[0]
            setIsDragging(true)
            setDragStart({
              x: touch.clientX - buttonPosition.x,
              y: touch.clientY - buttonPosition.y,
            })
            e.preventDefault()
          }}
          onClick={(e) => {
            // Only open dialog if not dragging or if we didn't actually move the mouse
            if (!hasMoved) {
              setIsAIDialogOpen(true)
              setAiQuery('')
              setAiResponse(null)
              setShowTaskForm(false)
              setTaskFormData({
                title: '',
                status: 'IN_PROGRESS',
                priority: 'MEDIUM',
                assignee: '',
                dueDate: '',
              })
            }
          }}
          title="AI Assistant - Drag to move, Click Bot icon to open"
        >
          <div className="relative w-full h-full flex items-center justify-center">
            <Bot className="h-6 w-6 bot-icon pointer-events-none" />
            <GripVertical className="absolute top-1 right-1 h-3 w-3 opacity-70 drag-handle pointer-events-none" />
          </div>
        </Button>
      )}

      {/* AI Assistant Dialog */}
      <Dialog open={isAIDialogOpen} onOpenChange={setIsAIDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              AI Assistant - Task Query
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!showTaskForm ? (
              <>
                <div className="flex gap-2">
                  <Input
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="e.g., Show all tasks for @John, Show under review tasks, Show dashboard, Show projects, Show credentials"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleAIQuery()
                      }
                    }}
                  />
                  <Button onClick={() => handleAIQuery()} disabled={aiLoading || !aiQuery.trim()}>
                    {aiLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Ask'
                    )}
                  </Button>
                </div>

                {/* Example Questions - Always visible */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Try asking:</p>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      // Replace placeholders with current user's name/email
                      const currentUserName = user?.name || user?.email || 'me'
                      const exampleQuestions = [
                        `Show tasks for ${currentUserName}`,
                        `Tell me about ${currentUserName}`,
                        'Show under review tasks',
                        'Show dashboard',
                        'Show projects',
                        'Show credentials',
                        'Show subscriptions',
                        'Show team tasks',
                        'Show completed tasks',
                        'Show in progress tasks',
                        'Show overdue tasks',
                        'Show team management',
                      ]
                      
                      return exampleQuestions.map((question) => (
                        <Button
                          key={question}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            handleAIQuery(question)
                          }}
                          disabled={aiLoading}
                        >
                          {question}
                        </Button>
                      ))
                    })()}
                  </div>
                </div>

                {aiResponse && aiResponse.action === 'created' && (
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-medium text-green-900">{aiResponse.message || 'Task created successfully!'}</p>
                          {aiResponse.task && (
                            <div className="mt-3 p-3 bg-white rounded border border-green-200">
                              <p className="font-medium">{aiResponse.task.title}</p>
                              <div className="flex gap-2 mt-2">
                                <StatusBadge className={getStatusBadgeColor(aiResponse.task.status)}>
                                  {aiResponse.task.status.replace('_', ' ')}
                                </StatusBadge>
                                <StatusBadge className={getPriorityBadgeColor(aiResponse.task.priority)}>
                                  {aiResponse.task.priority}
                                </StatusBadge>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {aiResponse && !aiResponse.success && (
                  <Card className="bg-red-50 border-red-200">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="font-medium text-red-900">Error</p>
                          <p className="text-sm text-red-700 mt-1">{aiResponse.message || 'Failed to process query'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {aiResponse && aiResponse.success && aiResponse.action === 'query' && (
                  <div className="space-y-4">
                    {aiResponse.user && (
                      <p className="text-sm text-muted-foreground">
                        Showing results for: <span className="font-medium">{aiResponse.user}</span>
                      </p>
                    )}
                    {aiResponse.message && (
                      <p className="text-sm font-medium">{aiResponse.message}</p>
                    )}
                    
                    {/* Render based on query type */}
                    {aiResponse.type === 'tasks' || aiResponse.type === 'under_review_tasks' || aiResponse.type === 'team_tasks' ? (
                      // Tasks table
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-3 text-left font-medium">Title</th>
                              <th className="p-3 text-left font-medium">Status</th>
                              <th className="p-3 text-left font-medium">Priority</th>
                              <th className="p-3 text-left font-medium">Assignees</th>
                              <th className="p-3 text-left font-medium">Project</th>
                              <th className="p-3 text-left font-medium">Due Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!aiResponse.data || (Array.isArray(aiResponse.data) && aiResponse.data.length === 0)) && (
                              <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                  No tasks found
                                </td>
                              </tr>
                            )}
                            {aiResponse.data && Array.isArray(aiResponse.data) && aiResponse.data.map((task: Task) => (
                              <tr key={task.id} className="border-t hover:bg-muted/50">
                                <td className="p-3 font-medium">{task.title}</td>
                                <td className="p-3">
                                  <StatusBadge className={getStatusBadgeColor(task.status)}>
                                    {task.status.replace('_', ' ')}
                                  </StatusBadge>
                                </td>
                                <td className="p-3">
                                  <StatusBadge className={getPriorityBadgeColor(task.priority)}>
                                    {task.priority}
                                  </StatusBadge>
                                </td>
                                <td className="p-3">
                                  {task.assignees && task.assignees.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {task.assignees.map((assignee, idx) => (
                                        <span key={idx} className="text-xs">
                                          {assignee.user?.name || assignee.user?.email}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  {task.project?.name ? (
                                    <Badge variant="outline">{task.project.name}</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : aiResponse.type === 'dashboard' ? (
                      // Dashboard statistics
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Total Tasks</p>
                            <p className="text-2xl font-bold">{aiResponse.data?.totalTasks || 0}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Completed</p>
                            <p className="text-2xl font-bold">{aiResponse.data?.completedTasks || 0}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">In Progress</p>
                            <p className="text-2xl font-bold">{aiResponse.data?.inProgressTasks || 0}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Overdue</p>
                            <p className="text-2xl font-bold">{aiResponse.data?.overdueTasks || 0}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Active Projects</p>
                            <p className="text-2xl font-bold">{aiResponse.data?.activeProjects || 0}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Credentials</p>
                            <p className="text-2xl font-bold">{aiResponse.data?.totalCredentials || 0}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Active Subscriptions</p>
                            <p className="text-2xl font-bold">{aiResponse.data?.activeSubscriptions || 0}</p>
                          </CardContent>
                        </Card>
                      </div>
                    ) : aiResponse.type === 'projects' ? (
                      // Projects table
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-3 text-left font-medium">Name</th>
                              <th className="p-3 text-left font-medium">Brand</th>
                              <th className="p-3 text-left font-medium">Members</th>
                              <th className="p-3 text-left font-medium">Tasks</th>
                              <th className="p-3 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!aiResponse.data || (Array.isArray(aiResponse.data) && aiResponse.data.length === 0)) && (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                  No projects found
                                </td>
                              </tr>
                            )}
                            {aiResponse.data && Array.isArray(aiResponse.data) && aiResponse.data.map((project: any) => (
                              <tr key={project.id} className="border-t hover:bg-muted/50">
                                <td className="p-3 font-medium">{project.name}</td>
                                <td className="p-3">{project.brand || '-'}</td>
                                <td className="p-3">{project.members?.length || 0}</td>
                                <td className="p-3">{project._count?.tasks || 0}</td>
                                <td className="p-3">
                                  <StatusBadge variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                    {project.status || 'ACTIVE'}
                                  </StatusBadge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : aiResponse.type === 'credentials' ? (
                      // Credentials table
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-3 text-left font-medium">Company</th>
                              <th className="p-3 text-left font-medium">Platform</th>
                              <th className="p-3 text-left font-medium">URL</th>
                              <th className="p-3 text-left font-medium">Username</th>
                              <th className="p-3 text-left font-medium">Privacy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!aiResponse.data || (Array.isArray(aiResponse.data) && aiResponse.data.length === 0)) && (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                  No credentials found
                                </td>
                              </tr>
                            )}
                            {aiResponse.data && Array.isArray(aiResponse.data) && aiResponse.data.map((credential: any) => (
                              <tr key={credential.id} className="border-t hover:bg-muted/50">
                                <td className="p-3 font-medium">{credential.company}</td>
                                <td className="p-3">{credential.platform}</td>
                                <td className="p-3">{credential.url || '-'}</td>
                                <td className="p-3">{credential.username || '-'}</td>
                                <td className="p-3">
                                  <StatusBadge variant={credential.privacyLevel === 'PUBLIC' ? 'default' : 'secondary'}>
                                    {credential.privacyLevel || 'PRIVATE'}
                                  </StatusBadge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : aiResponse.type === 'subscriptions' ? (
                      // Subscriptions table
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-3 text-left font-medium">Name</th>
                              <th className="p-3 text-left font-medium">Amount</th>
                              <th className="p-3 text-left font-medium">Currency</th>
                              <th className="p-3 text-left font-medium">Status</th>
                              <th className="p-3 text-left font-medium">Billing Cycle</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!aiResponse.data || (Array.isArray(aiResponse.data) && aiResponse.data.length === 0)) && (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                  No subscriptions found
                                </td>
                              </tr>
                            )}
                            {aiResponse.data && Array.isArray(aiResponse.data) && aiResponse.data.map((subscription: any) => (
                              <tr key={subscription.id} className="border-t hover:bg-muted/50">
                                <td className="p-3 font-medium">{subscription.name}</td>
                                <td className="p-3">{subscription.amount || 0}</td>
                                <td className="p-3">{subscription.currency || 'USD'}</td>
                                <td className="p-3">
                                  <StatusBadge variant={subscription.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                    {subscription.status || 'INACTIVE'}
                                  </StatusBadge>
                                </td>
                                <td className="p-3">{subscription.billingCycle || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : aiResponse.type === 'user_info' ? (
                      // User information card
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            User Information
                          </CardTitle>
                          <CardDescription>{aiResponse.message}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {aiResponse.data?.user && (
                            <>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Name</p>
                                  <p className="text-lg font-semibold">{aiResponse.data.user.name || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Email</p>
                                  <p className="text-lg">{aiResponse.data.user.email}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Employee ID</p>
                                  <p className="text-lg">{aiResponse.data.user.employeeId || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Department</p>
                                  <p className="text-lg">{aiResponse.data.user.department || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Company</p>
                                  <p className="text-lg">{aiResponse.data.user.company || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Role</p>
                                  <Badge variant={aiResponse.data.user.role === 'admin' || aiResponse.data.user.role === 'superadmin' ? 'default' : 'secondary'}>
                                    {aiResponse.data.user.role?.toUpperCase() || 'USER'}
                                  </Badge>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                                  <Badge variant={aiResponse.data.user.isActive ? 'default' : 'secondary'}>
                                    {aiResponse.data.user.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Member Since</p>
                                  <p className="text-lg">
                                    {aiResponse.data.user.createdAt 
                                      ? new Date(aiResponse.data.user.createdAt).toLocaleDateString('en-US', { 
                                          year: 'numeric', 
                                          month: 'short', 
                                          day: 'numeric' 
                                        })
                                      : 'N/A'}
                                  </p>
                                </div>
                              </div>
                              <div className="border-t pt-4">
                                <h4 className="font-semibold mb-3">Statistics</h4>
                                <div className="grid grid-cols-2 gap-4">
                                  <Card>
                                    <CardContent className="pt-6">
                                      <p className="text-sm text-muted-foreground">Total Projects</p>
                                      <p className="text-2xl font-bold">{aiResponse.data.projectCount || 0}</p>
                                    </CardContent>
                                  </Card>
                                  <Card>
                                    <CardContent className="pt-6">
                                      <p className="text-sm text-muted-foreground">Total Tasks</p>
                                      <p className="text-2xl font-bold">{aiResponse.data.taskCount || 0}</p>
                                    </CardContent>
                                  </Card>
                                </div>
                                {aiResponse.data.tasksByStatus && Object.keys(aiResponse.data.tasksByStatus).length > 0 && (
                                  <div className="mt-4">
                                    <h5 className="font-medium mb-2">Tasks by Status</h5>
                                    <div className="grid grid-cols-2 gap-2">
                                      {Object.entries(aiResponse.data.tasksByStatus).map(([status, count]: [string, any]) => (
                                        <div key={status} className="flex items-center justify-between p-2 bg-muted rounded">
                                          <span className="text-sm capitalize">{status.replace('_', ' ')}</span>
                                          <Badge>{count}</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    ) : aiResponse.type === 'team_management' ? (
                      // Team members table
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-3 text-left font-medium">Name</th>
                              <th className="p-3 text-left font-medium">Email</th>
                              <th className="p-3 text-left font-medium">Department</th>
                              <th className="p-3 text-left font-medium">Role</th>
                              <th className="p-3 text-left font-medium">Tasks</th>
                              <th className="p-3 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!aiResponse.data || (Array.isArray(aiResponse.data) && aiResponse.data.length === 0)) && (
                              <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                  No team members found
                                </td>
                              </tr>
                            )}
                            {aiResponse.data && Array.isArray(aiResponse.data) && aiResponse.data.map((member: any) => (
                              <tr key={member.id} className="border-t hover:bg-muted/50">
                                <td className="p-3 font-medium">{member.name || '-'}</td>
                                <td className="p-3">{member.email}</td>
                                <td className="p-3">{member.department || '-'}</td>
                                <td className="p-3">
                                  <StatusBadge variant="outline">{member.role || 'user'}</StatusBadge>
                                </td>
                                <td className="p-3">{member._count?.tasksAssigned || 0}</td>
                                <td className="p-3">
                                  <StatusBadge variant={member.isActive ? 'default' : 'destructive'}>
                                    {member.isActive ? 'Active' : 'Inactive'}
                                  </StatusBadge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="task-title">Task Title *</Label>
                      <Input
                        id="task-title"
                        value={taskFormData.title}
                        onChange={(e) => setTaskFormData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Enter task title"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="task-status">Status</Label>
                        <Select
                          value={taskFormData.status}
                          onValueChange={(value) => setTaskFormData(prev => ({ ...prev, status: value }))}
                        >
                          <SelectTrigger id="task-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                            <SelectItem value="YTS">Yet to Start</SelectItem>
                            <SelectItem value="ON_HOLD">On Hold</SelectItem>
                            <SelectItem value="RECURRING">Recurring</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="task-priority">Priority</Label>
                        <Select
                          value={taskFormData.priority}
                          onValueChange={(value) => setTaskFormData(prev => ({ ...prev, priority: value }))}
                        >
                          <SelectTrigger id="task-priority">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HIGH">High</SelectItem>
                            <SelectItem value="MEDIUM">Medium</SelectItem>
                            <SelectItem value="LOW">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="task-assignee">Assign To (User Name or Email)</Label>
                      <Input
                        id="task-assignee"
                        value={taskFormData.assignee}
                        onChange={(e) => setTaskFormData(prev => ({ ...prev, assignee: e.target.value }))}
                        placeholder="e.g., John Doe or john@example.com"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave empty to assign to yourself
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="task-due-date">Due Date (Optional)</Label>
                      <Input
                        id="task-due-date"
                        type="date"
                        value={taskFormData.dueDate}
                        onChange={(e) => setTaskFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                      />
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowTaskForm(false)
                          setTaskFormData({
                            title: '',
                            status: 'IN_PROGRESS',
                            priority: 'MEDIUM',
                            assignee: '',
                            dueDate: '',
                          })
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleCreateTaskFromForm} disabled={aiLoading || !taskFormData.title.trim()}>
                        {aiLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create Task'
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </nav>
  )
}

