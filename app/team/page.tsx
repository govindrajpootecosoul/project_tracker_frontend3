'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { motion } from 'framer-motion'
import { Mail, Send, Users, CheckCircle2, Clock, AlertCircle, UserPlus, Search, Filter, Key, CreditCard, Power, PowerOff, Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface TeamMember {
  id: string
  name?: string
  email: string
  department?: string
  tasksAssigned: number
  projectsInvolved: number
  hasCredentialAccess?: boolean
  hasSubscriptionAccess?: boolean
  statusSummary: {
    inProgress: number
    completed: number
    onHold: number
  }
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => lastTeamMembersSnapshot ?? [])
  const [allUsers, setAllUsers] = useState<{ id: string; name?: string; email: string; department?: string }[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [userRole, setUserRole] = useState<string>('USER')
  const [userDepartment, setUserDepartment] = useState<string>('')
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('') // User input
  const [searchQuery, setSearchQuery] = useState('') // Debounced search query
  const [isRefreshing, setIsRefreshing] = useState<boolean>(!lastTeamMembersSnapshot)
  const [emailForm, setEmailForm] = useState({
    to: '',
    cc: '',
    subject: '',
    body: '',
  })
  const [includeDepartmentTasks, setIncludeDepartmentTasks] = useState(false)
  
  // Debounce timer ref
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)

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

  const fetchUserRole = async () => {
    try {
      const user = await apiClient.getUserRole()
      setUserRole(user.role || 'USER')
      setUserDepartment(user.department || '')
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
      if (selectedDepartment !== 'all') {
        params.department = selectedDepartment
      }
    } else {
      params.department = userDepartment || selectedDepartment
    }

    if (trimmedSearch) {
      params.search = trimmedSearch
    }

    const cacheKey = getTeamMembersCacheKey(params.department, params.search)
    const canUseCache = !options?.force && !trimmedSearch

    const applyData = (data: TeamMember[]) => {
      lastTeamMembersSnapshot = data
      setTeamMembers(data)
      if (!trimmedSearch) {
        teamMembersCacheStore[cacheKey] = {
          data,
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
          .getTeamMembers(params, false)
          .then((data) => {
            const members = data as TeamMember[]
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
        setIsRefreshing(true)
      }
      const data = await apiClient.getTeamMembers(params, !options?.force && !trimmedSearch)
      const members = data as TeamMember[]
      applyData(members)
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    } finally {
      if (trimmedSearch) {
        setSearchLoading(false)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [searchQuery, isSuperAdmin, selectedDepartment, userDepartment])

  const fetchDepartments = useCallback(async () => {
    try {
      const data = await apiClient.getDepartments() as string[]
      setDepartments(data)
    } catch (error) {
      console.error('Failed to fetch departments:', error)
    }
  }, [])

  const fetchAllUsers = useCallback(async () => {
    try {
      // For search, don't filter by department - search across all users
      const params: { department?: string; search?: string } = {}
      if (searchQuery) params.search = searchQuery
      // Don't send department filter for search - we want to search all users
      
      const data = await apiClient.getTeamUsers(params) as { id: string; name?: string; email: string; department?: string }[]
      setAllUsers(data)
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }, [searchQuery])

  // Fetch data when search query or department changes
  useEffect(() => {
    if (userRole && userDepartment !== undefined) {
      fetchTeamMembers()
      // Only fetch departments once, not on every search
      if (departments.length === 0) {
        fetchDepartments()
      }
    }
  }, [selectedDepartment, searchQuery, userRole, userDepartment, fetchTeamMembers, fetchDepartments, departments.length])

  // Fetch all users when invite dialog opens
  useEffect(() => {
    if (isInviteDialogOpen) {
      fetchAllUsers()
    }
  }, [isInviteDialogOpen, fetchAllUsers])

  const handleSendEmail = async () => {
    // Validate required fields
    if (!emailForm.to || !emailForm.to.trim()) {
      alert('Please enter a recipient email address')
      return
    }
    if (!emailForm.subject || !emailForm.subject.trim()) {
      alert('Please enter an email subject')
      return
    }
    if (!emailForm.body || !emailForm.body.trim()) {
      alert('Please enter an email body')
      return
    }

    try {
      // Prepare email data - handle empty cc field
      const emailData = {
        to: emailForm.to.trim(),
        subject: emailForm.subject.trim(),
        body: emailForm.body.trim(),
        includeDepartmentTasks: includeDepartmentTasks,
        ...(emailForm.cc && emailForm.cc.trim() && { cc: emailForm.cc.trim() }),
      }
      
      await apiClient.sendEmail(emailData)
      setIsEmailDialogOpen(false)
      setEmailForm({ to: '', cc: '', subject: '', body: '' })
      setIncludeDepartmentTasks(false)
      alert('Email sent successfully!')
    } catch (error: any) {
      console.error('Failed to send email:', error)
      alert(error.message || 'Failed to send email')
    }
  }

  const handleToggleCredentialActive = async (credentialId: string, memberId: string, isActive: boolean) => {
    try {
      await apiClient.toggleCredentialMemberActive(credentialId, memberId, !isActive)
      await fetchTeamMembers({ force: true })
    } catch (error: any) {
      console.error('Failed to toggle credential status:', error)
      alert(error.message || 'Failed to update credential status')
    }
  }

  const handleToggleSubscriptionActive = async (subscriptionId: string, memberId: string, isActive: boolean) => {
    try {
      await apiClient.toggleSubscriptionMemberActive(subscriptionId, memberId, !isActive)
      await fetchTeamMembers({ force: true })
    } catch (error: any) {
      console.error('Failed to toggle subscription status:', error)
      alert(error.message || 'Failed to update subscription status')
    }
  }

  const handleToggleCredentialAccess = async (memberId: string, currentValue: boolean) => {
    try {
      await apiClient.updateMemberFeatures(memberId, !currentValue, undefined)
      await fetchTeamMembers({ force: true })
      // If updating own access, refresh user details and sidebar
      const token = getToken()
      if (token && typeof window !== 'undefined') {
        const userStr = localStorage.getItem('user')
        if (userStr) {
          try {
            const parsedUser = JSON.parse(userStr)
            if (parsedUser.id === memberId) {
              // Refresh user details to update sidebar and profile
              const updatedUser = await apiClient.getUserRole(false)
              localStorage.setItem('user', JSON.stringify({
                ...parsedUser,
                hasCredentialAccess: updatedUser.hasCredentialAccess,
              }))
              // Dispatch custom event to refresh sidebar
              window.dispatchEvent(new CustomEvent('userPermissionsUpdated'))
              // Refresh user details in navbar
              setTimeout(() => {
                window.location.reload()
              }, 500)
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to toggle credential access:', error)
      alert(error.message || 'Failed to update credential access')
    }
  }

  const handleToggleSubscriptionAccess = async (memberId: string, currentValue: boolean) => {
    try {
      await apiClient.updateMemberFeatures(memberId, undefined, !currentValue)
      await fetchTeamMembers({ force: true })
      // If updating own access, refresh user details and sidebar
      const token = getToken()
      if (token && typeof window !== 'undefined') {
        const userStr = localStorage.getItem('user')
        if (userStr) {
          try {
            const parsedUser = JSON.parse(userStr)
            if (parsedUser.id === memberId) {
              // Refresh user details to update sidebar and profile
              const updatedUser = await apiClient.getUserRole(false)
              localStorage.setItem('user', JSON.stringify({
                ...parsedUser,
                hasSubscriptionAccess: updatedUser.hasSubscriptionAccess,
              }))
              // Dispatch custom event to refresh sidebar
              window.dispatchEvent(new CustomEvent('userPermissionsUpdated'))
              // Refresh user details in navbar
              setTimeout(() => {
                window.location.reload()
              }, 500)
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to toggle subscription access:', error)
      alert(error.message || 'Failed to update subscription access')
    }
  }

  const handleInviteTeamMember = async () => {
    try {
      if (!inviteEmail || !inviteEmail.trim()) {
        alert('Please enter an email address')
        return
      }
      // TODO: Implement invite team member API endpoint
      // For now, just show success message
      alert(`Invitation sent to ${inviteEmail}`)
      setIsInviteDialogOpen(false)
      setInviteEmail('')
      await fetchTeamMembers({ force: true })
    } catch (error) {
      console.error('Failed to invite team member:', error)
      alert('Failed to invite team member')
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
          <Button onClick={() => {
            setInviteEmail('')
            setIsInviteDialogOpen(true)
          }}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Team Member
          </Button>
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Enter an email address to invite a new team member to join your workspace.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="inviteTeamEmail">Email Address</Label>
                  <Input
                    id="inviteTeamEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter email address to invite a new team member
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleInviteTeamMember}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Invitation
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="team" className="space-y-4">
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
                      <SelectContent>
                        {isSuperAdmin && (
                          <SelectItem value="all">All Departments</SelectItem>
                        )}
                        {departments.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                            {!isSuperAdmin && dept === userDepartment && ' (Your Department)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isSuperAdmin && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Showing employees from your department: {userDepartment}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            {searchLoading ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Fetching team members...
                </CardContent>
              </Card>
            ) : teamMembers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {searchQuery ? 'No team members found matching your search.' : 'No team members found.'}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4 relative">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Team Members
                      {searchQuery && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          ({teamMembers.length} result{teamMembers.length !== 1 ? 's' : ''})
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
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-4">Team Member</th>
                            <th className="text-left p-4">Department</th>
                            <th className="text-left p-4">Tasks Assigned</th>
                            <th className="text-left p-4">Projects Involved</th>
                            <th className="text-left p-4">Status Summary</th>
                            {isAdmin && (
                              <>
                                <th className="text-left p-4">Credential Access</th>
                                <th className="text-left p-4">Subscription Access</th>
                                <th className="text-left p-4">Credentials</th>
                                <th className="text-left p-4">Subscriptions</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {teamMembers.map((member) => (
                            <motion.tr
                              key={member.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-b hover:bg-accent/50"
                            >
                              <td className="p-4">
                                <div>
                                  <div className="font-medium">{member.name || member.email}</div>
                                  <div className="text-sm text-muted-foreground">{member.email}</div>
                                </div>
                              </td>
                              <td className="p-4">
                                {member.department ? (
                                  <Badge variant="outline">{member.department}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-4">{member.tasksAssigned}</td>
                              <td className="p-4">{member.projectsInvolved}</td>
                              <td className="p-4">
                                <div className="flex gap-2">
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {member.statusSummary.inProgress}
                                  </Badge>
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {member.statusSummary.completed}
                                  </Badge>
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {member.statusSummary.onHold}
                                  </Badge>
                                </div>
                              </td>
                              {isAdmin && (
                                <>
                                  <td className="p-4">
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={member.hasCredentialAccess || false}
                                        onCheckedChange={() => handleToggleCredentialAccess(member.id, member.hasCredentialAccess || false)}
                                      />
                                      <span className="text-sm text-muted-foreground">
                                        {member.hasCredentialAccess ? 'Enabled' : 'Disabled'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={member.hasSubscriptionAccess || false}
                                        onCheckedChange={() => handleToggleSubscriptionAccess(member.id, member.hasSubscriptionAccess || false)}
                                      />
                                      <span className="text-sm text-muted-foreground">
                                        {member.hasSubscriptionAccess ? 'Enabled' : 'Disabled'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    {member.credentialMembers && member.credentialMembers.length > 0 ? (
                                      <div className="space-y-1">
                                        {member.credentialMembers.map((cm) => (
                                          <div key={cm.id} className="flex items-center gap-2">
                                            <span className="text-sm">{cm.credentialName}</span>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={() => handleToggleCredentialActive(cm.credentialId, cm.id, cm.isActive)}
                                              title={cm.isActive ? 'Deactivate' : 'Activate'}
                                            >
                                              {cm.isActive ? (
                                                <Power className="h-3 w-3 text-green-600" />
                                              ) : (
                                                <PowerOff className="h-3 w-3 text-red-600" />
                                              )}
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground text-sm">-</span>
                                    )}
                                  </td>
                                  <td className="p-4">
                                    {member.subscriptionMembers && member.subscriptionMembers.length > 0 ? (
                                      <div className="space-y-1">
                                        {member.subscriptionMembers.map((sm) => (
                                          <div key={sm.id} className="flex items-center gap-2">
                                            <span className="text-sm">{sm.subscriptionName}</span>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={() => handleToggleSubscriptionActive(sm.subscriptionId, sm.id, sm.isActive)}
                                              title={sm.isActive ? 'Deactivate' : 'Activate'}
                                            >
                                              {sm.isActive ? (
                                                <Power className="h-3 w-3 text-green-600" />
                                              ) : (
                                                <PowerOff className="h-3 w-3 text-red-600" />
                                              )}
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground text-sm">-</span>
                                    )}
                                  </td>
                                </>
                              )}
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Send Email</CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setIsEmailDialogOpen(true)}>
                  <Send className="h-4 w-4 mr-2" />
                  Compose Email
                </Button>
                <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
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
                          Smart defaults: users with in-progress or recurring tasks
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="cc">CC</Label>
                        <Input
                          id="cc"
                          value={emailForm.cc}
                          onChange={(e) => setEmailForm({ ...emailForm, cc: e.target.value })}
                          placeholder="cc@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="subject">Subject *</Label>
                        <Input
                          id="subject"
                          value={emailForm.subject}
                          onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                          placeholder="Email subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="body">Body *</Label>
                        <textarea
                          id="body"
                          className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          value={emailForm.body}
                          onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                          placeholder="Email body"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="includeDepartmentTasks"
                          className="rounded"
                          checked={includeDepartmentTasks}
                          onChange={(e) => setIncludeDepartmentTasks(e.target.checked)}
                        />
                        <Label htmlFor="includeDepartmentTasks" className="text-sm">
                          Include department members' tasks (IN_PROGRESS & RECURRING)
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="attachSummary"
                          className="rounded"
                        />
                        <Label htmlFor="attachSummary" className="text-sm">
                          Attach project/task summary
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="recurringWeekly"
                          className="rounded"
                        />
                        <Label htmlFor="recurringWeekly" className="text-sm">
                          Send summary emails for recurring tasks weekly
                        </Label>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSendEmail}>
                          <Send className="h-4 w-4 mr-2" />
                          Send Email
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}

