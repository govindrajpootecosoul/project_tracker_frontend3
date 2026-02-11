'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
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
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit, Trash2, MessageSquare, CheckCircle2, Calendar, List, Grid3x3, LayoutGrid, Users, X, Loader2, MoreVertical, Minus, ChevronLeft, ChevronRight, ChevronDown, Pin } from 'lucide-react'
import { format } from 'date-fns'
import type { TaskComment } from '@/types/comments'
import { TaskListSkeleton, TaskTableSkeleton } from '@/components/skeletons/task-skeleton'

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
  statusUpdatedAt?: string
  createdAt?: string
  updatedAt?: string
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

function TasksPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamTasks, setTeamTasks] = useState<Task[]>([])
  const [reviewTasks, setReviewTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false)
  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
    brand: '',
    company: '',
    status: 'ACTIVE',
  })
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
  const [allProjectTasks, setAllProjectTasks] = useState<Task[]>([]) // Combined tasks from all tabs when project filter is active
  const [myTasksSort, setMyTasksSort] = useState<'default' | 'alphabetical'>('default')
  const [assignableMembers, setAssignableMembers] = useState<{ id: string; name?: string; email: string; department?: string }[]>([])
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('')
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [taskSearchQuery, setTaskSearchQuery] = useState('') // Search query for tasks
  const commentsContainerRef = useRef<HTMLDivElement | null>(null)
  const lastCommentCountRef = useRef<number>(0)
  const lastMenuClickRef = useRef<{ taskId: string; timestamp: number } | null>(null)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [openActionTaskId, setOpenActionTaskId] = useState<string | null>(null)
  const [duplicatingTaskId, setDuplicatingTaskId] = useState<string | null>(null)
  const projectFilter = searchParams.get('projectId')
  const projectFilterName = searchParams.get('projectName')
  const projectDepartment = searchParams.get('projectDepartment')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [departments, setDepartments] = useState<string[]>([])
  const [taskProjectDepartmentFilter, setTaskProjectDepartmentFilter] = useState<string>('all')
  const [pinSelectedProject, setPinSelectedProject] = useState(false)
  const [pinnedProjectIds, setPinnedProjectIds] = useState<Set<string>>(new Set())
  const [isPinManagerOpen, setIsPinManagerOpen] = useState(false)
  const [otherDepartmentTasks, setOtherDepartmentTasks] = useState<Task[]>([])
  const [isLoadingOtherDept, setIsLoadingOtherDept] = useState(false)
  const [taskFields, setTaskFields] = useState<Array<{ title: string; description: string; imageCount: string; videoCount: string }>>([{ title: '', description: '', imageCount: '', videoCount: '' }])

  const getPinnedProjectsStorageKey = useCallback(
    (userId?: string | null) =>
      userId ? `eco_project_tracker:pinnedProjectIds:${userId}` : 'eco_project_tracker:pinnedProjectIds',
    [],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!user?.id) {
      setPinnedProjectIds(new Set())
      return
    }

    try {
      const storageKey = getPinnedProjectsStorageKey(user.id)
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setPinnedProjectIds(new Set())
        return
      }
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setPinnedProjectIds(new Set(parsed.filter((id) => typeof id === 'string' && id.trim().length > 0)))
      } else {
        setPinnedProjectIds(new Set())
      }
    } catch {
      setPinnedProjectIds(new Set())
    }
  }, [user?.id, getPinnedProjectsStorageKey])

  const persistPinnedProjects = useCallback(
    (next: Set<string>) => {
      if (typeof window === 'undefined' || !user?.id) return
      try {
        const storageKey = getPinnedProjectsStorageKey(user.id)
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
    },
    [user?.id, getPinnedProjectsStorageKey],
  )

  const togglePinnedProjectId = useCallback((projectId: string) => {
    const id = projectId.trim()
    if (!id) return
    setPinnedProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistPinnedProjects(next)
      return next
    })
  }, [persistPinnedProjects])
  
  // Pagination state for My Tasks
  const [myTasksPage, setMyTasksPage] = useState(1)
  const [myTasksItemsPerPage, setMyTasksItemsPerPage] = useState(20)
  const [myTasksTotal, setMyTasksTotal] = useState(0)
  const [isLoadingMyTasks, setIsLoadingMyTasks] = useState(false)
  const [isInitialLoadingMyTasks, setIsInitialLoadingMyTasks] = useState(true)
  
  // Pagination state for Team Tasks
  const [teamTasksPage, setTeamTasksPage] = useState(1)
  const [teamTasksItemsPerPage, setTeamTasksItemsPerPage] = useState(20)
  const [teamTasksTotal, setTeamTasksTotal] = useState(0)
  const [isLoadingTeamTasks, setIsLoadingTeamTasks] = useState(false)
  const [isInitialLoadingTeamTasks, setIsInitialLoadingTeamTasks] = useState(true)
  
  // Pagination state for Review Tasks
  const [reviewTasksPage, setReviewTasksPage] = useState(1)
  const [reviewTasksItemsPerPage, setReviewTasksItemsPerPage] = useState(20)
  const [reviewTasksTotal, setReviewTasksTotal] = useState(0)
  const [isLoadingReviewTasks, setIsLoadingReviewTasks] = useState(false)
  const [isInitialLoadingReviewTasks, setIsInitialLoadingReviewTasks] = useState(true)
  
  // Pagination state for Other Dept Tasks
  const [otherDeptTasksPage, setOtherDeptTasksPage] = useState(1)
  const [otherDeptTasksItemsPerPage, setOtherDeptTasksItemsPerPage] = useState(20)
  const [otherDeptTasksTotal, setOtherDeptTasksTotal] = useState(0)
  const [isInitialLoadingOtherDept, setIsInitialLoadingOtherDept] = useState(true)
  const [otherDeptMemberFilter, setOtherDeptMemberFilter] = useState<string>('all')
  
  // Refs for infinite scroll
  const myTasksScrollRef = useRef<HTMLDivElement>(null)
  const teamTasksScrollRef = useRef<HTMLDivElement>(null)
  const reviewTasksScrollRef = useRef<HTMLDivElement>(null)
  const otherDeptTasksScrollRef = useRef<HTMLDivElement>(null)
  
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
  // Always show Other Department tab for super admin, even if no tasks currently fetched.
  const showOtherDeptTab = isSuperAdminUser

  const teamMemberLookup = useMemo(() => {
    const map = new Map<string, TeamMemberInfo>()
    teamMembers.forEach(member => {
      map.set(member.id, member)
    })
    return map
  }, [teamMembers])

  const selectedProjectDepartment = useMemo(() => {
    if (!formData.projectId) return null
    const projectsArray = Array.isArray(projects) ? projects : []
    const project = projectsArray.find(project => project.id === formData.projectId)
    return project?.department || null
  }, [formData.projectId, projects])

  const filteredProjectsForTaskForm = useMemo(() => {
    const projectsArray = Array.isArray(projects) ? projects : []
    if (taskProjectDepartmentFilter === 'all') return projectsArray
    const normalized = taskProjectDepartmentFilter.trim().toLowerCase()
    return projectsArray.filter((p) => p.department?.trim().toLowerCase() === normalized)
  }, [projects, taskProjectDepartmentFilter])

  const sortedProjectsForTaskForm = useMemo(() => {
    const list = [...filteredProjectsForTaskForm]
    list.sort((a, b) => {
      const aPinned = pinnedProjectIds.has(a.id)
      const bPinned = pinnedProjectIds.has(b.id)
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      return (a.name || '').localeCompare(b.name || '')
    })
    return list
  }, [filteredProjectsForTaskForm, pinnedProjectIds])

  useEffect(() => {
    if (!formData.projectId) return
    const stillValid = filteredProjectsForTaskForm.some((p) => p.id === formData.projectId)
    if (!stillValid) {
      updateFormField('projectId', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskProjectDepartmentFilter, filteredProjectsForTaskForm])

  const isEditingNewProductDesignTask = editingTask ? isNewProductDesignDepartment(editingTask.project?.department) : false
  const userIsNewProductDesign = isNewProductDesignDepartment(user?.department)
  const shouldShowMediaFields = userIsNewProductDesign || isNewProductDesignDepartment(selectedProjectDepartment) || isEditingNewProductDesignTask

  const availableTeamMembers = useMemo(() => {
    const normalizedDepartmentFilter = user?.department?.trim().toLowerCase() || null

    return teamMembers
      .filter(member => {
        // Team Tasks should always show members from the current user's department (for USER/ADMIN/SUPER_ADMIN).
        if (!normalizedDepartmentFilter) return true
        return member.department?.trim().toLowerCase() === normalizedDepartmentFilter
      })
      .sort((a, b) => {
        const labelA = (a.name || a.email).toLowerCase()
        const labelB = (b.name || b.email).toLowerCase()
        return labelA.localeCompare(labelB)
      })
  }, [teamMembers, user?.department])

  const availableOtherDeptMembers = useMemo(() => {
    // Only show members list once a department is selected in Other Department tab.
    if (departmentFilter === 'all') return []
    const normalizedSelected = departmentFilter.trim().toLowerCase()
    return teamMembers
      .filter((member) => member.department?.trim().toLowerCase() === normalizedSelected)
      .sort((a, b) => {
        const labelA = (a.name || a.email).toLowerCase()
        const labelB = (b.name || b.email).toLowerCase()
        return labelA.localeCompare(labelB)
      })
  }, [teamMembers, departmentFilter])

  const filteredTeamTasks = useMemo(() => {
    const normalizedDepartmentFilter = user?.department?.trim().toLowerCase() || null
    const taskMap = new Map<string, Task>()

    teamTasks.forEach(task => {
      const matchesStatus = teamTaskStatusFilter === 'all' || task.status === teamTaskStatusFilter
      if (!matchesStatus) return

      const matchesMember =
        teamMemberFilter === 'all'
          ? true
          : task.assignees.some(assignee => assignee.user.id === teamMemberFilter)
      if (!matchesMember) return

      // Team Tasks should show tasks assigned to members from the current user's department (all roles).
      // Backend already scopes to department, but keep this as a safety net when we have member metadata.
      let matchesDepartment = true
      if (normalizedDepartmentFilter) {
        matchesDepartment = task.assignees.some((assignee) => {
          const memberMeta = teamMemberLookup.get(assignee.user.id)
          const memberDepartment = memberMeta?.department?.trim().toLowerCase()
          return memberDepartment === normalizedDepartmentFilter
        })
      }

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

    // Don't apply departmentFilter in Team Tasks tab - only filter by project if needed
    return Array.from(taskMap.values()).filter(matchesProjectFilter)
  }, [teamTasks, teamTaskStatusFilter, teamMemberFilter, teamMemberLookup, user?.department, taskSearchQuery, matchesProjectFilter])

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

  const fetchTasks = useCallback(async (overridePage?: number, overrideItemsPerPage?: number) => {
    try {
      setIsInitialLoadingMyTasks(true)
      setIsLoadingMyTasks(true)
      const page = overridePage !== undefined ? overridePage : myTasksPage
      
      // When project filter is active, use the new project tasks endpoint
      if (projectFilter) {
        const itemsPerPage = 10000
        const skip = 0
        const result = await apiClient.getProjectTasks(projectFilter, { limit: itemsPerPage, skip })
        const tasksArray = result.tasks || []
        setTasks(tasksArray)
        setMyTasksTotal(result.total || tasksArray.length)
      } else {
        // Normal flow: fetch user's assigned tasks
        const itemsPerPage = overrideItemsPerPage !== undefined ? overrideItemsPerPage : myTasksItemsPerPage
        const skip = (page - 1) * itemsPerPage
        const result = await apiClient.getMyTasks({ limit: itemsPerPage, skip })
        const data = result.tasks || result // Handle both new and old format
        const tasksArray = Array.isArray(data) ? data : []
        setTasks(tasksArray)
        if (result.total !== undefined) {
          setMyTasksTotal(result.total)
        } else {
          setMyTasksTotal(tasksArray.length)
        }
      }
    } catch (error) {
      console.error('Failed to fetch my tasks:', error)
    } finally {
      setIsLoadingMyTasks(false)
      setIsInitialLoadingMyTasks(false)
    }
  }, [myTasksPage, myTasksItemsPerPage, projectFilter])

  const fetchTeamTasks = useCallback(async (overridePage?: number, overrideItemsPerPage?: number) => {
    try {
      setIsInitialLoadingTeamTasks(true)
      setIsLoadingTeamTasks(true)
      const page = overridePage !== undefined ? overridePage : teamTasksPage
      
      // When project filter is active, use the new project tasks endpoint
      if (projectFilter) {
        const itemsPerPage = 10000
        const skip = 0
        const result = await apiClient.getProjectTasks(projectFilter, { limit: itemsPerPage, skip })
        const tasksArray = result.tasks || []
        setTeamTasks(tasksArray)
        setTeamTasksTotal(result.total || tasksArray.length)
      } else {
        // Normal flow: Team Tasks = all tasks assigned to members of the current user's department
        const itemsPerPage = overrideItemsPerPage !== undefined ? overrideItemsPerPage : teamTasksItemsPerPage
        const skip = (page - 1) * itemsPerPage
        // If a member filter is selected, ask server for that member's tasks so total count is correct.
        const memberId = teamMemberFilter !== 'all' ? teamMemberFilter : undefined
        const status = teamTaskStatusFilter !== 'all' ? teamTaskStatusFilter : undefined
        const result = await apiClient.getDepartmentTasks({ limit: itemsPerPage, skip, memberId, status })
        const data = result.tasks || result // Handle both new and old format
        const tasksArray = Array.isArray(data) ? data : []
        setTeamTasks(tasksArray)
        if (result.total !== undefined) {
          setTeamTasksTotal(result.total)
        } else {
          setTeamTasksTotal(tasksArray.length)
        }
      }
    } catch (error) {
      console.error('Failed to fetch team tasks:', error)
    } finally {
      setIsLoadingTeamTasks(false)
      setIsInitialLoadingTeamTasks(false)
    }
  }, [teamTasksPage, teamTasksItemsPerPage, projectFilter, teamMemberFilter, teamTaskStatusFilter])

  // Avoid page reset loops: use a ref for fetchTeamTasks in filter-change effects.
  const fetchTeamTasksRef = useRef(fetchTeamTasks)
  useEffect(() => {
    fetchTeamTasksRef.current = fetchTeamTasks
  }, [fetchTeamTasks])

  // When changing member/status filter on Team Tasks, reset to page 1 and refetch so totals match.
  useEffect(() => {
    if (activeTab !== 'team') return
    setTeamTasksPage(1)
    fetchTeamTasksRef.current(1, undefined)
  }, [teamMemberFilter, teamTaskStatusFilter, activeTab])

  const fetchReviewTasks = useCallback(async (overridePage?: number, overrideItemsPerPage?: number) => {
    try {
      setIsInitialLoadingReviewTasks(true)
      setIsLoadingReviewTasks(true)
      const page = overridePage !== undefined ? overridePage : reviewTasksPage
      
      // When project filter is active, use the new project tasks endpoint
      if (projectFilter) {
        const itemsPerPage = 10000
        const skip = 0
        const result = await apiClient.getProjectTasks(projectFilter, { limit: itemsPerPage, skip })
        const tasksArray = result.tasks || []
        setReviewTasks(tasksArray)
        setReviewTasksTotal(result.total || tasksArray.length)
      } else {
        // Normal flow: fetch review tasks
        const itemsPerPage = overrideItemsPerPage !== undefined ? overrideItemsPerPage : reviewTasksItemsPerPage
        const skip = (page - 1) * itemsPerPage
        const result = await apiClient.getReviewTasks({ limit: itemsPerPage, skip })
        const data = result.tasks || result // Handle both new and old format
        const tasksArray = Array.isArray(data) ? data : []
        setReviewTasks(tasksArray)
        if (result.total !== undefined) {
          setReviewTasksTotal(result.total)
        } else {
          setReviewTasksTotal(tasksArray.length)
        }
      }
    } catch (error) {
      console.error('Failed to fetch review tasks:', error)
    } finally {
      setIsLoadingReviewTasks(false)
      setIsInitialLoadingReviewTasks(false)
    }
  }, [reviewTasksPage, reviewTasksItemsPerPage, projectFilter])

  const fetchOtherDepartmentTasks = useCallback(async (overridePage?: number, overrideItemsPerPage?: number) => {
    if (!isSuperAdminUser) {
      setOtherDepartmentTasks([])
      setIsInitialLoadingOtherDept(false)
      return
    }
    setIsInitialLoadingOtherDept(true)
    setIsLoadingOtherDept(true)
    try {
      const page = overridePage !== undefined ? overridePage : otherDeptTasksPage
      
      // When project filter is active, use the new project tasks endpoint
      if (projectFilter) {
        const itemsPerPage = 10000
        const skip = 0
        const result = await apiClient.getProjectTasks(projectFilter, { limit: itemsPerPage, skip })
        const tasksArray = result.tasks || []
        setOtherDepartmentTasks(tasksArray)
        setOtherDeptTasksTotal(result.total || tasksArray.length)
      } else {
        // Normal flow: fetch other department tasks
        const itemsPerPage = overrideItemsPerPage !== undefined ? overrideItemsPerPage : otherDeptTasksItemsPerPage
        const skip = (page - 1) * itemsPerPage
        const selectedDept = departmentFilter !== 'all' ? departmentFilter : undefined
        const memberId = otherDeptMemberFilter !== 'all' ? otherDeptMemberFilter : undefined
        const result = await apiClient.getAllDepartmentsTasks({ limit: itemsPerPage, skip, department: selectedDept, memberId })
        const data = result.tasks || result // Handle both new and old format
        const tasksArray = Array.isArray(data) ? data : []
        setOtherDepartmentTasks(tasksArray)
        if (result.total !== undefined) {
          setOtherDeptTasksTotal(result.total)
        } else {
          setOtherDeptTasksTotal(tasksArray.length)
        }
      }
    } catch (error) {
      console.error('Failed to fetch other department tasks:', error)
      setOtherDepartmentTasks([])
    } finally {
      setIsLoadingOtherDept(false)
      setIsInitialLoadingOtherDept(false)
    }
  }, [isSuperAdminUser, otherDeptTasksPage, otherDeptTasksItemsPerPage, projectFilter, departmentFilter, otherDeptMemberFilter])

  useEffect(() => {
    fetchOtherDepartmentTasks()
  }, [fetchOtherDepartmentTasks])

  // Keep a stable ref to the latest fetch function so filter-change effects don't re-run
  // just because the callback identity changes (e.g. when paging).
  const fetchOtherDepartmentTasksRef = useRef(fetchOtherDepartmentTasks)
  useEffect(() => {
    fetchOtherDepartmentTasksRef.current = fetchOtherDepartmentTasks
  }, [fetchOtherDepartmentTasks])

  // When changing department filter on Other Department tab, reset pagination and refetch so totals match.
  useEffect(() => {
    if (!isSuperAdminUser) return
    if (activeTab !== 'otherDept') return
    setOtherDeptTasksPage(1)
    setOtherDeptMemberFilter('all')
    fetchOtherDepartmentTasksRef.current(1, undefined)
  }, [departmentFilter, activeTab, isSuperAdminUser])

  // When changing member filter on Other Department tab, reset pagination and refetch.
  useEffect(() => {
    if (!isSuperAdminUser) return
    if (activeTab !== 'otherDept') return
    setOtherDeptTasksPage(1)
    fetchOtherDepartmentTasksRef.current(1, undefined)
  }, [otherDeptMemberFilter, activeTab, isSuperAdminUser])

  const fetchProjects = useCallback(async () => {
    try {
      const projectsData = await apiClient.getProjects({ limit: 1000, skip: 0 }) // Get all projects for dropdown
      // Handle new paginated response format
      const projects = Array.isArray(projectsData)
        ? projectsData
        : (projectsData as any)?.projects || []
      setProjects(projects as Project[])
      
      // Update brands from projects
      const brandSet = new Set<string>()
      projects.forEach((project: Project) => {
        if (project.brand && project.brand.trim()) {
          brandSet.add(project.brand.trim())
        }
      })
      setBrands(Array.from(brandSet).sort())
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }, [])

  const handleCreateProject = useCallback(async () => {
    try {
      if (!projectFormData.name.trim()) {
        alert('Project name is required')
        return
      }
      const newProject = await apiClient.createProject(projectFormData)
      setIsProjectDialogOpen(false)
      setProjectFormData({
        name: '',
        description: '',
        brand: '',
        company: '',
        status: 'ACTIVE',
      })
      // Refresh projects list
      await fetchProjects()
      // Select the newly created project in the task form
      if (newProject && (newProject as any).id) {
        updateFormField('projectId', (newProject as any).id)
      } else if (Array.isArray(newProject) && newProject.length > 0) {
        updateFormField('projectId', newProject[0].id)
      }
      alert('Project created successfully!')
    } catch (error: any) {
      console.error('Failed to create project:', error)
      alert(error?.message || 'Failed to create project')
    }
  }, [projectFormData, fetchProjects])

  const fetchTeamMembers = useCallback(async () => {
    try {
      const membersData = await apiClient.getTeamMembers({ limit: 1000, skip: 0 }) // Get all members for dropdown
      // Handle new paginated response format
      const members = Array.isArray(membersData)
        ? membersData
        : (membersData as any)?.members || []
      setTeamMembers(members as TeamMemberInfo[])
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
    fetchTeamTasks()
    fetchReviewTasks()
    fetchProjects()
    fetchTeamMembers()
    fetchDepartments()
    fetchAllUsers()
    
    // Check URL params for tab
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab === 'review') {
        setActiveTab('review')
      }
      // Tab selection based on project will be handled by the separate useEffect
      // that depends on projectFilter, projectDepartment, and user
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]) // Only run once on mount - fetch functions are called directly, not as dependencies

  // Set appropriate tab when project is selected
  useEffect(() => {
    if (projectFilter && projectDepartment && user) {
      const userDept = user.department?.trim().toLowerCase()
      const projDept = projectDepartment.trim().toLowerCase()
      const isSuperAdmin = user.role?.toUpperCase() === 'SUPER_ADMIN'
      
      if (isSuperAdmin && userDept && projDept !== userDept) {
        // Super admin clicking on other department's project -> Other Department tab
        setActiveTab('otherDept')
      } else if (userDept && projDept === userDept) {
        // Same department project -> Team Tasks tab
        setActiveTab('team')
      } else {
        // Default -> My Tasks tab
        setActiveTab('my')
      }
    }
  }, [projectFilter, projectDepartment, user])

  // Combine all tasks from all tabs when project filter is active
  useEffect(() => {
    if (projectFilter) {
      const taskMap = new Map<string, Task>()
      
      // Add tasks from My Tasks
      tasks.forEach(task => {
        if (task.projectId === projectFilter || task.project?.id === projectFilter) {
          taskMap.set(task.id, task)
        }
      })
      
      // Add tasks from Team Tasks
      teamTasks.forEach(task => {
        if (task.projectId === projectFilter || task.project?.id === projectFilter) {
          taskMap.set(task.id, task)
        }
      })
      
      // Add tasks from Review Tasks
      reviewTasks.forEach(task => {
        if (task.projectId === projectFilter || task.project?.id === projectFilter) {
          taskMap.set(task.id, task)
        }
      })
      
      // Add tasks from Other Department (if super admin)
      if (isSuperAdminUser) {
        otherDepartmentTasks.forEach(task => {
          if (task.projectId === projectFilter || task.project?.id === projectFilter) {
            taskMap.set(task.id, task)
          }
        })
      }
      
      // Convert map to array and sort by createdAt (newest first)
      const combinedTasks = Array.from(taskMap.values()).sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bTime - aTime
      })
      
      setAllProjectTasks(combinedTasks)
    } else {
      setAllProjectTasks([])
    }
  }, [projectFilter, tasks, teamTasks, reviewTasks, otherDepartmentTasks, isSuperAdminUser])

  // Refetch tasks when project filter changes
  useEffect(() => {
    if (projectFilter) {
      // Reset to page 1 when project filter is applied
      setMyTasksPage(1)
      setTeamTasksPage(1)
      setReviewTasksPage(1)
      setOtherDeptTasksPage(1)
      // Fetch all tasks for the selected project from all tabs
      fetchTasks(1, 10000)
      fetchTeamTasks(1, 10000)
      fetchReviewTasks(1, 10000)
      if (isSuperAdminUser) {
        fetchOtherDepartmentTasks(1, 10000)
      }
    }
  }, [projectFilter, fetchTasks, fetchTeamTasks, fetchReviewTasks, fetchOtherDepartmentTasks, isSuperAdminUser])

  // Separate useEffect for event listeners using refs to avoid refresh loops
  useEffect(() => {
    // Listen for refresh events from navbar - only refresh on explicit events
    const handleRefreshTasks = () => {
      fetchTasks()
      fetchTeamTasks()
      fetchReviewTasks()
    }
    window.addEventListener('refreshTasks', handleRefreshTasks)
    
    // Listen for switch to review tab event
    const handleSwitchToReviewTab = () => {
      setActiveTab('review')
      // Auto-refresh removed - no automatic refresh on tab switch
    }
    window.addEventListener('switchToReviewTab', handleSwitchToReviewTab)
    
    return () => {
      window.removeEventListener('refreshTasks', handleRefreshTasks)
      window.removeEventListener('switchToReviewTab', handleSwitchToReviewTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Event listeners use latest fetch functions via closure, no need for dependencies

  // Infinite scroll removed - all tabs load all tasks at once

  // Auto-refresh removed - pagination will only update when user manually changes page

  // Restore scroll when popover closes
  useEffect(() => {
    if (!openActionTaskId) {
      // Restore scroll position and re-enable scrolling when popover closes
      if (typeof window !== 'undefined') {
        const preserved = (window as any).__preservedScrollY
        if (preserved !== undefined) {
          // Restore scrollIntoView
          if ((window as any).__originalScrollIntoView) {
            Element.prototype.scrollIntoView = (window as any).__originalScrollIntoView
            delete (window as any).__originalScrollIntoView
          }
          
          // Restore body styles
          document.body.style.overflow = ''
          document.body.style.position = ''
          document.body.style.top = ''
          document.body.style.width = ''
          document.documentElement.style.overflow = ''
          
          // Restore scroll position
          window.scrollTo(0, preserved)
          
          // Clear preserved scroll
          delete (window as any).__preservedScrollY
        }
      }
    }
  }, [openActionTaskId])

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
    setTaskFields([{ title: '', description: '', imageCount: '', videoCount: '' }])
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
    setPinSelectedProject(false)
    setIsPinManagerOpen(false)
    setIsDialogOpen(true)
    // Fetch assignable members when opening dialog
    if (user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
      fetchAssignableMembers()
    }
  }, [resetForm, user?.role, fetchAssignableMembers])

  const canModifyTask = useCallback((task: Task) => {
    const role = user?.role?.toUpperCase()
    const isPrivileged = role === 'ADMIN' || role === 'SUPER_ADMIN'
    if (isPrivileged) return true

    const isAssignee = task.assignees?.some((a) => a.user.id === user?.id) ?? false
    if (isAssignee) return true

    const isReviewerUnderReview =
      task.reviewStatus === 'UNDER_REVIEW' && task.reviewerId && task.reviewerId === user?.id
    return isReviewerUnderReview
  }, [user?.id, user?.role])

  const openEditDialog = useCallback((task: Task) => {
    // Check permission first
    if (!canModifyTask(task)) {
      alert('You don\'t have access to update this task. You can only edit tasks assigned to you or tasks you are reviewing.')
      return
    }
    // Save scroll position before opening dialog
    const scrollY = window.scrollY
    if (typeof window !== 'undefined') {
      (window as any).__preservedScrollY = scrollY
    }
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
    setTaskFields([{ title: task.title, description: task.description || '', imageCount: '', videoCount: '' }])
    setIsDialogOpen(true)
    // Restore scroll position after dialog opens
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY)
    })
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
  }, [user?.role, fetchAssignableMembers, canModifyTask])

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
      // Validate that at least one title is provided
      const validFields = taskFields.filter(field => field.title.trim().length > 0)
      if (validFields.length === 0) {
        alert('At least one task title is required')
        return
      }

      setIsSavingTask(true)

      // Send tasks as an array instead of comma-separated strings
      const parseCountInput = (value: string) => {
        if (!value || value.trim() === '') return 0
        const num = Number(value)
        if (!Number.isFinite(num) || num < 0) return 0
        return Math.round(num)
      }

      const tasks = validFields.map(field => {
        const taskData: any = {
          title: field.title.trim(),
          description: field.description.trim() || null,
        }
        
        // Add imageCount and videoCount only for New Product Design department
        if (shouldShowMediaFields) {
          taskData.imageCount = parseCountInput(field.imageCount)
          taskData.videoCount = parseCountInput(field.videoCount)
        }
        
        return taskData
      })

      const cleanData: any = {
        tasks: tasks,
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
        link: formData.link?.trim() || null,
      }

      // Add assignees if assigneeId is provided and user is admin/super admin
      if (formData.assigneeId && formData.assigneeId.trim() !== '' && 
          user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        cleanData.assignees = [formData.assigneeId.trim()]
      }

      const result = await apiClient.createTask(cleanData)

      // Pin selected project for future quick selection (local-only)
      if (pinSelectedProject && formData.projectId && formData.projectId.trim() !== '') {
        const projectId = formData.projectId.trim()
        setPinnedProjectIds((prev) => {
          const next = new Set(prev)
          next.add(projectId)
          persistPinnedProjects(next)
          return next
        })
      }
      
      // Handle response - could be single task or multiple tasks
      if (result.tasks && Array.isArray(result.tasks)) {
        // Multiple tasks created
        alert(`Successfully created ${result.count || result.tasks.length} task(s)!`)
      } else if (result.id) {
        // Single task created (backward compatibility)
        alert('Task created successfully!')
      }
      
      closeDialog()
      
      // Auto-refresh task lists after creation
      await Promise.all([
        fetchTasks(),
        fetchTeamTasks(),
        fetchReviewTasks(),
      ])
      
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
  }, [taskFields, formData, closeDialog, fetchTasks, fetchTeamTasks, fetchReviewTasks, fetchProjects, user?.role, isSavingTask, shouldShowMediaFields, pinSelectedProject, persistPinnedProjects])

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
      
      // Auto-refresh task lists after update
      await Promise.all([
        fetchTasks(),
        fetchTeamTasks(),
        fetchReviewTasks(),
      ])
      
      closeDialog()
      
      // Refresh notifications and request hub immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
        // Also dispatch request and task update events to sync request hub status
        window.dispatchEvent(new Event('requestsUpdated'))
        window.dispatchEvent(new Event('tasksUpdated'))
      }
    } catch (error: any) {
      console.error('Failed to update task:', error)
      alert(error.message || 'Failed to update task')
    } finally {
      setIsSavingTask(false)
    }
  }, [editingTask, formData, closeDialog, fetchTasks, fetchTeamTasks, fetchReviewTasks, fetchProjects, user?.role, isSavingTask])

  const handleDuplicateTask = useCallback(async (task: Task) => {
    // Prevent double-clicks and multiple API calls
    if (duplicatingTaskId === task.id) return
    
    try {
      setDuplicatingTaskId(task.id)
      
      const parseCountInput = (value: number | undefined) => {
        if (value === undefined || value === null) return 0
        const num = Number(value)
        if (!Number.isFinite(num) || num < 0) return 0
        return Math.round(num)
      }

      // Format dates for API
      const formatDate = (date: Date | string | null | undefined) => {
        if (!date) return null
        const dateObj = date instanceof Date ? date : new Date(date)
        if (isNaN(dateObj.getTime())) return null
        return dateObj.toISOString().split('T')[0]
      }

      // Get assignee IDs if user is admin/super admin
      const assigneeIds = task.assignees && task.assignees.length > 0 && 
        user?.role && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')
        ? task.assignees.map(a => a.user.id)
        : []

      const cleanData: any = {
        tasks: [{
          title: `Copy of ${task.title}`,
          description: task.description || null,
        }],
        status: task.status,
        priority: task.priority,
        startDate: formatDate(task.startDate),
        dueDate: formatDate(task.dueDate),
        projectId: task.projectId || null,
        brand: task.brand || null,
        tags: task.tags || null,
        recurring: task.recurring || null,
        imageCount: parseCountInput(task.imageCount),
        videoCount: parseCountInput(task.videoCount),
        link: task.link || null,
      }

      // Add assignees if available
      if (assigneeIds.length > 0) {
        cleanData.assignees = assigneeIds
      }

      const result = await apiClient.createTask(cleanData)
      
      if (result.tasks && Array.isArray(result.tasks)) {
        alert(`Task duplicated successfully!`)
      } else if (result.id) {
        alert('Task duplicated successfully!')
      }
      
      // Refresh notifications
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
    } catch (error: any) {
      console.error('Failed to duplicate task:', error)
      alert(error.message || 'Failed to duplicate task')
    } finally {
      setDuplicatingTaskId(null)
    }
  }, [user?.role, duplicatingTaskId])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    // Find the task to check permissions
    const allTasks = [...tasks, ...teamTasks, ...reviewTasks, ...otherDepartmentTasks]
    const task = allTasks.find(t => t.id === taskId)
    if (task && !canModifyTask(task)) {
      alert('You don\'t have access to delete this task. You can only delete tasks assigned to you or tasks you are reviewing.')
      return
    }
    if (!confirm('Are you sure you want to delete this task?')) return
    try {
      await apiClient.deleteTask(taskId)
      
      // Auto-refresh task lists after deletion
      await Promise.all([
        fetchTasks(),
        fetchTeamTasks(),
        fetchReviewTasks(),
      ])
      
      // Refresh notifications immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
      alert('Failed to delete task')
    }
  }, [fetchTasks, fetchTeamTasks, fetchReviewTasks, fetchProjects, tasks, teamTasks, reviewTasks, otherDepartmentTasks, canModifyTask])

  const handleMarkComplete = useCallback(async (taskId: string) => {
    // Find the task to check permissions
    const allTasks = [...tasks, ...teamTasks, ...reviewTasks, ...otherDepartmentTasks]
    const task = allTasks.find(t => t.id === taskId)
    if (task && !canModifyTask(task)) {
      alert('You don\'t have access to update this task. You can only update tasks assigned to you or tasks you are reviewing.')
      return
    }
    try {
      await apiClient.updateTask(taskId, { status: 'COMPLETED' })
      
      // Auto-refresh task lists after status update
      await Promise.all([
        fetchTasks(),
        fetchTeamTasks(),
        fetchReviewTasks(),
      ])
      
      // Refresh notifications and request hub immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
        // Also dispatch request and task update events to sync request hub status
        window.dispatchEvent(new Event('requestsUpdated'))
        window.dispatchEvent(new Event('tasksUpdated'))
      }
    } catch (error) {
      console.error('Failed to update task:', error)
      alert('Failed to update task')
    }
  }, [fetchTasks, fetchTeamTasks, fetchReviewTasks, tasks, teamTasks, reviewTasks, otherDepartmentTasks, canModifyTask])

  const handleQuickStatusUpdate = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    // Find the task to check permissions
    const allTasks = [...tasks, ...teamTasks, ...reviewTasks, ...otherDepartmentTasks]
    const task = allTasks.find(t => t.id === taskId)
    if (task && !canModifyTask(task)) {
      alert('You don\'t have access to update this task. You can only update tasks assigned to you or tasks you are reviewing.')
      return
    }
    try {
      await apiClient.updateTask(taskId, { status: newStatus })
      
      // Auto-refresh task lists after status update
      await Promise.all([
        fetchTasks(),
        fetchTeamTasks(),
        fetchReviewTasks(),
      ])
      
      // Refresh notifications and request hub immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
        // Also dispatch request and task update events to sync request hub status
        window.dispatchEvent(new Event('requestsUpdated'))
        window.dispatchEvent(new Event('tasksUpdated'))
      }
    } catch (error) {
      console.error('Failed to update task status:', error)
      alert('Failed to update task status')
    }
  }, [fetchTasks, fetchTeamTasks, fetchReviewTasks, tasks, teamTasks, reviewTasks, otherDepartmentTasks, canModifyTask])

  const openCommentDialog = useCallback(async (task: Task) => {
    // Save scroll position before opening dialog
    const scrollY = window.scrollY
    if (typeof window !== 'undefined') {
      (window as any).__preservedScrollY = scrollY
    }
    setSelectedTaskForComment(task)
    setIsCommentDialogOpen(true)
    setCommentText('')
    
    // Multiple restoration attempts
    const restoreScroll = () => {
      if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
        window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
      }
    }
    restoreScroll()
    requestAnimationFrame(restoreScroll)
    setTimeout(restoreScroll, 0)
    setTimeout(restoreScroll, 10)
    setTimeout(restoreScroll, 50)
    
    try {
      const taskComments = await apiClient.getTaskComments(task.id)
      setComments(taskComments)
      lastCommentCountRef.current = taskComments.length
      // Scroll to bottom when opening (only in comment container, not page)
      setTimeout(() => {
        if (commentsContainerRef.current) {
          commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight
        }
        // Restore page scroll position
        restoreScroll()
        setTimeout(restoreScroll, 0)
        setTimeout(restoreScroll, 10)
        setTimeout(restoreScroll, 50)
        setTimeout(restoreScroll, 100)
      }, 100)
    } catch (error) {
      console.error('Failed to fetch comments:', error)
      setComments([])
      lastCommentCountRef.current = 0
      // Restore scroll position even on error
      restoreScroll()
      requestAnimationFrame(restoreScroll)
      setTimeout(restoreScroll, 0)
      setTimeout(restoreScroll, 10)
      setTimeout(restoreScroll, 50)
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
    // Save scroll position before opening dialog
    const scrollY = window.scrollY
    if (typeof window !== 'undefined') {
      (window as any).__preservedScrollY = scrollY
    }
    setSelectedTaskForComment(task)
    setIsReviewDialogOpen(true)
    // Multiple restoration attempts
    const restoreScroll = () => {
      if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
        window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
      }
    }
    restoreScroll()
    requestAnimationFrame(restoreScroll)
    setTimeout(restoreScroll, 0)
    setTimeout(restoreScroll, 10)
    setTimeout(restoreScroll, 50)
    setTimeout(restoreScroll, 100)
    setTimeout(restoreScroll, 200)
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
      // Refresh all task lists
      await Promise.all([
        fetchTasks(),
        fetchTeamTasks(),
        fetchReviewTasks(),
      ])
      // Refresh notifications immediately (for mentions)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
    } catch (error: any) {
      console.error('Failed to send comment:', error)
      alert(error.message || 'Failed to send comment')
    }
  }, [selectedTaskForComment, commentText, allUsers, fetchTasks, fetchTeamTasks, fetchReviewTasks])

  const handleRequestReview = useCallback(async (reviewerId: string) => {
    if (!selectedTaskForComment) return

    try {
      await apiClient.requestReview(selectedTaskForComment.id, reviewerId)
      setIsReviewDialogOpen(false)
      setSelectedTaskForComment(null)
      // Refresh lists so review status changes show immediately
      await Promise.all([fetchTasks(), fetchTeamTasks(), fetchReviewTasks()])
      // Refresh notifications immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
      alert('Review requested successfully. The task has been paused and sent for review.')
    } catch (error: any) {
      console.error('Failed to request review:', error)
      alert(error.message || 'Failed to request review')
    }
  }, [selectedTaskForComment, fetchTasks, fetchTeamTasks, fetchReviewTasks])

  const handleRespondToReview = useCallback(async (action: 'APPROVED' | 'REJECTED', comment?: string) => {
    if (!selectedTaskForComment) return

    try {
      await apiClient.respondToReview(selectedTaskForComment.id, action, comment)
      setIsReviewDialogOpen(false)
      setSelectedTaskForComment(null)
      // Auto-refresh removed - no automatic refresh on review response
      // Refresh notifications immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('refreshNotifications'))
      }
      alert(`Review ${action.toLowerCase()} successfully.`)
    } catch (error: any) {
      console.error('Failed to respond to review:', error)
      alert(error.message || 'Failed to respond to review')
    }
  }, [selectedTaskForComment, fetchTasks, fetchTeamTasks, fetchReviewTasks])

  const handleAcceptReviewRequest = useCallback(async (taskId: string) => {
    // Prevent double-clicks
    if (acceptingTaskId === taskId) return
    
    try {
      setAcceptingTaskId(taskId)
      await apiClient.acceptReviewRequest(taskId, true)
      // Refresh review list and switch user context to Under Review
      await fetchReviewTasks()
      setActiveTab('review')
      // Open the review dialog for this task (lets reviewer edit if needed)
      try {
        const updatedTask = await apiClient.getTask(taskId) as Task
        if (updatedTask) {
          openReviewDialog(updatedTask)
        }
      } catch (e) {
        // If fetching fails, still keep tab switched; list is refreshed above.
      }
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
  }, [fetchReviewTasks, acceptingTaskId, openReviewDialog])

  const handleCancelReviewRequest = useCallback(async (taskId: string) => {
    // Prevent double-clicks
    if (cancellingTaskId === taskId) return
    
    if (!confirm('Are you sure you want to cancel this review request?')) return
    
    try {
      setCancellingTaskId(taskId)
      await apiClient.acceptReviewRequest(taskId, false)
      // Auto-refresh removed - no automatic refresh on cancel review
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
  }, [fetchTasks, fetchTeamTasks, fetchReviewTasks, cancellingTaskId])

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

  // Pagination component
  const PaginationControls = ({ 
    currentPage, 
    totalPages, 
    itemsPerPage, 
    totalItems,
    onPageChange, 
    onItemsPerPageChange 
  }: {
    currentPage: number
    totalPages: number
    itemsPerPage: number
    totalItems: number
    onPageChange: (page: number) => void
    onItemsPerPageChange: (items: number) => void
  }) => {
    const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    
    return (
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="flex items-center gap-2">
          <Select value={String(itemsPerPage)} onValueChange={(value) => onItemsPerPageChange(Number(value))}>
            <SelectTrigger className="w-20 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">items per page</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={String(currentPage)} onValueChange={(value) => onPageChange(Number(value))}>
            <SelectTrigger className="w-20 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageNumbers.map((page) => (
                <SelectItem key={page} value={String(page)}>
                  {page}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">of {totalPages} pages</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="h-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="h-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  const renderTaskActions = (task: Task) => {
    const actionItemClass =
      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-black hover:text-white'
    const disabledActionClass = 'disabled:opacity-50 disabled:hover:bg-black/80 disabled:hover:text-white'

    return (
    <Popover 
      modal={false}
      open={openActionTaskId === task.id} 
      onOpenChange={(open) => {
        if (open) {
          setOpenActionTaskId(task.id)
        } else {
          setOpenActionTaskId(null)
          
          // Restore scroll position when popover closes
          if (typeof window !== 'undefined') {
            const preserved = (window as any).__preservedScrollY
            if (preserved !== undefined) {
              // Restore scrollIntoView if it was overridden
              if ((window as any).__originalScrollIntoView) {
                Element.prototype.scrollIntoView = (window as any).__originalScrollIntoView
                delete (window as any).__originalScrollIntoView
              }
              
              // Restore scroll position immediately
              requestAnimationFrame(() => {
                window.scrollTo({ top: preserved, behavior: 'instant' })
                // Also restore after a small delay to ensure it sticks
                setTimeout(() => {
                  window.scrollTo({ top: preserved, behavior: 'instant' })
                }, 0)
                delete (window as any).__preservedScrollY
              })
            }
          }
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Task actions"
          className="text-muted-foreground hover:bg-black hover:text-white"
          onClick={(e) => {
            e.stopPropagation()
            
            // Prevent rapid clicks (debounce)
            const now = Date.now()
            if (lastMenuClickRef.current && 
                lastMenuClickRef.current.taskId === task.id && 
                now - lastMenuClickRef.current.timestamp < 300) {
              return // Ignore rapid clicks within 300ms
            }
            lastMenuClickRef.current = { taskId: task.id, timestamp: now }
            
            // Preserve scroll position before popover opens
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop
            if (typeof window !== 'undefined') {
              (window as any).__preservedScrollY = scrollTop
              
              // Override scrollIntoView to prevent Radix UI from scrolling
              if (!(window as any).__originalScrollIntoView) {
                const originalScrollIntoView = Element.prototype.scrollIntoView
                Element.prototype.scrollIntoView = function() {
                  // Do nothing - prevent ALL scrollIntoView calls
                }
                ;(window as any).__originalScrollIntoView = originalScrollIntoView
              }
            }
          }}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-56 p-2" 
        align="end"
        side="bottom"
        sideOffset={5}
        avoidCollisions={false}
        collisionPadding={0}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // Prevent any scroll when opening
          if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
            window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
          }
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onEscapeKeyDown={(e) => {
          setOpenActionTaskId(null)
        }}
        onInteractOutside={(e) => {
          // Allow default behavior - clicking outside closes the popover
        }}
      >
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Task Options</div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const scrollY = window.scrollY
              if (typeof window !== 'undefined') {
                (window as any).__preservedScrollY = scrollY
              }
              openCommentDialog(task)
              setOpenActionTaskId(null)
              // Multiple restoration attempts
              const restoreScroll = () => {
                if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
                  window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
                }
              }
              restoreScroll()
              requestAnimationFrame(restoreScroll)
              setTimeout(restoreScroll, 0)
              setTimeout(restoreScroll, 10)
              setTimeout(restoreScroll, 50)
              setTimeout(restoreScroll, 100)
              setTimeout(restoreScroll, 200)
            }}
            className={actionItemClass}
          >
            <MessageSquare className="h-4 w-4" />
            Comments & Chat
          </button>
          {task.reviewStatus !== 'REVIEW_REQUESTED' && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const scrollY = window.scrollY
                if (typeof window !== 'undefined') {
                  (window as any).__preservedScrollY = scrollY
                }
                openReviewDialog(task)
                setOpenActionTaskId(null)
                // Multiple restoration attempts
                const restoreScroll = () => {
                  if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
                    window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
                  }
                }
                restoreScroll()
                requestAnimationFrame(restoreScroll)
                setTimeout(restoreScroll, 0)
                setTimeout(restoreScroll, 10)
                setTimeout(restoreScroll, 50)
                setTimeout(restoreScroll, 100)
                setTimeout(restoreScroll, 200)
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
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const scrollY = window.scrollY
                  if (typeof window !== 'undefined') {
                    (window as any).__preservedScrollY = scrollY
                  }
                  handleAcceptReviewRequest(task.id)
                  setOpenActionTaskId(null)
                  // Multiple restoration attempts
                  const restoreScroll = () => {
                    if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
                      window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
                    }
                  }
                  restoreScroll()
                  requestAnimationFrame(restoreScroll)
                  setTimeout(restoreScroll, 0)
                  setTimeout(restoreScroll, 10)
                  setTimeout(restoreScroll, 50)
                  setTimeout(restoreScroll, 100)
                  setTimeout(restoreScroll, 200)
                }}
                disabled={acceptingTaskId === task.id}
                className={`${actionItemClass} ${disabledActionClass}`}
              >
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Accept Review Request
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const scrollY = window.scrollY
                  if (typeof window !== 'undefined') {
                    (window as any).__preservedScrollY = scrollY
                  }
                  handleCancelReviewRequest(task.id)
                  setOpenActionTaskId(null)
                  // Multiple restoration attempts
                  const restoreScroll = () => {
                    if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
                      window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
                    }
                  }
                  restoreScroll()
                  requestAnimationFrame(restoreScroll)
                  setTimeout(restoreScroll, 0)
                  setTimeout(restoreScroll, 10)
                  setTimeout(restoreScroll, 50)
                  setTimeout(restoreScroll, 100)
                  setTimeout(restoreScroll, 200)
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
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!canModifyTask(task)) {
                alert('You don\'t have access to update this task. You can only edit tasks assigned to you or tasks you are reviewing.')
                setOpenActionTaskId(null)
                return
              }
              const scrollY = window.scrollY
              if (typeof window !== 'undefined') {
                (window as any).__preservedScrollY = scrollY
              }
              openEditDialog(task)
              setOpenActionTaskId(null)
              // Multiple restoration attempts
              const restoreScroll = () => {
                if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
                  window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
                }
              }
              restoreScroll()
              requestAnimationFrame(restoreScroll)
              setTimeout(restoreScroll, 0)
              setTimeout(restoreScroll, 10)
              setTimeout(restoreScroll, 50)
              setTimeout(restoreScroll, 100)
              setTimeout(restoreScroll, 200)
            }}
            className={`${actionItemClass} ${!canModifyTask(task) ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!canModifyTask(task) ? 'You don\'t have access to update this task. You can only edit tasks assigned to you or tasks you are reviewing.' : undefined}
          >
            <Edit className="h-4 w-4" />
            Edit Task
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!canModifyTask(task)) {
                alert('You don\'t have access to delete this task. You can only delete tasks assigned to you or tasks you are reviewing.')
                setOpenActionTaskId(null)
                return
              }
              const scrollY = window.scrollY
              if (typeof window !== 'undefined') {
                (window as any).__preservedScrollY = scrollY
              }
              handleDeleteTask(task.id)
              setOpenActionTaskId(null)
              // Multiple restoration attempts
              const restoreScroll = () => {
                if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
                  window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
                }
              }
              restoreScroll()
              requestAnimationFrame(restoreScroll)
              setTimeout(restoreScroll, 0)
              setTimeout(restoreScroll, 10)
              setTimeout(restoreScroll, 50)
              setTimeout(restoreScroll, 100)
              setTimeout(restoreScroll, 200)
            }}
            className={`${actionItemClass} text-red-600 ${!canModifyTask(task) ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!canModifyTask(task) ? 'You don\'t have access to delete this task. You can only delete tasks assigned to you or tasks you are reviewing.' : undefined}
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
                <Badge
                  className={`${getStatusBadgeColor(task.status)} ${
                    canModifyTask(task) ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-not-allowed opacity-80'
                  }`}
                >
                  {task.status.replace('_', ' ')}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Change Status</div>
                  {(['YTS', 'IN_PROGRESS', 'ON_HOLD', 'RECURRING', 'COMPLETED'] as TaskStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        if (!canModifyTask(task)) {
                          alert('You don\'t have access to update this task. You can only update tasks assigned to you or tasks you are reviewing.')
                          return
                        }
                        handleQuickStatusUpdate(task.id, status)
                      }}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors ${
                        task.status === status ? 'bg-accent font-medium' : ''
                      } ${!canModifyTask(task) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              onClick={() => {
                if (!canModifyTask(task)) {
                  alert('You don\'t have access to update this task. You can only update tasks assigned to you or tasks you are reviewing.')
                  return
                }
                handleMarkComplete(task.id)
              }}
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

  const getFilteredAndSortedTasks = (
    tasksToRender: Task[],
    sortType: 'default' | 'alphabetical' = 'default',
    searchQuery: string = '',
    skipDepartmentFilter: boolean = false,
  ) => {
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

    filtered = filtered.filter(matchesProjectFilter)
    if (!skipDepartmentFilter) {
      filtered = filtered.filter(matchesDepartmentFilter)
    }

    // Sort based on selected sort type
    const sorted = [...filtered].sort((a, b) => {
      if (sortType === 'alphabetical') {
        // Sort alphabetically by title (ascending)
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      }
      
      // Default sort: By createdAt (newest first) at the top
      if (a.createdAt && b.createdAt) {
        const aTime = new Date(a.createdAt).getTime()
        const bTime = new Date(b.createdAt).getTime()
        return bTime - aTime // Descending order (newest first)
      }
      if (a.createdAt) return -1
      if (b.createdAt) return 1
      
      // If no createdAt, fallback to statusUpdatedAt
      if (a.statusUpdatedAt && b.statusUpdatedAt) {
        const aTime = new Date(a.statusUpdatedAt).getTime()
        const bTime = new Date(b.statusUpdatedAt).getTime()
        return bTime - aTime // Descending order (newest first)
      }
      if (a.statusUpdatedAt) return -1
      if (b.statusUpdatedAt) return 1
      
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

  const renderTasks = (
    tasksToRender: Task[],
    sortType: 'default' | 'alphabetical' = 'default',
    currentPage?: number,
    itemsPerPage?: number,
    skipDepartmentFilter: boolean = false,
  ) => {
    const filteredAndSorted = getFilteredAndSortedTasks(tasksToRender, sortType, taskSearchQuery, skipDepartmentFilter)
    
    // Apply client-side pagination when project filter is active (since we fetch all tasks)
    let paginatedTasks = filteredAndSorted
    if (projectFilter && currentPage !== undefined && itemsPerPage !== undefined) {
      const startIndex = (currentPage - 1) * itemsPerPage
      const endIndex = startIndex + itemsPerPage
      paginatedTasks = filteredAndSorted.slice(startIndex, endIndex)
    }

    if (paginatedTasks.length === 0 && filteredAndSorted.length === 0) {
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
            const statusTasks = paginatedTasks.filter(t => {
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

    const showAssetsColumn = userIsNewProductDesign || paginatedTasks.some(task => isNewProductDesignDepartment(task.project?.department))

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
                {paginatedTasks.map((task) => (
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
                                  onClick={() => {
                                    if (!canModifyTask(task)) {
                                      alert('You don\'t have access to update this task. You can only update tasks assigned to you or tasks you are reviewing.')
                                      return
                                    }
                                    handleQuickStatusUpdate(task.id, status)
                                  }}
                                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors ${
                                    task.status === status ? 'bg-accent font-medium' : ''
                                  } ${!canModifyTask(task) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
        {paginatedTasks.map((task) => (
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
          </div>
          <div className="text-sm text-muted-foreground">
            {projectFilter
              ? `Showing ${allProjectTasks.length} task${allProjectTasks.length !== 1 ? 's' : ''}`
              : `Showing ${filteredTeamTasks.length} of ${teamTasksTotal} task${teamTasksTotal !== 1 ? 's' : ''}`}
          </div>
        </div>
        <AnimatePresence mode="wait">
          {isInitialLoadingTeamTasks ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {viewMode === 'list' ? (
                <TaskTableSkeleton count={5} />
              ) : (
                <TaskListSkeleton count={6} />
              )}
            </motion.div>
          ) : filteredTeamTasks.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {!isSuperAdmin && normalizedDepartmentFilter
                    ? `No team tasks found for ${user?.department}.`
                    : 'No team tasks found.'}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              ref={teamTasksScrollRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
                    {renderTasks(projectFilter ? allProjectTasks : filteredTeamTasks, 'default', projectFilter ? teamTasksPage : undefined, projectFilter ? teamTasksItemsPerPage : undefined, true)}
              {!isInitialLoadingTeamTasks && (projectFilter ? allProjectTasks.length > 0 : filteredTeamTasks.length > 0) && (
                <PaginationControls
                  currentPage={teamTasksPage}
                  totalPages={Math.ceil((projectFilter ? allProjectTasks.length : teamTasksTotal) / teamTasksItemsPerPage) || 1}
                  itemsPerPage={teamTasksItemsPerPage}
                  totalItems={projectFilter ? allProjectTasks.length : teamTasksTotal}
                  onPageChange={async (page) => {
                    setTeamTasksPage(page)
                    // When project filter is active, pagination is client-side only
                    if (!projectFilter) {
                      await fetchTeamTasks(page, undefined)
                    }
                  }}
                  onItemsPerPageChange={async (items) => {
                    setTeamTasksItemsPerPage(items)
                    setTeamTasksPage(1)
                    // When project filter is active, pagination is client-side only
                    if (!projectFilter) {
                      await fetchTeamTasks(1, items)
                    }
                  }}
                />
              )}
              {isLoadingTeamTasks && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
            const scrollY = window.scrollY
            if (typeof window !== 'undefined') {
              (window as any).__preservedScrollY = scrollY
            }
            closeDialog()
            // Multiple restoration attempts
            const restoreScroll = () => {
              if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
                window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
              }
            }
            restoreScroll()
            requestAnimationFrame(restoreScroll)
            setTimeout(restoreScroll, 0)
            setTimeout(restoreScroll, 10)
            setTimeout(restoreScroll, 50)
            setTimeout(restoreScroll, 100)
          } else {
            // Save scroll when opening
            const scrollY = window.scrollY
            if (typeof window !== 'undefined') {
              (window as any).__preservedScrollY = scrollY
            }
          }
        }}>
          <DialogContent 
            className="max-w-2xl max-h-[90vh] overflow-y-auto"
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              const scrollY = typeof window !== 'undefined' ? ((window as any).__preservedScrollY || window.scrollY) : 0
              if (typeof window !== 'undefined') {
                (window as any).__preservedScrollY = scrollY
                window.scrollTo({ top: scrollY, behavior: 'instant' })
              }
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              const scrollY = typeof window !== 'undefined' ? ((window as any).__preservedScrollY || window.scrollY) : 0
              if (typeof window !== 'undefined') {
                window.scrollTo({ top: scrollY, behavior: 'instant' })
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
              <DialogDescription>
                {editingTask 
                  ? 'Update the task details below.' 
                  : 'Fill in the details to create a new task. Click the plus icon to add multiple tasks.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {editingTask ? (
                <>
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
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>Tasks *</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Add multiple tasks by clicking the plus icon
                    </p>
                    {taskFields.map((field, index) => (
                      <div key={`task-field-${index}`} className="mb-4 p-4 border rounded-lg space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-3">
                            <div>
                              <Label htmlFor={`title-${index}`}>
                                Title {index + 1} {index === 0 && '*'}
                              </Label>
                              <Input
                                id={`title-${index}`}
                                value={field.title}
                                onChange={(e) => {
                                  const newFields = taskFields.map((f, i) => 
                                    i === index ? { ...f, title: e.target.value } : f
                                  )
                                  setTaskFields(newFields)
                                }}
                                placeholder="Enter task title"
                                required={index === 0}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`description-${index}`}>Description {index + 1}</Label>
                              <textarea
                                id={`description-${index}`}
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value={field.description}
                                onChange={(e) => {
                                  const newFields = taskFields.map((f, i) => 
                                    i === index ? { ...f, description: e.target.value } : f
                                  )
                                  setTaskFields(newFields)
                                }}
                                placeholder="Enter task description (optional)"
                              />
                            </div>
                            {shouldShowMediaFields && (
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                  <Label htmlFor={`imageCount-${index}`}>Images Created</Label>
                                  <Input
                                    id={`imageCount-${index}`}
                                    type="number"
                                    min={0}
                                    value={field.imageCount}
                                    onChange={(e) => {
                                      const value = e.target.value
                                      const newFields = taskFields.map((f, i) => 
                                        i === index ? { ...f, imageCount: value === '' ? '' : value } : f
                                      )
                                      setTaskFields(newFields)
                                    }}
                                    placeholder="Enter image count"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`videoCount-${index}`}>Videos Created</Label>
                                  <Input
                                    id={`videoCount-${index}`}
                                    type="number"
                                    min={0}
                                    value={field.videoCount}
                                    onChange={(e) => {
                                      const value = e.target.value
                                      const newFields = taskFields.map((f, i) => 
                                        i === index ? { ...f, videoCount: value === '' ? '' : value } : f
                                      )
                                      setTaskFields(newFields)
                                    }}
                                    placeholder="Enter video count"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          {taskFields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="mt-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                const newFields = taskFields.filter((_, i) => i !== index)
                                setTaskFields(newFields)
                              }}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setTaskFields([...taskFields, { title: '', description: '', imageCount: '', videoCount: '' }])
                      }}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Another Task
                    </Button>
                  </div>
                </div>
              )}

              {shouldShowMediaFields && editingTask && (
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
                  <Label htmlFor="task-project-department">Department (for Project)</Label>
                  <Select
                    value={taskProjectDepartmentFilter}
                    onValueChange={(value) => setTaskProjectDepartmentFilter(value)}
                  >
                    <SelectTrigger id="task-project-department">
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Filter projects by department
                  </p>
                </div>
                <div />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="project">Project (Optional)</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setProjectFormData({
                          name: '',
                          description: '',
                          brand: '',
                          company: '',
                          status: 'ACTIVE',
                        })
                        setIsProjectDialogOpen(true)
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      + Add New Project
                    </button>
                  </div>
                  <Select
                    value={formData.projectId || 'none'}
                    onValueChange={(value) => {
                      const projectId = value === 'none' ? '' : value
                      updateFormField('projectId', projectId)
                      if (!projectId) {
                        setPinSelectedProject(false)
                      } else {
                        setPinSelectedProject(pinnedProjectIds.has(projectId))
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {sortedProjectsForTaskForm.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          <span className="flex items-center gap-1.5">
                            {pinnedProjectIds.has(project.id) && (
                              <Pin className="h-3.5 w-3.5 text-primary fill-primary flex-shrink-0" />
                            )}
                            {project.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select a project from the dropdown
                  </p>
                  {formData.projectId && formData.projectId.trim() !== '' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        id="pin-project"
                        type="checkbox"
                        checked={pinSelectedProject}
                        onChange={(e) => {
                          const isChecked = e.target.checked
                          setPinSelectedProject(isChecked)
                          const projectId = formData.projectId.trim()
                          if (projectId) {
                            if (isChecked) {
                              // Pin the project immediately
                              setPinnedProjectIds((prev) => {
                                const next = new Set(prev)
                                next.add(projectId)
                                persistPinnedProjects(next)
                                return next
                              })
                            } else {
                              // Unpin the project immediately
                              setPinnedProjectIds((prev) => {
                                const next = new Set(prev)
                                next.delete(projectId)
                                persistPinnedProjects(next)
                                return next
                              })
                            }
                          }
                        }}
                      />
                      <Label htmlFor="pin-project" className="text-sm">
                        Pin this project
                      </Label>
                    </div>
                  )}
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsPinManagerOpen((v) => !v)}
                    >
                      {isPinManagerOpen ? 'Hide pin manager' : 'Pin multiple projects'}
                    </Button>
                  </div>
                  {isPinManagerOpen && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                      <div className="text-xs text-muted-foreground">
                        Select multiple projects to pin/unpin. Pinned projects appear at top of the Project dropdown.
                      </div>
                      {sortedProjectsForTaskForm.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No projects available.</div>
                      ) : (
                        sortedProjectsForTaskForm.map((project) => {
                          const checked = pinnedProjectIds.has(project.id)
                          const checkboxId = `pin-multi-${project.id}`
                          return (
                            <label key={project.id} htmlFor={checkboxId} className="flex items-center gap-2 text-sm">
                              <input
                                id={checkboxId}
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePinnedProjectId(project.id)}
                              />
                              <span className={checked ? 'font-medium' : ''}>{project.name}</span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  )}
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
          const scrollY = window.scrollY
          if (typeof window !== 'undefined') {
            (window as any).__preservedScrollY = scrollY
          }
          setIsCommentDialogOpen(open)
          if (!open) {
            // Reset when dialog closes
            lastCommentCountRef.current = 0
            setComments([])
            setSelectedTaskForComment(null)
          }
          // Multiple restoration attempts
          const restoreScroll = () => {
            if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
              window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
            }
          }
          restoreScroll()
          requestAnimationFrame(restoreScroll)
          setTimeout(restoreScroll, 0)
          setTimeout(restoreScroll, 10)
          setTimeout(restoreScroll, 50)
          setTimeout(restoreScroll, 100)
        }}>
          <DialogContent 
            className="max-w-2xl max-h-[90vh] overflow-y-auto"
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              const scrollY = typeof window !== 'undefined' ? ((window as any).__preservedScrollY || window.scrollY) : 0
              if (typeof window !== 'undefined') {
                (window as any).__preservedScrollY = scrollY
                window.scrollTo({ top: scrollY, behavior: 'instant' })
              }
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              const scrollY = typeof window !== 'undefined' ? ((window as any).__preservedScrollY || window.scrollY) : 0
              if (typeof window !== 'undefined') {
                window.scrollTo({ top: scrollY, behavior: 'instant' })
              }
            }}
          >
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
        <Dialog open={isReviewDialogOpen} onOpenChange={(open) => {
          const scrollY = window.scrollY
          if (typeof window !== 'undefined') {
            (window as any).__preservedScrollY = scrollY
          }
          setIsReviewDialogOpen(open)
          // Multiple restoration attempts
          const restoreScroll = () => {
            if (typeof window !== 'undefined' && (window as any).__preservedScrollY !== undefined) {
              window.scrollTo({ top: (window as any).__preservedScrollY, behavior: 'instant' })
            }
          }
          restoreScroll()
          requestAnimationFrame(restoreScroll)
          setTimeout(restoreScroll, 0)
          setTimeout(restoreScroll, 10)
          setTimeout(restoreScroll, 50)
          setTimeout(restoreScroll, 100)
        }}>
          <DialogContent
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              const scrollY = typeof window !== 'undefined' ? ((window as any).__preservedScrollY || window.scrollY) : 0
              if (typeof window !== 'undefined') {
                (window as any).__preservedScrollY = scrollY
                window.scrollTo({ top: scrollY, behavior: 'instant' })
              }
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              const scrollY = typeof window !== 'undefined' ? ((window as any).__preservedScrollY || window.scrollY) : 0
              if (typeof window !== 'undefined') {
                window.scrollTo({ top: scrollY, behavior: 'instant' })
              }
            }}
          >
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
                {selectedTaskForComment?.reviewerId === user?.id && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const task = selectedTaskForComment
                        setIsReviewDialogOpen(false)
                        // Open edit dialog after closing review dialog
                        setTimeout(() => {
                          openEditDialog(task)
                        }, 0)
                      }}
                    >
                      Edit Task
                    </Button>
                  </div>
                )}
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
            <div ref={myTasksScrollRef}>
              <AnimatePresence mode="wait">
                {isInitialLoadingMyTasks ? (
                  <motion.div
                    key="skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {viewMode === 'list' ? (
                      <TaskTableSkeleton count={5} />
                    ) : (
                      <TaskListSkeleton count={6} />
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {renderTasks(projectFilter ? allProjectTasks : tasks, myTasksSort, projectFilter ? myTasksPage : undefined, projectFilter ? myTasksItemsPerPage : undefined)}
                  </motion.div>
                )}
              </AnimatePresence>
              {!isInitialLoadingMyTasks && (projectFilter ? allProjectTasks.length > 0 : tasks.length > 0) && (
                <PaginationControls
                  currentPage={myTasksPage}
                  totalPages={Math.ceil((projectFilter ? allProjectTasks.length : myTasksTotal) / myTasksItemsPerPage) || 1}
                  itemsPerPage={myTasksItemsPerPage}
                  totalItems={projectFilter ? allProjectTasks.length : myTasksTotal}
                  onPageChange={async (page) => {
                    setMyTasksPage(page)
                    // When project filter is active, pagination is client-side only
                    if (!projectFilter) {
                      await fetchTasks(page, undefined)
                    }
                  }}
                  onItemsPerPageChange={async (items) => {
                    setMyTasksItemsPerPage(items)
                    setMyTasksPage(1)
                    // When project filter is active, pagination is client-side only
                    if (!projectFilter) {
                      await fetchTasks(1, items)
                    }
                  }}
                />
              )}
            </div>
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
            <div ref={reviewTasksScrollRef}>
              <AnimatePresence mode="wait">
                {isInitialLoadingReviewTasks ? (
                  <motion.div
                    key="skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {viewMode === 'list' ? (
                      <TaskTableSkeleton count={5} />
                    ) : (
                      <TaskListSkeleton count={6} />
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {renderTasks(getUnderReviewTasks(), 'default', projectFilter ? reviewTasksPage : undefined, projectFilter ? reviewTasksItemsPerPage : undefined)}
                  </motion.div>
                )}
              </AnimatePresence>
              {!isInitialLoadingReviewTasks && (projectFilter ? getUnderReviewTasks().length > 0 : reviewTasks.length > 0) && (
                <PaginationControls
                  currentPage={reviewTasksPage}
                  totalPages={Math.ceil((projectFilter ? getUnderReviewTasks().length : reviewTasksTotal) / reviewTasksItemsPerPage) || 1}
                  itemsPerPage={reviewTasksItemsPerPage}
                  totalItems={projectFilter ? getUnderReviewTasks().length : reviewTasksTotal}
                  onPageChange={async (page) => {
                    setReviewTasksPage(page)
                    // When project filter is active, pagination is client-side only
                    if (!projectFilter) {
                      await fetchReviewTasks(page, undefined)
                    }
                  }}
                  onItemsPerPageChange={async (items) => {
                    setReviewTasksItemsPerPage(items)
                    setReviewTasksPage(1)
                    // When project filter is active, pagination is client-side only
                    if (!projectFilter) {
                      await fetchReviewTasks(1, items)
                    }
                  }}
                />
              )}
              {!isInitialLoadingReviewTasks && isLoadingReviewTasks && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
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
                  <Label htmlFor="member-filter-other" className="text-sm">Member:</Label>
                  <Select
                    value={otherDeptMemberFilter}
                    onValueChange={setOtherDeptMemberFilter}
                    disabled={departmentFilter === 'all'}
                  >
                    <SelectTrigger id="member-filter-other" className="w-56">
                      <SelectValue placeholder={departmentFilter === 'all' ? 'Select department first' : 'All members'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Members</SelectItem>
                      {availableOtherDeptMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name || member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-muted-foreground">
                    {isInitialLoadingOtherDept
                      ? 'Loading tasks from other departments...'
                      : projectFilter
                        ? `Showing ${allProjectTasks.length} task${allProjectTasks.length !== 1 ? 's' : ''}`
                        : `Showing ${getFilteredAndSortedTasks(otherDepartmentTasks, 'default', taskSearchQuery, true).length} of ${otherDeptTasksTotal} task${otherDeptTasksTotal !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>
              <AnimatePresence mode="wait">
                {isInitialLoadingOtherDept ? (
                  <motion.div
                    key="skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {viewMode === 'list' ? (
                      <TaskTableSkeleton count={5} />
                    ) : (
                      <TaskListSkeleton count={6} />
                    )}
                  </motion.div>
                ) : otherDepartmentTasks.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No tasks from other departments are available right now.
                      </CardContent>
                    </Card>
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    ref={otherDeptTasksScrollRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {renderTasks(projectFilter ? allProjectTasks : otherDepartmentTasks, 'default', projectFilter ? otherDeptTasksPage : undefined, projectFilter ? otherDeptTasksItemsPerPage : undefined, true)}
                    {!isInitialLoadingOtherDept && (projectFilter ? allProjectTasks.length > 0 : otherDepartmentTasks.length > 0) && (
                      <PaginationControls
                        currentPage={otherDeptTasksPage}
                        totalPages={Math.ceil((projectFilter ? allProjectTasks.length : otherDeptTasksTotal) / otherDeptTasksItemsPerPage) || 1}
                        itemsPerPage={otherDeptTasksItemsPerPage}
                        totalItems={projectFilter ? allProjectTasks.length : otherDeptTasksTotal}
                  onPageChange={async (page) => {
                    setOtherDeptTasksPage(page)
                    // When project filter is active, pagination is client-side only
                    if (!projectFilter) {
                      await fetchOtherDepartmentTasks(page, undefined)
                    }
                  }}
                  onItemsPerPageChange={async (items) => {
                    setOtherDeptTasksItemsPerPage(items)
                    setOtherDeptTasksPage(1)
                    // When project filter is active, pagination is client-side only
                    if (!projectFilter) {
                      await fetchOtherDepartmentTasks(1, items)
                    }
                  }}
                      />
                    )}
                    {isLoadingOtherDept && (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          )}
        </Tabs>

        {/* Create New Project Dialog */}
        <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Fill in the details to create a new project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="projectName">Project Name *</Label>
                <Input
                  id="projectName"
                  value={projectFormData.name}
                  onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
                  placeholder="Project name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="projectDescription">Description</Label>
                <textarea
                  id="projectDescription"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={projectFormData.description}
                  onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
                  placeholder="Project description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="projectBrand">Brand</Label>
                  <Input
                    id="projectBrand"
                    value={projectFormData.brand}
                    onChange={(e) => setProjectFormData({ ...projectFormData, brand: e.target.value })}
                    placeholder="Brand name"
                  />
                </div>
                <div>
                  <Label htmlFor="projectCompany">Company</Label>
                  <Input
                    id="projectCompany"
                    value={projectFormData.company}
                    onChange={(e) => setProjectFormData({ ...projectFormData, company: e.target.value })}
                    placeholder="Company name"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsProjectDialogOpen(false)
                    setProjectFormData({
                      name: '',
                      description: '',
                      brand: '',
                      company: '',
                      status: 'ACTIVE',
                    })
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleCreateProject}>
                  Create Project
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}

export default function TasksPage() {
  return (
    <Suspense fallback={
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading tasks...</p>
          </div>
        </div>
      </MainLayout>
    }>
      <TasksPageContent />
    </Suspense>
  )
}
