'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Users as UsersIcon, Download, Eye, EyeOff, Copy, Check, CreditCard } from 'lucide-react'
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

  const fetchCredentials = useCallback(async () => {
    try {
      const data = await apiClient.getCredentials()
      setCredentials(data as Credential[])
    } catch (error) {
      console.error('Failed to fetch credentials:', error)
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

  const handleRemoveMember = useCallback(async (memberId: string) => {
    if (!selectedCredential) return
    
    if (!confirm('Are you sure you want to remove this member?')) {
      return
    }
    
    try {
      await apiClient.removeCredentialMember(selectedCredential.id, memberId)
      await fetchCredentials()
    } catch (error: any) {
      console.error('Failed to remove member:', error)
      alert(error.message || 'Failed to remove member')
    }
  }, [selectedCredential, fetchCredentials])

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

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Credential Manager</h1>
            <p className="text-muted-foreground">Manage login credentials and collaborate with your team</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => {
              // Open a dialog to manage collaboration for PUBLIC credentials only
              const publicCredentials = credentials.filter(c => c.privacyLevel === 'PUBLIC')
              if (publicCredentials.length > 0) {
                // For now, just show a message - can be enhanced later
                alert(`Collaboration feature: You can add members to individual PUBLIC credentials from the table actions. Found ${publicCredentials.length} PUBLIC credential(s) available for collaboration.`)
              } else {
                alert('No PUBLIC credentials available for collaboration. Please create credentials with PUBLIC privacy level to enable sharing.')
              }
            }}>
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
                            onClick={() => handleRemoveMember(member.id)}
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

