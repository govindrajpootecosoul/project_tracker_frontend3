'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Plus, Edit, Trash2, MessageSquare, CheckCircle2, Calendar, List, Grid3x3, LayoutGrid, Users, X, Loader2, MoreVertical } from 'lucide-react'
import { format } from 'date-fns'
import type { TaskComment } from '@/types/comments'

type TaskStatus = 'IN_PROGRESS' | 'COMPLETED' | 'YTS' | 'ON_HOLD' | 'RECURRING'
type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW'
type RecurringType = 'DAILY' | 'WEEKLY' | 'MONTHLY'
type ViewMode = 'list' | 'grid' | 'kanban'

const isNewProductDesignDepartment = (value?: string | null) => value?.trim().toLowerCase() === 'new product design'

const normalizeDepartmentNames = (departments: unknown): string[] => {
  if (!Array.isArray(departments)) return []
  const names = departments
    .map((dept) => {
      if (typeof dept === 'string') return dept
      if (dept && typeof (dept as any).name === 'string') return (dept as any).name as string
      return null
    })
    .filter((name): name is string => Boolean(name))

  return Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  startDate?: string
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
    department?: string
  } | null
  comments?: TaskComment[]
  imageCount?: number
  videoCount?: number
  link?: string
}

interface Project {
  id: string
  name: string
  brand?: string
  company?: string
  department?: string
}

interface FormData {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  startDate: string
  dueDate: string
  projectId: string
  brand: string
  tags: string
  recurring: RecurringType | '' | 'none'
  assigneeId: string
  imageCount: string
  videoCount: string
  link: string
}

interface TeamMemberInfo {
  id: string
  name?: string
  email: string
  department?: string
}

const createInitialFormData = (): FormData => ({
  title: '',
  description: '',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  startDate: format(new Date(), 'yyyy-MM-dd'),
  dueDate: '',
  projectId: '',
  brand: '',
  tags: '',
  recurring: '',
  assigneeId: '',
  imageCount: '',
  videoCount: '',
  link: '',
})

const initialFormData: FormData = createInitialFormData()

