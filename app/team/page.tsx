'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient, type DepartmentDto } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Send, CheckCircle2, Clock, AlertCircle, UserPlus, Search, Pencil, Trash2, Loader2, Settings, PlusCircle } from 'lucide-react'
import { TeamMemberListSkeleton } from '@/components/skeletons/team-skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface TeamMember {
  id: string
  name?: string
  email: string
  department?: string
  company?: string
  employeeId?: string
  tasksAssigned: number
  projectsInvolved: number
  hasCredentialAccess?: boolean
  hasSubscriptionAccess?: boolean
  statusSummary: {
    inProgress: number
    completed: number
    onHold: number
    yts?: number
    recurring?: number
  }
  role: string
  credentialMembers?: {
    id: string
    credentialId: string
    credentialName: string
    isActive: boolean
  }[]
  subscriptionMembers?: {
    id: string
    subscriptionId: string
    subscriptionName: string
    isActive: boolean
  }[]
}

type MemberRoleOption = 'USER' | 'ADMIN' | 'SUPER_ADMIN'

interface MemberFormState {
  name: string
  email: string
  password: string
  department: string
  company: string
  employeeId: string
  role: MemberRoleOption
  hasCredentialAccess: boolean
  hasSubscriptionAccess: boolean
}

interface DepartmentOption {
  id?: string
  name: string
  userCount?: number
  projectCount?: number
  isLegacy?: boolean
}

const normalizeRoleForSelect = (role?: string): MemberRoleOption => {
  if (!role) return 'USER'
  const upper = role.toUpperCase().replace(/-/g, '_')
  if (upper === 'SUPERADMIN') return 'SUPER_ADMIN'
  if (upper === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (upper === 'ADMIN') return 'ADMIN'
  return 'USER'
}

const formatRoleLabel = (role?: string) => {
  const labels: Record<MemberRoleOption, string> = {
    USER: 'User',
    ADMIN: 'Admin',
    SUPER_ADMIN: 'Super Admin',
  }
  return labels[normalizeRoleForSelect(role)]
}

const getDefaultMemberForm = (): MemberFormState => ({
  name: '',
  email: '',
  password: '',
  department: '',
  company: '',
  employeeId: '',
  role: 'USER',
  hasCredentialAccess: false,
  hasSubscriptionAccess: false,
})

const mapDepartmentsResponse = (data: DepartmentDto[] | string[]): DepartmentOption[] => {
  if (!Array.isArray(data)) return []
  const normalized = data
    .map((item) => {
      if (typeof item === 'string') {
        return { name: item, isLegacy: true }
      }
      return {
        id: item.id,
        name: item.name,
        userCount: item.userCount,
        projectCount: item.projectCount,
        isLegacy: !item.id,
      }
    })
    .filter((dept): dept is DepartmentOption => Boolean(dept?.name))

  const unique = new Map<string, DepartmentOption>()
  normalized.forEach((dept) => {
    const key = dept.name.toLowerCase()
    if (!unique.has(key)) {
      unique.set(key, dept)
    }
  })

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name))
}

const NO_DEPARTMENT_VALUE = '__none__'

const mergeDepartmentOptions = (base: DepartmentOption[], extras: (string | null | undefined)[]) => {
  const extraOptions = extras
    .map((name) => (name ? { name, isLegacy: true } as DepartmentOption : null))
    .filter((v): v is DepartmentOption => Boolean(v))
  const combined = [...base, ...extraOptions]
  const unique = new Map<string, DepartmentOption>()
  combined.forEach((dept) => {
    const key = dept.name.toLowerCase()
    if (!unique.has(key)) {
      unique.set(key, dept)
    }
  })
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name))
}

const TEAM_MEMBERS_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
interface TeamMembersCacheEntry {
  data: TeamMember[]
  timestamp: number
}
const teamMembersCacheStore: Record<string, TeamMembersCacheEntry> = {}
let lastTeamMembersSnapshot: TeamMember[] | null = null
const getTeamMembersCacheKey = (department?: string, search?: string) => `${department ?? 'all'}::${search ?? ''}`

