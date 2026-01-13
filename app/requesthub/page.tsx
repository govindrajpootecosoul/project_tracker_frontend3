'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Inbox, Plus, Search, Loader2, ChevronDown, Calendar, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

type RequestType = 'AUTOMATION' | 'DATA' | 'ACCESS' | 'SUPPORT' | 'OTHER'
type RequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type RequestStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'WAITING_INFO' | 'COMPLETED' | 'CLOSED'
type TaskStatus = 'YTS' | 'IN_PROGRESS' | 'ON_HOLD' | 'RECURRING' | 'COMPLETED'

interface Request {
  id: string
  title: string
  description: string
  requestType: RequestType
  priority: RequestPriority
  status: RequestStatus
  fromDepartmentId?: string | null
  toDepartmentId?: string | null
  createdById: string
  assignedToId?: string | null
  tentativeDeadline?: string | null
  createdAt: string
  updatedAt: string
  createdBy: {
    id: string
    name?: string | null
    email: string
    department?: string | null
  }
  assignedTo?: {
    id: string
    name?: string | null
    email: string
    department?: string | null
  } | null
  fromDepartment?: {
    id: string
    name: string
  } | null
  toDepartment?: {
    id: string
    name: string
  } | null
}

interface Department {
  id: string | null
  name: string
}

interface DepartmentAdmin {
  id: string
  name?: string | null
  email: string
  role: string
}

// Priority color mapping
const priorityColors: Record<RequestPriority, string> = {
  LOW: 'bg-blue-100 text-blue-800 border-blue-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
}

// Status color mapping
const statusColors: Record<RequestStatus, string> = {
  SUBMITTED: 'bg-gray-100 text-gray-800 border-gray-200',
  APPROVED: 'bg-green-100 text-green-800 border-green-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  WAITING_INFO: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-800 border-slate-200',
}

