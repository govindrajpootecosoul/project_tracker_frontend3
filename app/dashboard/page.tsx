'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, AlertCircle, RefreshCw, TrendingUp, Circle, Pause, FolderKanban, Users, Plus, Edit, Trash2, MessageSquare, Mail, FileCheck } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarProps } from 'recharts'

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
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    inProgress: 0,
    yts: 0,
    onHold: 0,
    overdue: 0,
    recurring: 0,
  })
  const [projects, setProjects] = useState<Project[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [activities, setActivities] = useState<any[]>([])

  // Load cached data immediately on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    try {
      // Try to load from cache synchronously
      const cacheKey = (key: string) => `api_cache_${key}`
      const getCached = (key: string) => {
        try {
          const cached = localStorage.getItem(cacheKey(key))
          if (cached) {
            const { data, timestamp } = JSON.parse(cached)
            const now = Date.now()
            if (now - timestamp < 5 * 60 * 1000) { // 5 minutes
              return data
            }
          }
        } catch {}
        return null
      }

      const cachedStats = getCached('/tasks/stats')
      const cachedProjects = getCached('/projects')
      const cachedTeamMembers = getCached('/team/members')
      const cachedActivities = getCached('/activities')

      if (cachedStats) setStats(cachedStats)
      if (cachedProjects) setProjects(cachedProjects)
      if (cachedTeamMembers) setTeamMembers(cachedTeamMembers)
      if (cachedActivities) setActivities(cachedActivities)
    } catch (e) {
      // Ignore cache errors
    }
  }, [])

  useEffect(() => {
    // Check authentication
    const token = getToken()
    if (!token) {
      router.push('/auth/signin')
      return
    }

    fetchStats()
  }, [router])

  const fetchStats = async () => {
    try {
      const [statsData, projectsData, teamMembersData] = await Promise.all([
        apiClient.getTaskStats(),
        apiClient.getProjects(),
        apiClient.getTeamMembers(),
      ])
      setStats(statsData as typeof stats)
      setProjects(projectsData as Project[])
      setTeamMembers(teamMembersData as TeamMember[])
      
      // Fetch activities separately to avoid breaking the dashboard if it fails
      try {
        const activitiesData = await apiClient.getActivities()
        setActivities(activitiesData as any[])
      } catch (activityError) {
        console.error('Failed to fetch activities:', activityError)
        setActivities([]) // Set empty array if activities fail to load
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

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
  const tasksByProjectData = projects
    .map(project => ({
      name: project.name,
      value: project._count?.tasks || 0,
      icon: FolderKanban,
      color: COLORS[projects.indexOf(project) % COLORS.length],
    }))
    .filter(item => item.value > 0) // Only show projects with tasks
    .sort((a, b) => b.value - a.value) // Sort by task count descending

  // Calculate percentages for team members
  const tasksByMemberData = teamMembers
    .map(member => ({
      name: member.name || member.email,
      value: member.taskCount || 0,
      icon: Users,
      color: COLORS[teamMembers.indexOf(member) % COLORS.length],
    }))
    .filter(item => item.value > 0) // Only show members with tasks
    .sort((a, b) => b.value - a.value) // Sort by task count descending

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
    total 
  }: { 
    title: string
    data: Array<{ name: string; value: number; icon: any; color: string }>
    total: number
  }) => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Distribution across {title.toLowerCase()}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.map((item, index) => {
              const percentage = calculatePercentage(item.value, total)
              const Icon = item.icon
              return (
                <div key={index} className="flex items-center gap-3">
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

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your tasks and team performance</p>
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
          />
        </div>

        <PercentageBarWidget
          title="Tasks by Team Member"
          data={tasksByMemberData}
          total={tasksByMemberData.reduce((sum, item) => sum + item.value, 0)}
        />

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest activities and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}