export default function TeamPage() {
  const router = useRouter()
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMember[]>(() => lastTeamMembersSnapshot ?? [])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => lastTeamMembersSnapshot ?? [])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [isDepartmentManagerOpen, setIsDepartmentManagerOpen] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [departmentActionError, setDepartmentActionError] = useState<string | null>(null)
  const [isSavingDepartment, setIsSavingDepartment] = useState(false)
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<string | null>(null)
  const [departmentUpdateLoading, setDepartmentUpdateLoading] = useState<Record<string, boolean>>({})
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null)
  const [editingDepartmentName, setEditingDepartmentName] = useState<string>('')
  const [savingDepartmentEdit, setSavingDepartmentEdit] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [userRole, setUserRole] = useState<string>('USER')
  const [userDepartment, setUserDepartment] = useState<string>('')
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [debouncedDepartment, setDebouncedDepartment] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('') // User input
  const [searchQuery, setSearchQuery] = useState('') // Debounced search query
  const [isRefreshing, setIsRefreshing] = useState<boolean>(!lastTeamMembersSnapshot)
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(!lastTeamMembersSnapshot)
  const [emailForm, setEmailForm] = useState({
    to: '',
    cc: '',
    subject: '',
    body: '',
  })
  const [includeDepartmentTasks, setIncludeDepartmentTasks] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [departmentTaskCounts, setDepartmentTaskCounts] = useState<{ employees: number; tasks: number } | null>(null)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [onLeaveMembers, setOnLeaveMembers] = useState<string[]>([]) // Array of user IDs on leave
  const [departmentMembersForLeave, setDepartmentMembersForLeave] = useState<TeamMember[]>([])
  const [isDepartmentMembersLoading, setIsDepartmentMembersLoading] = useState(false)
  const [leaveMemberSearch, setLeaveMemberSearch] = useState<string>('') // Search filter for leave members
  const [activeTab, setActiveTab] = useState<string>('team')
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [selectedMemberForRole, setSelectedMemberForRole] = useState<TeamMember | null>(null)
  const [roleSelection, setRoleSelection] = useState<MemberRoleOption>('USER')
  const [roleSaving, setRoleSaving] = useState(false)
  const [isMemberFormOpen, setIsMemberFormOpen] = useState(false)
  const [memberFormMode, setMemberFormMode] = useState<'create' | 'edit'>('create')
  const [memberFormData, setMemberFormData] = useState<MemberFormState>(() => getDefaultMemberForm())
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [isSavingMember, setIsSavingMember] = useState(false)
  const [memberFormError, setMemberFormError] = useState<string | null>(null)
  const [memberDepartmentSelection, setMemberDepartmentSelection] = useState<Record<string, string>>({})
  
  // Debounce timer refs
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const departmentDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const departmentMembersCacheRef = useRef<Record<string, TeamMember[]>>({})
  const departmentMembersInFlightRef = useRef<Record<string, Promise<TeamMember[]>>>({})

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.push('/auth/signin')
      return
    }
    fetchUserRole()
  }, [router])

  // Debounce search input
  useEffect(() => {
    // Clear previous timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    // Set new timer
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput)
    }, 300) // 300ms debounce delay

    // Cleanup on unmount
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [searchInput])

  // Debounce department filter changes for API calls (but show immediate client-side filtering)
  useEffect(() => {
    // Clear previous timer
    if (departmentDebounceRef.current) {
      clearTimeout(departmentDebounceRef.current)
    }

    // Set new timer - debounce API calls but allow immediate client-side filtering
    departmentDebounceRef.current = setTimeout(() => {
      setDebouncedDepartment(selectedDepartment)
    }, 500) // 500ms debounce for API calls

    // Cleanup on unmount
    return () => {
      if (departmentDebounceRef.current) {
        clearTimeout(departmentDebounceRef.current)
      }
    }
  }, [selectedDepartment])

  const fetchUserRole = async () => {
    try {
      const user = await apiClient.getUserRole()
      setUserRole(user.role || 'USER')
      setUserDepartment(user.department || '')
      setCurrentUserId(user.id || '')
      // Set default department filter to user's department if not super admin
      const roleUpper = (user.role || '').toUpperCase()
      if (roleUpper !== 'SUPER_ADMIN' && user.department) {
        setSelectedDepartment(user.department)
      }
    } catch (error) {
      console.error('Failed to fetch user role:', error)
    }
  }

  const isSuperAdmin = userRole.toUpperCase() === 'SUPER_ADMIN'
  const isAdmin = userRole.toUpperCase() === 'ADMIN' || isSuperAdmin

  const fetchTeamMembers = useCallback(async (options?: { force?: boolean }) => {
    const trimmedSearch = searchQuery.trim()
    const params: { department?: string; search?: string } = {}

    if (isSuperAdmin) {
      if (debouncedDepartment !== 'all') {
        params.department = debouncedDepartment
      }
    } else {
      params.department = userDepartment || debouncedDepartment
    }

    if (trimmedSearch) {
      params.search = trimmedSearch
    }

    const cacheKey = getTeamMembersCacheKey(params.department, params.search)
    const canUseCache = !options?.force && !trimmedSearch

    const applyData = (data: TeamMember[]) => {
      const membersArray = Array.isArray(data) ? data : []
      lastTeamMembersSnapshot = membersArray
      // Store all members for client-side filtering when fetching all departments or no filter
      if (!trimmedSearch && (debouncedDepartment === 'all' || !params.department || params.department === 'all')) {
        setAllTeamMembers(membersArray)
      }
      setTeamMembers(membersArray)
      if (!trimmedSearch) {
        teamMembersCacheStore[cacheKey] = {
          data: membersArray,
          timestamp: Date.now(),
        }
      }
    }

    if (canUseCache) {
      const cached = teamMembersCacheStore[cacheKey]
      const cacheValid = cached && Date.now() - cached.timestamp < TEAM_MEMBERS_CACHE_DURATION
      if (cacheValid && cached) {
        applyData(cached.data)
        setIsRefreshing(true)
        apiClient
          .getTeamMembers({ ...params, limit: 1000, skip: 0 }, false)
          .then((data) => {
            // Handle new paginated response format
            const members = Array.isArray(data)
              ? data
              : (data as any)?.members || []
            teamMembersCacheStore[cacheKey] = {
              data: members,
              timestamp: Date.now(),
            }
            applyData(members)
          })
          .catch((error) => {
            console.error('Failed to refresh team members:', error)
          })
          .finally(() => {
            setIsRefreshing(false)
          })
        return
      }
    }

    try {
      if (trimmedSearch) {
        setSearchLoading(true)
      } else {
        if (!lastTeamMembersSnapshot) {
          setIsInitialLoading(true)
        }
        setIsRefreshing(true)
      }
      const data = await apiClient.getTeamMembers({ ...params, limit: 1000, skip: 0 }, !options?.force && !trimmedSearch)
      // Handle new paginated response format
      const members = Array.isArray(data)
        ? data
        : (data as any)?.members || []
      applyData(members)
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    } finally {
      if (trimmedSearch) {
        setSearchLoading(false)
      } else {
        setIsRefreshing(false)
        setIsInitialLoading(false)
      }
    }
  }, [searchQuery, isSuperAdmin, debouncedDepartment, userDepartment])

  const fetchDepartments = useCallback(async () => {
    try {
      const data = await apiClient.getDepartments()
      const mapped = mapDepartmentsResponse(data as DepartmentDto[] | string[])
      const includeUserDept =
        userDepartment &&
        !mapped.some((dept) => dept.name.toLowerCase() === userDepartment.toLowerCase())
          ? [...mapped, { name: userDepartment, isLegacy: true }]
          : mapped
      setDepartments(includeUserDept.sort((a, b) => a.name.localeCompare(b.name)))
    } catch (error: any) {
      console.error('Failed to fetch departments:', error)
      // Don't show alert for department fetch errors, just log them
      // The UI will work with empty departments list or cached data
      // If it's a critical error, it will be shown in the console
    }
  }, [userDepartment])

  // Keep department list in sync with member departments so dropdown always includes their current dept
  useEffect(() => {
    const membersArray = Array.isArray(teamMembers) ? teamMembers : []
    if (departments.length === 0 && membersArray.length === 0) return
    const memberDepartments = membersArray.map((m) => m.department || null)
    setDepartments((prev) => mergeDepartmentOptions(prev, memberDepartments))
  }, [teamMembers, departments.length])

  // Pre-select department dropdowns for members once data is loaded
  useEffect(() => {
    const membersArray = Array.isArray(teamMembers) ? teamMembers : []
    if (!membersArray || membersArray.length === 0) return
    setMemberDepartmentSelection((prev) => {
      const next = { ...prev }
      const membersArray = Array.isArray(teamMembers) ? teamMembers : []
      membersArray.forEach((member) => {
        if (next[member.id] === undefined) {
          next[member.id] = member.department || NO_DEPARTMENT_VALUE
        }
      })
      return next
    })
  }, [teamMembers])

  const handleAddDepartment = useCallback(async () => {
    if (!isSuperAdmin) {
      alert('Only super admins can manage departments.')
      return
    }
    const name = newDepartmentName.trim()
    if (!name) {
      setDepartmentActionError('Department name is required.')
      return
    }
    setDepartmentActionError(null)
    setIsSavingDepartment(true)
    try {
      await apiClient.createDepartment(name)
      setNewDepartmentName('')
      await fetchDepartments()
    } catch (error: any) {
      console.error('Failed to create department:', error)
      setDepartmentActionError(error.message || 'Failed to create department')
    } finally {
      setIsSavingDepartment(false)
    }
  }, [isSuperAdmin, newDepartmentName, fetchDepartments])

  const handleDeleteDepartment = useCallback(async (dept: DepartmentOption) => {
    if (!isSuperAdmin) {
      alert('Only super admins can manage departments.')
      return
    }
    if (!dept.id) {
      setDepartmentActionError('Cannot delete legacy department without id.')
      return
    }
    
    // Check actual member counts from teamMembers
    const membersArray = Array.isArray(teamMembers) ? teamMembers : []
    const members = membersArray.filter(m => 
      (m.department || '').trim().toLowerCase() === dept.name.trim().toLowerCase()
    )
    const actualUserCount = members.length || dept.userCount || 0
    const actualProjectCount = dept.projectCount || 0
    
    if (actualUserCount > 0 || actualProjectCount > 0) {
      setDepartmentActionError(`Cannot delete department. It has ${actualUserCount} user(s) and ${actualProjectCount} project(s). Please reassign them first.`)
      return
    }
    
    // Confirm deletion
    if (!window.confirm(`Are you sure you want to delete "${dept.name}"? This action cannot be undone.`)) {
      return
    }
    
    setDepartmentActionError(null)
    setDeletingDepartmentId(dept.id)
    try {
      await apiClient.deleteDepartment(dept.id)
      await fetchDepartments()
      await fetchTeamMembers({ force: true })
      alert(`Department "${dept.name}" deleted successfully.`)
    } catch (error: any) {
      console.error('Failed to delete department:', error)
      setDepartmentActionError(error.message || 'Failed to delete department')
    } finally {
      setDeletingDepartmentId(null)
    }
  }, [isSuperAdmin, fetchDepartments, fetchTeamMembers, teamMembers])

  const handleStartEditDepartment = useCallback((dept: DepartmentOption) => {
    if (!dept.id) {
      setDepartmentActionError('Cannot edit legacy department without an id. Create a new department instead.')
      return
    }
    setEditingDepartmentId(dept.id)
    setEditingDepartmentName(dept.name)
    setDepartmentActionError(null)
  }, [])

  const handleCancelEditDepartment = useCallback(() => {
    setEditingDepartmentId(null)
    setEditingDepartmentName('')
    setSavingDepartmentEdit(false)
  }, [])

  const handleSaveEditDepartment = useCallback(async () => {
    if (!editingDepartmentId) return
    if (!editingDepartmentName.trim()) {
      setDepartmentActionError('Department name cannot be empty.')
      return
    }
    setSavingDepartmentEdit(true)
    setDepartmentActionError(null)
    try {
      const result = await apiClient.updateDepartment(editingDepartmentId, editingDepartmentName.trim())
      setEditingDepartmentId(null)
      setEditingDepartmentName('')
      // Refresh departments and team members to show updated department names
      await Promise.all([
        fetchDepartments(),
        fetchTeamMembers({ force: true })
      ])
      // Show success message if users/projects were updated
      if (result?.usersUpdated || result?.projectsUpdated) {
        const message = `Department updated successfully. ${result.usersUpdated || 0} user(s) and ${result.projectsUpdated || 0} project(s) updated.`
        alert(message)
      }
    } catch (error: any) {
      console.error('Failed to update department:', error)
      setDepartmentActionError(error.message || 'Failed to update department')
    } finally {
      setSavingDepartmentEdit(false)
    }
  }, [editingDepartmentId, editingDepartmentName, fetchDepartments, fetchTeamMembers])

  const handleMemberDepartmentChange = useCallback(async (userId: string, departmentName: string) => {
    const normalized = departmentName === NO_DEPARTMENT_VALUE ? '' : departmentName
    setMemberDepartmentSelection(prev => ({ ...prev, [userId]: departmentName }))
    setDepartmentUpdateLoading(prev => ({ ...prev, [userId]: true }))
    try {
      await apiClient.updateMemberDepartment(userId, normalized || null)
      // Update local state immediately for better UX
      setTeamMembers(prev => {
        const prevArray = Array.isArray(prev) ? prev : []
        return prevArray.map(m => 
          m.id === userId ? { ...m, department: normalized || undefined } : m
        )
      })
      await fetchTeamMembers({ force: true })
      await fetchDepartments()
    } catch (error: any) {
      console.error('Failed to update member department:', error)
      // Revert selection on error
      const membersArray = Array.isArray(teamMembers) ? teamMembers : []
      const member = membersArray.find(m => m.id === userId)
      setMemberDepartmentSelection(prev => ({ 
        ...prev, 
        [userId]: member?.department || NO_DEPARTMENT_VALUE 
      }))
      const errorMsg = error?.error || error?.message || 'Failed to update department. Please try again.'
      alert(errorMsg)
    } finally {
      setDepartmentUpdateLoading(prev => ({ ...prev, [userId]: false }))
    }
  }, [fetchTeamMembers, fetchDepartments, teamMembers])

  // Client-side filtering for instant updates (before API call completes)
  const filteredTeamMembers = useMemo(() => {
    // Try to get cached "all" members from cache store if state doesn't have them
    const allMembersCache = teamMembersCacheStore[getTeamMembersCacheKey('all', '')]
    const allMembersArray = Array.isArray(allTeamMembers) ? allTeamMembers : []
    const availableAllMembers = allMembersArray.length > 0 
      ? allMembersArray 
      : (Array.isArray(allMembersCache?.data) ? allMembersCache.data : [])
    
    // If we have all members (from state or cache) and user is filtering by department, filter client-side for instant updates
    if (selectedDepartment !== 'all' && availableAllMembers.length > 0 && !searchQuery.trim()) {
      const normalizedFilter = selectedDepartment.trim().toLowerCase()
      const filtered = availableAllMembers.filter(member => {
        const memberDept = member.department?.trim().toLowerCase() || ''
        return memberDept === normalizedFilter
      })
      // Return filtered results immediately, even if API call is still pending
      return filtered
    }
    // If filtering by 'all', use all members if available
    if (selectedDepartment === 'all' && availableAllMembers.length > 0 && !searchQuery.trim()) {
      return availableAllMembers
    }
    // Otherwise use the server-filtered results
    const membersArray = Array.isArray(teamMembers) ? teamMembers : []
    return membersArray
  }, [allTeamMembers, teamMembers, selectedDepartment, searchQuery])

  // Use filtered members for display (instant client-side filtering)
  const displayMembers = useMemo(() => {
    const membersArray = Array.isArray(teamMembers) ? teamMembers : []
    const filteredArray = Array.isArray(filteredTeamMembers) ? filteredTeamMembers : []
    let members = searchQuery.trim() ? membersArray : filteredArray
    
    // Apply additional client-side filtering to ensure search + department filter work together
    if (searchQuery.trim() && selectedDepartment !== 'all') {
      const normalizedFilter = selectedDepartment.trim().toLowerCase()
      members = members.filter(member => {
        const memberDept = member.department?.trim().toLowerCase() || ''
        return memberDept === normalizedFilter
      })
    }
    
    return members
  }, [filteredTeamMembers, teamMembers, searchQuery, selectedDepartment])

  // Departments that have at least one member (for the filter dropdown)
  const departmentsWithMembers = useMemo(() => {
    const counts: Record<string, number> = {}
    const membersArray = Array.isArray(teamMembers) ? teamMembers : []
    membersArray.forEach((m) => {
      const key = (m.department || '').trim().toLowerCase()
      if (!key) return
      counts[key] = (counts[key] || 0) + 1
    })
    return departments
      .filter((d) => {
        const key = d.name.trim().toLowerCase()
        const memberCount = counts[key] || d.userCount || 0
        return memberCount > 0
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [departments, teamMembers])

  const departmentMembersMap = useMemo(() => {
    const map: Record<string, TeamMember[]> = {}
    const membersArray = Array.isArray(teamMembers) ? teamMembers : []
    membersArray.forEach((member) => {
      const key = (member.department || '').trim().toLowerCase()
      if (!map[key]) map[key] = []
      map[key].push(member)
    })
    return map
  }, [teamMembers])


  const applyDepartmentMembersForLeave = useCallback((members: TeamMember[]) => {
    setDepartmentMembersForLeave(members)
    if (members.length === 0) {
      setOnLeaveMembers([])
      return
    }
    setOnLeaveMembers((prev) => prev.filter((id) => members.some((member) => member.id === id)))
  }, [])

  const refreshDepartmentMembers = useCallback((department: string, showLoading: boolean = false): Promise<TeamMember[]> => {
    if (!department) {
      applyDepartmentMembersForLeave([])
      return Promise.resolve([])
    }

    const cacheKey = department.toLowerCase()
    const inFlight = departmentMembersInFlightRef.current[cacheKey]
    if (inFlight) {
      return inFlight
    }

    if (showLoading) {
      setIsDepartmentMembersLoading(true)
    }

    const fetchPromise = apiClient
      .getTeamMembers({ department }, true)
      .then((data) => {
        const members = (data as TeamMember[]) || []
        departmentMembersCacheRef.current[cacheKey] = members
        applyDepartmentMembersForLeave(members)
        return members
      })
      .catch((error) => {
        console.error('Failed to fetch department members:', error)
        if (showLoading) {
          applyDepartmentMembersForLeave([])
        }
        return []
      })
      .finally(() => {
        if (showLoading) {
          setIsDepartmentMembersLoading(false)
        }
        delete departmentMembersInFlightRef.current[cacheKey]
      })

    departmentMembersInFlightRef.current[cacheKey] = fetchPromise
    return fetchPromise
  }, [applyDepartmentMembersForLeave])

  const loadDepartmentMembersForLeave = useCallback(async (department: string): Promise<TeamMember[]> => {
    if (!department) {
      applyDepartmentMembersForLeave([])
      return []
    }

    const cacheKey = department.toLowerCase()
    const cachedMembers = departmentMembersCacheRef.current[cacheKey]
    if (cachedMembers) {
      applyDepartmentMembersForLeave(cachedMembers)
      refreshDepartmentMembers(department)
      return cachedMembers
    }

    const membersArray = Array.isArray(teamMembers) ? teamMembers : []
    const fallbackMembers = membersArray.filter((member) => (member.department || '').toLowerCase() === cacheKey)
    if (fallbackMembers.length > 0) {
      departmentMembersCacheRef.current[cacheKey] = fallbackMembers
      applyDepartmentMembersForLeave(fallbackMembers)
      refreshDepartmentMembers(department)
      return fallbackMembers
    }

    return refreshDepartmentMembers(department, true)
  }, [teamMembers, applyDepartmentMembersForLeave, refreshDepartmentMembers])

  const fetchDepartmentTasksForEmail = useCallback(async (): Promise<any[]> => {
    if (isAdmin) {
      return apiClient.getDepartmentTasks()
    }

    const [myTasks, teamTasks] = await Promise.all([
      apiClient.getMyTasks(),
      apiClient.getTeamTasks(),
    ])

    const uniqueTasks = new Map<string, any>()
    ;[...(myTasks || []), ...(teamTasks || [])].forEach((task: any) => {
      if (task?.id && !uniqueTasks.has(task.id)) {
        uniqueTasks.set(task.id, task)
      }
    })

    return Array.from(uniqueTasks.values())
  }, [isAdmin])

  // Fetch data when debounced search query or debounced department changes (for API calls)
  useEffect(() => {
    if (userRole && userDepartment !== undefined) {
      fetchTeamMembers()
      // Only fetch departments once, not on every search
      if (departments.length === 0) {
        fetchDepartments()
      }
    }
  }, [debouncedDepartment, searchQuery, userRole, userDepartment, fetchTeamMembers, fetchDepartments, departments.length])

  // Also fetch all members when component loads or when switching to 'all' to enable client-side filtering
  useEffect(() => {
    if (userRole && userDepartment !== undefined && selectedDepartment === 'all' && isSuperAdmin && allTeamMembers.length === 0) {
      // Fetch all members to enable client-side filtering
      fetchTeamMembers({ force: false })
    }
  }, [selectedDepartment, userRole, userDepartment, isSuperAdmin, allTeamMembers.length, fetchTeamMembers])

  const handleSendEmail = async () => {
    // Validate required fields
    if (!emailForm.to || !emailForm.to.trim()) {
      alert('Please enter a recipient email address')
      return
    }
    // Subject is required unless includeDepartmentTasks is checked (backend will auto-generate)
    if (!includeDepartmentTasks && (!emailForm.subject || !emailForm.subject.trim())) {
      alert('Please enter an email subject')
      return
    }

    setIsSendingEmail(true)

    try {
      // Parse multiple emails (comma or semicolon separated)
      const parseEmails = (emailString: string): string[] => {
        return emailString
          .split(/[,;]/)
          .map(email => email.trim())
          .filter(email => email.length > 0)
      }

      // Prepare email data
      const emailData = {
        to: parseEmails(emailForm.to.trim()),
        subject: emailForm.subject.trim() || (includeDepartmentTasks ? 'Department Tasks Report' : ''),
        body: emailForm.body.trim() || '', // Body is optional now
        includeDepartmentTasks: includeDepartmentTasks,
        onLeaveMemberIds: onLeaveMembers, // Send on leave member IDs
        ...(emailForm.cc && emailForm.cc.trim() && { cc: parseEmails(emailForm.cc.trim()) }),
      }
      
      await apiClient.sendEmail(emailData)
      setIsEmailDialogOpen(false)
      setActiveTab('team') // Navigate back to Team Overview after sending email
      setEmailForm({ to: '', cc: '', subject: '', body: '' })
      setIncludeDepartmentTasks(false)
      setDepartmentTaskCounts(null)
      setOnLeaveMembers([])
      setDepartmentMembersForLeave([])
      alert('Email sent successfully!')
    } catch (error: any) {
      console.error('Failed to send email:', error)
      alert(error.message || 'Failed to send email')
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleRoleDialogOpenChange = (open: boolean) => {
    setIsRoleDialogOpen(open)
    if (!open) {
      setSelectedMemberForRole(null)
      setRoleSaving(false)
    }
  }

  const openRoleDialog = (member: TeamMember) => {
    // Only super admin can edit super admin roles
    if (normalizeRoleForSelect(member.role) === 'SUPER_ADMIN' && !isSuperAdmin) {
      alert('Only super admins can edit another super admin.')
      return
    }
    setSelectedMemberForRole(member)
    setRoleSelection(normalizeRoleForSelect(member.role))
    setIsRoleDialogOpen(true)
  }

  const handleUpdateRole = async () => {
    if (!selectedMemberForRole) return
    
    // Only super admin can assign SUPER_ADMIN role
    if (roleSelection === 'SUPER_ADMIN' && !isSuperAdmin) {
      alert('Only super admins can assign the SUPER_ADMIN role.')
      return
    }
    
    // Only super admin can change super admin's role
    if (normalizeRoleForSelect(selectedMemberForRole.role) === 'SUPER_ADMIN' && !isSuperAdmin) {
      alert('Only super admins can modify another super admin\'s role.')
      return
    }
    
    setRoleSaving(true)
    try {
      await apiClient.updateMemberRole(selectedMemberForRole.id, roleSelection)
      await fetchTeamMembers({ force: true })
      handleRoleDialogOpenChange(false)
      alert('Role updated successfully!')
    } catch (error: any) {
      console.error('Failed to update member role:', error)
      alert(error.message || 'Failed to update member role')
    } finally {
      setRoleSaving(false)
    }
  }

  const closeMemberForm = useCallback(() => {
    setIsMemberFormOpen(false)
    setEditingMemberId(null)
    setMemberFormError(null)
    setMemberFormData(getDefaultMemberForm())
  }, [])

  const openMemberForm = useCallback((mode: 'create' | 'edit', member?: TeamMember) => {
    if (!isSuperAdmin) {
      alert('Only super admins can manage team members.')
      return
    }
    setMemberFormMode(mode)
    if (mode === 'create' || !member) {
      setMemberFormData(getDefaultMemberForm())
      setEditingMemberId(null)
    } else {
      setMemberFormData({
        name: member.name || '',
        email: member.email,
        password: '',
        department: member.department || '',
        company: member.company || '',
        employeeId: member.employeeId || '',
        role: normalizeRoleForSelect(member.role),
        hasCredentialAccess: member.hasCredentialAccess ?? false,
        hasSubscriptionAccess: member.hasSubscriptionAccess ?? false,
      })
      setEditingMemberId(member.id)
    }
    setMemberFormError(null)
    setIsMemberFormOpen(true)
  }, [isSuperAdmin])

  const handleMemberFormSubmit = async () => {
    if (!isSuperAdmin) {
      alert('Only super admins can manage team members.')
      return
    }

    const email = memberFormData.email.trim()
    const password = memberFormData.password.trim()

    if (!email) {
      setMemberFormError('Email is required.')
      return
    }

    if (memberFormMode === 'create' && !password) {
      setMemberFormError('Password is required for new members.')
      return
    }

    setMemberFormError(null)
    setIsSavingMember(true)

    try {
      const payload: any = {
        name: memberFormData.name.trim() || undefined,
        email,
        department: memberFormData.department.trim() || undefined,
        company: memberFormData.company.trim() || undefined,
        employeeId: memberFormData.employeeId.trim() || undefined,
        role: memberFormData.role,
        hasCredentialAccess: memberFormData.hasCredentialAccess,
        hasSubscriptionAccess: memberFormData.hasSubscriptionAccess,
      }

      if (memberFormMode === 'create' || password) {
        payload.password = password
      }

      if (memberFormMode === 'create') {
        await apiClient.createTeamMember(payload)
      } else if (editingMemberId) {
        await apiClient.updateTeamMember(editingMemberId, payload)
      }

      await fetchTeamMembers({ force: true })
      closeMemberForm()
      alert(memberFormMode === 'create' ? 'Team member added successfully!' : 'Team member updated successfully!')
    } catch (error: any) {
      console.error('Failed to save team member:', error)
      alert(error.message || 'Failed to save team member')
    } finally {
      setIsSavingMember(false)
    }
  }

  const handleInviteTeamMember = async () => {
    try {
      const email = inviteEmail.trim()
      if (!email) {
        alert('Please enter an email address')
        return
      }
      // Placeholder until invite API exists
      alert(`Invitation sent to ${email}`)
      setIsInviteDialogOpen(false)
      setInviteEmail('')
    } catch (error) {
      console.error('Failed to invite team member:', error)
      alert('Failed to invite team member')
    }
  }

  const handleDeactivateMember = async (member: TeamMember) => {
    if (normalizeRoleForSelect(member.role) === 'SUPER_ADMIN' && !isSuperAdmin) {
      alert('Only super admins can deactivate another super admin.')
      return
    }

    if (member.id === currentUserId) {
      alert('You cannot deactivate your own account.')
      return
    }

    let confirmed = true
    if (typeof window !== 'undefined') {
      confirmed = window.confirm(
        `Are you sure you want to delete ${member.name || member.email}? They will lose access to the workspace.`
      )
    }
    if (!confirmed) {
      return
    }

    try {
      await apiClient.deactivateMember(member.id)
      if (selectedMemberForRole?.id === member.id) {
        handleRoleDialogOpenChange(false)
      }
      await fetchTeamMembers({ force: true })
      alert('Team member deleted successfully.')
    } catch (error: any) {
      console.error('Failed to deactivate member:', error)
      alert(error.message || 'Failed to deactivate member')
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Team Management</h1>
            <p className="text-muted-foreground">View team workload and task assignments</p>
            {!searchQuery && isRefreshing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Refreshing team data…</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setInviteEmail('')
                setIsInviteDialogOpen(true)
              }}
            >
              <Mail className="h-4 w-4 mr-2" />
              Invite Team Member
            </Button>
            {isSuperAdmin && (
              <Button onClick={() => openMemberForm('create')}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add New Employee
              </Button>
            )}
          </div>
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Enter an email address to invite a new teammate to the workspace.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="inviteEmail">Email Address</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    We’ll email them instructions to join your workspace.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleInviteTeamMember}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Invite
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value)
          if (value === 'email') {
            setIsEmailDialogOpen(true)
          }
        }} className="space-y-4">
          <TabsList>
            <TabsTrigger value="team">Team Overview</TabsTrigger>
            <TabsTrigger value="email">Send Email</TabsTrigger>
          </TabsList>
          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label htmlFor="search">Search Users</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      {searchLoading && (
                        <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                      )}
                      <Input
                        id="search"
                        placeholder="Search by name or email..."
                        value={searchInput}
                        onChange={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setSearchInput(e.target.value)
                        }}
                        className="pl-9 pr-9"
                      />
                    </div>
                  </div>
                  <div className="w-64">
                    <Label htmlFor="department">Department</Label>
                    <Select 
                      value={selectedDepartment} 
                      onValueChange={setSelectedDepartment}
                      disabled={!isSuperAdmin}
                    >
                      <SelectTrigger id="department">
                        <SelectValue placeholder="All Departments" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {isSuperAdmin && (
                          <SelectItem value="all">All Departments</SelectItem>
                        )}
                        {departmentsWithMembers.map((dept) => (
                          <SelectItem key={dept.name} value={dept.name}>
                            {dept.name}
                            {!isSuperAdmin && dept.name === userDepartment && ' (Your Department)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isSuperAdmin && (
                      <div className="flex justify-end mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsDepartmentManagerOpen(true)}
                          className="gap-1"
                        >
                          <Settings className="h-4 w-4" />
                          Manage
                        </Button>
                      </div>
                    )}
                    {!isSuperAdmin && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Showing employees from your department: {userDepartment}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <AnimatePresence mode="wait">
              {isInitialLoading ? (
                <motion.div
                  key="skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <TeamMemberListSkeleton count={6} />
                </motion.div>
              ) : searchLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Fetching team members...
                    </CardContent>
                  </Card>
                </motion.div>
              ) : displayMembers.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      {searchQuery ? 'No team members found matching your search.' : 'No team members found.'}
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  key="content"
                  className="space-y-4 relative"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Team Members
                      {searchQuery && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          ({displayMembers.length} result{displayMembers.length !== 1 ? 's' : ''})
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative">
                    {searchLoading && (
                      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                        <div className="flex items-center gap-2 bg-card p-3 rounded-lg shadow-lg">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Searching...</span>
                        </div>
                      </div>
                    )}
                    <div className="overflow-x-auto -mx-4 px-4">
                      <table className="w-full min-w-[1200px]">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 text-sm font-medium">Team Member</th>
                            <th className="text-left p-2 text-sm font-medium">Department</th>
                            <th className="text-left p-2 text-sm font-medium">Role</th>
                            <th className="text-left p-2 text-sm font-medium">Tasks</th>
                            <th className="text-left p-2 text-sm font-medium">Projects</th>
                            <th className="text-left p-2 text-sm font-medium">Status</th>
                            <th className="text-left p-2 text-sm font-medium">Credential</th>
                            <th className="text-left p-2 text-sm font-medium">Subscription</th>
                            {isAdmin && <th className="text-left p-2 text-sm font-medium">Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {displayMembers.map((member) => (
                            <motion.tr
                              key={member.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-b hover:bg-accent/50"
                            >
                              <td className="p-2">
                                <div>
                                  <div className="font-medium text-sm">{member.name || member.email}</div>
                                  <div className="text-xs text-muted-foreground truncate max-w-[200px]">{member.email}</div>
                                </div>
                              </td>
                              <td className="p-2">
                                {isAdmin ? (
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={memberDepartmentSelection[member.id] ?? member.department ?? NO_DEPARTMENT_VALUE}
                                      onValueChange={(value) =>
                                        handleMemberDepartmentChange(
                                          member.id,
                                          value === NO_DEPARTMENT_VALUE ? '' : value
                                        )
                                      }
                                      disabled={departmentUpdateLoading[member.id]}
                                    >
                                      <SelectTrigger className="w-44">
                                        <SelectValue placeholder="Select department" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={NO_DEPARTMENT_VALUE}>No Department</SelectItem>
                                        {departments.map((dept) => (
                                          <SelectItem key={`${dept.name}-${dept.id ?? 'legacy'}`} value={dept.name}>
                                            {dept.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {departmentUpdateLoading[member.id] && <Loader2 className="h-4 w-4 animate-spin" />}
                                  </div>
                                ) : member.department ? (
                                  <Badge variant="outline">{member.department}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-2">
                                <Badge variant="secondary" className="text-xs">{formatRoleLabel(member.role)}</Badge>
                              </td>
                              <td className="p-2 text-sm">{member.tasksAssigned}</td>
                              <td className="p-2 text-sm">{member.projectsInvolved}</td>
                              <td className="p-2">
                                <div className="flex gap-1 flex-wrap">
                                  <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                    <Clock className="h-3 w-3" />
                                    {member.statusSummary.inProgress}
                                  </Badge>
                                  <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {member.statusSummary.completed}
                                  </Badge>
                                  <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                    <AlertCircle className="h-3 w-3" />
                                    {member.statusSummary.onHold}
                                  </Badge>
                                </div>
                              </td>
                              <td className="p-2">
                                {isAdmin ? (
                                  <div className="flex items-center gap-1">
                                    <Switch
                                      checked={member.hasCredentialAccess || false}
                                      onCheckedChange={async (checked) => {
                                        try {
                                          await apiClient.updateMemberFeatures(member.id, checked, undefined)
                                          await fetchTeamMembers({ force: true })
                                        } catch (error: any) {
                                          console.error('Failed to update credential access:', error)
                                          alert(error.message || 'Failed to update credential access')
                                        }
                                      }}
                                      disabled={member.id === currentUserId}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {member.hasCredentialAccess ? 'Yes' : 'No'}
                                    </span>
                                  </div>
                                ) : (
                                  member.hasCredentialAccess ? (
                                    <Badge variant="default" className="bg-green-600 text-xs">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Yes
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground text-xs">
                                      No
                                    </Badge>
                                  )
                                )}
                              </td>
                              <td className="p-2">
                                {isAdmin ? (
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={member.hasSubscriptionAccess || false}
                                      onCheckedChange={async (checked) => {
                                        try {
                                          await apiClient.updateMemberFeatures(member.id, undefined, checked)
                                          await fetchTeamMembers({ force: true })
                                          // If updating own access, refresh user role to update access check
                                          if (member.id === currentUserId) {
                                            window.dispatchEvent(new CustomEvent('userPermissionsUpdated'))
                                          }
                                        } catch (error: any) {
                                          console.error('Failed to update subscription access:', error)
                                          alert(error.message || 'Failed to update subscription access')
                                        }
                                      }}
                                    />
                                    <span className="text-sm text-muted-foreground">
                                      {member.hasSubscriptionAccess ? 'Yes' : 'No'}
                                    </span>
                                  </div>
                                ) : (
                                  member.hasSubscriptionAccess ? (
                                    <Badge variant="default" className="bg-green-600">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Yes
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      No
                                    </Badge>
                                  )
                                )}
                              </td>
                              {isAdmin && (
                                <td className="p-2">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {isSuperAdmin ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openMemberForm('edit', member)}
                                        title="Edit details"
                                      >
                                        <Pencil className="h-4 w-4" />
                                        <span className="sr-only">Edit details</span>
                                      </Button>
                                    ) : (
                                      (!isSuperAdmin && normalizeRoleForSelect(member.role) === 'SUPER_ADMIN') ? null : (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => openRoleDialog(member)}
                                          title="Edit role"
                                        >
                                          <Pencil className="h-4 w-4" />
                                          <span className="sr-only">Edit role</span>
                                        </Button>
                                      )
                                    )}
                                    {normalizeRoleForSelect(member.role) === 'SUPER_ADMIN' && !isSuperAdmin ? null : (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => handleDeactivateMember(member)}
                                        disabled={
                                          member.id === currentUserId ||
                                          (!isSuperAdmin && normalizeRoleForSelect(member.role) === 'SUPER_ADMIN')
                                        }
                                        title={
                                          member.id === currentUserId
                                            ? 'You cannot delete your own account'
                                            : !isSuperAdmin && normalizeRoleForSelect(member.role) === 'SUPER_ADMIN'
                                              ? 'Only super admins can delete another super admin'
                                              : 'Delete team member'
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Delete</span>
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>
          <TabsContent value="email" className="space-y-4">
            <Dialog 
              open={isEmailDialogOpen} 
              onOpenChange={(open) => {
                setIsEmailDialogOpen(open)
                if (!open) {
                  // Navigate back to Team Overview when dialog closes
                  setActiveTab('team')
                }
                if (open && userDepartment) {
                  // Auto-fill subject when dialog opens
                  const autoFillSubject = async () => {
                    try {
                      const myTasks = await apiClient.getMyTasks()
                      const inProgressTasks = myTasks.filter((task: any) => {
                        const status = String(task.status || '').toUpperCase().trim()
                        return status === 'IN_PROGRESS'
                      })
                      const taskCount = inProgressTasks.length
                      
                      setEmailForm(prev => ({
                        ...prev,
                        subject: `${userDepartment} In-Progress Tasks Report - ${taskCount} Task${taskCount !== 1 ? 's' : ''}`
                      }))
                    } catch (error) {
                      console.error('Failed to fetch task counts:', error)
                    }
                  }
                  autoFillSubject()
                }
              }}
            >
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Compose Email</DialogTitle>
                      <DialogDescription>
                        Send an email to team members. Smart defaults include users with in-progress or recurring tasks.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="to">To *</Label>
                        <Input
                          id="to"
                          value={emailForm.to}
                          onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })}
                          placeholder="user@example.com"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Multiple emails: Separate with comma (e.g., user1@example.com, user2@example.com)
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="cc">CC</Label>
                        <Input
                          id="cc"
                          value={emailForm.cc}
                          onChange={(e) => setEmailForm({ ...emailForm, cc: e.target.value })}
                          placeholder="cc@example.com, cc2@example.com"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Multiple emails: Separate with comma
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="subject">Subject {includeDepartmentTasks ? '' : '*'}</Label>
                        <Input
                          id="subject"
                          value={emailForm.subject}
                          onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                          placeholder="Email subject"
                          disabled={isSendingEmail}
                        />
                        {includeDepartmentTasks && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Subject will be auto-generated based on department tasks
                          </p>
                        )}
                      </div>
                      {includeDepartmentTasks && (
                        <div>
                          <Label htmlFor="onLeaveMembers">Mark Members on Leave</Label>
                          <div className="mb-2">
                            <Input
                              id="leaveMemberSearch"
                              placeholder="Search members..."
                              value={leaveMemberSearch}
                              onChange={(e) => setLeaveMemberSearch(e.target.value)}
                              className="w-full"
                            />
                          </div>
                          <div className="border rounded-md p-2 max-h-48 overflow-y-auto">
                            {(() => {
                              if (isDepartmentMembersLoading && departmentMembersForLeave.length === 0) {
                                return (
                                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading department members...
                                  </div>
                                )
                              }

                              // Filter members based on search
                              const filteredMembers = departmentMembersForLeave.filter((member) => {
                                if (!leaveMemberSearch.trim()) return true
                                const searchLower = leaveMemberSearch.toLowerCase()
                                const name = (member.name || '').toLowerCase()
                                const email = (member.email || '').toLowerCase()
                                return name.includes(searchLower) || email.includes(searchLower)
                              })

                              if (filteredMembers.length === 0) {
                                return (
                                  <p className="text-sm text-muted-foreground text-center py-2">
                                    {departmentMembersForLeave.length === 0
                                      ? 'No department members found'
                                      : 'No members found matching your search'}
                                  </p>
                                )
                              }

                              return (
                                <div className="space-y-2">
                                  {filteredMembers.map((member) => {
                                    const isSelected = onLeaveMembers.includes(member.id)
                                    return (
                                      <div
                                        key={member.id}
                                        className="flex items-center gap-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                                        onClick={() => {
                                          if (isSelected) {
                                            setOnLeaveMembers(onLeaveMembers.filter((id) => id !== member.id))
                                          } else {
                                            setOnLeaveMembers([...onLeaveMembers, member.id])
                                          }
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {
                                            if (isSelected) {
                                              setOnLeaveMembers(onLeaveMembers.filter((id) => id !== member.id))
                                            } else {
                                              setOnLeaveMembers([...onLeaveMembers, member.id])
                                            }
                                          }}
                                          className="rounded"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <span className="text-sm flex-1">
                                          {member.name || member.email}
                                        </span>
                                        {isSelected && (
                                          <span className="text-xs text-red-600 font-medium">On Leave</span>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                          {onLeaveMembers.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {onLeaveMembers.length} member{onLeaveMembers.length !== 1 ? 's' : ''} marked on leave
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="includeDepartmentTasks"
                          className="rounded"
                          checked={includeDepartmentTasks}
                          onChange={async (e) => {
                            const checked = e.target.checked
                            setIncludeDepartmentTasks(checked)
                            setLeaveMemberSearch('')
                            
                            if (checked && userDepartment) {
                              let departmentMembers: TeamMember[] = []
                              try {
                                departmentMembers = await loadDepartmentMembersForLeave(userDepartment)
                                const departmentTasks = await fetchDepartmentTasksForEmail()
                                
                                const inProgressAndRecurringTasks = departmentTasks.filter((task: any) => {
                                  const status = String(task.status || '').toUpperCase().trim()
                                  return status === 'IN_PROGRESS' || status === 'RECURRING'
                                })
                                
                                const uniqueEmployees = new Set(
                                  inProgressAndRecurringTasks.flatMap((task: any) =>
                                    task.assignees?.map((a: any) => a.user?.id).filter(Boolean) || []
                                  )
                                )
                                
                                const employeeCount = uniqueEmployees.size
                                const taskCount = inProgressAndRecurringTasks.length
                                
                                setDepartmentTaskCounts({ employees: employeeCount, tasks: taskCount })
                                
                                const departmentEmails = departmentMembers
                                  .map((member: TeamMember) => member.email)
                                  .filter((email: string) => email && email.trim())
                                  .join(', ')
                                
                                setEmailForm((prev) => ({
                                  ...prev,
                                  cc: departmentEmails,
                                  subject: `${userDepartment} In-Progress & Recurring Tasks Report - ${employeeCount} Employee${employeeCount !== 1 ? 's' : ''}, ${taskCount} Task${taskCount !== 1 ? 's' : ''}`,
                                }))
                              } catch (error) {
                                console.error('Failed to fetch department task counts:', error)
                                setDepartmentTaskCounts(null)
                                
                                let fallbackMembers = departmentMembers
                                if (fallbackMembers.length === 0 && userDepartment) {
                                  try {
                                    fallbackMembers = await loadDepartmentMembersForLeave(userDepartment)
                                  } catch {
                                    fallbackMembers = []
                                  }
                                }

                                const fallbackEmails = fallbackMembers
                                  .map((member: TeamMember) => member.email)
                                  .filter((email: string) => email && email.trim())
                                  .join(', ')

                                setEmailForm((prev) => ({
                                  ...prev,
                                  cc: fallbackEmails,
                                  subject: `${userDepartment} In-Progress & Recurring Tasks Report`,
                                }))
                              }
                            } else if (!checked && userDepartment) {
                              setDepartmentTaskCounts(null)
                              applyDepartmentMembersForLeave([])
                              try {
                                const myTasks = await apiClient.getMyTasks()
                                const inProgressAndRecurringTasks = myTasks.filter((task: any) => {
                                  const status = String(task.status || '').toUpperCase().trim()
                                  return status === 'IN_PROGRESS' || status === 'RECURRING'
                                })
                                const taskCount = inProgressAndRecurringTasks.length
                                
                                setEmailForm((prev) => ({
                                  ...prev,
                                  cc: '',
                                  subject: `${userDepartment} In-Progress & Recurring Tasks Report - ${taskCount} Task${taskCount !== 1 ? 's' : ''}`,
                                }))
                              } catch (error) {
                                console.error('Failed to fetch task counts:', error)
                                setEmailForm((prev) => ({
                                  ...prev,
                                  cc: '',
                                }))
                              }
                            } else {
                              setDepartmentTaskCounts(null)
                              applyDepartmentMembersForLeave([])
                            }
                          }}
                          disabled={isSendingEmail}
                        />
                        <Label htmlFor="includeDepartmentTasks" className="text-sm" style={{ color: '#006e90' }}>
                          Select the check box to send all team members tasks(In Progress & Recurring)
                        </Label>
                      </div>
                      <div className="flex flex-col gap-2">
                        {isSendingEmail && (
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => {
                            setIsEmailDialogOpen(false)
                            setActiveTab('team')
                          }} disabled={isSendingEmail}>
                            Cancel
                          </Button>
                          <Button onClick={handleSendEmail} disabled={isSendingEmail}>
                            {isSendingEmail ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Sending Email...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                Send Email
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
          </TabsContent>
        </Tabs>
        <Dialog open={isRoleDialogOpen} onOpenChange={handleRoleDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Team Member Role</DialogTitle>
              <DialogDescription>
                Update the role for{' '}
                {selectedMemberForRole?.name || selectedMemberForRole?.email || 'the selected team member'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="memberRoleSelect">Role</Label>
                <Select
                  value={roleSelection}
                  onValueChange={(value) => setRoleSelection(value as MemberRoleOption)}
                  disabled={roleSaving}
                >
                  <SelectTrigger id="memberRoleSelect">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    {isSuperAdmin && (
                      <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleRoleDialogOpenChange(false)} disabled={roleSaving}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateRole} disabled={roleSaving}>
                  {roleSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {isSuperAdmin && (
          <Dialog
            open={isMemberFormOpen}
            onOpenChange={(open) => {
              if (!open) {
                closeMemberForm()
              } else {
                setIsMemberFormOpen(true)
              }
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{memberFormMode === 'create' ? 'Add New Employee' : 'Edit Team Member'}</DialogTitle>
                <DialogDescription>
                  {memberFormMode === 'create'
                    ? 'Create a new workspace member and assign their role and permissions.'
                    : 'Update the selected member’s profile, role, and permissions.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {memberFormError && (
                  <div className="rounded-md bg-destructive/10 border border-destructive px-3 py-2 text-sm text-destructive">
                    {memberFormError}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="memberName">Full Name</Label>
                    <Input
                      id="memberName"
                      value={memberFormData.name}
                      onChange={(e) => setMemberFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter full name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="memberEmail">Email *</Label>
                    <Input
                      id="memberEmail"
                      type="email"
                      value={memberFormData.email}
                      onChange={(e) => setMemberFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="user@example.com"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="memberPassword">
                    {memberFormMode === 'create' ? 'Password *' : 'Reset Password (optional)'}
                  </Label>
                  <Input
                    id="memberPassword"
                    type="password"
                    value={memberFormData.password}
                    onChange={(e) => setMemberFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={memberFormMode === 'create' ? 'Minimum 6 characters' : 'Leave blank to keep existing'}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="memberDepartment">Department</Label>
                    <Select
                      value={memberFormData.department || NO_DEPARTMENT_VALUE}
                      onValueChange={(value) =>
                        setMemberFormData(prev => ({ ...prev, department: value === NO_DEPARTMENT_VALUE ? '' : value }))
                      }
                    >
                      <SelectTrigger id="memberDepartment">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectItem value={NO_DEPARTMENT_VALUE}>No Department</SelectItem>
                        {Array.from(new Map(departments.map(dept => [dept.name.toLowerCase(), dept])).values())
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((dept) => (
                            <SelectItem key={`${dept.name}-${dept.id ?? 'legacy'}`} value={dept.name}>
                              {dept.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="memberCompany">Company</Label>
                    <Input
                      id="memberCompany"
                      value={memberFormData.company}
                      onChange={(e) => setMemberFormData(prev => ({ ...prev, company: e.target.value }))}
                      placeholder="Company name"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="memberEmployeeId">Employee ID</Label>
                    <Input
                      id="memberEmployeeId"
                      value={memberFormData.employeeId}
                      onChange={(e) => setMemberFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                      placeholder="ECOSIND0178"
                    />
                  </div>
                  <div>
                    <Label htmlFor="memberRole">Role</Label>
                    <Select
                      value={memberFormData.role}
                      onValueChange={(value) => setMemberFormData(prev => ({ ...prev, role: value as MemberRoleOption }))}
                    >
                      <SelectTrigger id="memberRole">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USER">User</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">Credential Access</p>
                      <p className="text-xs text-muted-foreground">Allow access to credential manager</p>
                    </div>
                    <Switch
                      checked={memberFormData.hasCredentialAccess}
                      onCheckedChange={(checked) =>
                        setMemberFormData(prev => ({ ...prev, hasCredentialAccess: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">Subscription Access</p>
                      <p className="text-xs text-muted-foreground">Allow access to subscription manager</p>
                    </div>
                    <Switch
                      checked={memberFormData.hasSubscriptionAccess}
                      onCheckedChange={(checked) =>
                        setMemberFormData(prev => ({ ...prev, hasSubscriptionAccess: checked }))
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={closeMemberForm} disabled={isSavingMember}>
                    Cancel
                  </Button>
                  <Button onClick={handleMemberFormSubmit} disabled={isSavingMember}>
                    {isSavingMember && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {memberFormMode === 'create' ? 'Add Member' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {isSuperAdmin && (
          <Dialog open={isDepartmentManagerOpen} onOpenChange={setIsDepartmentManagerOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Manage Departments</DialogTitle>
                <DialogDescription>View, add, or delete departments.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {departmentActionError && (
                  <div className="rounded-md bg-destructive/10 border border-destructive px-3 py-2 text-sm text-destructive">
                    {departmentActionError}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="New department name"
                    value={newDepartmentName}
                    onChange={(e) => setNewDepartmentName(e.target.value)}
                    disabled={isSavingDepartment}
                  />
                  <Button onClick={handleAddDepartment} disabled={isSavingDepartment}>
                    {isSavingDepartment && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add
                  </Button>
                </div>
                <div className="border rounded-md max-h-64 overflow-auto">
                  {departments.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No departments yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {Array.from(new Map(departments.map(dept => [dept.name.toLowerCase(), dept])).values())
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((dept) => {
                        const members = departmentMembersMap[dept.name.toLowerCase()] || []
                        const sampleMembers = members.slice(0, 4)
                        const hasMore = members.length > sampleMembers.length
                        const isEditing = editingDepartmentId === dept.id
                        const actualUserCount = members.length || dept.userCount || 0
                        const actualProjectCount = dept.projectCount || 0
                        const canDelete = dept.id && actualUserCount === 0 && actualProjectCount === 0
                        return (
                          <li key={`${dept.name}-${dept.id ?? 'legacy'}`} className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                {isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={editingDepartmentName}
                                      onChange={(e) => setEditingDepartmentName(e.target.value)}
                                      className="h-8"
                                      autoFocus
                                    />
                                    <Button size="sm" onClick={handleSaveEditDepartment} disabled={savingDepartmentEdit}>
                                      {savingDepartmentEdit && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                                      Save
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={handleCancelEditDepartment} disabled={savingDepartmentEdit}>
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <p className="font-medium">{dept.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Users: {actualUserCount} · Projects: {actualProjectCount}
                                      {dept.isLegacy && ' · legacy'}
                                    </p>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {!dept.id && (
                                  <Badge variant="outline" className="text-xs">Legacy</Badge>
                                )}
                                {dept.id && !isEditing && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleStartEditDepartment(dept)}
                                    title="Edit department name"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive"
                                  disabled={!canDelete || deletingDepartmentId === dept.id}
                                  onClick={() => handleDeleteDepartment(dept)}
                                  title={
                                    !dept.id
                                      ? 'Cannot delete legacy department'
                                      : !canDelete
                                        ? `Cannot delete: ${actualUserCount} user(s), ${actualProjectCount} project(s)`
                                        : 'Delete department'
                                  }
                                >
                                  {deletingDepartmentId === dept.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <div className="bg-muted/40 rounded-md p-2">
                              {members.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No users in this department yet.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {sampleMembers.map((m) => (
                                    <Badge key={m.id} variant="outline" className="text-xs">
                                      {m.name || m.email}
                                    </Badge>
                                  ))}
                                  {hasMore && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{members.length - sampleMembers.length} more
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </MainLayout>
  )
}

