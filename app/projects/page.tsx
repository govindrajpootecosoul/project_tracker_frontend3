'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Users, FolderKanban, CheckCircle2, Calendar, List, Grid3x3, LayoutGrid, GanttChart, UserPlus, Mail, Loader2, MoreVertical } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend } from 'recharts'
import { format } from 'date-fns'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Project {
  id: string
  name: string
  description?: string
  brand?: string
  company?: string
  department?: string
  status: string
  createdAt: string
  members: {
    id?: string
    role?: string
    user: { id: string; name?: string; email: string }
  }[]
  tasks?: { id: string; title: string; dueDate?: string; status: string }[]
  _count?: { tasks: number }
}

type ViewMode = 'list' | 'grid' | 'kanban' | 'gantt'

const PROJECTS_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
let projectsCache: Project[] | null = null
let projectsCacheTimestamp = 0

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>(() => projectsCache ?? [])
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    brand: '',
    company: '',
    status: 'ACTIVE',
  })
  const [isRefreshing, setIsRefreshing] = useState<boolean>(!projectsCache)
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [departments, setDepartments] = useState<string[]>([])
  const [isCollabDialogOpen, setIsCollabDialogOpen] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [allMembers, setAllMembers] = useState<{ id: string; name?: string; email: string }[]>([])
  const [isSubmittingCollab, setIsSubmittingCollab] = useState(false)
  const [collabSummary, setCollabSummary] = useState<any>(null)
  const [isCollabSummaryDialogOpen, setIsCollabSummaryDialogOpen] = useState(false)
  const [collabDialogTab, setCollabDialogTab] = useState<'invite' | 'manage'>('invite')
  const [expandedManageProjectId, setExpandedManageProjectId] = useState<string | null>(null)
  const [removingMemberKey, setRemovingMemberKey] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('USER')
  const [userDepartment, setUserDepartment] = useState<string>('')
  const [collabDepartmentFilter, setCollabDepartmentFilter] = useState<string>('all')
  const [collabProjectDepartmentFilter, setCollabProjectDepartmentFilter] = useState<string>('all')
  const [manualEmail, setManualEmail] = useState<string>('')
  const [manualEmails, setManualEmails] = useState<string[]>([])
  const [openProjectActionId, setOpenProjectActionId] = useState<string | null>(null)
  const [brandInputMode, setBrandInputMode] = useState<'select' | 'custom'>('select')
  const [companyInputMode, setCompanyInputMode] = useState<'select' | 'custom'>('select')

  const fetchProjects = useCallback(async (useCache: boolean = true) => {
    const cacheIsValid =
      useCache &&
      projectsCache &&
      Date.now() - projectsCacheTimestamp < PROJECTS_CACHE_DURATION

    if (cacheIsValid) {
      setProjects(projectsCache as Project[])
      setIsRefreshing(true)
      apiClient
        .getProjects(false)
        .then((data) => {
          projectsCache = data as Project[]
          projectsCacheTimestamp = Date.now()
          setProjects(projectsCache)
        })
        .catch((error: any) => {
          console.error('Failed to refresh projects:', error)
        })
        .finally(() => setIsRefreshing(false))
      return
    }

    try {
      setIsRefreshing(true)
      const data = await apiClient.getProjects(useCache)
      projectsCache = data as Project[]
      projectsCacheTimestamp = Date.now()
      setProjects(projectsCache)
    } catch (error: any) {
      console.error('Failed to fetch projects:', error)
      alert(error.message || 'Failed to fetch projects. Please try again.')
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  const fetchDepartments = useCallback(async () => {
    try {
      const departmentsData = await apiClient.getDepartments()
      setDepartments(departmentsData as string[])
    } catch (error) {
      console.error('Failed to fetch departments:', error)
    }
  }, [])

  const fetchTeamMembers = useCallback(async (deptFilter?: string) => {
    try {
      const params: { department?: string } = {}
      const isSuperAdminUser = userRole.toUpperCase() === 'SUPER_ADMIN'
      if (isSuperAdminUser && deptFilter && deptFilter !== 'all') {
        params.department = deptFilter
      }
      const membersData = await apiClient.getTeamMembers(params)
      setAllMembers(membersData as { id: string; name?: string; email: string; department?: string }[])
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    }
  }, [userRole])

  const fetchUserRole = useCallback(async () => {
    try {
      const user = await apiClient.getUserRole()
      setUserRole(user.role || 'USER')
      setUserDepartment(user.department || '')
    } catch (error) {
      console.error('Failed to fetch user role:', error)
    }
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.push('/auth/signin')
      return
    }

    fetchProjects(true)
    fetchDepartments()
    fetchTeamMembers()
    fetchUserRole()
  }, [router, fetchProjects, fetchDepartments, fetchTeamMembers, fetchUserRole])

  const handleInviteMember = async (projectId: string, email: string) => {
    try {
      // TODO: Implement invite API endpoint
      // For now, just show success message
      alert(`Invitation sent to ${email}`)
      setIsInviteDialogOpen(false)
      setInviteEmail('')
      setSelectedProject(null)
      await fetchProjects(false)
    } catch (error) {
      console.error('Failed to invite member:', error)
      alert('Failed to invite member')
    }
  }

  const openInviteDialog = (project: Project) => {
    setSelectedProject(project)
    setInviteEmail('')
    setIsInviteDialogOpen(true)
  }

  const handleCreateProject = async () => {
    try {
      await apiClient.createProject(formData)
      setIsDialogOpen(false)
      resetForm()
      await fetchProjects(false)
    } catch (error) {
      console.error('Failed to create project:', error)
      alert('Failed to create project')
    }
  }

  const handleUpdateProject = async () => {
    if (!editingProject) return
    try {
      await apiClient.updateProject(editingProject.id, formData)
      setIsDialogOpen(false)
      setEditingProject(null)
      resetForm()
      await fetchProjects(false)
    } catch (error) {
      console.error('Failed to update project:', error)
      alert('Failed to update project')
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return
    try {
      await apiClient.deleteProject(projectId)
      await fetchProjects(false)
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Failed to delete project')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      brand: '',
      company: '',
      status: 'ACTIVE',
    })
    setEditingProject(null)
  }

  const openEditDialog = (project: Project) => {
    setEditingProject(project)
    setFormData({
      name: project.name,
      description: project.description || '',
      brand: project.brand || '',
      company: project.company || '',
      status: project.status,
    })
    setIsDialogOpen(true)
  }

  const handleOpenProjectTasks = useCallback((project: Project) => {
    const params = new URLSearchParams()
    params.set('projectId', project.id)
    if (project.name) {
      params.set('projectName', project.name)
    }
    router.push(`/tasks?${params.toString()}`)
  }, [router])

  const toggleProjectSelection = useCallback((projectId: string) => {
    setSelectedProjectIds(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }, [])

  const toggleMemberSelection = useCallback((memberId: string) => {
    setSelectedMemberIds(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    )
  }, [])

  const resetCollabState = useCallback(() => {
    setSelectedProjectIds([])
    setSelectedMemberIds([])
    setMemberSearch('')
    setManualEmail('')
    setManualEmails([])
    setCollabDepartmentFilter('all')
    setCollabProjectDepartmentFilter('all')
  }, [])

  const handleAddManualEmail = useCallback(() => {
    if (!manualEmail.trim()) return
    const email = manualEmail.trim().toLowerCase()
    if (!email.includes('@')) {
      alert('Please enter a valid email address')
      return
    }
    if (manualEmails.includes(email)) {
      alert('This email is already added')
      return
    }
    setManualEmails(prev => [...prev, email])
    setManualEmail('')
  }, [manualEmail, manualEmails])

  const handleRemoveManualEmail = useCallback((email: string) => {
    setManualEmails(prev => prev.filter(e => e !== email))
  }, [])

  const handleCollabSubmit = useCallback(async () => {
    if (selectedProjectIds.length === 0) {
      alert('Please select at least one project.')
      return
    }
    if (selectedMemberIds.length === 0 && manualEmails.length === 0) {
      alert('Please select at least one member or add an email address.')
      return
    }

    setIsSubmittingCollab(true)
    try {
      const isAdminUser = userRole.toUpperCase() === 'ADMIN' || userRole.toUpperCase() === 'SUPER_ADMIN'
      const response = await apiClient.requestProjectCollaboration({
        projectIds: selectedProjectIds,
        memberIds: selectedMemberIds,
        manualEmails: isAdminUser ? manualEmails : [],
        role: 'member',
      })
      const summary = (response as { summary?: any })?.summary
      setCollabSummary(summary || null)
      setIsCollabSummaryDialogOpen(true)
      setIsCollabDialogOpen(false)
      resetCollabState()
      setManualEmails([])
      await fetchProjects(false)
    } catch (error: any) {
      console.error('Failed to send collaboration requests:', error)
      // Extract error message - handle both Error objects and API response errors
      const errorMessage = error?.message || error?.error || 'Failed to send collaboration requests. Please try again.'
      alert(errorMessage)
    } finally {
      setIsSubmittingCollab(false)
    }
  }, [selectedProjectIds, selectedMemberIds, manualEmails, userRole, fetchProjects, resetCollabState])

  const handleCollabDialogChange = useCallback(
    (open: boolean) => {
      setIsCollabDialogOpen(open)
      if (!open) {
        resetCollabState()
        setCollabDialogTab('invite')
      }
    },
    [resetCollabState],
  )

  const toggleManageProject = useCallback((projectId: string) => {
    setExpandedManageProjectId(prev => (prev === projectId ? null : projectId))
  }, [])

  const handleRemoveMember = useCallback(async (projectId: string, memberId: string) => {
    const memberKey = `${projectId}:${memberId}`
    setRemovingMemberKey(memberKey)
    try {
      await apiClient.removeProjectMember(projectId, memberId)
      await fetchProjects(false)
    } catch (error: any) {
      console.error('Failed to remove member:', error)
      const message = error?.message || 'Failed to remove member'
      alert(message)
    } finally {
      setRemovingMemberKey(null)
    }
  }, [fetchProjects])

  const matchesDepartmentFilter = useCallback((project: Project) => {
    if (departmentFilter === 'all') return true
    const projectDepartment = project.department?.trim().toLowerCase()
    const filterDepartment = departmentFilter.trim().toLowerCase()
    return projectDepartment === filterDepartment
  }, [departmentFilter])

  const matchesSearchQuery = useCallback((project: Project) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      project.name.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query) ||
      project.brand?.toLowerCase().includes(query) ||
      project.company?.toLowerCase().includes(query) ||
      project.department?.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const filteredProjects = useMemo(() => {
    return projects.filter(project => 
      matchesSearchQuery(project) && matchesDepartmentFilter(project)
    )
  }, [projects, matchesSearchQuery, matchesDepartmentFilter])

  const isSuperAdmin = userRole.toUpperCase() === 'SUPER_ADMIN'
  const isAdmin = userRole.toUpperCase() === 'ADMIN' || isSuperAdmin

  // Fetch team members when dialog opens or department filter changes (for superadmin)
  useEffect(() => {
    if (isCollabDialogOpen) {
      if (isSuperAdmin) {
        fetchTeamMembers(collabDepartmentFilter)
      } else {
        fetchTeamMembers()
      }
    }
  }, [collabDepartmentFilter, isCollabDialogOpen, isSuperAdmin, fetchTeamMembers])

  const filteredMembers = useMemo(() => {
    let members = allMembers
    
    // Filter by search query
    if (memberSearch.trim()) {
      const query = memberSearch.toLowerCase()
      members = members.filter(member => 
        member.name?.toLowerCase().includes(query) || 
        member.email.toLowerCase().includes(query)
      )
    }
    
    return members
  }, [allMembers, memberSearch])

  // Filter projects for collaboration dialog by department
  const filteredProjectsForCollab = useMemo(() => {
    if (collabProjectDepartmentFilter === 'all') {
      return filteredProjects
    }
    const normalizedFilter = collabProjectDepartmentFilter.trim().toLowerCase()
    return filteredProjects.filter(project => {
      const projectDept = project.department?.trim().toLowerCase() || ''
      return projectDept === normalizedFilter
    })
  }, [filteredProjects, collabProjectDepartmentFilter])

  const handleOpenCollab = useCallback(() => {
    if (filteredProjects.length === 0) {
      alert('No projects available for collaboration.')
      return
    }
    setCollabDialogTab('invite')
    setIsCollabDialogOpen(true)
  }, [filteredProjects.length])

  const stats = {
    activeProjects: filteredProjects.filter(p => p.status === 'ACTIVE').length,
    tasksCompleted: 0, // Would need to fetch from tasks
    membersCollaborating: new Set(filteredProjects.flatMap(p => p.members.map(m => m.user.id))).size,
  }

  const tasksByProjectData = filteredProjects.map(p => ({
    name: p.name,
    tasks: p._count?.tasks || 0,
  }))

  const renderProjectActions = (project: Project) => {
    const actionItemClass =
      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-black hover:text-white'

    return (
      <Popover
        open={openProjectActionId === project.id}
        onOpenChange={(open) => setOpenProjectActionId(open ? project.id : null)}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="Project actions"
            className="text-muted-foreground hover:bg-black hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="end" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Project Options</div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                openInviteDialog(project)
                setOpenProjectActionId(null)
              }}
              className={actionItemClass}
            >
              <UserPlus className="h-4 w-4" />
              Invite Member
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                openEditDialog(project)
                setOpenProjectActionId(null)
              }}
              className={actionItemClass}
            >
              <Edit className="h-4 w-4" />
              Edit Project
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteProject(project.id)
                setOpenProjectActionId(null)
              }}
              className={`${actionItemClass} text-red-600`}
            >
              <Trash2 className="h-4 w-4" />
              Delete Project
            </button>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  const ProjectCard = ({ 
    project, 
    onEdit, 
    onDelete, 
    onInvite,
    onViewTasks,
  }: { 
    project: Project
    onEdit: (project: Project) => void
    onDelete: (projectId: string) => void
    onInvite: (project: Project) => void
    onViewTasks: (project: Project) => void
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Card
        className="hover:shadow-lg transition-shadow h-full flex flex-col cursor-pointer"
        onClick={() => onViewTasks(project)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onViewTasks(project)
          }
        }}
      >
        <CardHeader className="flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg line-clamp-2">{project.name}</CardTitle>
              {project.description && (
                <CardDescription className="mt-1 line-clamp-2">{project.description}</CardDescription>
              )}
            </div>
            <div className="ml-2">{renderProjectActions(project)}</div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
            <Badge 
              variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}
              className={project.status === 'ACTIVE' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
            >
              {project.status}
            </Badge>
            {project.brand && (
              <Badge variant="outline">
                {project.brand}
              </Badge>
            )}
            {project.company && (
              <Badge variant="outline">
                {project.company}
              </Badge>
            )}
            {project.department && (
              <Badge variant="outline">
                Dept: {project.department}
              </Badge>
            )}
            {project._count && (
              <Badge variant="outline">
                {project._count.tasks} tasks
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm mt-auto">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-pointer">
                    <div className="flex -space-x-2">
                      {project.members.slice(0, 3).map((member) => (
                        <Avatar key={member.user.id} className="w-8 h-8 border-2 border-background">
                          <AvatarFallback className="text-xs">
                            {member.user.name?.[0] || member.user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    {project.members.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{project.members.length - 3}</span>
                    )}
                    <span className="text-muted-foreground">{project.members.length} members</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-semibold">Active Members:</p>
                    {project.members.map((member) => (
                      <p key={member.user.id} className="text-sm">
                        {member.user.name || member.user.email}
                      </p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )

  const brandOptions = useMemo(() => {
    const set = new Set<string>()
    projects.forEach((project) => {
      if (project.brand) {
        set.add(project.brand.trim())
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [projects])

  const companyOptions = useMemo(() => {
    const set = new Set<string>()
    projects.forEach((project) => {
      if (project.company) {
        set.add(project.company.trim())
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [projects])

  useEffect(() => {
    if (formData.brand && !brandOptions.includes(formData.brand)) {
      setBrandInputMode('custom')
    } else if (!formData.brand) {
      setBrandInputMode('select')
    }
  }, [formData.brand, brandOptions])

  useEffect(() => {
    if (formData.company && !companyOptions.includes(formData.company)) {
      setCompanyInputMode('custom')
    } else if (!formData.company) {
      setCompanyInputMode('select')
    }
  }, [formData.company, companyOptions])

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">Manage your projects and collaboration</p>
            {isRefreshing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Refreshing projects…</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleOpenCollab}>
              <Users className="h-4 w-4 mr-2" />
              Collab
            </Button>
            <Button onClick={() => {
              resetForm()
              setIsDialogOpen(true)
            }}>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingProject ? 'Edit Project' : 'Create New Project'}</DialogTitle>
                <DialogDescription>
                  {editingProject ? 'Update the project details below.' : 'Fill in the details to create a new project.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Project name"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Project description"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    {brandInputMode === 'select' ? (
                      <Select
                        value={formData.brand || 'none'}
                        onValueChange={(value) => {
                          if (value === '__custom__') {
                            setBrandInputMode('custom')
                            setFormData((prev) => ({ ...prev, brand: '' }))
                          } else {
                            setFormData((prev) => ({ ...prev, brand: value === 'none' ? '' : value }))
                          }
                        }}
                      >
                        <SelectTrigger id="brand">
                          <SelectValue placeholder="Select a brand" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Brand</SelectItem>
                          {brandOptions.map((brand) => (
                            <SelectItem key={brand} value={brand}>
                              {brand}
                            </SelectItem>
                          ))}
                          <SelectItem value="__custom__">+ Add new brand</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          id="brand"
                          value={formData.brand}
                          onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                          placeholder="Enter brand name"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Brand not listed? Add it here.</span>
                          {brandOptions.length > 0 && (
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => setBrandInputMode('select')}
                            >
                              Select existing
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="company">Company</Label>
                    {companyInputMode === 'select' ? (
                      <Select
                        value={formData.company || 'none'}
                        onValueChange={(value) => {
                          if (value === '__custom__') {
                            setCompanyInputMode('custom')
                            setFormData((prev) => ({ ...prev, company: '' }))
                          } else {
                            setFormData((prev) => ({ ...prev, company: value === 'none' ? '' : value }))
                          }
                        }}
                      >
                        <SelectTrigger id="company">
                          <SelectValue placeholder="Select a company" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Company</SelectItem>
                          {companyOptions.map((company) => (
                            <SelectItem key={company} value={company}>
                              {company}
                            </SelectItem>
                          ))}
                          <SelectItem value="__custom__">+ Add new company</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          id="company"
                          value={formData.company}
                          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                          placeholder="Enter company name"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Company not listed? Add it here.</span>
                          {companyOptions.length > 0 && (
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => setCompanyInputMode('select')}
                            >
                              Select existing
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={editingProject ? handleUpdateProject : handleCreateProject}>
                    {editingProject ? 'Update' : 'Create'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeProjects}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.tasksCompleted}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Members Collaborating</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.membersCollaborating}</div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline Chart */}
        <Card className="bg-transparent border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle>Tasks by Project</CardTitle>
            <CardDescription>Number of tasks per project</CardDescription>
          </CardHeader>
          <CardContent className="bg-transparent p-0 [&_.recharts-bar-rectangle]:hover:!filter-none [&_.recharts-bar-rectangle]:hover:!drop-shadow-none [&_.recharts-wrapper]:!bg-transparent [&_.recharts-surface]:!bg-transparent [&_.recharts-cartesian-grid]:!bg-transparent [&_svg]:!bg-transparent">
            <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={tasksByProjectData}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar 
                    dataKey="tasks" 
                    fill="#8884d8"
                    activeBar={false}
                  />
                </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* View Type and Search Bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <Label htmlFor="department-filter-projects" className="text-sm">Department:</Label>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger id="department-filter-projects" className="w-48">
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
            <Button
              variant={viewMode === 'gantt' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('gantt')}
            >
              <GanttChart className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Manage Projects Section */}
        <div className="space-y-4">
            {filteredProjects.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {projects.length === 0 
                    ? 'No projects found. Create your first project!'
                    : 'No projects match your filters.'}
                </CardContent>
              </Card>
            ) : (
              <>
                {viewMode === 'gantt' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Project Timeline (Gantt Chart)</CardTitle>
                      <CardDescription>Task deadlines across projects</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {filteredProjects.map((project) => (
                          <div key={project.id} className="border-l-4 border-primary pl-4">
                            <h3 className="font-semibold mb-2">{project.name}</h3>
                            <div className="space-y-2 ml-4">
                              {project._count && project._count.tasks > 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  {project._count.tasks} task{project._count.tasks !== 1 ? 's' : ''} in this project
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">No tasks</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {viewMode === 'list' && (
                  <Card>
                    <CardContent className="p-0">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-4">Project Name</th>
                            <th className="text-left p-4">Status</th>
                            <th className="text-left p-4">Members</th>
                            <th className="text-left p-4">Tasks</th>
                            <th className="text-left p-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProjects.map((project) => (
                            <tr
                              key={project.id}
                              className="border-b hover:bg-accent/50 cursor-pointer"
                              onClick={() => handleOpenProjectTasks(project)}
                            >
                              <td className="p-4">
                                <div>
                                  <div className="font-medium">{project.name}</div>
                                  {project.description && (
                                    <div className="text-sm text-muted-foreground">{project.description}</div>
                                  )}
                                  {project.department && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Department: {project.department}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <Badge 
                                  variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}
                                  className={project.status === 'ACTIVE' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
                                >
                                  {project.status}
                                </Badge>
                              </td>
                              <td className="p-4">
                                <TooltipProvider>
                                  <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2">
                                      {project.members.slice(0, 3).map((member) => (
                                        <Tooltip key={member.user.id}>
                                          <TooltipTrigger asChild>
                                            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium border-2 border-background">
                                              {member.user.name?.[0] || member.user.email[0].toUpperCase()}
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{member.user.name || member.user.email}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      ))}
                                    </div>
                                    {project.members.length > 3 && (
                                      <span className="text-sm text-muted-foreground">
                                        +{project.members.length - 3}
                                      </span>
                                    )}
                                  </div>
                                </TooltipProvider>
                              </td>
                              <td className="p-4">{project._count?.tasks || 0}</td>
                              <td className="p-4">
                                <div onClick={(e) => e.stopPropagation()}>{renderProjectActions(project)}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}

                {viewMode === 'kanban' && (
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'].map((status) => {
                      const statusProjects = filteredProjects.filter(p => p.status === status)
                      return (
                        <div key={status} className="flex-shrink-0 w-80">
                          <div className="bg-muted rounded-lg p-3 mb-2">
                            <h3 className="font-semibold">{status} ({statusProjects.length})</h3>
                          </div>
                          <div className="space-y-2 min-h-[400px]">
                            {statusProjects.map((project) => (
                              <div key={project.id} className="h-full">
                                <ProjectCard
                                  project={project}
                                  onEdit={openEditDialog}
                                  onDelete={handleDeleteProject}
                                  onInvite={openInviteDialog}
                                  onViewTasks={handleOpenProjectTasks}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {viewMode === 'grid' && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
                    {filteredProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onEdit={openEditDialog}
                        onDelete={handleDeleteProject}
                        onInvite={openInviteDialog}
                        onViewTasks={handleOpenProjectTasks}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
        </div>

        {/* Invite Member Dialog */}
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Member to {selectedProject?.name}</DialogTitle>
              <DialogDescription>
                Enter an email address to invite a member (internal or external user) to collaborate on this project.
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
                  Enter email address to invite (internal or external user)
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedProject && inviteEmail) {
                      handleInviteMember(selectedProject.id, inviteEmail)
                    }
                  }}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invitation
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Collaboration Dialog */}
        <Dialog open={isCollabDialogOpen} onOpenChange={handleCollabDialogChange}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Project Collaboration</DialogTitle>
              <DialogDescription>
                Select multiple projects and team members to collaborate. Members will be added to the selected projects.
              </DialogDescription>
            </DialogHeader>
            <Tabs value={collabDialogTab} onValueChange={(v) => setCollabDialogTab(v as 'invite' | 'manage')}>
              <TabsList>
                <TabsTrigger value="invite">Invite</TabsTrigger>
                <TabsTrigger value="manage">Manage Collaborations</TabsTrigger>
              </TabsList>
              <TabsContent value="invite" className="mt-4 space-y-4">
                {filteredProjectsForCollab.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground border rounded-lg bg-muted/40">
                    {filteredProjects.length === 0 
                      ? 'There are no projects available right now.'
                      : 'No projects match the selected department filter.'}
                  </div>
                ) : (
                  <>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-sm font-medium">Projects</Label>
                          <span className="text-xs text-muted-foreground">{selectedProjectIds.length} selected</span>
                        </div>
                        <div className="mb-3">
                          <Label htmlFor="collab-project-dept-filter" className="text-xs text-muted-foreground mb-1 block">Department:</Label>
                          <Select value={collabProjectDepartmentFilter} onValueChange={setCollabProjectDepartmentFilter}>
                            <SelectTrigger id="collab-project-dept-filter" className="w-full">
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
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                          {filteredProjectsForCollab.map((project) => {
                            const isSelected = selectedProjectIds.includes(project.id)
                            return (
                              <label
                                key={project.id}
                                className={`flex gap-3 rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
                                  isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 rounded border-muted-foreground"
                                  checked={isSelected}
                                  onChange={() => toggleProjectSelection(project.id)}
                                />
                                <div className="flex-1">
                                  <p className="font-medium">{project.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {project.company || project.brand || 'No company'}
                                    {project.department && ` • ${project.department}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {project.members.length} member{project.members.length === 1 ? '' : 's'} currently
                                  </p>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-sm font-medium">Members</Label>
                          <span className="text-xs text-muted-foreground">{selectedMemberIds.length} selected</span>
                        </div>
                        {isSuperAdmin && (
                          <div className="mb-3">
                            <Label htmlFor="collab-dept-filter" className="text-xs text-muted-foreground mb-1 block">Department:</Label>
                            <Select value={collabDepartmentFilter} onValueChange={setCollabDepartmentFilter}>
                              <SelectTrigger id="collab-dept-filter" className="w-full">
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
                        )}
                        <Input
                          placeholder="Search team..."
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          className="mb-3"
                        />
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                          {filteredMembers.length === 0 ? (
                            <div className="text-sm text-muted-foreground p-3 border rounded-lg">No members found.</div>
                          ) : (
                            filteredMembers.map((member) => {
                              const isSelected = selectedMemberIds.includes(member.id)
                              return (
                                <label
                                  key={member.id}
                                  className={`flex gap-3 rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
                                    isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 rounded border-muted-foreground"
                                    checked={isSelected}
                                    onChange={() => toggleMemberSelection(member.id)}
                                  />
                                  <div>
                                    <p className="font-medium">{member.name || member.email}</p>
                                    <p className="text-xs text-muted-foreground">{member.email}</p>
                                  </div>
                                </label>
                              )
                            })
                          )}
                        </div>
                        {isAdmin && (
                          <div className="mt-4 pt-4 border-t">
                            <Label className="text-sm font-medium mb-2 block">Add Email Manually (Other Department)</Label>
                            <div className="flex gap-2 mb-2">
                              <Input
                                placeholder="Enter email address..."
                                value={manualEmail}
                                onChange={(e) => setManualEmail(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleAddManualEmail()
                                  }
                                }}
                                className="flex-1"
                              />
                              <Button onClick={handleAddManualEmail} variant="outline" size="sm">
                                Add
                              </Button>
                            </div>
                            {manualEmails.length > 0 && (
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {manualEmails.map((email) => (
                                  <div key={email} className="flex items-center justify-between rounded border p-2 text-sm bg-muted/40">
                                    <span>{email}</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => handleRemoveManualEmail(email)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              Add email addresses for employees from other departments
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <p className="text-xs text-muted-foreground">
                        Selected projects: {selectedProjectIds.length} · Selected members: {selectedMemberIds.length}
                        {manualEmails.length > 0 && ` · Manual emails: ${manualEmails.length}`}
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => handleCollabDialogChange(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCollabSubmit}
                          disabled={
                            selectedProjectIds.length === 0 || selectedMemberIds.length === 0 || isSubmittingCollab
                          }
                        >
                          {isSubmittingCollab ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Mail className="mr-2 h-4 w-4" />
                              Send Collaboration
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
              <TabsContent value="manage" className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground">Total Projects</p>
                    <p className="text-2xl font-semibold">{filteredProjects.length}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground">Total Collaborators</p>
                    <p className="text-2xl font-semibold">
                      {new Set(filteredProjects.flatMap(p => p.members.map(m => m.user.id))).size}
                    </p>
                  </div>
                </div>
                {filteredProjects.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground border rounded-lg bg-muted/40">
                    No projects available to manage.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {filteredProjects.map((project) => {
                      const memberCount = project.members.length
                      const isExpanded = expandedManageProjectId === project.id
                      return (
                        <div key={project.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{project.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {project.company || project.brand || 'No company'}
                                {project.department && ` • ${project.department}`}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => toggleManageProject(project.id)}
                            >
                              <Users className="h-4 w-4" />
                              <span>{memberCount} collaborator{memberCount === 1 ? '' : 's'}</span>
                            </Button>
                          </div>
                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              {memberCount === 0 ? (
                                <p className="text-sm text-muted-foreground">No collaborators yet.</p>
                              ) : (
                                project.members.map((member) => {
                                  const memberKey = `${project.id}:${member.user.id}`
                                  const isRemoving = removingMemberKey === memberKey
                                  return (
                                    <div
                                      key={member.user.id}
                                      className="flex items-center justify-between rounded border p-2 text-sm"
                                    >
                                      <div>
                                        <p className="font-medium">{member.user.name || member.user.email}</p>
                                        <p className="text-xs text-muted-foreground capitalize">{member.role || 'member'}</p>
                                      </div>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="flex items-center gap-1"
                                        onClick={() => handleRemoveMember(project.id, member.user.id)}
                                        disabled={isRemoving}
                                      >
                                        {isRemoving ? (
                                          <>
                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                            Removing...
                                          </>
                                        ) : (
                                          <>
                                            <Trash2 className="h-3 w-3" />
                                            Remove
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => handleCollabDialogChange(false)}>
                    Close
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Collaboration Summary Dialog */}
        <Dialog open={isCollabSummaryDialogOpen} onOpenChange={setIsCollabSummaryDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Collaboration Summary</DialogTitle>
              <DialogDescription>Here&apos;s what happened with your collaboration request.</DialogDescription>
            </DialogHeader>
            {collabSummary ? (
              <div className="space-y-4">
                <div className={`grid gap-2 text-center text-sm ${collabSummary.emailsSent ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-lg font-semibold">{collabSummary.created || 0}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Updated</p>
                    <p className="text-lg font-semibold">{collabSummary.updated || 0}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Skipped</p>
                    <p className="text-lg font-semibold">{collabSummary.skipped || 0}</p>
                  </div>
                  {collabSummary.emailsSent !== undefined && (
                    <div className="rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">Emails Sent</p>
                      <p className="text-lg font-semibold">{collabSummary.emailsSent}</p>
                    </div>
                  )}
                </div>
                {collabSummary.inaccessibleProjectCount ? (
                  <div className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                    {collabSummary.inaccessibleProjectCount} project
                    {collabSummary.inaccessibleProjectCount > 1 ? 's were' : ' was'} not available for collaboration
                    due to permissions.
                  </div>
                ) : null}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {collabSummary.details?.length === 0 && (!collabSummary.emailResults || collabSummary.emailResults.length === 0) ? (
                    <div className="text-sm text-muted-foreground text-center py-6">
                      No collaboration changes were made.
                    </div>
                  ) : (
                    <>
                      {collabSummary.details?.map((detail: any) => (
                        <div key={detail.memberId} className="rounded-lg border p-3">
                          <p className="font-medium">{detail.memberName || detail.memberEmail || 'Member'}</p>
                          <p className="text-sm text-muted-foreground">
                            {detail.action === 'created' && `Added to ${detail.projectCount} project(s).`}
                            {detail.action === 'skipped' && 'Request skipped.'}
                          </p>
                          {detail.note && <p className="text-xs text-yellow-700 mt-1">{detail.note}</p>}
                        </div>
                      ))}
                      {collabSummary.emailResults?.map((emailResult: any) => (
                        <div key={emailResult.email} className="rounded-lg border p-3">
                          <p className="font-medium">{emailResult.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {emailResult.action === 'sent' && 'Invitation email sent.'}
                            {emailResult.action === 'skipped' && 'Email skipped.'}
                          </p>
                          {emailResult.note && <p className="text-xs text-yellow-700 mt-1">{emailResult.note}</p>}
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={() => setIsCollabSummaryDialogOpen(false)}>Close</Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No summary available. Please try sending the collaboration request again.
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}

