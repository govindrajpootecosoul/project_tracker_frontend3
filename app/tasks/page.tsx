'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, MessageSquare, CheckCircle2, Calendar, List, Grid3x3, LayoutGrid, Users, ChevronDown, ChevronRight, Filter, X } from 'lucide-react'
import { format } from 'date-fns'

type TaskStatus = 'IN_PROGRESS' | 'COMPLETED' | 'YTS' | 'ON_HOLD' | 'RECURRING'
type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW'
type RecurringType = 'DAILY' | 'WEEKLY' | 'MONTHLY'
type ViewMode = 'list' | 'grid' | 'kanban'

interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string
  projectId?: string
  brand?: string
  tags?: string
  recurring?: RecurringType
  reviewStatus?: 'REVIEW_REQUESTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | null
  reviewRequestedById?: string
  reviewRequestedAt?: string
  reviewerId?: string
  reviewedById?: string
  reviewedAt?: string
  createdById: string
  assignees: { user: { id: string; name?: string; email: string } }[]
  reviewRequestedBy?: { id: string; name?: string; email: string } | null
  reviewer?: { id: string; name?: string; email: string } | null
  reviewedBy?: { id: string; name?: string; email: string } | null
  project?: {
    id: string
    name: string
    brand?: string
  } | null
  comments?: Comment[]
}

interface Comment {
  id: string
  content: string
  taskId: string
  userId: string
  mentions?: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name?: string
    email: string
  }
}

interface Project {
  id: string
  name: string
  brand?: string
}

interface FormData {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
  projectId: string
  brand: string
  tags: string
  recurring: RecurringType | '' | 'none'
  assigneeId: string
}

interface TeamMemberInfo {
  id: string
  name?: string
  email: string
  department?: string
}

