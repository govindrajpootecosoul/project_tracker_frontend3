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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Users as UsersIcon, Download, CreditCard, DollarSign, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts'

interface Subscription {
  id: string
  name: string
  url?: string
  amount: number
  currency: string
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAUSED'
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'WEEKLY'
  startDate: string
  renewalDate: string
  description?: string
  notes?: string
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
  name: string
  url: string
  amount: string
  currency: string
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAUSED'
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'WEEKLY'
  startDate: string
  description: string
  notes: string
}

const initialFormData: FormData = {
  name: '',
  url: '',
  amount: '',
  currency: 'USD',
  status: 'ACTIVE',
  billingCycle: 'MONTHLY',
  startDate: '',
  description: '',
  notes: '',
}

export default function SubscriptionsPage() {
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCollabDialogOpen, setIsCollabDialogOpen] = useState(false)
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null)
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)

  const fetchSubscriptions = useCallback(async () => {
    try {
      const data = await apiClient.getSubscriptions()
      setSubscriptions(data as Subscription[])
    } catch (error: any) {
      console.error('Failed to fetch subscriptions:', error)
      const errorMessage = error.message || 'Failed to fetch subscriptions. Please ensure the backend server is running and Prisma client is regenerated.'
      alert(errorMessage)
    }
  }, [])

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
        const hasAccess = isAdmin || user.hasSubscriptionAccess === true
        
        if (!hasAccess) {
          router.push('/dashboard')
          alert('You do not have access to My Subscriptions. Please contact your admin.')
          return
        }
      } catch (error) {
        console.error('Failed to check access:', error)
        router.push('/auth/signin')
      }
    }
    
    checkAccess()
    fetchSubscriptions()
    fetchUsers()
  }, [router, fetchSubscriptions, fetchUsers])

  const resetForm = useCallback(() => {
    setFormData(initialFormData)
    setEditingSubscription(null)
  }, [])

  const openCreateDialog = useCallback(() => {
    resetForm()
    setIsDialogOpen(true)
  }, [resetForm])

  const openEditDialog = useCallback((subscription: Subscription) => {
    setEditingSubscription(subscription)
    setFormData({
      name: subscription.name,
      url: subscription.url || '',
      amount: subscription.amount.toString(),
      currency: subscription.currency,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      startDate: format(new Date(subscription.startDate), 'yyyy-MM-dd'),
      description: subscription.description || '',
      notes: subscription.notes || '',
    })
    setIsDialogOpen(true)
  }, [])

  const openCollabDialog = useCallback((subscription: Subscription) => {
    setSelectedSubscription(subscription)
    setIsCollabDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false)
    resetForm()
  }, [resetForm])

  const handleCreateSubscription = useCallback(async () => {
    try {
      if (!formData.name || !formData.amount || !formData.billingCycle || !formData.startDate) {
        alert('Please fill in all required fields')
        return
      }

      await apiClient.createSubscription(formData)
      closeDialog()
      await fetchSubscriptions()
    } catch (error: any) {
      console.error('Failed to create subscription:', error)
      alert(error.message || 'Failed to create subscription')
    }
  }, [formData, closeDialog, fetchSubscriptions])

  const handleUpdateSubscription = useCallback(async () => {
    if (!editingSubscription) return

    try {
      if (!formData.name || !formData.amount || !formData.billingCycle || !formData.startDate) {
        alert('Please fill in all required fields')
        return
      }

      await apiClient.updateSubscription(editingSubscription.id, formData)
      closeDialog()
      await fetchSubscriptions()
    } catch (error: any) {
      console.error('Failed to update subscription:', error)
      alert(error.message || 'Failed to update subscription')
    }
  }, [editingSubscription, formData, closeDialog, fetchSubscriptions])

  const handleDeleteSubscription = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this subscription?')) return
    try {
      await apiClient.deleteSubscription(id)
      await fetchSubscriptions()
    } catch (error) {
      console.error('Failed to delete subscription:', error)
      alert('Failed to delete subscription')
    }
  }, [fetchSubscriptions])

  const handleAddMember = useCallback(async (userId: string, role: string = 'viewer') => {
    if (!selectedSubscription) return
    try {
      await apiClient.addSubscriptionMember(selectedSubscription.id, userId, role)
      await fetchSubscriptions()
      setIsCollabDialogOpen(false)
      setSelectedSubscription(null)
    } catch (error: any) {
      console.error('Failed to add member:', error)
      alert(error.message || 'Failed to add member')
    }
  }, [selectedSubscription, fetchSubscriptions])

  const handleRemoveMember = useCallback(async (memberId: string) => {
    if (!selectedSubscription) return
    try {
      await apiClient.removeSubscriptionMember(selectedSubscription.id, memberId)
      await fetchSubscriptions()
    } catch (error) {
      console.error('Failed to remove member:', error)
      alert('Failed to remove member')
    }
  }, [selectedSubscription, fetchSubscriptions])

  const handleExport = () => {
    const csv = [
      ['Website/App Name', 'URL', 'Amount', 'Currency', 'Status', 'Billing Cycle', 'Start Date', 'Renewal Date', 'Description', 'Notes'],
      ...subscriptions.map(s => [
        s.name,
        s.url || '',
        s.amount.toString(),
        s.currency,
        s.status,
        s.billingCycle,
        format(new Date(s.startDate), 'yyyy-MM-dd'),
        format(new Date(s.renewalDate), 'yyyy-MM-dd'),
        s.description || '',
        s.notes || '',
      ]),
    ].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscriptions-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const updateFormField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  const getStatusBadgeColor = (status: string) => {
    const colors = {
      ACTIVE: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-red-100 text-red-800',
      EXPIRED: 'bg-gray-100 text-gray-800',
      PAUSED: 'bg-yellow-100 text-yellow-800',
    }
    return colors[status as keyof typeof colors] || colors.ACTIVE
  }

  // Calculate monthly cost based on billing cycle
  const calculateMonthlyCost = (amount: number, billingCycle: string): number => {
    switch (billingCycle) {
      case 'WEEKLY':
        return amount * 4.33 // Average weeks per month
      case 'MONTHLY':
        return amount
      case 'QUARTERLY':
        return amount / 3
      case 'YEARLY':
        return amount / 12
      default:
        return amount
    }
  }

  // Calculate KPIs
  const totalSubscriptions = subscriptions.length
  const activeSubscriptions = subscriptions.filter(s => s.status === 'ACTIVE').length
  
  // Status breakdown
  const statusBreakdown = {
    ACTIVE: subscriptions.filter(s => s.status === 'ACTIVE').length,
    CANCELLED: subscriptions.filter(s => s.status === 'CANCELLED').length,
    EXPIRED: subscriptions.filter(s => s.status === 'EXPIRED').length,
    PAUSED: subscriptions.filter(s => s.status === 'PAUSED').length,
  }
  
  // Top 5 subscriptions by amount (active only)
  const top5Subscriptions = subscriptions
    .filter(s => s.status === 'ACTIVE')
    .sort((a, b) => {
      const monthlyA = calculateMonthlyCost(a.amount, a.billingCycle)
      const monthlyB = calculateMonthlyCost(b.amount, b.billingCycle)
      return monthlyB - monthlyA
    })
    .slice(0, 5)
  
  // Calculate total monthly cost by currency
  const monthlyCostsByCurrency: { [key: string]: number } = {}
  subscriptions
    .filter(s => s.status === 'ACTIVE')
    .forEach(sub => {
      const monthlyCost = calculateMonthlyCost(sub.amount, sub.billingCycle)
      if (!monthlyCostsByCurrency[sub.currency]) {
        monthlyCostsByCurrency[sub.currency] = 0
      }
      monthlyCostsByCurrency[sub.currency] += monthlyCost
    })

  // Convert to USD (simplified conversion rates - in production, use real-time rates)
  const conversionRates: { [key: string]: number } = {
    USD: 1,
    EUR: 1.1,
    GBP: 1.27,
    INR: 0.012,
    // Add more currencies as needed
  }

  const totalMonthlyCostUSD = Object.entries(monthlyCostsByCurrency).reduce((total, [currency, amount]) => {
    const rate = conversionRates[currency] || 1
    return total + (amount * rate)
  }, 0)

  const kpiCards = [
    {
      title: 'Total Subscriptions',
      value: totalSubscriptions,
      icon: CreditCard,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Top 5 Subscriptions',
      value: top5Subscriptions.length,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      topSubscriptions: top5Subscriptions,
    },
    {
      title: 'Total Monthly Cost',
      value: `$${totalMonthlyCostUSD.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      subtitle: 'USD',
      breakdown: monthlyCostsByCurrency,
    },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Subscriptions</h1>
            <p className="text-muted-foreground">Manage your subscriptions and collaborate with your team</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => {
              // Open a dialog to manage collaboration for all subscriptions
              if (subscriptions.length > 0) {
                // For now, just show a message - can be enhanced later
                alert('Collaboration feature: You can add members to individual subscriptions from the table actions.')
              } else {
                alert('No subscriptions available for collaboration.')
              }
            }}>
              <UsersIcon className="h-4 w-4 mr-2" />
              Collab
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Subscription
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-3">
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
                        {kpi.subtitle && (
                          <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>
                        )}
                        {kpi.breakdown && Object.keys(kpi.breakdown).length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Breakdown by Currency:</p>
                            {Object.entries(kpi.breakdown).map(([currency, amount]) => (
                              <div key={currency} className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{currency}:</span>
                                <span className="font-medium">
                                  {currency === 'USD' 
                                    ? `$${amount.toFixed(2)}` 
                                    : `${currency} ${amount.toFixed(2)}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {kpi.topSubscriptions && kpi.topSubscriptions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Top Subscriptions:</p>
                            {kpi.topSubscriptions.map((sub, idx) => {
                              const monthlyCost = calculateMonthlyCost(sub.amount, sub.billingCycle)
                              return (
                                <div key={sub.id} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground truncate flex-1 mr-2">
                                    {idx + 1}. {sub.name}
                                  </span>
                                  <span className="font-medium flex-shrink-0">
                                    {sub.currency === 'USD' 
                                      ? `$${monthlyCost.toFixed(2)}` 
                                      : `${sub.currency} ${monthlyCost.toFixed(2)}`}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
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

        {/* Status Breakdown Chart */}
        {subscriptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Subscription Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Active', value: statusBreakdown.ACTIVE, color: '#10b981' },
                          { name: 'Cancelled', value: statusBreakdown.CANCELLED, color: '#ef4444' },
                          { name: 'Expired', value: statusBreakdown.EXPIRED, color: '#6b7280' },
                          { name: 'Paused', value: statusBreakdown.PAUSED, color: '#f59e0b' },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {[
                          { name: 'Active', value: statusBreakdown.ACTIVE, color: '#10b981' },
                          { name: 'Cancelled', value: statusBreakdown.CANCELLED, color: '#ef4444' },
                          { name: 'Expired', value: statusBreakdown.EXPIRED, color: '#6b7280' },
                          { name: 'Paused', value: statusBreakdown.PAUSED, color: '#f59e0b' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-green-600 rounded"></div>
                        <span className="font-medium">Active</span>
                      </div>
                      <span className="font-bold text-lg">{statusBreakdown.ACTIVE}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-red-600 rounded"></div>
                        <span className="font-medium">Cancelled</span>
                      </div>
                      <span className="font-bold text-lg">{statusBreakdown.CANCELLED}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-gray-600 rounded"></div>
                        <span className="font-medium">Expired</span>
                      </div>
                      <span className="font-bold text-lg">{statusBreakdown.EXPIRED}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-yellow-600 rounded"></div>
                        <span className="font-medium">Paused</span>
                      </div>
                      <span className="font-bold text-lg">{statusBreakdown.PAUSED}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {subscriptions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No subscriptions found. Click "Add Subscription" to get started.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Subscriptions</CardTitle>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4">Website/App Name</th>
                      <th className="text-left p-4">URL</th>
                      <th className="text-left p-4">Amount</th>
                      <th className="text-left p-4">Currency</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-left p-4">Billing Cycle</th>
                      <th className="text-left p-4">Start Date</th>
                      <th className="text-left p-4">Renewal Date</th>
                      <th className="text-left p-4">Members</th>
                      <th className="text-left p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((subscription) => (
                      <motion.tr
                        key={subscription.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-b hover:bg-accent/50"
                      >
                        <td className="p-4">
                          <div className="font-medium">{subscription.name}</div>
                          {subscription.description && (
                            <div className="text-sm text-muted-foreground mt-1">{subscription.description}</div>
                          )}
                        </td>
                        <td className="p-4">
                          {subscription.url ? (
                            <a href={subscription.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                              {subscription.url}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-4">{subscription.amount.toFixed(2)}</td>
                        <td className="p-4">{subscription.currency}</td>
                        <td className="p-4">
                          <Badge className={getStatusBadgeColor(subscription.status)}>
                            {subscription.status}
                          </Badge>
                        </td>
                        <td className="p-4">{subscription.billingCycle}</td>
                        <td className="p-4">{format(new Date(subscription.startDate), 'MMM dd, yyyy')}</td>
                        <td className="p-4">{format(new Date(subscription.renewalDate), 'MMM dd, yyyy')}</td>
                        <td className="p-4">
                          <TooltipProvider>
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-2">
                                {subscription.members.slice(0, 3).map((member) => (
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
                                {subscription.members.length > 3 && (
                                  <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs">
                                    +{subscription.members.length - 3}
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {subscription.members.length}
                              </span>
                            </div>
                          </TooltipProvider>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(subscription)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteSubscription(subscription.id)}
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

        {/* Add/Edit Subscription Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) closeDialog()
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSubscription ? 'Edit Subscription' : 'Add Subscription'}</DialogTitle>
              <DialogDescription>
                {editingSubscription ? 'Update the subscription details below.' : 'Fill in the details to add a new subscription.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Website/App Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateFormField('name', e.target.value)}
                  placeholder="e.g., Netflix, GitHub"
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount">Amount *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => updateFormField('amount', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={formData.currency} onValueChange={(value) => updateFormField('currency', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="INR">INR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => updateFormField('status', value as FormData['status'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      <SelectItem value="EXPIRED">Expired</SelectItem>
                      <SelectItem value="PAUSED">Paused</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="billingCycle">Billing Cycle *</Label>
                  <Select value={formData.billingCycle} onValueChange={(value) => updateFormField('billingCycle', value as FormData['billingCycle'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                      <SelectItem value="YEARLY">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => updateFormField('startDate', e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Select start date and billing cycle to calculate renewal date
                </p>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => updateFormField('description', e.target.value)}
                  placeholder="Brief description"
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button onClick={editingSubscription ? handleUpdateSubscription : handleCreateSubscription}>
                  {editingSubscription ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Collaboration Dialog */}
        <Dialog open={isCollabDialogOpen} onOpenChange={setIsCollabDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Collaborate on Subscription</DialogTitle>
              <DialogDescription>
                Add team members to view or edit this subscription.
              </DialogDescription>
            </DialogHeader>
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
                        !selectedSubscription?.members.some(m => m.user.id === user.id) &&
                        selectedSubscription?.createdBy.id !== user.id
                      )
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedSubscription && selectedSubscription.members.length > 0 && (
                <div>
                  <Label>Current Members</Label>
                  <div className="space-y-2 mt-2">
                    {selectedSubscription.members.map((member) => (
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
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}

