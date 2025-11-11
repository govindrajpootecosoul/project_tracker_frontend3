'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Users, FolderKanban, CheckCircle2, Calendar, List, Grid3x3, LayoutGrid, GanttChart, UserPlus, Mail, Loader2 } from 'lucide-react'
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
  status: string
  createdAt: string
  members: { user: { id: string; name?: string; email: string } }[]
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

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.push('/auth/signin')
      return
    }

    fetchProjects(true)
  }, [router, fetchProjects])

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

  const stats = {
    activeProjects: projects.filter(p => p.status === 'ACTIVE').length,
    tasksCompleted: 0, // Would need to fetch from tasks
    membersCollaborating: new Set(projects.flatMap(p => p.members.map(m => m.user.id))).size,
  }

  const tasksByProjectData = projects.map(p => ({
    name: p.name,
    tasks: p._count?.tasks || 0,
  }))

  const ProjectCard = ({ 
    project, 
    onEdit, 
    onDelete, 
    onInvite 
  }: { 
    project: Project
    onEdit: (project: Project) => void
    onDelete: (projectId: string) => void
    onInvite: (project: Project) => void
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Card className="shadow-orange-500/30 hover:shadow-orange-500/50 hover:shadow-xl transition-all duration-300 h-full flex flex-col bg-gradient-to-br from-orange-600 via-amber-600 to-orange-700 border-0">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl text-white/90 line-clamp-2">{project.name}</CardTitle>
              {project.description && (
                <CardDescription className="mt-1 text-white/80 line-clamp-2">{project.description}</CardDescription>
              )}
            </div>
            <div className="flex gap-2 ml-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onInvite(project)}
                title="Invite Member"
                className="bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(project)}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(project.id)}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
            <Badge 
              variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}
              className="bg-white/20 text-white border-white/30"
            >
              {project.status}
            </Badge>
            {project.brand && (
              <Badge variant="outline" className="bg-white/20 text-white border-white/30">
                {project.brand}
              </Badge>
            )}
            {project.company && (
              <Badge variant="outline" className="bg-white/20 text-white border-white/30">
                {project.company}
              </Badge>
            )}
            {project._count && (
              <Badge variant="outline" className="bg-white/20 text-white border-white/30">
                {project._count.tasks} tasks
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-white mt-auto">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-pointer">
                    <div className="flex -space-x-2">
                      {project.members.slice(0, 3).map((member) => (
                        <Avatar key={member.user.id} className="w-8 h-8 border-2 border-white/30">
                          <AvatarFallback className="bg-white/20 text-white text-xs">
                            {member.user.name?.[0] || member.user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    {project.members.length > 3 && (
                      <span className="text-xs text-white/90">+{project.members.length - 3}</span>
                    )}
                    <span className="text-white">{project.members.length} members</span>
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

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">Manage your projects and collaboration</p>
            {isRefreshing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Refreshing projects…</span>
              </div>
            )}
          </div>
          <Button onClick={() => {
            resetForm()
            setIsDialogOpen(true)
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    <Input
                      id="brand"
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      placeholder="Brand name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="Company name"
                    />
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
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview Dashboard</TabsTrigger>
            <TabsTrigger value="manage">Manage Projects</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-4">
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
            <Card>
              <CardHeader>
                <CardTitle>Tasks by Project</CardTitle>
                <CardDescription>Number of tasks per project</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={tasksByProjectData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <RechartsTooltip />
                      <Bar dataKey="tasks" fill="#8884d8" />
                    </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="manage" className="space-y-4">
            <div className="flex items-center justify-end gap-2">
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

            {projects.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No projects found. Create your first project!
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
                        {projects.map((project) => (
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
                          {projects.map((project) => (
                            <tr key={project.id} className="border-b hover:bg-accent/50">
                              <td className="p-4">
                                <div>
                                  <div className="font-medium">{project.name}</div>
                                  {project.description && (
                                    <div className="text-sm text-muted-foreground">{project.description}</div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <Badge variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}>
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
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openInviteDialog(project)}
                                  >
                                    <UserPlus className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditDialog(project)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteProject(project.id)}
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
                )}

                {viewMode === 'kanban' && (
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'].map((status) => {
                      const statusProjects = projects.filter(p => p.status === status)
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
                    {projects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onEdit={openEditDialog}
                        onDelete={handleDeleteProject}
                        onInvite={openInviteDialog}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

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
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}

