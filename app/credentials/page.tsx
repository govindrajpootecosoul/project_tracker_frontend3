'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/main-layout'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Users as UsersIcon, Download, Eye, EyeOff, Copy, Check, CreditCard, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface Credential {
  id: string
  company: string
  geography: string
  platform: string
  url?: string
  username: string
  password: string
  authenticator?: string
  notes?: string
  privacyLevel?: 'PRIVATE' | 'PUBLIC'
  createdAt: string
  updatedAt: string
  createdBy: {
    id: string
    name?: string
    email: string
  }
  members: {
    id: string
    role: string
    user: {
      id: string
      name?: string
      email: string
    }
  }[]
}

interface User {
  id: string
  name?: string
  email: string
}

interface CollaborationSummaryEntry {
  memberId: string
  memberName: string
  memberEmail: string
  action: 'created' | 'updated' | 'skipped'
  credentialCount: number
  note?: string
}

interface CollaborationSummary {
  created: number
  updated: number
  skipped: number
  inaccessibleCredentialCount?: number
  details: CollaborationSummaryEntry[]
}

interface FormData {
  company: string
  geography: string
  platform: string
  url: string
  username: string
  password: string
  authenticator: string
  notes: string
  privacyLevel: 'PRIVATE' | 'PUBLIC'
}

const initialFormData: FormData = {
  company: '',
  geography: '',
  platform: '',
  url: '',
  username: '',
  password: '',
  authenticator: '',
  notes: '',
  privacyLevel: 'PRIVATE',
}

