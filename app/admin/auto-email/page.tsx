'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save, ArrowLeft, Plus, X } from 'lucide-react'
import { DepartmentDto } from '@/lib/api'

interface AutoEmailConfig {
  id?: string
  enabled: boolean
  toEmails: string[]
  departments: string[]
  daysOfWeek: number[]
  timeOfDay: string
  timezone: string
  sendWhenEmpty: boolean
  lastRunAt?: string | null
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export default function AutoEmailConfigPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<AutoEmailConfig>({
    enabled: false,
    toEmails: ['priyanka.aeron@ecosoulhome.com', 'charu.anand@ecosoulhome.com'],
    departments: [],
    daysOfWeek: [],
    timeOfDay: '18:00',
    timezone: 'Asia/Kolkata',
    sendWhenEmpty: false,
  })
  const [newEmail, setNewEmail] = useState('')
  const [departments, setDepartments] = useState<DepartmentDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const token = getToken()
        if (!token) {
          router.push('/auth/signin')
          return
        }

        const user = await apiClient.getUserRole()
        const isSuperAdmin = user.role?.toUpperCase() === 'SUPER_ADMIN'
        
        if (!isSuperAdmin) {
          router.push('/dashboard')
          alert('Only super admins can access this page.')
          return
        }

        await loadConfig()
        await loadDepartments()
      } catch (error: any) {
        console.error('Failed to check access:', error)
        setError(error.message || 'Failed to load page')
      } finally {
        setLoading(false)
      }
    }

    checkAccess()
  }, [router])

  const loadConfig = async () => {
    try {
      const data = await apiClient.getAutoEmailConfig()
      const configData = data as AutoEmailConfig
      // Ensure toEmails has default values if empty
      if (!configData.toEmails || configData.toEmails.length === 0) {
        configData.toEmails = ['priyanka.aeron@ecosoulhome.com', 'charu.anand@ecosoulhome.com']
      }
      setConfig(configData)
    } catch (error: any) {
      console.error('Failed to load config:', error)
      setError(error.message || 'Failed to load configuration')
    }
  }

  const loadDepartments = async () => {
    try {
      const data = await apiClient.getDepartments()
      // Handle both array of strings and array of DepartmentDto
      const deptList = Array.isArray(data) 
        ? data.map((dept: any) => typeof dept === 'string' ? { name: dept } : dept)
        : []
      setDepartments(deptList as DepartmentDto[])
    } catch (error: any) {
      console.error('Failed to load departments:', error)
    }
  }

  const handleSave = async () => {
    // Validation
    if (config.enabled) {
      if (config.toEmails.length === 0) {
        setError('Please add at least one recipient email when enabled')
        return
      }
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const invalidEmails = config.toEmails.filter((email) => !emailRegex.test(email.trim()))
      if (invalidEmails.length > 0) {
        setError(`Invalid email format: ${invalidEmails.join(', ')}`)
        return
      }
      if (config.departments.length === 0) {
        setError('Please select at least one department when enabled')
        return
      }
      if (config.daysOfWeek.length === 0) {
        setError('Please select at least one day of week when enabled')
        return
      }
      if (!config.timeOfDay || !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(config.timeOfDay)) {
        setError('Please enter a valid time in HH:MM format (e.g., 18:00)')
        return
      }
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await apiClient.updateAutoEmailConfig(config)
      setSuccess('Configuration saved successfully!')
      await loadConfig() // Reload to get updated lastRunAt
    } catch (error: any) {
      console.error('Failed to save config:', error)
      setError(error.message || 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (day: number) => {
    setConfig((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day].sort(),
    }))
  }

  const selectWeekdays = () => {
    setConfig((prev) => ({
      ...prev,
      daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
    }))
  }

  const selectAllDays = () => {
    setConfig((prev) => ({
      ...prev,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
    }))
  }

  const clearDays = () => {
    setConfig((prev) => ({
      ...prev,
      daysOfWeek: [],
    }))
  }

  const addEmail = () => {
    const email = newEmail.trim()
    if (!email) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Invalid email format')
      return
    }

    if (config.toEmails.includes(email.toLowerCase())) {
      setError('Email already added')
      return
    }

    setConfig((prev) => ({
      ...prev,
      toEmails: [...prev.toEmails, email.toLowerCase()],
    }))
    setNewEmail('')
    setError(null)
  }

  const removeEmail = (emailToRemove: string) => {
    setConfig((prev) => ({
      ...prev,
      toEmails: prev.toEmails.filter((email) => email !== emailToRemove),
    }))
  }

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addEmail()
    }
  }

  const getConfigSummary = () => {
    if (!config.enabled) {
      return 'Automatic emails are disabled'
    }

    const dayLabels = config.daysOfWeek
      .sort()
      .map((d) => DAYS_OF_WEEK.find((day) => day.value === d)?.label)
      .filter(Boolean)
      .join(', ')

    const deptNames = config.departments.length > 0
      ? config.departments.join(', ')
      : 'No departments selected'

    return `Emails scheduled for ${dayLabels || 'no days'} at ${config.timeOfDay} (${config.timezone}) for departments: ${deptNames}`
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="container mx-auto py-8 max-w-4xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">Manage Auto Send Mail</h1>
          <p className="text-muted-foreground mt-2">
            Configure automatic department-wise task email sending
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Auto Email Configuration</CardTitle>
            <CardDescription>
              Configure when and how automatic department-wise task emails are sent
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800">
                {error}
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md text-green-800">
                {success}
              </div>
            )}

            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="enabled" className="text-base font-semibold">
                  Enable automatic department-wise task email
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  When enabled, emails will be sent automatically based on the schedule below
                </p>
              </div>
              <Switch
                id="enabled"
                checked={config.enabled}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>

            {/* TO Recipients */}
            <div className="space-y-2">
              <Label>Email Recipients (To) *</Label>
              <p className="text-sm text-muted-foreground">
                Add email addresses that will receive the automatic emails
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Enter email address..."
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value)
                    setError(null)
                  }}
                  onKeyDown={handleEmailKeyDown}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addEmail}
                  disabled={!newEmail.trim()}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
              {config.toEmails.length > 0 && (
                <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                  {config.toEmails.map((email) => (
                    <div
                      key={email}
                      className="flex items-center justify-between p-2 bg-muted rounded-md"
                    >
                      <span className="text-sm">{email}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEmail(email)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {config.toEmails.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No recipients added. Add at least one email address.
                </p>
              )}
            </div>

            {/* Departments Selection */}
            <div className="space-y-2">
              <Label>Departments to include *</Label>
              <p className="text-sm text-muted-foreground">
                Select departments whose tasks will be included in the email
              </p>
              <div className="border rounded-md p-4 max-h-64 overflow-y-auto">
                {departments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No departments available</p>
                ) : (
                  <div className="space-y-2">
                    {departments.map((dept) => {
                      const deptName = typeof dept === 'string' ? dept : dept.name
                      return (
                        <div key={deptName} className="flex items-center space-x-2">
                          <Checkbox
                            id={`dept-${deptName}`}
                            checked={config.departments.includes(deptName)}
                            onCheckedChange={(checked) => {
                              setConfig((prev) => ({
                                ...prev,
                                departments: checked
                                  ? [...prev.departments, deptName]
                                  : prev.departments.filter((d) => d !== deptName),
                              }))
                            }}
                          />
                          <Label
                            htmlFor={`dept-${deptName}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {deptName}
                          </Label>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Days of Week Selection */}
            <div className="space-y-2">
              <Label>Days of week *</Label>
              <p className="text-sm text-muted-foreground">
                Select which days of the week to send emails
              </p>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectWeekdays}
                >
                  Weekdays (Mon-Fri)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllDays}
                >
                  All Days
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearDays}
                >
                  Clear
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={config.daysOfWeek.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    <Label
                      htmlFor={`day-${day.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Time Selection */}
            <div className="space-y-2">
              <Label htmlFor="timeOfDay">Send email at *</Label>
              <p className="text-sm text-muted-foreground">
                Time in 24-hour format (HH:MM)
              </p>
              <div className="flex gap-4">
                <Input
                  id="timeOfDay"
                  type="time"
                  value={config.timeOfDay}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, timeOfDay: e.target.value }))
                  }
                  className="w-32"
                  disabled={!config.enabled}
                />
                <Select
                  value={config.timezone}
                  onValueChange={(value) =>
                    setConfig((prev) => ({ ...prev, timezone: value }))
                  }
                  disabled={!config.enabled}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Send When Empty */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="sendWhenEmpty" className="text-base font-semibold">
                  Send email even if there are no tasks
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  When enabled, emails will be sent even when no tasks are found for selected departments
                </p>
              </div>
              <Switch
                id="sendWhenEmpty"
                checked={config.sendWhenEmpty}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({ ...prev, sendWhenEmpty: checked }))
                }
                disabled={!config.enabled}
              />
            </div>

            {/* Configuration Summary */}
            <div className="p-4 bg-muted rounded-lg">
              <Label className="text-sm font-semibold">Current Configuration:</Label>
              <p className="text-sm text-muted-foreground mt-1">{getConfigSummary()}</p>
              {config.lastRunAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Last automatic send: {new Date(config.lastRunAt).toLocaleString()}
                </p>
              )}
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Email Recipients Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Automatic emails are sent <strong>To:</strong> the email addresses configured above.
              All employees from the selected departments are automatically included in <strong>CC</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}