export default function RequestHubPage() {
  const router = useRouter()
  const [view, setView] = useState<'sent' | 'received'>('sent')
  const [sentRequests, setSentRequests] = useState<Request[]>([])
  const [receivedRequests, setReceivedRequests] = useState<Request[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [departmentAdmins, setDepartmentAdmins] = useState<DepartmentAdmin[]>([])
  const [teamMembers, setTeamMembers] = useState<{ id: string; name?: string | null; email: string; department?: string | null }[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserDepartment, setCurrentUserDepartment] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('USER')
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false)
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false)
  const [isLoadingTeamMembers, setIsLoadingTeamMembers] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    requestType: 'OTHER' as RequestType,
    priority: 'MEDIUM' as RequestPriority,
    toDepartmentId: '',
    assignedToId: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Task creation modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [selectedRequestForTask, setSelectedRequestForTask] = useState<Request | null>(null)
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('')
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    description: '',
    status: 'IN_PROGRESS' as 'IN_PROGRESS' | 'COMPLETED' | 'YTS' | 'ON_HOLD' | 'RECURRING',
    priority: 'MEDIUM' as 'HIGH' | 'MEDIUM' | 'LOW',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: '',
    projectId: '',
    brand: '',
    tags: '',
    link: '',
  })
  const [projects, setProjects] = useState<{ id: string; name: string; brand?: string }[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [isCreatingTask, setIsCreatingTask] = useState(false)

  // Fetch current user ID, department, and role, and check access
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = getToken()
        if (!token) {
          router.push('/auth/signin')
          return
        }

        const user = await apiClient.getUserRole()
        if (user?.id) {
          setCurrentUserId(user.id)
          setCurrentUserDepartment(user.department || null)
          setCurrentUserRole(user.role || 'USER')
          
          // Check if user is ADMIN or SUPER_ADMIN
          const roleUpper = (user.role || '').toUpperCase()
          const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SUPER_ADMIN'
          
          if (!isAdmin) {
            router.push('/dashboard')
            alert('You do not have access to RequestHub. Only admins can access this page.')
            return
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error)
        // Set defaults on error to prevent blocking
        setCurrentUserId(null)
        setCurrentUserDepartment(null)
        setCurrentUserRole('USER')
        router.push('/auth/signin')
      }
    }
    fetchUser()
  }, [router])

  // Fetch requests - wrapped in useCallback to prevent unnecessary re-renders
  const fetchRequests = useCallback(async () => {
    try {
      const [sent, received] = await Promise.all([
        apiClient.getSentRequests(),
        apiClient.getReceivedRequests(),
      ])
      setSentRequests(Array.isArray(sent) ? sent : [])
      setReceivedRequests(Array.isArray(received) ? received : [])
    } catch (error) {
      console.error('Error fetching requests:', error)
      // Set empty arrays on error to prevent blocking
      setSentRequests([])
      setReceivedRequests([])
    }
  }, [])

  useEffect(() => {
    const loadRequests = async () => {
      setIsLoading(true)
      try {
        await fetchRequests()
      } catch (error) {
        console.error('Error loading requests:', error)
        // Ensure we set empty arrays on error
        setSentRequests([])
        setReceivedRequests([])
      } finally {
        setIsLoading(false)
      }
    }
    loadRequests()

    // Poll for updates every 2 seconds for real-time sync
    const interval = setInterval(() => {
      fetchRequests()
    }, 2000)

    // Listen for request update events
    const handleRequestUpdate = () => {
      fetchRequests()
    }
    // Listen for task update events (to sync status from tasks)
    const handleTaskUpdate = () => {
      console.log('[RequestHub] Task update event received, refreshing requests...')
      // Refresh multiple times to ensure we get the updated status
      // Backend sync might take a moment, so we refresh with increasing delays
      fetchRequests() // Immediate refresh
      setTimeout(() => fetchRequests(), 500) // After 500ms
      setTimeout(() => fetchRequests(), 1500) // After 1.5s
      setTimeout(() => fetchRequests(), 3000) // After 3s (fallback)
    }
    
    // Listen for visibility change to refresh when user returns to tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchRequests()
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('requestsUpdated', handleRequestUpdate)
      window.addEventListener('tasksUpdated', handleTaskUpdate)
      document.addEventListener('visibilitychange', handleVisibilityChange)
      // Also listen for focus events
      window.addEventListener('focus', handleRequestUpdate)
    }

    return () => {
      clearInterval(interval)
      if (typeof window !== 'undefined') {
        window.removeEventListener('requestsUpdated', handleRequestUpdate)
        window.removeEventListener('tasksUpdated', handleTaskUpdate)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('focus', handleRequestUpdate)
      }
    }
  }, [])

  // Fetch departments
  useEffect(() => {
    const fetchDepartments = async () => {
      setIsLoadingDepartments(true)
      try {
        const depts = await apiClient.getDepartments()
        // Handle both formats: array of {id, name} or array of strings
        const normalizedDepts: Department[] = (depts || []).map((dept: any) => {
          if (typeof dept === 'string') {
            return { id: null, name: dept }
          }
          return {
            id: dept.id || null,
            name: dept.name,
          }
        })
        setDepartments(normalizedDepts)
      } catch (error) {
        console.error('Error fetching departments:', error)
        setDepartments([])
      } finally {
        setIsLoadingDepartments(false)
      }
    }
    fetchDepartments()
  }, [])

  // Fetch department admins when department is selected
  useEffect(() => {
    const fetchAdmins = async () => {
      if (!formData.toDepartmentId) {
        setDepartmentAdmins([])
        setFormData(prev => ({ ...prev, assignedToId: '' }))
        return
      }

      setIsLoadingAdmins(true)
      try {
        // Find the department to get its name (in case we only have ID)
        const selectedDept = departments.find(d => d.id === formData.toDepartmentId)
        const departmentIdentifier = selectedDept?.name || formData.toDepartmentId
        
        const admins = await apiClient.getDepartmentAdmins(departmentIdentifier) as DepartmentAdmin[] | null | undefined
        setDepartmentAdmins(Array.isArray(admins) ? admins : [])
        // Reset assignedToId if current selection is not in the new list
        if (formData.assignedToId && Array.isArray(admins) && !admins.find(a => a.id === formData.assignedToId)) {
          setFormData(prev => ({ ...prev, assignedToId: '' }))
        }
      } catch (error) {
        console.error('Error fetching department admins:', error)
        setDepartmentAdmins([])
      } finally {
        setIsLoadingAdmins(false)
      }
    }
    fetchAdmins()
  }, [formData.toDepartmentId, departments])

  // Filter requests based on search query
  const filteredSentRequests = useMemo(() => {
    if (!searchQuery.trim()) return sentRequests
    const query = searchQuery.toLowerCase()
    return sentRequests.filter(
      req =>
        req.title.toLowerCase().includes(query) ||
        req.description.toLowerCase().includes(query) ||
        req.id.toLowerCase().includes(query)
    )
  }, [sentRequests, searchQuery])

  const filteredReceivedRequests = useMemo(() => {
    if (!searchQuery.trim()) return receivedRequests
    const query = searchQuery.toLowerCase()
    return receivedRequests.filter(
      req =>
        req.title.toLowerCase().includes(query) ||
        req.description.toLowerCase().includes(query) ||
        req.id.toLowerCase().includes(query)
    )
  }, [receivedRequests, searchQuery])

  const handleCreateRequest = async () => {
    // Validation
    const errors: Record<string, string> = {}
    if (!formData.title.trim()) {
      errors.title = 'Title is required'
    }
    if (!formData.description.trim()) {
      errors.description = 'Description is required'
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setIsSubmitting(true)
    setFormErrors({})

    try {
      await apiClient.createRequest({
        title: formData.title,
        description: formData.description,
        requestType: formData.requestType,
        priority: formData.priority,
        toDepartmentId: formData.toDepartmentId || undefined,
        assignedToId: formData.assignedToId || undefined,
      })

      // Refresh requests
      await fetchRequests()
      
      // Dispatch event to notify other components/users
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('requestsUpdated'))
      }

      // Reset form
      setFormData({
        title: '',
        description: '',
        requestType: 'OTHER',
        priority: 'MEDIUM',
        toDepartmentId: '',
        assignedToId: '',
      })
      setIsCreateModalOpen(false)
    } catch (error: any) {
      console.error('Error creating request:', error)
      alert(error?.message || 'Failed to create request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRequest = async (requestId: string) => {
    if (!confirm('Are you sure you want to delete this request? This action cannot be undone.')) {
      return
    }

    // Optimistic update - remove from UI immediately
    setSentRequests(prev => prev.filter(req => req.id !== requestId))

    try {
      await apiClient.deleteRequest(requestId)
      
      // Refresh requests to ensure consistency
      await fetchRequests()
      
      // Dispatch event to notify other components/users
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('requestsUpdated'))
      }
    } catch (error: any) {
      console.error('Error deleting request:', error)
      // Revert optimistic update on error
      await fetchRequests()
      alert(error?.message || 'Failed to delete request')
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    await handleStatusUpdate(requestId, 'APPROVED')
  }

  const handleRejectRequest = async (requestId: string) => {
    await handleStatusUpdate(requestId, 'REJECTED')
  }

  const handleStatusUpdate = async (requestId: string, newStatus: RequestStatus | TaskStatus) => {
    // Optimistic update - update UI immediately
    // Map task status to request status if needed
    let requestStatus: RequestStatus
    if (newStatus === 'YTS') {
      requestStatus = 'APPROVED'
    } else if (newStatus === 'IN_PROGRESS') {
      requestStatus = 'IN_PROGRESS'
    } else if (newStatus === 'ON_HOLD') {
      requestStatus = 'WAITING_INFO'
    } else if (newStatus === 'COMPLETED') {
      requestStatus = 'COMPLETED'
    } else if (newStatus === 'RECURRING') {
      requestStatus = 'IN_PROGRESS'
    } else {
      requestStatus = newStatus as RequestStatus
    }

    setSentRequests(prev => 
      prev.map(req => 
        req.id === requestId ? { ...req, status: requestStatus } : req
      )
    )
    setReceivedRequests(prev => 
      prev.map(req => 
        req.id === requestId ? { ...req, status: requestStatus } : req
      )
    )

    try {
      await apiClient.updateRequestStatus(requestId, requestStatus)
      
      // Refresh requests to get latest data (including any other changes)
      await fetchRequests()
      
      // Dispatch event to notify other components/users
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('requestsUpdated'))
        // Also dispatch task update event to refresh task lists
        window.dispatchEvent(new Event('tasksUpdated'))
      }
    } catch (error: any) {
      console.error('Error updating request status:', error)
      // Revert optimistic update on error
      await fetchRequests()
      alert(error?.message || 'Failed to update request status')
    }
  }

  const handleDeadlineUpdate = async (requestId: string, deadline: string | null) => {
    // Optimistic update - update UI immediately
    setSentRequests(prev => 
      prev.map(req => 
        req.id === requestId ? { ...req, tentativeDeadline: deadline || null } : req
      )
    )
    setReceivedRequests(prev => 
      prev.map(req => 
        req.id === requestId ? { ...req, tentativeDeadline: deadline || null } : req
      )
    )

    try {
      await apiClient.updateRequestDeadline(requestId, deadline)
      
      // Refresh requests to get latest data
      await fetchRequests()
      
      // Dispatch event to notify other components/users
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('requestsUpdated'))
      }
    } catch (error: any) {
      console.error('Error updating request deadline:', error)
      // Revert optimistic update on error
      await fetchRequests()
      alert(error?.message || 'Failed to update request deadline')
    }
  }

  const canUpdateStatus = (request: Request): boolean => {
    if (!currentUserId) return false
    // User can update if they are assigned to the request, or if they are admin/superadmin in target department
    const isAssigned = request.assignedToId === currentUserId
    const isAdmin = currentUserRole?.toUpperCase() === 'ADMIN'
    const isSuperAdmin = currentUserRole?.toUpperCase() === 'SUPER_ADMIN'
    const isInTargetDepartment = request.toDepartment?.name === currentUserDepartment
    return isAssigned || (isAdmin && isInTargetDepartment) || isSuperAdmin
  }

  const canAssignRequest = (request: Request): boolean => {
    if (!currentUserId) return false
    // Admin in target department, superadmin, or current assignee can assign
    const isAdmin = currentUserRole?.toUpperCase() === 'ADMIN'
    const isSuperAdmin = currentUserRole?.toUpperCase() === 'SUPER_ADMIN'
    const isInTargetDepartment = request.toDepartment?.name === currentUserDepartment
    const isCurrentAssignee = request.assignedToId === currentUserId
    return (isAdmin && isInTargetDepartment) || isSuperAdmin || isCurrentAssignee
  }

  // Fetch team members from department
  const fetchTeamMembers = async (departmentName?: string | null) => {
    if (!departmentName) return
    setIsLoadingTeamMembers(true)
    try {
      const params: { department?: string; limit?: number; skip?: number } = {
        limit: 1000,
        skip: 0,
      }
      if (departmentName) {
        params.department = departmentName
      }
      const membersData = await apiClient.getTeamMembers(params)
      const membersArray = Array.isArray(membersData)
        ? membersData
        : (membersData as any)?.members || []
      setTeamMembers(membersArray as { id: string; name?: string | null; email: string; department?: string | null }[])
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    } finally {
      setIsLoadingTeamMembers(false)
    }
  }

  // Fetch team members when user department is available
  useEffect(() => {
    if (currentUserDepartment) {
      // Fetch team members from user's department (they receive requests for their department)
      fetchTeamMembers(currentUserDepartment)
    }
  }, [currentUserDepartment])

  // Fetch projects and brands for task creation
  const fetchProjects = async () => {
    setIsLoadingProjects(true)
    try {
      const projectsData = await apiClient.getProjects({ limit: 1000, skip: 0 })
      const projectsArray = Array.isArray(projectsData) ? projectsData : (projectsData as any)?.projects || []
      const projectsList = projectsArray.map((p: { id: string; name: string; brand?: string }) => ({ id: p.id, name: p.name, brand: p.brand }))
      setProjects(projectsList)
      
      // Extract unique brands from projects
      const brandSet = new Set<string>()
      projectsList.forEach((project: { id: string; name: string; brand?: string }) => {
        if (project.brand && project.brand.trim()) {
          brandSet.add(project.brand.trim())
        }
      })
      setBrands(Array.from(brandSet).sort())
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const handleAssignmentUpdate = async (requestId: string, assignedToId: string | null) => {
    // If unassigning, just update without opening modal
    if (!assignedToId || assignedToId === 'unassign') {
      try {
        await apiClient.updateRequestAssignment(requestId, null)
        await fetchRequests()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('requestsUpdated'))
        }
      } catch (error: any) {
        console.error('Error updating request assignment:', error)
        await fetchRequests()
        alert(error?.message || 'Failed to update request assignment')
      }
      return
    }

    // Find the request
    const request = receivedRequests.find(r => r.id === requestId)
    if (!request) return

    // Always open task creation modal when assigning (whether first time or reassigning)
    // Map request priority to task priority
    const taskPriority = request.priority === 'CRITICAL' ? 'HIGH' : 
                        request.priority === 'HIGH' ? 'HIGH' : 
                        request.priority === 'MEDIUM' ? 'MEDIUM' : 'LOW'

    // Pre-fill task form with request data
    setTaskFormData({
      title: `[Request] ${request.title}`,
      description: `Request Type: ${request.requestType}\n\n${request.description}`,
      status: request.status === 'COMPLETED' ? 'COMPLETED' : 
             request.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_PROGRESS',
      priority: taskPriority,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      dueDate: request.tentativeDeadline ? format(new Date(request.tentativeDeadline), 'yyyy-MM-dd') : '',
      projectId: '',
      brand: '',
      tags: '',
      link: '',
    })
    setSelectedRequestForTask(request)
    setSelectedAssigneeId(assignedToId)
    setIsTaskModalOpen(true)
    fetchProjects()
  }

  const handleCreateTaskFromRequest = async () => {
    if (!selectedRequestForTask || !selectedAssigneeId) {
      alert('Please select an assignee')
      return
    }

    if (!taskFormData.title.trim()) {
      alert('Task title is required')
      return
    }

    setIsCreatingTask(true)
    try {
      // Validate assignee ID
      if (!selectedAssigneeId || selectedAssigneeId.trim() === '') {
        alert('Please select a valid team member to assign')
        return
      }

      // Always create a task when assigning (whether first time or reassignment)
      // Add request ID to description for easy tracking
      const taskDescription = taskFormData.description.trim() || ''
      const requestIdMarker = `\n\n[RequestID:${selectedRequestForTask.id}]`
      const finalDescription = taskDescription + requestIdMarker
      
      const taskData: any = {
        tasks: [{
          title: taskFormData.title.trim(),
          description: finalDescription,
        }],
        status: taskFormData.status,
        priority: taskFormData.priority,
        startDate: taskFormData.startDate && taskFormData.startDate.trim() !== '' ? taskFormData.startDate : null,
        dueDate: taskFormData.dueDate && taskFormData.dueDate.trim() !== '' ? taskFormData.dueDate : null,
        projectId: taskFormData.projectId && taskFormData.projectId.trim() !== '' ? taskFormData.projectId.trim() : null,
        brand: taskFormData.brand?.trim() || null,
        tags: taskFormData.tags?.trim() || null,
        link: taskFormData.link?.trim() || null,
        assignees: [selectedAssigneeId.trim()], // Ensure it's a valid string array
      }

      console.log('Creating task with data:', { ...taskData, assignees: taskData.assignees })

      // Create the task
      const createdTask = await apiClient.createTask(taskData)
      console.log('Task created successfully:', createdTask)

      // Verify task was created with assignees
      if (createdTask) {
        const taskResult = Array.isArray(createdTask) ? createdTask[0] : (createdTask.tasks?.[0] || createdTask)
        if (taskResult?.assignees && taskResult.assignees.length > 0) {
          console.log('Task assignees:', taskResult.assignees)
        } else {
          console.warn('Task created but no assignees found in response')
        }
      }

      // Update the request assignment
      await apiClient.updateRequestAssignment(selectedRequestForTask.id, selectedAssigneeId.trim())
      
      // Refresh requests
      await fetchRequests()
      
      // Close modal and reset
      setIsTaskModalOpen(false)
      setSelectedRequestForTask(null)
      setSelectedAssigneeId('')
      
      // Dispatch event to notify other components/users
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('requestsUpdated'))
        // Also dispatch task update event to refresh task lists
        window.dispatchEvent(new Event('tasksUpdated'))
      }

      alert('Task created and request assigned successfully! The task should now appear in the assigned team member\'s task list.')
    } catch (error: any) {
      console.error('Error creating task from request:', error)
      alert(error?.message || 'Failed to create task')
    } finally {
      setIsCreatingTask(false)
    }
  }

  const requests = view === 'sent' ? filteredSentRequests : filteredReceivedRequests

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Inbox className="h-8 w-8 text-orange-600" />
            <div>
              <h1 className="text-3xl font-bold">RequestHub</h1>
              <p className="text-muted-foreground">Manage and track all your requests</p>
            </div>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Request
          </Button>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search requests by title, description, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={view} onValueChange={(v) => setView(v as 'sent' | 'received')}>
          <TabsList>
            <TabsTrigger value="sent">Sent Requests</TabsTrigger>
            <TabsTrigger value="received">Received Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="sent" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sent Requests ({filteredSentRequests.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredSentRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchQuery ? 'No requests found matching your search.' : 'No sent requests yet.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 text-sm font-medium">Title</th>
                          <th className="text-left p-3 text-sm font-medium">Type</th>
                          <th className="text-left p-3 text-sm font-medium">Priority</th>
                          <th className="text-left p-3 text-sm font-medium">Status</th>
                          <th className="text-left p-3 text-sm font-medium">To Department / Assigned To</th>
                          <th className="text-left p-3 text-sm font-medium">Tentative Deadline</th>
                          <th className="text-left p-3 text-sm font-medium">Created</th>
                          <th className="text-left p-3 text-sm font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSentRequests.map((request) => (
                          <tr key={request.id} className="border-b hover:bg-muted/50">
                            <td className="p-3 text-sm">
                              <div>
                                <div className="font-medium">{request.title}</div>
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {request.description}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-sm">
                              <Badge variant="outline" className="text-xs">{request.requestType}</Badge>
                            </td>
                            <td className="p-3 text-sm">
                              <Badge className={cn(priorityColors[request.priority], "text-xs")}>
                                {request.priority}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm">
                              <Badge className={cn(statusColors[request.status], "text-xs")}>
                                {request.status.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm">
                              <div className="space-y-1">
                                <div>{request.toDepartment?.name || request.assignedTo?.department || '-'}</div>
                                <div className="text-xs text-muted-foreground">
                                  {request.assignedTo?.name || request.assignedTo?.email || '-'}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-sm">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs">
                                  {request.tentativeDeadline ? format(new Date(request.tentativeDeadline), 'MMM d, yyyy') : '-'}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {format(new Date(request.createdAt), 'MMM d, yyyy')}
                            </td>
                            <td className="p-3 text-sm">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteRequest(request.id)}
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="received" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Received Requests ({filteredReceivedRequests.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredReceivedRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchQuery ? 'No requests found matching your search.' : 'No received requests yet.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 text-sm font-medium">Title</th>
                          <th className="text-left p-3 text-sm font-medium">Type</th>
                          <th className="text-left p-3 text-sm font-medium">Priority</th>
                          <th className="text-left p-3 text-sm font-medium">Status</th>
                          <th className="text-left p-3 text-sm font-medium">From Department / Assigned By</th>
                          <th className="text-left p-3 text-sm font-medium">Assign To</th>
                          <th className="text-left p-3 text-sm font-medium">Tentative Deadline</th>
                          <th className="text-left p-3 text-sm font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReceivedRequests.map((request) => (
                          <tr key={request.id} className="border-b hover:bg-muted/50">
                            <td className="p-3 text-sm">
                              <div>
                                <div className="font-medium">{request.title}</div>
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {request.description}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-sm">
                              <Badge variant="outline" className="text-xs">{request.requestType}</Badge>
                            </td>
                            <td className="p-3 text-sm">
                              <Badge className={cn(priorityColors[request.priority], "text-xs")}>
                                {request.priority}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm">
                              {request.status === 'SUBMITTED' && canUpdateStatus(request) ? (
                                // Show Accept/Cancel buttons for SUBMITTED requests
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleAcceptRequest(request.id)}
                                    className="h-7 text-xs px-3 bg-green-600 hover:bg-green-700"
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRejectRequest(request.id)}
                                    className="h-7 text-xs px-3 text-red-600 border-red-600 hover:bg-red-50"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : canUpdateStatus(request) && request.status !== 'REJECTED' && request.status !== 'CLOSED' ? (
                                // Show task status dropdown for accepted requests
                                <Select
                                  value={request.status === 'APPROVED' ? 'YTS' : 
                                         request.status === 'IN_PROGRESS' ? 'IN_PROGRESS' :
                                         request.status === 'WAITING_INFO' ? 'ON_HOLD' :
                                         request.status === 'COMPLETED' ? 'COMPLETED' : 'YTS'}
                                  onValueChange={(value) => handleStatusUpdate(request.id, value as TaskStatus)}
                                >
                                  <SelectTrigger className={cn('w-[140px] text-xs', statusColors[request.status])}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(['YTS', 'IN_PROGRESS', 'ON_HOLD', 'RECURRING', 'COMPLETED'] as TaskStatus[]).map((status) => (
                                      <SelectItem key={status} value={status} className="text-xs">
                                        {status === 'YTS' ? 'YTS' : status.replace('_', ' ')}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge className={cn(statusColors[request.status], "text-xs")}>
                                  {request.status.replace('_', ' ')}
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-sm">
                              <div className="space-y-1">
                                <div>{request.fromDepartment?.name || request.createdBy?.department || '-'}</div>
                                <div className="text-xs text-muted-foreground">
                                  {request.createdBy?.name || request.createdBy?.email || '-'}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-sm">
                              {canAssignRequest(request) ? (
                                <Select
                                  value={request.assignedToId || 'unassign'}
                                  onValueChange={(value) => handleAssignmentUpdate(request.id, value === 'unassign' ? null : value)}
                                  disabled={isLoadingTeamMembers}
                                >
                                  <SelectTrigger className="w-[180px] text-xs">
                                    <SelectValue placeholder="Select team member" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unassign" className="text-xs">Unassign</SelectItem>
                                    {teamMembers.length === 0 && !isLoadingTeamMembers ? (
                                      <SelectItem value="no-members" disabled className="text-xs">No team members found</SelectItem>
                                    ) : (
                                      teamMembers.map((member) => (
                                        <SelectItem key={member.id} value={member.id} className="text-xs">
                                          {member.name || member.email}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="text-xs text-muted-foreground">
                                  {request.assignedTo?.name || request.assignedTo?.email || '-'}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-sm">
                              {canUpdateStatus(request) ? (
                                <Input
                                  type="date"
                                  value={request.tentativeDeadline ? format(new Date(request.tentativeDeadline), 'yyyy-MM-dd') : ''}
                                  onChange={(e) => handleDeadlineUpdate(request.id, e.target.value || null)}
                                  className="w-[160px] text-xs"
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs">
                                    {request.tentativeDeadline ? format(new Date(request.tentativeDeadline), 'MMM d, yyyy') : '-'}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {format(new Date(request.createdAt), 'MMM d, yyyy')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Request Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Request</DialogTitle>
              <DialogDescription>
                Fill in the details to create a new request
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, title: e.target.value }))
                    if (formErrors.title) setFormErrors(prev => ({ ...prev, title: '' }))
                  }}
                  placeholder="Enter request title"
                />
                {formErrors.title && (
                  <p className="text-sm text-red-500">{formErrors.title}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">
                  Description <span className="text-red-500">*</span>
                </Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, description: e.target.value }))
                    if (formErrors.description) setFormErrors(prev => ({ ...prev, description: '' }))
                  }}
                  placeholder="Enter request description"
                  rows={4}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
                {formErrors.description && (
                  <p className="text-sm text-red-500">{formErrors.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="requestType">Request Type</Label>
                  <Select
                    value={formData.requestType}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, requestType: value as RequestType }))}
                  >
                    <SelectTrigger id="requestType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTOMATION">Automation</SelectItem>
                      <SelectItem value="DATA">Data</SelectItem>
                      <SelectItem value="ACCESS">Access</SelectItem>
                      <SelectItem value="SUPPORT">Support</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value as RequestPriority }))}
                  >
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="toDepartment">To Department</Label>
                <Select
                  value={formData.toDepartmentId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, toDepartmentId: value, assignedToId: '' }))}
                  disabled={isLoadingDepartments}
                >
                  <SelectTrigger id="toDepartment">
                    <SelectValue placeholder={isLoadingDepartments ? 'Loading departments...' : 'Select department'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {isLoadingDepartments ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : departments.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        No departments available
                      </div>
                    ) : (
                      departments
                        .filter((dept) => {
                          // Filter out user's own department - can't send request to own department
                          if (currentUserDepartment && dept.name.toLowerCase() === currentUserDepartment.toLowerCase()) {
                            return false
                          }
                          return true
                        })
                        .map((dept) => (
                          <SelectItem key={dept.id || dept.name} value={dept.id || dept.name}>
                            {dept.name}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
                {departments.length === 0 && !isLoadingDepartments && (
                  <p className="text-sm text-muted-foreground">No departments found. Please create departments first.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedTo">Assign To (Department Admin)</Label>
                <Select
                  value={formData.assignedToId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, assignedToId: value }))}
                  disabled={!formData.toDepartmentId || isLoadingAdmins || departmentAdmins.length === 0}
                >
                  <SelectTrigger id="assignedTo">
                    <SelectValue 
                      placeholder={
                        !formData.toDepartmentId 
                          ? 'Select department first' 
                          : isLoadingAdmins 
                          ? 'Loading admins...' 
                          : departmentAdmins.length === 0 
                          ? 'No admins found' 
                          : 'Select admin'
                      } 
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {isLoadingAdmins ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : departmentAdmins.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        No admins found in this department
                      </div>
                    ) : (
                      departmentAdmins.map((admin) => (
                        <SelectItem key={admin.id} value={admin.id}>
                          {admin.name ? `${admin.name} (${admin.email})` : admin.email}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {formData.toDepartmentId && departmentAdmins.length === 0 && !isLoadingAdmins && (
                  <p className="text-sm text-muted-foreground">
                    No admins found in this department. Only users with admin or superadmin role in this department can be assigned.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateModalOpen(false)
                  setFormData({
                    title: '',
                    description: '',
                    requestType: 'OTHER',
                    priority: 'MEDIUM',
                    toDepartmentId: '',
                    assignedToId: '',
                  })
                  setFormErrors({})
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateRequest}
                disabled={isSubmitting}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Request'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Task Creation Modal */}
        <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Task from Request</DialogTitle>
              <DialogDescription>
                Create a task for the assigned team member. Fields are pre-filled from the request, but you can edit them.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="taskTitle">Task Title *</Label>
                <Input
                  id="taskTitle"
                  value={taskFormData.title}
                  onChange={(e) => setTaskFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter task title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="taskDescription">Description</Label>
                <textarea
                  id="taskDescription"
                  value={taskFormData.description}
                  onChange={(e) => setTaskFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter task description"
                  className="w-full min-h-[100px] p-2 border rounded-md resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskStatus">Status</Label>
                  <Select
                    value={taskFormData.status}
                    onValueChange={(value) => setTaskFormData(prev => ({ ...prev, status: value as any }))}
                  >
                    <SelectTrigger id="taskStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="YTS">Yet To Start</SelectItem>
                      <SelectItem value="ON_HOLD">On Hold</SelectItem>
                      <SelectItem value="RECURRING">Recurring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taskPriority">Priority</Label>
                  <Select
                    value={taskFormData.priority}
                    onValueChange={(value) => setTaskFormData(prev => ({ ...prev, priority: value as any }))}
                  >
                    <SelectTrigger id="taskPriority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskStartDate">Start Date</Label>
                  <Input
                    id="taskStartDate"
                    type="date"
                    value={taskFormData.startDate}
                    onChange={(e) => setTaskFormData(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taskDueDate">Due Date</Label>
                  <Input
                    id="taskDueDate"
                    type="date"
                    value={taskFormData.dueDate}
                    onChange={(e) => setTaskFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskProject">Project (Optional)</Label>
                  <Select
                    value={taskFormData.projectId || 'none'}
                    onValueChange={(value) => setTaskFormData(prev => ({ ...prev, projectId: value === 'none' ? '' : value }))}
                    disabled={isLoadingProjects}
                  >
                    <SelectTrigger id="taskProject">
                      <SelectValue placeholder={isLoadingProjects ? 'Loading projects...' : 'Select project (optional)'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {projects.map((project: { id: string; name: string; brand?: string }) => (
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
                <div className="space-y-2">
                  <Label htmlFor="taskBrand">Brand (Optional)</Label>
                  <Select
                    value={taskFormData.brand || 'none'}
                    onValueChange={(value) => setTaskFormData(prev => ({ ...prev, brand: value === 'none' ? '' : value }))}
                  >
                    <SelectTrigger id="taskBrand">
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

              <div className="space-y-2">
                <Label htmlFor="taskTags">Tags (Optional)</Label>
                <Input
                  id="taskTags"
                  value={taskFormData.tags}
                  onChange={(e) => setTaskFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="Enter tags (comma separated)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="taskLink">Link (Optional)</Label>
                <Input
                  id="taskLink"
                  value={taskFormData.link}
                  onChange={(e) => setTaskFormData(prev => ({ ...prev, link: e.target.value }))}
                  placeholder="Enter link URL"
                />
              </div>

              {selectedRequestForTask && (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium mb-1">Assigned To:</p>
                  <p className="text-sm text-muted-foreground">
                    {teamMembers.find(m => m.id === selectedAssigneeId)?.name || 
                     teamMembers.find(m => m.id === selectedAssigneeId)?.email || 
                     'Unknown'}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsTaskModalOpen(false)
                  setSelectedRequestForTask(null)
                  setSelectedAssigneeId('')
                }}
                disabled={isCreatingTask}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTaskFromRequest}
                disabled={isCreatingTask}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isCreatingTask ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Task & Assign'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}