export default function CredentialsPage() {
  const router = useRouter()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCollabDialogOpen, setIsCollabDialogOpen] = useState(false)
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null)
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({})
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentUser, setCurrentUser] = useState<{ id: string; name?: string; email?: string } | null>(null)
  const [isBulkCollabDialogOpen, setIsBulkCollabDialogOpen] = useState(false)
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<string[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [isSubmittingBulkCollab, setIsSubmittingBulkCollab] = useState(false)
  const [collabSummary, setCollabSummary] = useState<CollaborationSummary | null>(null)
  const [isCollabSummaryDialogOpen, setIsCollabSummaryDialogOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [collabDialogTab, setCollabDialogTab] = useState<'invite' | 'manage'>('invite')
  const [expandedManageCredentialId, setExpandedManageCredentialId] = useState<string | null>(null)
  const [removingMemberKey, setRemovingMemberKey] = useState<string | null>(null)

  const fetchCredentials = useCallback(async (): Promise<Credential[]> => {
    try {
      const data = await apiClient.getCredentials()
      setCredentials(data as Credential[])
      return data as Credential[]
    } catch (error) {
      console.error('Failed to fetch credentials:', error)
      return []
    }
  }, [])

  // Calculate KPIs
  const totalCredentials = credentials.length
  const sharedCredentials = credentials.filter(c => c.privacyLevel === 'PUBLIC' && c.members.length > 0).length

  const kpiCards = [
    {
      title: 'Total Credentials',
      value: totalCredentials,
      icon: CreditCard,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Shared Credentials',
      value: sharedCredentials,
      icon: UsersIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
  ]

  const publicCredentials = useMemo(
    () => credentials.filter((credential) => credential.privacyLevel === 'PUBLIC'),
    [credentials],
  )

  const totalCollaborationMembers = useMemo(
    () => publicCredentials.reduce((total, credential) => total + credential.members.length, 0),
    [publicCredentials],
  )

  const filteredMembers = useMemo(() => {
    const search = memberSearch.trim().toLowerCase()
    return allUsers
      .filter((user) => user.id !== currentUser?.id)
      .filter((user) => {
        if (!search) return true
        const nameMatch = user.name?.toLowerCase().includes(search)
        const emailMatch = user.email.toLowerCase().includes(search)
        return Boolean(nameMatch || emailMatch)
      })
  }, [allUsers, currentUser?.id, memberSearch])

  const allCredentialsSelected = useMemo(() => {
    if (publicCredentials.length === 0) return false
    return selectedCredentialIds.length === publicCredentials.length
  }, [publicCredentials, selectedCredentialIds])

  const visibleMemberIds = useMemo(() => filteredMembers.map((member) => member.id), [filteredMembers])
  const allVisibleMembersSelected = useMemo(() => {
    if (visibleMemberIds.length === 0) return false
    return visibleMemberIds.every((id) => selectedMemberIds.includes(id))
  }, [visibleMemberIds, selectedMemberIds])

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiClient.getTeamUsers()
      setAllUsers(data as User[])
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.push('/auth/signin')
      return
    }
    
    const checkAccess = async () => {
      try {
        const user = await apiClient.getUserRole()
        if (user?.id) {
          setCurrentUser({ id: user.id, name: user.name, email: user.email })
        }
        const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
        const hasAccess = isAdmin || user.hasCredentialAccess === true
        
        if (!hasAccess) {
          router.push('/dashboard')
          alert('You do not have access to Credential Manager. Please contact your admin.')
          return
        }
      } catch (error) {
        console.error('Failed to check access:', error)
        router.push('/auth/signin')
      }
    }
    
    checkAccess()
    fetchCredentials()
    fetchUsers()
  }, [router, fetchCredentials, fetchUsers])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      fetchCredentials()
    }
    window.addEventListener('refreshCredentials', handler as EventListener)
    return () => {
      window.removeEventListener('refreshCredentials', handler as EventListener)
    }
  }, [fetchCredentials])

  const resetForm = useCallback(() => {
    setFormData(initialFormData)
    setEditingCredential(null)
  }, [])

  const openCreateDialog = useCallback(() => {
    resetForm()
    setIsDialogOpen(true)
  }, [resetForm])

  const openEditDialog = useCallback((credential: Credential) => {
    setEditingCredential(credential)
    setFormData({
      company: credential.company,
      geography: credential.geography,
      platform: credential.platform,
      url: credential.url || '',
      username: credential.username,
      password: credential.password,
      authenticator: credential.authenticator || '',
      notes: credential.notes || '',
      privacyLevel: credential.privacyLevel || 'PRIVATE',
    })
    setIsDialogOpen(true)
  }, [])

  const openCollabDialog = useCallback((credential: Credential) => {
    setSelectedCredential(credential)
    setIsCollabDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false)
    resetForm()
  }, [resetForm])

  const handleCreateCredential = useCallback(async () => {
    try {
      if (!formData.company || !formData.geography || !formData.platform || !formData.username || !formData.password) {
        alert('Please fill in all required fields')
        return
      }

      await apiClient.createCredential(formData)
      closeDialog()
      await fetchCredentials()
    } catch (error: any) {
      console.error('Failed to create credential:', error)
      alert(error.message || 'Failed to create credential')
    }
  }, [formData, closeDialog, fetchCredentials])

  const handleUpdateCredential = useCallback(async () => {
    if (!editingCredential) return

    try {
      if (!formData.company || !formData.geography || !formData.platform || !formData.username || !formData.password) {
        alert('Please fill in all required fields')
        return
      }

      await apiClient.updateCredential(editingCredential.id, formData)
      closeDialog()
      await fetchCredentials()
    } catch (error: any) {
      console.error('Failed to update credential:', error)
      alert(error.message || 'Failed to update credential')
    }
  }, [editingCredential, formData, closeDialog, fetchCredentials])

  const handleDeleteCredential = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this credential?')) return
    try {
      await apiClient.deleteCredential(id)
      await fetchCredentials()
    } catch (error) {
      console.error('Failed to delete credential:', error)
      alert('Failed to delete credential')
    }
  }, [fetchCredentials])

  const handleAddMember = useCallback(async (userId: string, role: string = 'viewer') => {
    if (!selectedCredential) return
    
    // Check privacy level - only PUBLIC credentials can be shared
    if (selectedCredential.privacyLevel !== 'PUBLIC') {
      alert('Only credentials with PUBLIC privacy level can be shared for collaboration. Please update the privacy level to PUBLIC first.')
      setIsCollabDialogOpen(false)
      setSelectedCredential(null)
      return
    }
    
    try {
      await apiClient.addCredentialMember(selectedCredential.id, userId, role)
      await fetchCredentials()
      setIsCollabDialogOpen(false)
      setSelectedCredential(null)
    } catch (error: any) {
      console.error('Failed to add member:', error)
      alert(error.message || 'Failed to add member')
    }
  }, [selectedCredential, fetchCredentials])

  const handleRemoveMember = useCallback(
    async (credentialId: string, memberId: string, options?: { skipConfirm?: boolean }) => {
      if (!credentialId || !memberId) return

      if (!options?.skipConfirm) {
        const confirmed = window.confirm('Are you sure you want to remove this member?')
        if (!confirmed) return
      }

      try {
        const key = `${credentialId}:${memberId}`
        setRemovingMemberKey(key)
        await apiClient.removeCredentialMember(credentialId, memberId)
        const updatedList = await fetchCredentials()
        if (selectedCredential?.id === credentialId) {
          const updated = (updatedList as Credential[]).find((cred) => cred.id === credentialId) || null
          setSelectedCredential(updated)
        }
      } catch (error: any) {
        console.error('Failed to remove member:', error)
        alert(error.message || 'Failed to remove member')
      } finally {
        setRemovingMemberKey((current) => (current === `${credentialId}:${memberId}` ? null : current))
      }
    },
    [fetchCredentials, selectedCredential],
  )

  const handleTogglePrivacy = useCallback(async (credentialId: string, currentPrivacyLevel: 'PRIVATE' | 'PUBLIC') => {
    try {
      const newPrivacyLevel = currentPrivacyLevel === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE'
      await apiClient.updateCredential(credentialId, { privacyLevel: newPrivacyLevel })
      await fetchCredentials()
    } catch (error: any) {
      console.error('Failed to toggle privacy level:', error)
      alert(error.message || 'Failed to update privacy level')
    }
  }, [fetchCredentials])

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleExport = () => {
    const csv = [
      ['Company', 'Geography', 'Platform', 'URL', 'Username', 'Password', 'Authenticator', 'Notes'],
      ...credentials.map(c => [
        c.company,
        c.geography,
        c.platform,
        c.url || '',
        c.username,
        c.password,
        c.authenticator || '',
        c.notes || '',
      ]),
    ].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `credentials-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const updateFormField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  const toggleCredentialSelection = useCallback((credentialId: string) => {
    setSelectedCredentialIds(prev =>
      prev.includes(credentialId) ? prev.filter(id => id !== credentialId) : [...prev, credentialId],
    )
  }, [])

  const toggleMemberSelection = useCallback((memberId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId],
    )
  }, [])

  const resetBulkCollabState = useCallback(() => {
    setSelectedCredentialIds([])
    setSelectedMemberIds([])
    setMemberSearch('')
    setExpandedManageCredentialId(null)
  }, [])

  const handleBulkCollabSubmit = useCallback(async () => {
    if (selectedCredentialIds.length === 0 || selectedMemberIds.length === 0) {
      return
    }
    setIsSubmittingBulkCollab(true)
    try {
      const response = await apiClient.requestCredentialCollaboration({
        credentialIds: selectedCredentialIds,
        memberIds: selectedMemberIds,
        role: 'viewer',
      })
      const summary = (response as { summary?: CollaborationSummary })?.summary
      setCollabSummary(
        summary ?? {
          created: 0,
          updated: 0,
          skipped: 0,
          details: [],
        },
      )
      setIsCollabSummaryDialogOpen(true)
      setIsBulkCollabDialogOpen(false)
      resetBulkCollabState()
      await fetchCredentials()
    } catch (error: any) {
      console.error('Failed to send collaboration requests:', error)
      alert(error.message || 'Failed to send collaboration requests')
    } finally {
      setIsSubmittingBulkCollab(false)
    }
  }, [selectedCredentialIds, selectedMemberIds, fetchCredentials, resetBulkCollabState])

  const handleOpenBulkCollab = useCallback(() => {
    if (publicCredentials.length === 0) {
      alert('No PUBLIC credentials available for collaboration. Please update a credential privacy level to PUBLIC first.')
      return
    }
    setCollabDialogTab('invite')
    setIsBulkCollabDialogOpen(true)
  }, [publicCredentials.length])

  const handleBulkDialogChange = useCallback(
    (open: boolean) => {
      setIsBulkCollabDialogOpen(open)
      if (!open) {
        resetBulkCollabState()
        setCollabDialogTab('invite')
      }
    },
    [resetBulkCollabState],
  )

  const handleSelectAllCredentials = useCallback(() => {
    if (publicCredentials.length === 0) return
    if (allCredentialsSelected) {
      setSelectedCredentialIds([])
    } else {
      setSelectedCredentialIds(publicCredentials.map((credential) => credential.id))
    }
  }, [allCredentialsSelected, publicCredentials])

  const handleSelectAllMembers = useCallback(() => {
    if (visibleMemberIds.length === 0) return
    if (allVisibleMembersSelected) {
      setSelectedMemberIds((prev) => prev.filter((id) => !visibleMemberIds.includes(id)))
    } else {
      setSelectedMemberIds((prev) => Array.from(new Set([...prev, ...visibleMemberIds])))
    }
  }, [allVisibleMembersSelected, visibleMemberIds])

  const toggleManageCredential = useCallback((credentialId: string) => {
    setExpandedManageCredentialId(prev => (prev === credentialId ? null : credentialId))
  }, [])

  const handleCollabSummaryDialogChange = useCallback((open: boolean) => {
    setIsCollabSummaryDialogOpen(open)
    if (!open) {
      setCollabSummary(null)
    }
  }, [])

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Credential Manager</h1>
            <p className="text-muted-foreground">Manage login credentials and collaborate with your team</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleOpenBulkCollab}>
              <UsersIcon className="h-4 w-4 mr-2" />
              Collab
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Credential
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {kpiCards.map((kpi, index) => {
            const Icon = kpi.icon
            return (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.1 }}
              >
                <Card className="rounded-2xl shadow-md h-full">
                  <CardContent className="p-6 h-full flex flex-col">
                    <div className="flex items-start justify-between flex-1">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground mb-1">{kpi.title}</p>
                        <p className="text-3xl font-bold">{kpi.value}</p>
                      </div>
                      <div className={`${kpi.bgColor} p-3 rounded-xl flex-shrink-0`}>
                        <Icon className={`h-6 w-6 ${kpi.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>

        {credentials.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No credentials found. Click "Add Credential" to get started.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Credentials</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search credentials..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64"
                />
                <Button variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4">Company</th>
                      <th className="text-left p-4">Geography</th>
                      <th className="text-left p-4">Platform</th>
                      <th className="text-left p-4">Privacy</th>
                      <th className="text-left p-4">URL</th>
                      <th className="text-left p-4">Username</th>
                      <th className="text-left p-4">Password</th>
                      <th className="text-left p-4">Authenticator</th>
                      <th className="text-left p-4">Members</th>
                      <th className="text-left p-4">Actions</th>
                    </tr>
                  </thead>
            <tbody>
              {credentials
                .filter(credential => {
                  if (!searchQuery.trim()) return true
                  const query = searchQuery.toLowerCase()
                  return (
                    credential.company.toLowerCase().includes(query) ||
                    credential.geography.toLowerCase().includes(query) ||
                    credential.platform.toLowerCase().includes(query) ||
                    credential.url?.toLowerCase().includes(query) ||
                    credential.username.toLowerCase().includes(query) ||
                    credential.notes?.toLowerCase().includes(query)
                  )
                })
                .map((credential) => (
                      <motion.tr
                        key={credential.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-b hover:bg-accent/50"
                      >
                        <td className="p-4">
                          <div className="font-medium">{credential.company}</div>
                        </td>
                        <td className="p-4">{credential.geography}</td>
                        <td className="p-4">{credential.platform}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={credential.privacyLevel === 'PUBLIC'}
                              onCheckedChange={() => handleTogglePrivacy(credential.id, credential.privacyLevel || 'PRIVATE')}
                              className={
                                credential.privacyLevel === 'PUBLIC'
                                  ? 'data-[state=checked]:bg-green-600'
                                  : 'data-[state=unchecked]:bg-red-600'
                              }
                            />
                            <Badge 
                              variant={credential.privacyLevel === 'PUBLIC' ? 'default' : 'secondary'}
                              className={
                                credential.privacyLevel === 'PUBLIC' 
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-300' 
                                  : 'bg-red-100 text-red-800 hover:bg-red-200 border-red-300'
                              }
                            >
                              {credential.privacyLevel === 'PUBLIC' ? 'Public' : 'Private'}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-4">
                          {credential.url ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm truncate max-w-[200px]">{credential.url}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(credential.url!, `url-${credential.id}`)}
                              >
                                {copiedField === `url-${credential.id}` ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{credential.username}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(credential.username, `username-${credential.id}`)}
                            >
                              {copiedField === `username-${credential.id}` ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Input
                              type={showPasswords[credential.id] ? 'text' : 'password'}
                              value={credential.password}
                              readOnly
                              className="text-sm w-32"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => togglePasswordVisibility(credential.id)}
                            >
                              {showPasswords[credential.id] ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(credential.password, `password-${credential.id}`)}
                            >
                              {copiedField === `password-${credential.id}` ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </td>
                        <td className="p-4">
                          {credential.authenticator ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{credential.authenticator}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(credential.authenticator!, `auth-${credential.id}`)}
                              >
                                {copiedField === `auth-${credential.id}` ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          <TooltipProvider>
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-2">
                                {credential.members.slice(0, 3).map((member) => (
                                  <Tooltip key={member.id}>
                                    <TooltipTrigger>
                                      <Avatar className="h-6 w-6 border-2 border-background">
                                        <AvatarFallback className="text-xs">
                                          {member.user.name?.[0] || member.user.email[0].toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{member.user.name || member.user.email}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                                {credential.members.length > 3 && (
                                  <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs">
                                    +{credential.members.length - 3}
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {credential.members.length}
                              </span>
                            </div>
                          </TooltipProvider>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(credential)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteCredential(credential.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk Collaboration Dialog */}
        <Dialog open={isBulkCollabDialogOpen} onOpenChange={handleBulkDialogChange}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Collaborate on Credentials</DialogTitle>
              <DialogDescription>
                Invite new members or review existing collaborations across your PUBLIC credentials.
              </DialogDescription>
            </DialogHeader>
            <Tabs value={collabDialogTab} onValueChange={(value) => setCollabDialogTab(value as 'invite' | 'manage')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="invite">Invite Members</TabsTrigger>
                <TabsTrigger value="manage">Manage Collaborations</TabsTrigger>
              </TabsList>
              <TabsContent value="invite" className="mt-4 space-y-4">
                {publicCredentials.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground border rounded-lg bg-muted/40">
                    There are no PUBLIC credentials available right now. Update a credential&apos;s privacy level to PUBLIC to collaborate.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-sm font-medium">Public Credentials</Label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{selectedCredentialIds.length} selected</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={handleSelectAllCredentials}
                              disabled={publicCredentials.length === 0}
                            >
                              {allCredentialsSelected ? 'Clear All' : 'Select All'}
                            </Button>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                          {publicCredentials.map((credential) => {
                            const isSelected = selectedCredentialIds.includes(credential.id)
                            return (
                              <label
                                key={credential.id}
                                className={`flex gap-3 rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
                                  isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 rounded border-muted-foreground"
                                  checked={isSelected}
                                  onChange={() => toggleCredentialSelection(credential.id)}
                                />
                                <div className="flex-1">
                                  <p className="font-medium">{credential.company}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {credential.platform} • {credential.geography}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {credential.members.length} member{credential.members.length === 1 ? '' : 's'} currently
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
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{selectedMemberIds.length} selected</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={handleSelectAllMembers}
                              disabled={filteredMembers.length === 0}
                            >
                              {allVisibleMembersSelected ? 'Clear All' : 'Select Visible'}
                            </Button>
                          </div>
                        </div>
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
                                    isSelected ? 'border-primary bg-primary/5' : 'hover-border-primary/40'
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
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <p className="text-xs text-muted-foreground">
                        Selected credentials: {selectedCredentialIds.length} · Selected members: {selectedMemberIds.length}
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => handleBulkDialogChange(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleBulkCollabSubmit}
                          disabled={
                            selectedCredentialIds.length === 0 || selectedMemberIds.length === 0 || isSubmittingBulkCollab
                          }
                        >
                          {isSubmittingBulkCollab ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Send Collaboration'
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
                    <p className="text-xs text-muted-foreground">Public Credentials</p>
                    <p className="text-2xl font-semibold">{publicCredentials.length}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground">Total Collaborators</p>
                    <p className="text-2xl font-semibold">{totalCollaborationMembers}</p>
                  </div>
                </div>
                {publicCredentials.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground border rounded-lg bg-muted/40">
                    No PUBLIC credentials available to manage.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {publicCredentials.map((credential) => {
                      const memberCount = credential.members.length
                      const isExpanded = expandedManageCredentialId === credential.id
                      return (
                        <div key={credential.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{credential.company}</p>
                              <p className="text-xs text-muted-foreground">
                                {credential.platform} • {credential.geography}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => toggleManageCredential(credential.id)}
                            >
                              <UsersIcon className="h-4 w-4" />
                              <span>{memberCount} collaborator{memberCount === 1 ? '' : 's'}</span>
                            </Button>
                          </div>
                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              {memberCount === 0 ? (
                                <p className="text-sm text-muted-foreground">No collaborators yet.</p>
                              ) : (
                                credential.members.map((member) => {
                                  const memberKey = `${credential.id}:${member.id}`
                                  const isRemoving = removingMemberKey === memberKey
                                  return (
                                    <div
                                      key={member.id}
                                      className="flex items-center justify-between rounded border p-2 text-sm"
                                    >
                                      <div>
                                        <p className="font-medium">{member.user.name || member.user.email}</p>
                                        <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                                      </div>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="flex items-center gap-1"
                                        onClick={() => handleRemoveMember(credential.id, member.id)}
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
                  <Button variant="outline" onClick={() => handleBulkDialogChange(false)}>
                    Close
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Collaboration Summary Dialog */}
        <Dialog open={isCollabSummaryDialogOpen} onOpenChange={handleCollabSummaryDialogChange}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Collaboration Summary</DialogTitle>
              <DialogDescription>Here&apos;s what happened with your collaboration request.</DialogDescription>
            </DialogHeader>
            {collabSummary ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-lg font-semibold">{collabSummary.created}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Updated</p>
                    <p className="text-lg font-semibold">{collabSummary.updated}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Skipped</p>
                    <p className="text-lg font-semibold">{collabSummary.skipped}</p>
                  </div>
                </div>
                {collabSummary.inaccessibleCredentialCount ? (
                  <div className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                    {collabSummary.inaccessibleCredentialCount} credential
                    {collabSummary.inaccessibleCredentialCount > 1 ? 's were' : ' was'} not available for collaboration
                    due to permissions or privacy level.
                  </div>
                ) : null}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {collabSummary.details.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-6">
                      No collaboration changes were made.
                    </div>
                  ) : (
                    collabSummary.details.map((detail) => (
                      <div key={detail.memberId} className="rounded-lg border p-3">
                        <p className="font-medium">{detail.memberName || detail.memberEmail || 'Member'}</p>
                        <p className="text-sm text-muted-foreground">
                          {detail.action === 'created' && `Sent ${detail.credentialCount} credential request(s).`}
                          {detail.action === 'updated' && `Updated request with ${detail.credentialCount} additional credential(s).`}
                          {detail.action === 'skipped' && 'Request skipped.'}
                        </p>
                        {detail.note && <p className="text-xs text-yellow-700 mt-1">{detail.note}</p>}
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={() => handleCollabSummaryDialogChange(false)}>Close</Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No summary available. Please try sending the collaboration request again.
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add/Edit Credential Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) closeDialog()
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCredential ? 'Edit Credential' : 'Add Credential'}</DialogTitle>
              <DialogDescription>
                {editingCredential ? 'Update the credential details below.' : 'Fill in the details to add a new credential.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company">Company *</Label>
                  <Input
                    id="company"
                    value={formData.company}
                    onChange={(e) => updateFormField('company', e.target.value)}
                    placeholder="Enter company name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="geography">Geography *</Label>
                  <Input
                    id="geography"
                    value={formData.geography}
                    onChange={(e) => updateFormField('geography', e.target.value)}
                    placeholder="Enter geography"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="platform">Platform *</Label>
                <Input
                  id="platform"
                  value={formData.platform}
                  onChange={(e) => updateFormField('platform', e.target.value)}
                  placeholder="Enter platform name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => updateFormField('url', e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <Label htmlFor="username">Username/Email *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => updateFormField('username', e.target.value)}
                  placeholder="Enter username or email"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateFormField('password', e.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>
              <div>
                <Label htmlFor="authenticator">Authenticator</Label>
                <Input
                  id="authenticator"
                  value={formData.authenticator}
                  onChange={(e) => updateFormField('authenticator', e.target.value)}
                  placeholder="Enter authenticator code or app"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.notes}
                  onChange={(e) => updateFormField('notes', e.target.value)}
                  placeholder="Additional notes"
                />
              </div>
              <div>
                <Label htmlFor="privacyLevel">Privacy Level *</Label>
                <Select value={formData.privacyLevel} onValueChange={(value: 'PRIVATE' | 'PUBLIC') => updateFormField('privacyLevel', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select privacy level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRIVATE">Private (Cannot be shared)</SelectItem>
                    <SelectItem value="PUBLIC">Public (Can be shared for collaboration)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Only PUBLIC credentials can be shared with team members for collaboration.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button onClick={editingCredential ? handleUpdateCredential : handleCreateCredential}>
                  {editingCredential ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Collaboration Dialog */}
        <Dialog open={isCollabDialogOpen} onOpenChange={setIsCollabDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Collaborate on Credential</DialogTitle>
              <DialogDescription>
                {selectedCredential?.privacyLevel === 'PUBLIC' 
                  ? 'Add team members to view or edit this credential.'
                  : 'This credential has PRIVATE privacy level and cannot be shared. Please update the privacy level to PUBLIC first.'}
              </DialogDescription>
            </DialogHeader>
            {selectedCredential?.privacyLevel === 'PUBLIC' ? (
              <div className="space-y-4">
                <div>
                  <Label>Add Member</Label>
                  <Select onValueChange={(userId) => handleAddMember(userId, 'viewer')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers
                        .filter(user => 
                          !selectedCredential?.members.some(m => m.user.id === user.id) &&
                          selectedCredential?.createdBy.id !== user.id
                        )
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name || user.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedCredential && selectedCredential.members.length > 0 && (
                  <div>
                    <Label>Current Members</Label>
                    <div className="space-y-2 mt-2">
                      {selectedCredential.members.map((member) => (
                        <div key={member.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <p className="text-sm font-medium">{member.user.name || member.user.email}</p>
                            <Badge variant="outline" className="text-xs mt-1">
                              {member.role}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveMember(selectedCredential.id, member.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  This credential is set to PRIVATE privacy level. Only PUBLIC credentials can be shared with team members.
                  Please edit the credential and change the privacy level to PUBLIC to enable collaboration.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}