const initialFormData: FormData = {
  title: '',
  description: '',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  dueDate: '',
  projectId: '',
  brand: '',
  tags: '',
  recurring: '',
  assigneeId: '',
}

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamTasks, setTeamTasks] = useState<Task[]>([])
  const [reviewTasks, setReviewTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberInfo[]>([])
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set())
  const [teamTaskStatusFilter, setTeamTaskStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [selectedTaskForComment, setSelectedTaskForComment] = useState<Task | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionPosition, setMentionPosition] = useState({ start: 0, end: 0 })
  const [allUsers, setAllUsers] = useState<{ id: string; name?: string; email: string }[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [acceptingTaskId, setAcceptingTaskId] = useState<string | null>(null)
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null)
  const [user, setUser] = useState<{ id?: string; department?: string; role?: string; name?: string; email?: string } | null>(null)
  const [activeTab, setActiveTab] = useState<string>('my')
  const [assignableMembers, setAssignableMembers] = useState<{ id: string; name?: string; email: string; department?: string }[]>([])
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('')
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const teamMemberLookup = useMemo(() => {
    const map = new Map<string, TeamMemberInfo>()
    teamMembers.forEach(member => {
      map.set(member.id, member)
    })
    return map
  }, [teamMembers])

  const fetchTasks = useCallback(async () => {
    try {
      const [myTasks, teamTasksData, reviewTasksData] = await Promise.all([
        apiClient.getMyTasks(),
        apiClient.getTeamTasks(),
        apiClient.getReviewTasks(),
      ])
      setTasks(myTasks as Task[])
      setTeamTasks(teamTasksData as Task[])
      setReviewTasks(reviewTasksData as Task[])
      console.log('Fetched Review Tasks:', {
        count: (reviewTasksData as Task[]).length,
        tasks: (reviewTasksData as Task[]).map(t => ({
          id: t.id,
          title: t.title,
          reviewStatus: t.reviewStatus,
          reviewerId: t.reviewerId,
        })),
      })
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    }
  }, [])

  const fetchProjects = useCallback(async () => {
    try {
      const projectsData = await apiClient.getProjects()
      setProjects(projectsData as Project[])
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }, [])

  const fetchTeamMembers = useCallback(async () => {
    try {
      const membersData = await apiClient.getTeamMembers()
      setTeamMembers(membersData as TeamMemberInfo[])
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    }
  }, [])

  const fetchAllUsers = useCallback(async () => {
    try {
      const usersData = await apiClient.getTeamUsers()
      setAllUsers(usersData as { id: string; name?: string; email: string }[])
    } catch (error) {
      console.error('Failed to fetch all users:', error)
    }
  }, [])

  // Check authentication and fetch data
  useEffect(() => {
     const token = getToken()
     if (!token) {
       router.push('/auth/signin')
       return
     }
 
    // Hydrate user info from localStorage
    let storedUser: any = null
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        try {
          storedUser = JSON.parse(userStr)
          setUser((prev) => ({ ...(prev ?? {}), ...storedUser }))
        } catch (e) {
          console.error('Failed to parse user from localStorage:', e)
        }
      }
    }

    const hydrateProfile = async () => {
      try {
        const profile = await apiClient.getUserRole()
        if (profile) {
          setUser((prev) => ({ ...(prev ?? {}), ...profile }))
          if (typeof window !== 'undefined') {
            try {
              const merged = { ...(storedUser ?? {}), ...profile }
              localStorage.setItem('user', JSON.stringify(merged))
            } catch (e) {
              console.error('Failed to persist user profile:', e)
            }
          }
        }
      } catch (error) {
        console.error('Failed to hydrate user profile:', error)
      }
    }

    hydrateProfile()

    fetchTasks()
    fetchProjects()
    fetchTeamMembers()
    fetchAllUsers()
    
    // Listen for refresh events from navbar
    const handleRefreshTasks = () => {
      fetchTasks()
    }
    window.addEventListener('refreshTasks', handleRefreshTasks)
    
    // Listen for switch to review tab event
    const handleSwitchToReviewTab = () => {
      setActiveTab('review')
      fetchTasks() // Refresh tasks when switching to review tab
    }
    window.addEventListener('switchToReviewTab', handleSwitchToReviewTab)
    
    // Check URL params for tab
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab === 'review') {
        setActiveTab('review')
      }
    }
    
    return () => {
      window.removeEventListener('refreshTasks', handleRefreshTasks)
      window.removeEventListener('switchToReviewTab', handleSwitchToReviewTab)
    }
  }, [router, fetchTasks, fetchProjects, fetchTeamMembers, fetchAllUsers])

  // Extract unique brands from tasks and projects
  useEffect(() => {
    const brandSet = new Set<string>()
    
    // Extract brands from tasks
    tasks.forEach(task => {
      if (task.brand && task.brand.trim()) {
        brandSet.add(task.brand.trim())
      }
    })
    teamTasks.forEach(task => {
      if (task.brand && task.brand.trim()) {
        brandSet.add(task.brand.trim())
      }
    })
    
    // Extract brands from projects
    projects.forEach(project => {
      if (project.brand && project.brand.trim()) {
        brandSet.add(project.brand.trim())
      }
    })
    
    setBrands(Array.from(brandSet).sort())
  }, [tasks, teamTasks, projects])

  const resetForm = useCallback(() => {
    setFormData(initialFormData)
    setEditingTask(null)
  }, [])

  const fetchAssignableMembers = useCallback(async (search?: string) => {
    try {
      // Only fetch if user is admin or super admin
      if (user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        const members = await apiClient.getAssignableMembers(search)
        setAssignableMembers(members as { id: string; name?: string; email: string; department?: string }[])
      }
    } catch (error) {
      console.error('Failed to fetch assignable members:', error)
      // If error is 403, user doesn't have permission (not admin/super admin)
      if ((error as any)?.message?.includes('403')) {
        setAssignableMembers([])
      }
    }
  }, [user?.role])

  const openCreateDialog = useCallback(() => {
    resetForm()
    setIsDialogOpen(true)
    // Fetch assignable members when opening dialog
    if (user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
      fetchAssignableMembers()
    }
  }, [resetForm, user?.role, fetchAssignableMembers])

  const openEditDialog = useCallback((task: Task) => {
    setEditingTask(task)
    // Get the first assignee ID if available
    const firstAssigneeId = task.assignees && task.assignees.length > 0 ? task.assignees[0].user.id : ''
    setFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : '',
      projectId: task.projectId || '',
      brand: task.brand || '',
      tags: task.tags || '',
      recurring: task.recurring || '',
      assigneeId: firstAssigneeId,
    })
    setIsDialogOpen(true)
    // Fetch assignable members when opening dialog
    if (user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
      fetchAssignableMembers().then(() => {
        // If there's an assignee, ensure it's in the list
        if (firstAssigneeId && task.assignees && task.assignees.length > 0) {
          const assignee = task.assignees[0].user
          setAssignableMembers(prev => {
            // Check if assignee is already in the list
            const exists = prev.some(m => m.id === assignee.id)
            if (!exists) {
              return [...prev, {
                id: assignee.id,
                name: assignee.name,
                email: assignee.email,
              }]
            }
            return prev
          })
        }
      })
    }
  }, [user?.role, fetchAssignableMembers])

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false)
    resetForm()
    setAssigneeSearchQuery('')
    setIsAssigneeDropdownOpen(false)
    // Clear search timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
  }, [resetForm])

  const handleCreateTask = useCallback(async () => {
    try {
      if (!formData.title.trim()) {
        alert('Task title is required')
        return
      }

      const cleanData: any = {
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        status: formData.status,
        priority: formData.priority,
        dueDate: formData.dueDate && formData.dueDate.trim() !== '' ? formData.dueDate : null,
        projectId: formData.projectId && formData.projectId.trim() !== '' ? formData.projectId.trim() : null,
        brand: formData.brand?.trim() || null,
        tags: formData.tags?.trim() || null,
        recurring: formData.recurring && formData.recurring !== 'none' && formData.recurring.trim() !== '' 
          ? formData.recurring 
          : null,
      }

      // Add assignees if assigneeId is provided and user is admin/super admin
      if (formData.assigneeId && formData.assigneeId.trim() !== '' && 
          user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        cleanData.assignees = [formData.assigneeId.trim()]
      }

      await apiClient.createTask(cleanData)
      closeDialog()
      await Promise.all([fetchTasks(), fetchProjects()])
    } catch (error: any) {
      console.error('Failed to create task:', error)
      alert(error.message || 'Failed to create task')
    }
  }, [formData, closeDialog, fetchTasks, fetchProjects, user?.role])

  const handleUpdateTask = useCallback(async () => {
    if (!editingTask) return

    try {
      if (!formData.title.trim()) {
        alert('Task title is required')
        return
      }

      const cleanData: any = {
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        status: formData.status,
        priority: formData.priority,
        dueDate: formData.dueDate && formData.dueDate.trim() !== '' ? formData.dueDate : null,
        projectId: formData.projectId && formData.projectId.trim() !== '' ? formData.projectId.trim() : null,
        brand: formData.brand?.trim() || null,
        tags: formData.tags?.trim() || null,
        recurring: formData.recurring && formData.recurring !== 'none' && formData.recurring.trim() !== '' 
          ? formData.recurring 
          : null,
      }

      // Add assignees if assigneeId is provided and user is admin/super admin
      if (formData.assigneeId && formData.assigneeId.trim() !== '' && 
          user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        cleanData.assignees = [formData.assigneeId.trim()]
      }

      await apiClient.updateTask(editingTask.id, cleanData)
      closeDialog()
      // Force refresh all task lists to ensure status updates are reflected immediately
      await fetchTasks()
      await fetchProjects()
    } catch (error: any) {
      console.error('Failed to update task:', error)
      alert(error.message || 'Failed to update task')
    }
  }, [editingTask, formData, closeDialog, fetchTasks, fetchProjects, user?.role])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return
    try {
      await apiClient.deleteTask(taskId)
      fetchTasks()
    } catch (error) {
      console.error('Failed to delete task:', error)
      alert('Failed to delete task')
    }
  }, [])

  const handleMarkComplete = useCallback(async (taskId: string) => {
    try {
      await apiClient.updateTask(taskId, { status: 'COMPLETED' })
      await fetchTasks()
    } catch (error) {
      console.error('Failed to update task:', error)
      alert('Failed to update task')
    }
  }, [fetchTasks])

  const handleQuickStatusUpdate = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    try {
      await apiClient.updateTask(taskId, { status: newStatus })
      await fetchTasks()
    } catch (error) {
      console.error('Failed to update task status:', error)
      alert('Failed to update task status')
    }
  }, [fetchTasks])

  const openCommentDialog = useCallback(async (task: Task) => {
    setSelectedTaskForComment(task)
    setIsCommentDialogOpen(true)
    setCommentText('')
    try {
      const taskComments = await apiClient.getTaskComments(task.id)
      setComments(taskComments as Comment[])
    } catch (error) {
      console.error('Failed to fetch comments:', error)
      setComments([])
    }
  }, [])

  const openReviewDialog = useCallback((task: Task) => {
    setSelectedTaskForComment(task)
    setIsReviewDialogOpen(true)
  }, [])

  const handleSendComment = useCallback(async () => {
    if (!selectedTaskForComment || !commentText.trim()) return

    try {
      // Extract mentions from comment text (format: @username)
      const mentionRegex = /@(\w+)/g
      const mentionedUsernames: string[] = []
      let match
      while ((match = mentionRegex.exec(commentText)) !== null) {
        mentionedUsernames.push(match[1])
      }

      // Find user IDs for mentioned usernames
      const mentionedUserIds: string[] = []
      mentionedUsernames.forEach(username => {
        const user = allUsers.find(u => 
          (u.name && u.name.toLowerCase().includes(username.toLowerCase())) ||
          u.email.toLowerCase().includes(username.toLowerCase())
        )
        if (user) mentionedUserIds.push(user.id)
      })

      await apiClient.createComment(selectedTaskForComment.id, commentText, mentionedUserIds)
      setCommentText('')
      // Refresh comments
      const taskComments = await apiClient.getTaskComments(selectedTaskForComment.id)
      setComments(taskComments as Comment[])
      // Refresh tasks
      await fetchTasks()
    } catch (error: any) {
      console.error('Failed to send comment:', error)
      alert(error.message || 'Failed to send comment')
    }
  }, [selectedTaskForComment, commentText, allUsers, fetchTasks])

  const handleRequestReview = useCallback(async (reviewerId: string) => {
    if (!selectedTaskForComment) return

    try {
      await apiClient.requestReview(selectedTaskForComment.id, reviewerId)
      setIsReviewDialogOpen(false)
      setSelectedTaskForComment(null)
      await fetchTasks()
      alert('Review requested successfully. The task has been paused and sent for review.')
    } catch (error: any) {
      console.error('Failed to request review:', error)
      alert(error.message || 'Failed to request review')
    }
  }, [selectedTaskForComment, fetchTasks])

  const handleRespondToReview = useCallback(async (action: 'APPROVED' | 'REJECTED', comment?: string) => {
    if (!selectedTaskForComment) return

    try {
      await apiClient.respondToReview(selectedTaskForComment.id, action, comment)
      setIsReviewDialogOpen(false)
      setSelectedTaskForComment(null)
      await fetchTasks()
      alert(`Review ${action.toLowerCase()} successfully.`)
    } catch (error: any) {
      console.error('Failed to respond to review:', error)
      alert(error.message || 'Failed to respond to review')
    }
  }, [selectedTaskForComment, fetchTasks])

  const handleAcceptReviewRequest = useCallback(async (taskId: string) => {
    // Prevent double-clicks
    if (acceptingTaskId === taskId) return
    
    try {
      setAcceptingTaskId(taskId)
      await apiClient.acceptReviewRequest(taskId, true)
      // Refresh all tasks including review tasks immediately
      await fetchTasks()
      // Also refresh review tasks specifically after a short delay to ensure backend has updated
      setTimeout(async () => {
        try {
          const reviewTasksData = await apiClient.getReviewTasks()
          setReviewTasks(reviewTasksData as Task[])
          console.log('Refreshed review tasks after accept:', {
            count: (reviewTasksData as Task[]).length,
            tasks: (reviewTasksData as Task[]).map(t => ({
              id: t.id,
              title: t.title,
              reviewStatus: t.reviewStatus,
              reviewerId: t.reviewerId,
            })),
          })
        } catch (error) {
          console.error('Failed to refresh review tasks:', error)
        }
      }, 500)
      // Close notification popover if open
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshNotifications'))
      }
      // Don't show alert, just refresh silently
    } catch (error: any) {
      console.error('Failed to accept review request:', error)
      alert(error.message || 'Failed to accept review request')
    } finally {
      setAcceptingTaskId(null)
    }
  }, [fetchTasks, acceptingTaskId])

  const handleCancelReviewRequest = useCallback(async (taskId: string) => {
    // Prevent double-clicks
    if (cancellingTaskId === taskId) return
    
    if (!confirm('Are you sure you want to cancel this review request?')) return
    
    try {
      setCancellingTaskId(taskId)
      await apiClient.acceptReviewRequest(taskId, false)
      await fetchTasks()
      // Close notification popover if open
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshNotifications'))
      }
      // Don't show alert, just refresh silently
    } catch (error: any) {
      console.error('Failed to cancel review request:', error)
      alert(error.message || 'Failed to cancel review request')
    } finally {
      setCancellingTaskId(null)
    }
  }, [fetchTasks, cancellingTaskId])

  const handleCommentTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPosition = e.target.selectionStart
    
    setCommentText(value)

    // Check for @mention trigger
    const textBeforeCursor = value.substring(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)
      // Check if it's a valid mention (no spaces, no @ already)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('@')) {
        setMentionQuery(textAfterAt)
        setShowMentions(true)
        setMentionPosition({ start: lastAtIndex, end: cursorPosition })
      } else {
        setShowMentions(false)
      }
    } else {
      setShowMentions(false)
    }
  }, [])

  const insertMention = useCallback((user: { id: string; name?: string; email: string }) => {
    if (!selectedTaskForComment) return
    
    const beforeMention = commentText.substring(0, mentionPosition.start)
    const afterMention = commentText.substring(mentionPosition.end)
    const mentionText = `@${user.name || user.email} `
    const newText = beforeMention + mentionText + afterMention
    
    setCommentText(newText)
    setShowMentions(false)
    setMentionQuery('')
  }, [selectedTaskForComment, commentText, mentionPosition])

  const handleFormSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (editingTask) {
      handleUpdateTask()
    } else {
      handleCreateTask()
    }
  }, [editingTask, handleUpdateTask, handleCreateTask])

  const updateFormField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  const getStatusBadgeColor = (status: TaskStatus) => {
    const colors = {
      IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
      COMPLETED: 'bg-green-100 text-green-800',
      YTS: 'bg-blue-100 text-blue-800',
      ON_HOLD: 'bg-gray-100 text-gray-800',
      RECURRING: 'bg-purple-100 text-purple-800',
    }
    return colors[status] || colors.IN_PROGRESS
  }

  const getPriorityBadgeColor = (priority: TaskPriority) => {
    const colors = {
      HIGH: 'bg-red-100 text-red-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      LOW: 'bg-green-100 text-green-800',
    }
    return colors[priority] || colors.MEDIUM
  }

  const TaskCard = ({ task }: { task: Task }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Card className="hover:shadow-lg transition-shadow h-full flex flex-col min-h-[280px]">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg line-clamp-2">{task.title}</CardTitle>
              {task.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openCommentDialog(task)}
                title="Comments"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              {task.reviewStatus !== 'REVIEW_REQUESTED' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openReviewDialog(task)}
                  title="Request Review"
                >
                  <Users className="h-4 w-4" />
                </Button>
              )}
              {task.reviewStatus === 'REVIEW_REQUESTED' && task.reviewerId === user?.id && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleAcceptReviewRequest(task.id)}
                    title="Accept Review Request"
                    className="text-green-600 hover:text-green-700"
                    disabled={acceptingTaskId === task.id}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCancelReviewRequest(task.id)}
                    title="Cancel Review Request"
                    className="text-red-600 hover:text-red-700"
                    disabled={cancellingTaskId === task.id}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEditDialog(task)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteTask(task.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
            <Popover>
              <PopoverTrigger asChild>
                <Badge className={`${getStatusBadgeColor(task.status)} cursor-pointer hover:opacity-80 transition-opacity`}>
                  {task.status.replace('_', ' ')}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Change Status</div>
                  {(['YTS', 'IN_PROGRESS', 'ON_HOLD', 'RECURRING', 'COMPLETED'] as TaskStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleQuickStatusUpdate(task.id, status)}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors ${
                        task.status === status ? 'bg-accent font-medium' : ''
                      }`}
                    >
                      {status.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {task.reviewStatus && (
              <Badge className={
                task.reviewStatus === 'REVIEW_REQUESTED' ? 'bg-blue-100 text-blue-800' :
                task.reviewStatus === 'UNDER_REVIEW' ? 'bg-yellow-100 text-yellow-800' :
                task.reviewStatus === 'APPROVED' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }>
                {task.reviewStatus === 'REVIEW_REQUESTED' && task.reviewer 
                  ? `Review Requested (${task.reviewer.name || task.reviewer.email})`
                  : task.reviewStatus === 'UNDER_REVIEW' && task.reviewer
                  ? `Under Review (${task.reviewer.name || task.reviewer.email})`
                  : task.reviewStatus === 'APPROVED' && task.reviewedBy
                  ? `Approved by ${task.reviewedBy.name || task.reviewedBy.email}`
                  : task.reviewStatus === 'REJECTED' && task.reviewedBy
                  ? `Rejected by ${task.reviewedBy.name || task.reviewedBy.email}`
                  : task.reviewStatus.replace('_', ' ')}
              </Badge>
            )}
            <Badge className={getPriorityBadgeColor(task.priority)}>
              {task.priority}
            </Badge>
            {task.project && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {task.project.name}
              </Badge>
            )}
            {task.brand && (
              <Badge variant="outline">{task.brand}</Badge>
            )}
            {task.recurring && (
              <Badge variant="outline">{task.recurring}</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0 mb-3">
            {task.dueDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(task.dueDate), 'MMM dd, yyyy')}
              </div>
            )}
            {task.assignees.length > 0 && (
              <div className="truncate">
                Assigned to: {task.assignees.map(a => a.user.name || a.user.email).join(', ')}
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleMarkComplete(task.id)}
              disabled={task.status === 'COMPLETED'}
              className="flex-1"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark Complete
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => openCommentDialog(task)}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Comments
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )

  const getFilteredAndSortedTasks = (tasksToRender: Task[]) => {
    let filtered = tasksToRender

    // Sort: In-progress tasks first, then by due date
    const sorted = [...filtered].sort((a, b) => {
      // In-progress tasks first
      if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1
      if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1
      
      // Then by due date
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      }
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      
      return 0
    })

    return sorted
  }

  // Get tasks that are under review
  // Show all UNDER_REVIEW tasks that are visible to the user (from their tasks or team tasks)
  // The user will know which ones they need to review based on notifications
  const getUnderReviewTasks = useCallback(() => {
    // Filter review tasks for UNDER_REVIEW status where current user is the reviewer
    // Also check reviewerId matches to ensure it's the correct reviewer
    const filtered = reviewTasks.filter(task => {
      const matches = task.reviewStatus === 'UNDER_REVIEW' && task.reviewerId === user?.id
      if (!matches && task.reviewStatus === 'UNDER_REVIEW') {
        console.log('Task not matching:', {
          taskId: task.id,
          reviewStatus: task.reviewStatus,
          reviewerId: task.reviewerId,
          userId: user?.id,
        })
      }
      return matches
    })
    console.log('Under Review Tasks:', {
      totalReviewTasks: reviewTasks.length,
      filteredCount: filtered.length,
      userId: user?.id,
      reviewTasks: reviewTasks.map(t => ({
        id: t.id,
        reviewStatus: t.reviewStatus,
        reviewerId: t.reviewerId,
      })),
    })
    return filtered
  }, [reviewTasks, user?.id])

  const renderTasks = (tasksToRender: Task[]) => {
    const filteredAndSorted = getFilteredAndSortedTasks(tasksToRender)

    if (tasksToRender.length === 0) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No tasks found. Create your first task!
          </CardContent>
        </Card>
      )
    }

    if (viewMode === 'kanban') {
      const statusColumns: TaskStatus[] = ['YTS', 'IN_PROGRESS', 'ON_HOLD', 'RECURRING', 'COMPLETED']
      return (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statusColumns.map((status) => {
            // Filter tasks by exact status match (case-sensitive)
            const statusTasks = filteredAndSorted.filter(t => {
              const matches = t.status === status
              if (!matches && t.status) {
                console.log('Status mismatch:', { 
                  taskId: t.id, 
                  taskStatus: t.status, 
                  expectedStatus: status,
                  statusType: typeof t.status,
                  expectedType: typeof status
                })
              }
              return matches
            })
            return (
              <div key={status} className="flex-shrink-0 w-80">
                <div className="bg-muted rounded-lg p-3 mb-2">
                  <h3 className="font-semibold">{status.replace('_', ' ')} ({statusTasks.length})</h3>
                </div>
                <div className="space-y-2 min-h-[400px]">
                  {statusTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    if (viewMode === 'list') {
      return (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4">Title</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-left p-4">Priority</th>
                  <th className="text-left p-4">Project</th>
                  <th className="text-left p-4">Due Date</th>
                  <th className="text-left p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((task) => (
                  <tr key={task.id} className="border-b hover:bg-accent/50">
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{task.title}</div>
                        {task.description && (
                          <div className="text-sm text-muted-foreground">{task.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Badge className={`${getStatusBadgeColor(task.status)} cursor-pointer hover:opacity-80 transition-opacity`}>
                              {task.status.replace('_', ' ')}
                            </Badge>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2">
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Change Status</div>
                              {(['YTS', 'IN_PROGRESS', 'ON_HOLD', 'RECURRING', 'COMPLETED'] as TaskStatus[]).map((status) => (
                                <button
                                  key={status}
                                  onClick={() => handleQuickStatusUpdate(task.id, status)}
                                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors ${
                                    task.status === status ? 'bg-accent font-medium' : ''
                                  }`}
                                >
                                  {status.replace('_', ' ')}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        {task.reviewStatus && (
                          <Badge className={
                            task.reviewStatus === 'REVIEW_REQUESTED' ? 'bg-blue-100 text-blue-800' :
                            task.reviewStatus === 'UNDER_REVIEW' ? 'bg-yellow-100 text-yellow-800' :
                            task.reviewStatus === 'APPROVED' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }>
                            {task.reviewStatus === 'REVIEW_REQUESTED' && task.reviewer 
                              ? `Review Requested (${task.reviewer.name || task.reviewer.email})`
                              : task.reviewStatus === 'UNDER_REVIEW' && task.reviewer
                              ? `Under Review (${task.reviewer.name || task.reviewer.email})`
                              : task.reviewStatus === 'APPROVED' && task.reviewedBy
                              ? `Approved by ${task.reviewedBy.name || task.reviewedBy.email}`
                              : task.reviewStatus === 'REJECTED' && task.reviewedBy
                              ? `Rejected by ${task.reviewedBy.name || task.reviewedBy.email}`
                              : task.reviewStatus.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge className={getPriorityBadgeColor(task.priority)}>
                        {task.priority}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {task.project ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {task.project.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      {task.dueDate ? format(new Date(task.dueDate), 'MMM dd, yyyy') : '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openCommentDialog(task)}
                          title="Comments"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        {task.reviewStatus !== 'REVIEW_REQUESTED' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openReviewDialog(task)}
                            title="Request Review"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                        )}
                        {task.reviewStatus === 'REVIEW_REQUESTED' && task.reviewerId === user?.id && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleAcceptReviewRequest(task.id)}
                              title="Accept Review Request"
                              className="text-green-600 hover:text-green-700"
                              disabled={acceptingTaskId === task.id}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCancelReviewRequest(task.id)}
                              title="Cancel Review Request"
                              className="text-red-600 hover:text-red-700"
                              disabled={cancellingTaskId === task.id}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(task)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )
    }

    // Grid view (default)
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
        {filteredAndSorted.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    )
  }

  const toggleMemberExpansion = (memberId: string) => {
    setExpandedMembers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(memberId)) {
        newSet.delete(memberId)
      } else {
        newSet.add(memberId)
      }
      return newSet
    })
  }

  const renderTeamTasks = () => {
     // Group tasks by team member
    const tasksByMember: {
      [key: string]: {
        member: { id: string; name?: string; email: string; department?: string }
        tasks: Task[]
      }
    } = {}

    const normalizedDepartmentFilter = user?.department?.trim().toLowerCase() || null

    teamTasks.forEach(task => {
      task.assignees.forEach(assignee => {
        const memberId = assignee.user.id
        const memberMeta = teamMemberLookup.get(memberId)
        const memberDepartment = memberMeta?.department?.trim().toLowerCase()

        if (normalizedDepartmentFilter && memberDepartment && memberDepartment !== normalizedDepartmentFilter) {
          return
        }

        if (!tasksByMember[memberId]) {
          tasksByMember[memberId] = {
            member: {
              id: memberId,
              name: memberMeta?.name || assignee.user.name,
              email: memberMeta?.email || assignee.user.email,
              department: memberMeta?.department,
            },
            tasks: [],
          }
        }
        // Filter by status if filter is set
        if (teamTaskStatusFilter === 'all' || task.status === teamTaskStatusFilter) {
          tasksByMember[memberId].tasks.push(task)
        }
      })
    })

    // Sort members by name
    const sortedMembers = Object.values(tasksByMember).sort((a, b) => {
      const nameA = a.member.name || a.member.email
      const nameB = b.member.name || b.member.email
      return nameA.localeCompare(nameB)
    })

    if (sortedMembers.length === 0) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {normalizedDepartmentFilter
              ? `No team tasks found for ${user?.department}.`
              : 'No team tasks found.'}
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Team Tasks</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={teamTaskStatusFilter} onValueChange={(value) => setTeamTaskStatusFilter(value as TaskStatus | 'all')}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="YTS">Yet to Start</SelectItem>
                  <SelectItem value="ON_HOLD">On Hold</SelectItem>
                  <SelectItem value="RECURRING">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {sortedMembers.map(({ member, tasks }) => {
                const isExpanded = expandedMembers.has(member.id)
                const sortedTasks = [...tasks].sort((a, b) => {
                  // In-progress tasks first
                  if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1
                  if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1
                  // Then by due date
                  if (a.dueDate && b.dueDate) {
                    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
                  }
                  if (a.dueDate) return -1
                  if (b.dueDate) return 1
                  return 0
                })

                return (
                  <div key={member.id} className="transition-all">
                    <div
                      className="flex items-center justify-between p-4 hover:bg-accent/50 cursor-pointer"
                      onClick={() => toggleMemberExpansion(member.id)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <div className="font-semibold">{member.name || member.email}</div>
                          <div className="text-sm text-muted-foreground">{member.email}</div>
                          {member.department && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Department: {member.department}
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline">
                        {tasks.filter(t => t.status === 'IN_PROGRESS').length} In Progress
                      </Badge>
                    </div>
                    {isExpanded && (
                      <div className="pl-12 pr-4 pb-4 bg-muted/30">
                        <div className="space-y-2 pt-2">
                          {sortedTasks.length === 0 ? (
                            <div className="text-sm text-muted-foreground py-4 text-center">
                              No tasks found for this member.
                            </div>
                          ) : (
                            sortedTasks.map((task) => (
                              <Card key={task.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <h4 className="font-medium">{task.title}</h4>
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Badge className={`${getStatusBadgeColor(task.status)} cursor-pointer hover:opacity-80 transition-opacity`}>
                                              {task.status.replace('_', ' ')}
                                            </Badge>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-48 p-2">
                                            <div className="space-y-1">
                                              <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Change Status</div>
                                              {(['YTS', 'IN_PROGRESS', 'ON_HOLD', 'RECURRING', 'COMPLETED'] as TaskStatus[]).map((status) => (
                                                <button
                                                  key={status}
                                                  onClick={() => handleQuickStatusUpdate(task.id, status)}
                                                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors ${
                                                    task.status === status ? 'bg-accent font-medium' : ''
                                                  }`}
                                                >
                                                  {status.replace('_', ' ')}
                                                </button>
                                              ))}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                        <Badge className={getPriorityBadgeColor(task.priority)}>
                                          {task.priority}
                                        </Badge>
                                        {task.project && (
                                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                            {task.project.name}
                                          </Badge>
                                        )}
                                      </div>
                                      {task.description && (
                                        <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                                      )}
                                      {task.dueDate && (
                                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                          <Calendar className="h-4 w-4" />
                                          {format(new Date(task.dueDate), 'MMM dd, yyyy')}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openCommentDialog(task)
                                        }}
                                        title="Comments"
                                      >
                                        <MessageSquare className="h-4 w-4" />
                                      </Button>
                                      {task.reviewStatus !== 'REVIEW_REQUESTED' && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            openReviewDialog(task)
                                          }}
                                          title="Request Review"
                                        >
                                          <Users className="h-4 w-4" />
                                        </Button>
                                      )}
                                      {task.reviewStatus === 'REVIEW_REQUESTED' && task.reviewerId === user?.id && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleAcceptReviewRequest(task.id)
                                            }}
                                            title="Accept Review Request"
                                            className="text-green-600 hover:text-green-700"
                                            disabled={acceptingTaskId === task.id}
                                          >
                                            <CheckCircle2 className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleCancelReviewRequest(task.id)
                                            }}
                                            title="Cancel Review Request"
                                            className="text-red-600 hover:text-red-700"
                                            disabled={cancellingTaskId === task.id}
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openEditDialog(task)
                                        }}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteTask(task.id)
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tasks</h1>
            <p className="text-muted-foreground">Manage your tasks and team tasks</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border rounded-lg p-1">
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('grid')}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('kanban')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) {
            closeDialog()
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
              <DialogDescription>
                {editingTask ? 'Update the task details below.' : 'Fill in the details to create a new task.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={(e) => updateFormField('title', e.target.value)}
                  placeholder="Task title"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.description}
                  onChange={(e) => updateFormField('description', e.target.value)}
                  placeholder="Task description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => updateFormField('status', value as TaskStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="YTS">Yet to Start</SelectItem>
                      <SelectItem value="ON_HOLD">On Hold</SelectItem>
                      <SelectItem value="RECURRING">Recurring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => updateFormField('priority', value as TaskPriority)}
                  >
                    <SelectTrigger>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => updateFormField('dueDate', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="recurring">Recurring</Label>
                  <Select
                    value={formData.recurring || 'none'}
                    onValueChange={(value) => {
                      const recurringValue = value === 'none' ? '' : value as RecurringType
                      updateFormField('recurring', recurringValue)
                      if (recurringValue !== '') {
                        updateFormField('status', 'RECURRING')
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="DAILY">Daily</SelectItem>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="project">Project (Optional)</Label>
                  <Select
                    value={formData.projectId || 'none'}
                    onValueChange={(value) => {
                      const projectId = value === 'none' ? '' : value
                      updateFormField('projectId', projectId)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select a project from the dropdown
                  </p>
                </div>
                <div>
                  <Label htmlFor="brand">Brand (Optional)</Label>
                  <Select
                    value={formData.brand || 'none'}
                    onValueChange={(value) => {
                      const brand = value === 'none' ? '' : value
                      updateFormField('brand', brand)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  name="tags"
                  value={formData.tags}
                  onChange={(e) => updateFormField('tags', e.target.value)}
                  placeholder="Comma-separated tags"
                />
              </div>

              {/* Assignee field - only for admin and super admin */}
              {user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                <div>
                  <Label htmlFor="assignee">Assign Task To (Optional)</Label>
                  <Popover 
                    open={isAssigneeDropdownOpen} 
                    onOpenChange={(open) => {
                      setIsAssigneeDropdownOpen(open)
                      if (!open) {
                        // Reset search when closing
                        setAssigneeSearchQuery('')
                        // Clear timeout
                        if (searchTimeoutRef.current) {
                          clearTimeout(searchTimeoutRef.current)
                          searchTimeoutRef.current = null
                        }
                        // Reload full list when closing
                        if (user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
                          fetchAssignableMembers()
                        }
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        onClick={() => {
                          setIsAssigneeDropdownOpen(true)
                          if (assignableMembers.length === 0) {
                            fetchAssignableMembers()
                          }
                        }}
                      >
                        {formData.assigneeId
                          ? (() => {
                              const selected = assignableMembers.find(m => m.id === formData.assigneeId)
                              return selected ? (selected.name || selected.email) : 'Select assignee...'
                            })()
                          : 'Select assignee...'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <div className="p-2">
                        <Input
                          placeholder="Search by name or email..."
                          value={assigneeSearchQuery}
                          onChange={(e) => {
                            const query = e.target.value
                            setAssigneeSearchQuery(query)
                            
                            // Clear existing timeout
                            if (searchTimeoutRef.current) {
                              clearTimeout(searchTimeoutRef.current)
                            }
                            
                            // Set new timeout for debounced search
                            searchTimeoutRef.current = setTimeout(() => {
                              fetchAssignableMembers(query)
                            }, 300)
                          }}
                          className="mb-2"
                        />
                        <div className="max-h-60 overflow-y-auto">
                          {assignableMembers.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              {assigneeSearchQuery ? 'No members found' : 'Loading...'}
                            </div>
                          ) : (
                            assignableMembers.map((member) => (
                              <div
                                key={member.id}
                                className="p-2 hover:bg-accent cursor-pointer rounded-sm"
                                onClick={() => {
                                  updateFormField('assigneeId', member.id)
                                  setIsAssigneeDropdownOpen(false)
                                  setAssigneeSearchQuery('')
                                }}
                              >
                                <div className="font-medium text-sm">{member.name || member.email}</div>
                                {member.name && (
                                  <div className="text-xs text-muted-foreground">{member.email}</div>
                                )}
                                {member.department && (
                                  <div className="text-xs text-muted-foreground">Dept: {member.department}</div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                        {formData.assigneeId && (
                          <div className="mt-2 pt-2 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs"
                              onClick={() => {
                                updateFormField('assigneeId', '')
                                setIsAssigneeDropdownOpen(false)
                              }}
                            >
                              Clear Selection
                            </Button>
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground mt-1">
                    {user.role === 'ADMIN' 
                      ? 'Assign task to a member from your department'
                      : 'Assign task to any member'}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingTask ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Comment Dialog */}
        <Dialog open={isCommentDialogOpen} onOpenChange={setIsCommentDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Comments & Chat</DialogTitle>
              <DialogDescription>
                {selectedTaskForComment?.title}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Comments List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm">{comment.user.name || comment.user.email}</div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(comment.createdAt), 'MMM dd, yyyy HH:mm')}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Comment Input */}
              <div className="border-t pt-4">
                <div className="relative">
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={commentText}
                    onChange={handleCommentTextChange}
                    placeholder="Type @ to mention someone..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault()
                        handleSendComment()
                      }
                    }}
                  />
                  {showMentions && (
                    <div className="absolute bottom-full left-0 mb-2 w-full bg-background border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                      {allUsers
                        .filter(user => 
                          user.name?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                          user.email.toLowerCase().includes(mentionQuery.toLowerCase())
                        )
                        .slice(0, 5)
                        .map((user) => (
                          <div
                            key={user.id}
                            className="p-2 hover:bg-accent cursor-pointer"
                            onClick={() => insertMention(user)}
                          >
                            <div className="font-medium text-sm">{user.name || user.email}</div>
                            {user.name && <div className="text-xs text-muted-foreground">{user.email}</div>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="outline" onClick={() => setIsCommentDialogOpen(false)}>
                    Close
                  </Button>
                  <Button onClick={handleSendComment} disabled={!commentText.trim()}>
                    Send Comment
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Review Dialog */}
        <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedTaskForComment?.reviewStatus === 'UNDER_REVIEW' 
                  ? 'Review Task' 
                  : 'Request Review'}
              </DialogTitle>
              <DialogDescription>
                {selectedTaskForComment?.title}
              </DialogDescription>
            </DialogHeader>
            {selectedTaskForComment?.reviewStatus === 'UNDER_REVIEW' ? (
              <div className="space-y-4">
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    This task is currently under review. Please approve or reject it.
                  </p>
                </div>
                <div>
                  <Label htmlFor="reviewComment">Review Comment (Optional)</Label>
                  <textarea
                    id="reviewComment"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Add your review comments..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const comment = (document.getElementById('reviewComment') as HTMLTextAreaElement)?.value
                      handleRespondToReview('REJECTED', comment)
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => {
                      const comment = (document.getElementById('reviewComment') as HTMLTextAreaElement)?.value
                      handleRespondToReview('APPROVED', comment)
                    }}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="reviewer">Select Reviewer</Label>
                  <Select onValueChange={(reviewerId) => handleRequestReview(reviewerId)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a reviewer" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers
                        .filter(user => user.id !== selectedTaskForComment?.createdById)
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name || user.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">
                  The task will be paused and sent to the selected reviewer for approval.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="my">My Tasks</TabsTrigger>
            <TabsTrigger value="team">Team Tasks</TabsTrigger>
            <TabsTrigger value="review">Under Review</TabsTrigger>
          </TabsList>
          <TabsContent value="my" className="space-y-4">
            {renderTasks(tasks)}
          </TabsContent>
          <TabsContent value="team" className="space-y-4">
            {renderTeamTasks()}
          </TabsContent>
          <TabsContent value="review" className="space-y-4">
            {renderTasks(getUnderReviewTasks())}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}
