'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, AlertCircle, RefreshCw, TrendingUp, Circle, Pause, FolderKanban, Users, Plus, Edit, Trash2, MessageSquare, Mail, FileCheck } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarProps } from 'recharts'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

interface Project {
  id: string
  name: string
  _count?: {
    tasks: number
  }
}

interface TeamMember {
  id: string
  name?: string
  email: string
  taskCount?: number
}

export default function DashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const navigateToProjectTasks = useCallback((projectId: string, projectName?: string) => {
    const params = new URLSearchParams()
    params.set('projectId', projectId)
    if (projectName) {
      params.set('projectName', projectName)
    }
    router.push(`/tasks?${params.toString()}`)
  }, [router])
  const [currentView, setCurrentView] = useState<'my' | 'department' | 'all-departments'>('my')
  const [isScrollingPaused, setIsScrollingPaused] = useState(false)
  const activitiesContainerRef = useRef<HTMLDivElement | null>(null)

  const token = typeof window !== 'undefined' ? getToken() : null

  const userRoleQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.getUserRole(),
    enabled: Boolean(token),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const statsQuery = useQuery({
    queryKey: ['tasks', 'stats', currentView],
    queryFn: () => apiClient.getTaskStats(currentView, false), // Disable cache for fresh data
    enabled: Boolean(token),
    staleTime: 1000 * 30, // 30 seconds - prevent refetch on mount if data is fresh
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchOnMount: false, // Don't refetch on mount if data is fresh
  })

  const projectsQuery = useQuery({
    queryKey: ['projects', 'dashboard', currentView],
    queryFn: async () => {
      const projectsData = await apiClient.getProjects({ limit: 100, skip: 0 })
      return Array.isArray(projectsData) ? projectsData : (projectsData as any)?.projects || []
    },
    enabled: Boolean(token),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  const teamMembersQuery = useQuery({
    queryKey: ['team', 'members', 'dashboard', currentView],
    queryFn: async () => {
      const membersData = await apiClient.getTeamMembers({ limit: 100, skip: 0 })
      return Array.isArray(membersData) ? membersData : (membersData as any)?.members || []
    },
    enabled: Boolean(token),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  const inProgressTasksQuery = useQuery({
    queryKey: ['tasks', 'inProgress', currentView],
    queryFn: async () => {
      let tasksResult: any
      if (currentView === 'my') {
        tasksResult = await apiClient.getMyTasks({ limit: 100, skip: 0 })
      } else if (currentView === 'department') {
        tasksResult = await apiClient.getDepartmentTasks({ limit: 100, skip: 0 })
      } else if (currentView === 'all-departments') {
        tasksResult = await apiClient.getAllDepartmentsTasks({ limit: 100, skip: 0 })
      } else {
        tasksResult = await apiClient.getMyTasks({ limit: 100, skip: 0 })
      }
      const tasksData = Array.isArray(tasksResult) ? tasksResult : (tasksResult as any)?.tasks || []
      return tasksData.filter((task: any) => String(task.status || '').toUpperCase().trim() === 'IN_PROGRESS')
    },
    enabled: Boolean(token),
    staleTime: 1000 * 30, // 30 seconds - prevent refetch on mount if data is fresh
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchOnMount: false, // Don't refetch on mount if data is fresh
  })

  const activitiesQuery = useInfiniteQuery({
    queryKey: ['activities', currentView],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const data = (await apiClient.getActivities(currentView, { limit: 20, skip: pageParam as number })) as any[]
      return data
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.length, 0)
      return lastPage.length === 20 ? loaded : undefined
    },
    enabled: Boolean(token),
    staleTime: 1000 * 60 * 2, // 2 minutes - prevent refetch on mount if data is fresh
    refetchOnMount: false, // Don't refetch on mount if data is fresh
  })

  const stats = (statsQuery.data as any) || {
    totalTasks: 0,
    completedTasks: 0,
    inProgress: 0,
    yts: 0,
    onHold: 0,
    overdue: 0,
    recurring: 0,
  }
  const projects = (projectsQuery.data as Project[]) || []
  const teamMembers = (teamMembersQuery.data as TeamMember[]) || []
  const inProgressTasks = (inProgressTasksQuery.data as any[]) || []
  const activities = useMemo(() => {
    const pages = activitiesQuery.data?.pages || []
    return pages.flat()
  }, [activitiesQuery.data])

  // Handle scroll for infinite loading
  useEffect(() => {
    const container = activitiesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      // Load more when user is within 100px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        if (activitiesQuery.hasNextPage && !activitiesQuery.isFetchingNextPage) {
          activitiesQuery.fetchNextPage()
        }
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [activitiesQuery.hasNextPage, activitiesQuery.isFetchingNextPage, activitiesQuery.fetchNextPage])

  useEffect(() => {
    // Check authentication
    if (!token) {
      router.push('/auth/signin')
      return
    }
  }, [router, token])

  // Listen for task update events and invalidate queries
  useEffect(() => {
    const handleTaskUpdate = () => {
      // Invalidate all dashboard-related queries to force refetch
      queryClient.invalidateQueries({ queryKey: ['tasks', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'inProgress'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['projects', 'dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['team', 'members', 'dashboard'] })
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('tasksUpdated', handleTaskUpdate)
      return () => {
        window.removeEventListener('tasksUpdated', handleTaskUpdate)
      }
    }
  }, [queryClient])

  // Calculate percentages for task status - show all statuses
  // Ensure all values are numbers (default to 0 if undefined/null/NaN)
  const inProgress = (typeof stats.inProgress === 'number' && !isNaN(stats.inProgress)) ? stats.inProgress : 0
  const completed = (typeof stats.completedTasks === 'number' && !isNaN(stats.completedTasks)) ? stats.completedTasks : 0
  const yts = (typeof stats.yts === 'number' && !isNaN(stats.yts)) ? stats.yts : 0
  const onHold = (typeof stats.onHold === 'number' && !isNaN(stats.onHold)) ? stats.onHold : 0
  const recurring = (typeof stats.recurring === 'number' && !isNaN(stats.recurring)) ? stats.recurring : 0
  
  // Calculate total tasks from all statuses to ensure accuracy
  const totalTasksFromStatuses = inProgress + completed + yts + onHold + recurring
  const totalTasksForPercentage = stats.totalTasks > 0 ? stats.totalTasks : totalTasksFromStatuses
  
  const taskStatusData = [
    { 
      name: 'In Progress', 
      value: inProgress, 
      icon: Clock, 
      color: '#3b82f6' 
    },
    { 
      name: 'Completed', 
      value: completed, 
      icon: CheckCircle, 
      color: '#10b981' 
    },
    { 
      name: 'YTS', 
      value: yts, 
      icon: Circle, 
      color: '#f59e0b' 
    },
    { 
      name: 'On Hold', 
      value: onHold, 
      icon: Pause, 
      color: '#ef4444' 
    },
    { 
      name: 'Recurring', 
      value: recurring, 
      icon: RefreshCw, 
      color: '#8b5cf6' 
    },
  ]

  // Calculate percentages for projects
  const tasksByProjectData = (Array.isArray(projects) ? projects : [])
    .map((project, index) => ({
      id: project.id,
      name: project.name,
      value: project._count?.tasks || 0,
      icon: FolderKanban,
      color: COLORS[index % COLORS.length],
    }))
    .filter(item => item.value > 0) // Only show projects with tasks
    .sort((a, b) => b.value - a.value) // Sort by task count descending

  // Removed tasksByMemberData - no longer displaying "Tasks by Team Member"

  // Helper function to calculate percentage
  const calculatePercentage = (value: number, total: number): number => {
    if (total === 0 || !Number.isFinite(value) || !Number.isFinite(total)) return 0
    const percentage = (value / total) * 100
    return Math.round(percentage) || 0
  }

  // Component for percentage bar widget
  const PercentageBarWidget = ({ 
    title, 
    data, 
    total,
    onItemClick,
    maxVisibleItems,
  }: { 
    title: string
    data: Array<{ id?: string; name: string; value: number; icon: any; color: string }>
    total: number
    onItemClick?: (item: { id?: string; name: string; value: number; icon: any; color: string }) => void
    maxVisibleItems?: number
  }) => {
    const listClassName = `space-y-4 ${maxVisibleItems ? 'overflow-y-auto pr-2' : ''}`
    const listStyle = maxVisibleItems ? { maxHeight: `${maxVisibleItems * 68}px` } : undefined
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Distribution across {title.toLowerCase()}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={listClassName} style={listStyle}>
            {data.map((item, index) => {
              const percentage = calculatePercentage(item.value, total)
              const Icon = item.icon
              const isClickable = Boolean(onItemClick)
              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 ${isClickable ? 'cursor-pointer rounded-md px-2 py-1 -mx-2 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background' : ''}`}
                  onClick={() => onItemClick?.(item)}
                  onKeyDown={(e) => {
                    if (!onItemClick) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onItemClick(item)
                    }
                  }}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                >
                  <div 
                    className="p-2 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: `${item.color}20` }}
                  >
                    <Icon 
                      className="h-5 w-5" 
                      style={{ color: item.color }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground truncate">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-sm font-semibold text-foreground">
                          {item.value}
                        </span>
                        <span className="text-sm text-muted-foreground min-w-[3rem] text-right">
                          {percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
            {data.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No data available
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const kpiCards = [
    {
      title: 'Total Tasks',
      value: stats.totalTasks,
      icon: CheckCircle,
      color: 'text-blue-600',
      bgColor: 'bg-gradient-to-br from-blue-400 to-blue-600',
      hoverColor: 'hover:from-blue-500 hover:to-blue-700',
      textColor: 'text-white',
    },
    {
      title: 'Completed',
      value: stats.completedTasks,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-gradient-to-br from-green-400 to-green-600',
      hoverColor: 'hover:from-green-500 hover:to-green-700',
      textColor: 'text-white',
    },
    {
      title: 'In Progress',
      value: stats.inProgress,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-gradient-to-br from-yellow-400 to-yellow-600',
      hoverColor: 'hover:from-yellow-500 hover:to-yellow-700',
      textColor: 'text-white',
    },
    {
      title: 'Overdue',
      value: stats.overdue,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-gradient-to-br from-red-400 to-red-600',
      hoverColor: 'hover:from-red-500 hover:to-red-700',
      textColor: 'text-white',
    },
    {
      title: 'Recurring',
      value: stats.recurring,
      icon: RefreshCw,
      color: 'text-purple-600',
      bgColor: 'bg-gradient-to-br from-purple-400 to-purple-600',
      hoverColor: 'hover:from-purple-500 hover:to-purple-700',
      textColor: 'text-white',
    },
  ]

  const normalizedRole = String((userRoleQuery.data as any)?.role || 'USER').toUpperCase()
  const isAdmin = normalizedRole === 'ADMIN'
  const isSuperAdmin = normalizedRole === 'SUPER_ADMIN'

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">Dashboard</h1>
              {(statsQuery.isFetching || inProgressTasksQuery.isFetching) && (
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-muted-foreground">Overview of your tasks and team performance</p>
          </div>
          {(isAdmin || isSuperAdmin) && (
            <div className="flex gap-2">
              <Button
                variant={currentView === 'my' ? 'default' : 'outline'}
                onClick={() => setCurrentView('my')}
              >
                My Tasks
              </Button>
              <Button
                variant={currentView === 'department' ? 'default' : 'outline'}
                onClick={() => setCurrentView('department')}
              >
                Department Tasks
              </Button>
              {isSuperAdmin && (
                <Button
                  variant={currentView === 'all-departments' ? 'default' : 'outline'}
                  onClick={() => setCurrentView('all-departments')}
                >
                  All Departments Tasks
                </Button>
              )}
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {kpiCards.map((kpi, index) => {
            const Icon = kpi.icon
            return (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card 
                  className={`cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-105 ${kpi.bgColor} ${kpi.hoverColor}`}
                  onClick={() => router.push('/tasks')}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className={`text-sm font-medium ${kpi.textColor}`}>{kpi.title}</CardTitle>
                    <div className={`p-2 rounded-lg bg-white/20`}>
                      <Icon className={`h-4 w-4 ${kpi.textColor}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${kpi.textColor}`}>{kpi.value}</div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>

        {/* Charts with Percentage Bars */}
        <div className="grid gap-4 md:grid-cols-2">
          <PercentageBarWidget
            title="My Tasks Breakdown"
            data={taskStatusData}
            total={totalTasksForPercentage}
          />

          <PercentageBarWidget
            title="Tasks by Project"
            data={tasksByProjectData}
            total={tasksByProjectData.reduce((sum, item) => sum + item.value, 0)}
            maxVisibleItems={6}
          onItemClick={(item) => {
            if (item.id) {
              navigateToProjectTasks(item.id, item.name)
            }
          }}
          />
        </div>

        {/* In Progress Tasks - Auto Scroll Loop */}
        <Card>
          <CardHeader>
            <CardTitle>In Progress Tasks</CardTitle>
            <CardDescription>Tasks currently in progress</CardDescription>
          </CardHeader>
          <CardContent>
            {inProgressTasks.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 h-[350px] flex items-center justify-center">
                No in-progress tasks
              </div>
            ) : (
              <div 
                className="h-[350px] overflow-hidden relative"
                onMouseEnter={() => setIsScrollingPaused(true)}
                onMouseLeave={() => setIsScrollingPaused(false)}
              >
                <div 
                  id="inProgressTasksScroll"
                  className="space-y-3 pr-2"
                  style={{
                    animation: inProgressTasks.length > 0 && !isScrollingPaused 
                      ? 'scrollLoop 30s linear infinite' 
                      : 'none',
                    willChange: 'transform'
                  }}
                >
                  {/* Duplicate tasks for seamless loop */}
                  {[...inProgressTasks, ...inProgressTasks].map((task, index) => (
                    <div
                      key={`${task.id}-${index}`}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/tasks?task=${task.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm text-foreground truncate">
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {task.project && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <FolderKanban className="h-3 w-3" />
                                <span className="truncate">{task.project.name}</span>
                              </div>
                            )}
                            {task.dueDate && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>{format(new Date(task.dueDate), 'MMM d, yyyy')}</span>
                              </div>
                            )}
                            {task.priority && (
                              <Badge
                                variant={
                                  task.priority === 'HIGH'
                                    ? 'destructive'
                                    : task.priority === 'MEDIUM'
                                    ? 'default'
                                    : 'secondary'
                                }
                                className="text-xs"
                              >
                                {task.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            <Clock className="h-3 w-3 mr-1" />
                            In Progress
                          </Badge>
                        </div>
                      </div>
                      {task.assignees && task.assignees.length > 0 && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <div className="flex items-center gap-1 flex-wrap">
                            {task.assignees.map((assignee: any, idx: number) => (
                              <span
                                key={assignee.user?.id || idx}
                                className="text-xs text-muted-foreground"
                              >
                                {assignee.user?.name || assignee.user?.email || 'Unknown'}
                                {idx < task.assignees.length - 1 && ','}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest activities and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              ref={activitiesContainerRef}
              className="space-y-4 max-h-[600px] overflow-y-auto pr-2"
            >
              {activities.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No recent activities
                </div>
              ) : (
                activities.map((activity, index) => {
                  const getActivityIcon = () => {
                    switch (activity.type) {
                      case 'TASK_CREATED':
                        return <Plus className="h-4 w-4 text-blue-500" />
                      case 'TASK_UPDATED':
                      case 'TASK_STATUS_CHANGED':
                        return <Edit className="h-4 w-4 text-yellow-500" />
                      case 'TASK_DELETED':
                        return <Trash2 className="h-4 w-4 text-red-500" />
                      case 'TASK_REVIEW_REQUESTED':
                      case 'TASK_REVIEW_ACCEPTED':
                      case 'TASK_REVIEW_COMPLETED':
                        return <FileCheck className="h-4 w-4 text-purple-500" />
                      case 'PROJECT_CREATED':
                      case 'PROJECT_UPDATED':
                      case 'PROJECT_COMPLETED':
                        return <FolderKanban className="h-4 w-4 text-green-500" />
                      case 'EMAIL_SENT':
                        return <Mail className="h-4 w-4 text-indigo-500" />
                      case 'COMMENT_ADDED':
                        return <MessageSquare className="h-4 w-4 text-gray-500" />
                      default:
                        return <Circle className="h-4 w-4 text-gray-500" />
                    }
                  }

                  const metadata = activity.metadata ? (typeof activity.metadata === 'string' ? JSON.parse(activity.metadata) : activity.metadata) : {}

                  return (
                    <div key={activity.id} className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0">
                      <div className="p-2 rounded-full bg-muted flex-shrink-0">
                        {getActivityIcon()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {activity.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {activity.user?.name || activity.user?.email || 'Unknown user'}
                              </span>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {format(new Date(activity.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              {activitiesQuery.isFetchingNextPage && (
                <div className="text-center text-muted-foreground py-4">
                  Loading more activities...
                </div>
              )}
              {!activitiesQuery.hasNextPage && activities.length > 0 && (
                <div className="text-center text-muted-foreground py-4 text-sm">
                  No more activities to load
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}