export default function TasksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamTasks, setTeamTasks] = useState<Task[]>([])
  const [reviewTasks, setReviewTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberInfo[]>([])
  const [teamTaskStatusFilter, setTeamTaskStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [teamMemberFilter, setTeamMemberFilter] = useState<string>('all')
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [selectedTaskForComment, setSelectedTaskForComment] = useState<Task | null>(null)
  const [comments, setComments] = useState<TaskComment[]>([])
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
  const [myTasksSort, setMyTasksSort] = useState<'default' | 'alphabetical'>('default')
  const [assignableMembers, setAssignableMembers] = useState<{ id: string; name?: string; email: string; department?: string }[]>([])
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('')
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [taskSearchQuery, setTaskSearchQuery] = useState('') // Search query for tasks
  const commentsContainerRef = useRef<HTMLDivElement | null>(null)
  const lastCommentCountRef = useRef<number>(0)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [openActionTaskId, setOpenActionTaskId] = useState<string | null>(null)
  const projectFilter = searchParams.get('projectId')
  const projectFilterName = searchParams.get('projectName')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [departments, setDepartments] = useState<string[]>([])
  const [otherDepartmentTasks, setOtherDepartmentTasks] = useState<Task[]>([])
  const [isLoadingOtherDept, setIsLoadingOtherDept] = useState(false)
  
  const clearProjectFilter = useCallback(() => {
    router.push('/tasks')
  }, [router])
  const matchesProjectFilter = useCallback(
    (task: Task) => {
      if (!projectFilter) return true
      return task.projectId === projectFilter || task.project?.id === projectFilter
    },
    [projectFilter],
  )

  const matchesDepartmentFilter = useCallback(
    (task: Task) => {
      if (departmentFilter === 'all') return true
      const taskDepartment = task.project?.department?.trim().toLowerCase()
      const filterDepartment = departmentFilter.trim().toLowerCase()
      return taskDepartment === filterDepartment
    },
    [departmentFilter],
  )

  const isSuperAdminUser = user?.role?.toUpperCase() === 'SUPER_ADMIN'
  const showOtherDeptTab = isSuperAdminUser && (isLoadingOtherDept || otherDepartmentTasks.length > 0)

  const teamMemberLookup = useMemo(() => {
    const map = new Map<string, TeamMemberInfo>()
    teamMembers.forEach(member => {
      map.set(member.id, member)
    })
    return map
  }, [teamMembers])

  const selectedProjectDepartment = useMemo(() => {
    if (!formData.projectId) return null
    const project = projects.find(project => project.id === formData.projectId)
    return project?.department || null
  }, [formData.projectId, projects])

  const isEditingNewProductDesignTask = editingTask ? isNewProductDesignDepartment(editingTask.project?.department) : false
  const userIsNewProductDesign = isNewProductDesignDepartment(user?.department)
  const shouldShowMediaFields = userIsNewProductDesign || isNewProductDesignDepartment(selectedProjectDepartment) || isEditingNewProductDesignTask

  const availableTeamMembers = useMemo(() => {
    const normalizedDepartmentFilter = user?.department?.trim().toLowerCase() || null
    const isSuperAdmin = user?.role?.toUpperCase() === 'SUPER_ADMIN'

    return teamMembers
      .filter(member => {
        if (isSuperAdmin || !normalizedDepartmentFilter) return true
        return member.department?.trim().toLowerCase() === normalizedDepartmentFilter
      })
      .sort((a, b) => {
        const labelA = (a.name || a.email).toLowerCase()
        const labelB = (b.name || b.email).toLowerCase()
        return labelA.localeCompare(labelB)
      })
  }, [teamMembers, user?.department, user?.role])

  const filteredTeamTasks = useMemo(() => {
    const normalizedDepartmentFilter = user?.department?.trim().toLowerCase() || null
    const isSuperAdmin = user?.role?.toUpperCase() === 'SUPER_ADMIN'
    const taskMap = new Map<string, Task>()

    teamTasks.forEach(task => {
      const matchesStatus = teamTaskStatusFilter === 'all' || task.status === teamTaskStatusFilter
      if (!matchesStatus) return

      const matchesMember =
        teamMemberFilter === 'all'
          ? true
          : task.assignees.some(assignee => assignee.user.id === teamMemberFilter)
      if (!matchesMember) return

      const matchesDepartment =
        isSuperAdmin || !normalizedDepartmentFilter
          ? true
          : task.assignees.some((assignee) => {
              const memberMeta = teamMemberLookup.get(assignee.user.id)
              const memberDepartment = memberMeta?.department?.trim().toLowerCase()
              return memberDepartment === normalizedDepartmentFilter
            })

      if (!matchesDepartment) return

      // Filter by search query
      const matchesSearch = !taskSearchQuery.trim() || (() => {
        const query = taskSearchQuery.toLowerCase().trim()
        return (
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.brand?.toLowerCase().includes(query) ||
          task.tags?.toLowerCase().includes(query) ||
          task.project?.name.toLowerCase().includes(query)
        )
      })()
      
      if (!matchesSearch) return

      taskMap.set(task.id, task)
    })

    return Array.from(taskMap.values()).filter(matchesProjectFilter).filter(matchesDepartmentFilter)
  }, [teamTasks, teamTaskStatusFilter, teamMemberFilter, teamMemberLookup, user?.department, user?.role, taskSearchQuery, matchesProjectFilter, matchesDepartmentFilter])

  useEffect(() => {
    if (teamMemberFilter === 'all') return
    const exists = availableTeamMembers.some(member => member.id === teamMemberFilter)
    if (!exists) {
      setTeamMemberFilter('all')
    }
  }, [availableTeamMembers, teamMemberFilter])

  useEffect(() => {
    if (activeTab === 'otherDept' && !showOtherDeptTab) {
      setActiveTab('my')
    }
  }, [activeTab, showOtherDeptTab])

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

  const fetchOtherDepartmentTasks = useCallback(async () => {
    if (!isSuperAdminUser) {
      setOtherDepartmentTasks([])
      return
    }
    setIsLoadingOtherDept(true)
    try {
      const allDeptTasks = await apiClient.getAllDepartmentsTasks()
      const userDept = user?.department?.trim().toLowerCase()
      const filtered = (allDeptTasks as Task[]).filter((task) => {
        const projectDept = task.project?.department?.trim().toLowerCase()
        if (!projectDept) return false
        if (!userDept) return true
        return projectDept !== userDept
      })
      setOtherDepartmentTasks(filtered)
    } catch (error) {
      console.error('Failed to fetch other department tasks:', error)
      setOtherDepartmentTasks([])
    } finally {
      setIsLoadingOtherDept(false)
    }
  }, [isSuperAdminUser, user?.department, tasks.length, teamTasks.length])

  useEffect(() => {
    fetchOtherDepartmentTasks()
  }, [fetchOtherDepartmentTasks])

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

  const fetchDepartments = useCallback(async () => {
    try {
      const departmentsData = await apiClient.getDepartments()
      setDepartments(normalizeDepartmentNames(departmentsData))
    } catch (error) {
      console.error('Failed to fetch departments:', error)
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
    fetchDepartments()
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
    setFormData(createInitialFormData())
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
      startDate: task.startDate ? format(new Date(task.startDate), 'yyyy-MM-dd') : '',
      dueDate: task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : '',
      projectId: task.projectId || '',
      brand: task.brand || '',
      tags: task.tags || '',
      recurring: task.recurring || '',
      assigneeId: firstAssigneeId,
      imageCount: task.imageCount != null ? String(task.imageCount) : '',
      videoCount: task.videoCount != null ? String(task.videoCount) : '',
      link: task.link || '',
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
    if (isSavingTask) return
    try {
      if (!formData.title.trim()) {
        alert('Task title is required')
        return
      }

      setIsSavingTask(true)

      const parseCountInput = (value: string) => {
        if (!value || value.trim() === '') return 0
        const num = Number(value)
        if (!Number.isFinite(num) || num < 0) return 0
        return Math.round(num)
      }

      const cleanData: any = {
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        status: formData.status,
        priority: formData.priority,
        startDate: formData.startDate && formData.startDate.trim() !== '' ? formData.startDate : null,
        dueDate: formData.dueDate && formData.dueDate.trim() !== '' ? formData.dueDate : null,
        projectId: formData.projectId && formData.projectId.trim() !== '' ? formData.projectId.trim() : null,
        brand: formData.brand?.trim() || null,
        tags: formData.tags?.trim() || null,
        recurring: formData.recurring && formData.recurring !== 'none' && formData.recurring.trim() !== '' 
          ? formData.recurring 
          : null,
        imageCount: parseCountInput(formData.imageCount),
        videoCount: parseCountInput(formData.videoCount),
        link: formData.link?.trim() || null,
      }

      // Add assignees if assigneeId is provided and user is admin/super admin
      if (formData.assigneeId && formData.assigneeId.trim() !== '' && 
          user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        cleanData.assignees = [formData.assigneeId.trim()]
      }

      await apiClient.createTask(cleanData)
      closeDialog()
      await Promise.all([fetchTasks(), fetchProjects()])
      // Refresh notifications immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
    } catch (error: any) {
      console.error('Failed to create task:', error)
      alert(error.message || 'Failed to create task')
    } finally {
      setIsSavingTask(false)
    }
  }, [formData, closeDialog, fetchTasks, fetchProjects, user?.role, isSavingTask])

  const handleUpdateTask = useCallback(async () => {
    if (!editingTask) return
    if (isSavingTask) return

    try {
      if (!formData.title.trim()) {
        alert('Task title is required')
        return
      }

      setIsSavingTask(true)

      const parseCountInput = (value: string) => {
        if (!value || value.trim() === '') return 0
        const num = Number(value)
        if (!Number.isFinite(num) || num < 0) return 0
        return Math.round(num)
      }

      const cleanData: any = {
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        status: formData.status,
        priority: formData.priority,
        startDate: formData.startDate && formData.startDate.trim() !== '' ? formData.startDate : null,
        dueDate: formData.dueDate && formData.dueDate.trim() !== '' ? formData.dueDate : null,
        projectId: formData.projectId && formData.projectId.trim() !== '' ? formData.projectId.trim() : null,
        brand: formData.brand?.trim() || null,
        tags: formData.tags?.trim() || null,
        recurring: formData.recurring && formData.recurring !== 'none' && formData.recurring.trim() !== '' 
          ? formData.recurring 
          : null,
        imageCount: parseCountInput(formData.imageCount),
        videoCount: parseCountInput(formData.videoCount),
        link: formData.link?.trim() || null,
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
      // Refresh notifications immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
    } catch (error: any) {
      console.error('Failed to update task:', error)
      alert(error.message || 'Failed to update task')
    } finally {
      setIsSavingTask(false)
    }
  }, [editingTask, formData, closeDialog, fetchTasks, fetchProjects, user?.role, isSavingTask])

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
      setComments(taskComments)
      lastCommentCountRef.current = taskComments.length
      // Scroll to bottom when opening
      setTimeout(() => {
        if (commentsContainerRef.current) {
          commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight
        }
      }, 100)
    } catch (error) {
      console.error('Failed to fetch comments:', error)
      setComments([])
      lastCommentCountRef.current = 0
    }
  }, [])

  // Poll for new comments when dialog is open
  useEffect(() => {
    if (!isCommentDialogOpen || !selectedTaskForComment) return

    const fetchComments = async () => {
      try {
        const taskComments = await apiClient.getTaskComments(selectedTaskForComment.id)
        const previousCount = lastCommentCountRef.current
        const newCount = taskComments.length
        
        // Only update if comments changed
        if (newCount !== previousCount) {
          const wasAtBottom = commentsContainerRef.current 
            ? commentsContainerRef.current.scrollHeight - commentsContainerRef.current.scrollTop <= commentsContainerRef.current.clientHeight + 50
            : true
          
          setComments(taskComments)
          lastCommentCountRef.current = newCount
          
          // Auto-scroll to bottom if user was already at bottom (new comment arrived)
          if (wasAtBottom && newCount > previousCount) {
            setTimeout(() => {
              if (commentsContainerRef.current) {
                commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight
              }
            }, 100)
          }
        }
      } catch (error) {
        console.error('Failed to fetch comments:', error)
      }
    }

    // Fetch immediately
    fetchComments()

    // Poll every 3 seconds
    const interval = setInterval(fetchComments, 3000)

    return () => {
      clearInterval(interval)
    }
  }, [isCommentDialogOpen, selectedTaskForComment])

  // Listen for show task from notification event (after openCommentDialog is defined)
  useEffect(() => {
    const handleShowTaskFromNotification = async (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return
      }

      const { taskId } = event.detail || {}
      if (!taskId) return
      
      try {
        // Fetch the task details
        const task = await apiClient.getTask(taskId) as Task
        if (task) {
          // Open comment dialog to show the task
          await openCommentDialog(task)
        }
      } catch (error) {
        console.error('Failed to fetch task from notification:', error)
        // Try to find task in existing tasks
        const allTasks = [...tasks, ...teamTasks, ...reviewTasks]
        const foundTask = allTasks.find(t => t.id === taskId)
        if (foundTask) {
          await openCommentDialog(foundTask)
        } else {
          alert('Task not found. Please refresh the page.')
        }
      }
    }
    
    window.addEventListener('showTaskFromNotification', handleShowTaskFromNotification as EventListener)
    
    return () => {
      window.removeEventListener('showTaskFromNotification', handleShowTaskFromNotification as EventListener)
    }
  }, [openCommentDialog, tasks, teamTasks, reviewTasks])

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
        setComments(taskComments)
      lastCommentCountRef.current = taskComments.length
      // Scroll to bottom after sending comment
      setTimeout(() => {
        if (commentsContainerRef.current) {
          commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight
        }
      }, 100)
      // Refresh tasks
      await fetchTasks()
      // Refresh notifications immediately (for mentions)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
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
      // Refresh notifications immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
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
      // Refresh notifications immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
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
    if (isSavingTask) return
    if (editingTask) {
      handleUpdateTask()
    } else {
      handleCreateTask()
    }
  }, [editingTask, handleUpdateTask, handleCreateTask, isSavingTask])

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

  const renderTaskActions = (task: Task) => {
    const actionItemClass =
      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-black hover:text-white'
    const disabledActionClass = 'disabled:opacity-50 disabled:hover:bg-black/80 disabled:hover:text-white'

    return (
    <Popover open={openActionTaskId === task.id} onOpenChange={(open) => setOpenActionTaskId(open ? task.id : null)}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Task actions"
          className="text-muted-foreground hover:bg-black hover:text-white"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Task Options</div>
          <button
            onClick={() => {
              openCommentDialog(task)
              setOpenActionTaskId(null)
            }}
            className={actionItemClass}
          >
            <MessageSquare className="h-4 w-4" />
            Comments & Chat
          </button>
          {task.reviewStatus !== 'REVIEW_REQUESTED' && (
            <button
              onClick={() => {
                openReviewDialog(task)
                setOpenActionTaskId(null)
              }}
              className={actionItemClass}
            >
              <Users className="h-4 w-4" />
              Request Review
            </button>
          )}
          {task.reviewStatus === 'REVIEW_REQUESTED' && task.reviewerId === user?.id && (
            <>
              <button
                onClick={() => {
                  handleAcceptReviewRequest(task.id)
                  setOpenActionTaskId(null)
                }}
                disabled={acceptingTaskId === task.id}
                className={`${actionItemClass} ${disabledActionClass}`}
              >
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Accept Review Request
              </button>
              <button
                onClick={() => {
                  handleCancelReviewRequest(task.id)
                  setOpenActionTaskId(null)
                }}
                disabled={cancellingTaskId === task.id}
                className={`${actionItemClass} ${disabledActionClass}`}
              >
                <X className="h-4 w-4 text-red-600" />
                Cancel Review Request
              </button>
            </>
          )}
          <button
            onClick={() => {
              openEditDialog(task)
              setOpenActionTaskId(null)
            }}
            className={actionItemClass}
          >
            <Edit className="h-4 w-4" />
            Edit Task
          </button>
          <button
            onClick={() => {
              handleDeleteTask(task.id)
              setOpenActionTaskId(null)
            }}
            className={`${actionItemClass} text-red-600`}
          >
            <Trash2 className="h-4 w-4" />
            Delete Task
          </button>
        </div>
      </PopoverContent>
    </Popover>
    )
  }

  const shouldShowMediaForTask = (task: Task) => {
    if (isNewProductDesignDepartment(task.project?.department)) return true
    if (userIsNewProductDesign) return true
    return false
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
            {renderTaskActions(task)}
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
          {shouldShowMediaForTask(task) && (
            <div className="flex flex-wrap gap-2 mb-3 text-sm text-indigo-700">
              <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                Images: {task.imageCount ?? 0}
              </Badge>
              <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                Videos: {task.videoCount ?? 0}
              </Badge>
            </div>
          )}
          {task.link && (
            <div className="mb-3 text-sm">
              <a 
                href={task.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
              >
                <span>Link</span>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0 mb-3">
            {task.startDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Start: {format(new Date(task.startDate), 'MMM dd, yyyy')}</span>
              </div>
            )}
            {task.dueDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Due: {format(new Date(task.dueDate), 'MMM dd, yyyy')}</span>
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

  const getFilteredAndSortedTasks = (tasksToRender: Task[], sortType: 'default' | 'alphabetical' = 'default', searchQuery: string = '') => {
    // Filter by search query first
    let filtered = tasksToRender
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = tasksToRender.filter(task => 
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.brand?.toLowerCase().includes(query) ||
        task.tags?.toLowerCase().includes(query) ||
        task.project?.name.toLowerCase().includes(query)
      )
    }

    filtered = filtered.filter(matchesProjectFilter).filter(matchesDepartmentFilter)

    // Sort based on selected sort type
    const sorted = [...filtered].sort((a, b) => {
      if (sortType === 'alphabetical') {
        // Sort alphabetically by title (ascending)
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      }
      
      // Default sort: In-progress tasks first, then by due date
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
    
    let results = filtered

    // Apply search filter
    if (taskSearchQuery.trim()) {
      const query = taskSearchQuery.toLowerCase().trim()
      results = filtered.filter(task => 
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.brand?.toLowerCase().includes(query) ||
        task.tags?.toLowerCase().includes(query) ||
        task.project?.name.toLowerCase().includes(query)
      )
    }
    
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
    return results.filter(matchesProjectFilter).filter(matchesDepartmentFilter)
  }, [reviewTasks, user?.id, taskSearchQuery, matchesProjectFilter, matchesDepartmentFilter])

  const renderTasks = (tasksToRender: Task[], sortType: 'default' | 'alphabetical' = 'default') => {
    const filteredAndSorted = getFilteredAndSortedTasks(tasksToRender, sortType, taskSearchQuery)

    if (filteredAndSorted.length === 0) {
      const emptyMessage = projectFilter
        ? `No tasks found for ${projectFilterName || 'the selected project'}.`
        : 'No tasks found. Create your first task!'
      return (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {emptyMessage}
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

    const showAssetsColumn = userIsNewProductDesign || filteredAndSorted.some(task => isNewProductDesignDepartment(task.project?.department))

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
                  {showAssetsColumn && <th className="text-left p-4">Assets</th>}
                  <th className="text-left p-4">Start Date</th>
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
                        {task.assignees.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Assigned to: {task.assignees.map(a => a.user.name || a.user.email).join(', ')}
                          </div>
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
                    {showAssetsColumn && (
                      <td className="p-4">
                        <div className="space-y-1 text-sm">
                          {shouldShowMediaForTask(task) && (
                            <>
                              <div>Images: {task.imageCount ?? 0}</div>
                              <div>Videos: {task.videoCount ?? 0}</div>
                            </>
                          )}
                          {task.link && (
                            <div>
                              <a 
                                href={task.link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                              >
                                Link
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            </div>
                          )}
                          {!shouldShowMediaForTask(task) && !task.link && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="p-4">
                      {task.startDate ? format(new Date(task.startDate), 'MMM dd, yyyy') : '-'}
                    </td>
                    <td className="p-4">
                      {task.dueDate ? format(new Date(task.dueDate), 'MMM dd, yyyy') : '-'}
                    </td>
                    <td className="p-4">
                      {renderTaskActions(task)}
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

  const renderTeamTasks = () => {
    const normalizedDepartmentFilter = user?.department?.trim().toLowerCase() || null
    const isSuperAdmin = user?.role?.toUpperCase() === 'SUPER_ADMIN'

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Input
              placeholder="Search tasks..."
              value={taskSearchQuery}
              onChange={(e) => setTaskSearchQuery(e.target.value)}
              className="w-64"
            />
            <div className="flex items-center gap-2">
              <Label>Status</Label>
              <Select value={teamTaskStatusFilter} onValueChange={(value) => setTeamTaskStatusFilter(value as TaskStatus | 'all')}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All statuses" />
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
            <div className="flex items-center gap-2">
              <Label>Member</Label>
              <Select value={teamMemberFilter} onValueChange={setTeamMemberFilter}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {availableTeamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label>Department</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredTeamTasks.length} task{filteredTeamTasks.length !== 1 ? 's' : ''}
          </div>
        </div>
        {filteredTeamTasks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {!isSuperAdmin && normalizedDepartmentFilter
                ? `No team tasks found for ${user?.department}.`
                : 'No team tasks found.'}
            </CardContent>
          </Card>
        ) : (
          renderTasks(filteredTeamTasks)
        )}
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

              {shouldShowMediaFields && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="imageCount">Images Created</Label>
                    <Input
                      id="imageCount"
                      type="number"
                      min={0}
                      value={formData.imageCount}
                      onChange={(e) => {
                        const value = e.target.value
                        updateFormField('imageCount', value === '' ? '' : value)
                      }}
                      placeholder="Enter image count"
                    />
                  </div>
                  <div>
                    <Label htmlFor="videoCount">Videos Created</Label>
                    <Input
                      id="videoCount"
                      type="number"
                      min={0}
                      value={formData.videoCount}
                      onChange={(e) => {
                        const value = e.target.value
                        updateFormField('videoCount', value === '' ? '' : value)
                      }}
                      placeholder="Enter video count"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="link">Link</Label>
                <Input
                  id="link"
                  type="url"
                  value={formData.link}
                  onChange={(e) => updateFormField('link', e.target.value)}
                  placeholder="Enter link"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => updateFormField('startDate', e.target.value)}
                  />
                </div>
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

              <div className={`grid gap-4 ${user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? 'grid-cols-2' : 'grid-cols-1'}`}>
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
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSavingTask} className="min-w-[120px]">
                  {isSavingTask ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {editingTask ? 'Saving...' : 'Creating...'}
                    </>
                  ) : (
                    editingTask ? 'Update' : 'Create'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {projectFilter && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <div>
              <p className="text-sm text-muted-foreground">Filtering tasks by project</p>
              <p className="font-semibold text-primary">
                {projectFilterName || 'Selected Project'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={clearProjectFilter}>
              Clear Filter
            </Button>
          </div>
        )}

        {/* Comment Dialog */}
        <Dialog open={isCommentDialogOpen} onOpenChange={(open) => {
          setIsCommentDialogOpen(open)
          if (!open) {
            // Reset when dialog closes
            lastCommentCountRef.current = 0
            setComments([])
            setSelectedTaskForComment(null)
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Comments & Chat</DialogTitle>
              <DialogDescription>
                {selectedTaskForComment?.title}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Comments List */}
              <div 
                ref={commentsContainerRef}
                className="space-y-3 max-h-96 overflow-y-auto"
              >
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
            {showOtherDeptTab && <TabsTrigger value="otherDept">Other Department</TabsTrigger>}
          </TabsList>
          <TabsContent value="my" className="space-y-4">
            <div className="flex items-center justify-between gap-2 mb-4">
              <Input
                placeholder="Search tasks by title, description, brand, tags, or project..."
                value={taskSearchQuery}
                onChange={(e) => setTaskSearchQuery(e.target.value)}
                className="w-64"
              />
              <div className="flex items-center gap-2">
                <Label htmlFor="department-filter" className="text-sm">Department:</Label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger id="department-filter" className="w-48">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="sort-select" className="text-sm">Sort by:</Label>
                <Select value={myTasksSort} onValueChange={(value) => setMyTasksSort(value as 'default' | 'alphabetical')}>
                  <SelectTrigger id="sort-select" className="w-48">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (Status & Due Date)</SelectItem>
                    <SelectItem value="alphabetical">Alphabetical (A-Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {renderTasks(tasks, myTasksSort)}
          </TabsContent>
          <TabsContent value="team" className="space-y-4">
            {renderTeamTasks()}
          </TabsContent>
          <TabsContent value="review" className="space-y-4">
            <div className="flex items-center justify-between gap-2 mb-4">
              <Input
                placeholder="Search tasks by title, description, brand, tags, or project..."
                value={taskSearchQuery}
                onChange={(e) => setTaskSearchQuery(e.target.value)}
                className="w-64"
              />
              <div className="flex items-center gap-2">
                <Label htmlFor="department-filter-review" className="text-sm">Department:</Label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger id="department-filter-review" className="w-48">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {renderTasks(getUnderReviewTasks())}
          </TabsContent>
          {showOtherDeptTab && (
            <TabsContent value="otherDept" className="space-y-4">
              <div className="flex items-center justify-between gap-2 mb-4">
                <Input
                  placeholder="Search tasks by title, description, brand, tags, or project..."
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  className="w-64"
                />
                <div className="flex items-center gap-2">
                  <Label htmlFor="department-filter-other" className="text-sm">Department:</Label>
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger id="department-filter-other" className="w-48">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-muted-foreground">
                    {isLoadingOtherDept
                      ? 'Loading tasks from other departments...'
                      : `Showing ${otherDepartmentTasks.length} task${otherDepartmentTasks.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>
              {isLoadingOtherDept ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading other department tasks...
                  </CardContent>
                </Card>
              ) : otherDepartmentTasks.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No tasks from other departments are available right now.
                  </CardContent>
                </Card>
              ) : (
                renderTasks(otherDepartmentTasks)
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </MainLayout>
  )
}
