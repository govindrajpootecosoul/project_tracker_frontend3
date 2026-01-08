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
import { Loader2, Save, ArrowLeft, Plus, X, Trash2, Check } from 'lucide-react'
import { DepartmentDto } from '@/lib/api'

interface DepartmentConfig {
  department: string
  enabled: boolean
  daysOfWeek: number[]
  timeOfDay: string
  lastRunAt?: string | null
}

interface AutoEmailConfig {
  id?: string
  enabled: boolean
  toEmails: string[]
  timezone: string
  sendWhenEmpty: boolean
  departmentConfigs: DepartmentConfig[]
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
    timezone: 'Asia/Kolkata',
    sendWhenEmpty: false,
    departmentConfigs: [],
  })
  const [departments, setDepartments] = useState<DepartmentDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')

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
      // Ensure departmentConfigs exists
      if (!configData.departmentConfigs) {
        configData.departmentConfigs = []
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
      if (config.departmentConfigs.length === 0) {
        setError('Please add at least one department configuration when enabled')
        return
      }
      // Validate each department config
      for (const deptConfig of config.departmentConfigs) {
        if (deptConfig.enabled) {
          if (deptConfig.daysOfWeek.length === 0) {
            setError(`Department ${deptConfig.department}: Please select at least one day of week when enabled`)
            return
          }
          if (!deptConfig.timeOfDay || !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(deptConfig.timeOfDay)) {
            setError(`Department ${deptConfig.department}: Please enter a valid time in HH:MM format (e.g., 18:00)`)
            return
          }
        }
      }
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await apiClient.updateAutoEmailConfig({
        enabled: config.enabled,
        toEmails: config.toEmails,
        timezone: config.timezone,
        sendWhenEmpty: config.sendWhenEmpty,
        departmentConfigs: config.departmentConfigs,
      })
      setSuccess('Configuration saved successfully!')
      await loadConfig() // Reload to get updated lastRunAt
    } catch (error: any) {
      console.error('Failed to save config:', error)
      setError(error.message || 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const addEmail = async () => {
    const email = newEmail.trim()
    if (!email) {
      setError('Please enter an email address')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Invalid email format')
      return
    }

    const emailLower = email.toLowerCase()
    if (config.toEmails.includes(emailLower)) {
      setError('Email already added')
      return
    }

    // Add email to the list immediately in local state
    const updatedToEmails = [...config.toEmails, emailLower]
    setConfig((prev) => ({
      ...prev,
      toEmails: updatedToEmails,
    }))
    setNewEmail('')
    setError(null)

    // Auto-save to backend immediately
    try {
      await apiClient.updateAutoEmailConfig({
        enabled: config.enabled,
        toEmails: updatedToEmails,
        timezone: config.timezone,
        sendWhenEmpty: config.sendWhenEmpty,
        departmentConfigs: config.departmentConfigs,
      })
      setSuccess(`Email "${emailLower}" added and saved successfully!`)
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null)
      }, 3000)
    } catch (error: any) {
      console.error('Failed to save email:', error)
      // Revert the change if save failed
      setConfig((prev) => ({
        ...prev,
        toEmails: prev.toEmails.filter((e) => e !== emailLower),
      }))
      setError(error.message || 'Failed to save email. Please try again.')
    }
  }

  const removeEmail = async (emailToRemove: string) => {
    // Remove email from local state immediately
    const updatedToEmails = config.toEmails.filter((email) => email !== emailToRemove)
    setConfig((prev) => ({
      ...prev,
      toEmails: updatedToEmails,
    }))

    // Auto-save to backend immediately
    try {
      await apiClient.updateAutoEmailConfig({
        enabled: config.enabled,
        toEmails: updatedToEmails,
        timezone: config.timezone,
        sendWhenEmpty: config.sendWhenEmpty,
        departmentConfigs: config.departmentConfigs,
      })
      setSuccess(`Email "${emailToRemove}" removed successfully!`)
      
      // Clear success message after 2 seconds
      setTimeout(() => {
        setSuccess(null)
      }, 2000)
    } catch (error: any) {
      console.error('Failed to remove email:', error)
      // Revert the change if save failed
      setConfig((prev) => ({
        ...prev,
        toEmails: [...prev.toEmails, emailToRemove],
      }))
      setError(error.message || 'Failed to remove email. Please try again.')
    }
  }

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addEmail()
    }
  }

  const addDepartment = (departmentName: string) => {
    // Check if department already exists
    if (config.departmentConfigs.some((dc) => dc.department === departmentName)) {
      setError(`Department ${departmentName} is already configured`)
      return
    }

    setConfig((prev) => ({
      ...prev,
      departmentConfigs: [
        ...prev.departmentConfigs,
        {
          department: departmentName,
          enabled: true,
          daysOfWeek: [1, 2, 3, 4, 5], // Default to weekdays
          timeOfDay: '18:00',
        },
      ],
    }))
    setError(null)
  }

  const removeDepartment = (departmentName: string) => {
    setConfig((prev) => ({
      ...prev,
      departmentConfigs: prev.departmentConfigs.filter((dc) => dc.department !== departmentName),
    }))
  }

  const updateDepartmentConfig = (departmentName: string, updates: Partial<DepartmentConfig>) => {
    setConfig((prev) => ({
      ...prev,
      departmentConfigs: prev.departmentConfigs.map((dc) =>
        dc.department === departmentName ? { ...dc, ...updates } : dc
      ),
    }))
  }

  const toggleDay = (departmentName: string, day: number) => {
    const deptConfig = config.departmentConfigs.find((dc) => dc.department === departmentName)
    if (!deptConfig) return

    const newDays = deptConfig.daysOfWeek.includes(day)
      ? deptConfig.daysOfWeek.filter((d) => d !== day)
      : [...deptConfig.daysOfWeek, day].sort()

    updateDepartmentConfig(departmentName, { daysOfWeek: newDays })
  }

  const selectWeekdays = (departmentName: string) => {
    updateDepartmentConfig(departmentName, { daysOfWeek: [1, 2, 3, 4, 5] })
  }

  const selectAllDays = (departmentName: string) => {
    updateDepartmentConfig(departmentName, { daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })
  }

  const clearDays = (departmentName: string) => {
    updateDepartmentConfig(departmentName, { daysOfWeek: [] })
  }

  const isDepartmentConfigured = (deptName: string) => {
    return config.departmentConfigs.some((dc) => dc.department === deptName)
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
      <div className="container mx-auto py-8 max-w-6xl">
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
            Configure automatic department-wise task email sending with per-department schedules
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Auto Email Configuration</CardTitle>
            <CardDescription>
              Configure when and how automatic department-wise task emails are sent. Each department can have its own schedule.
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
                  When enabled, emails will be sent automatically based on each department's schedule below
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
                Add email addresses that will receive all automatic emails
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
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={config.timezone}
                onValueChange={(value) =>
                  setConfig((prev) => ({ ...prev, timezone: value }))
                }
                disabled={!config.enabled}
              >
                <SelectTrigger className="w-64">
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

            {/* Send When Empty */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="sendWhenEmpty" className="text-base font-semibold">
                  Send email even if there are no tasks
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  When enabled, emails will be sent even when no tasks are found
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

            {/* Department Configurations */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Department Configurations *</Label>
                {departments.length > 0 && (
                  <Select
                    onValueChange={(value) => {
                      // Only add if not already configured
                      if (!isDepartmentConfigured(value)) {
                        addDepartment(value)
                      }
                    }}
                    disabled={!config.enabled}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Add Department..." />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => {
                        const deptName = typeof dept === 'string' ? dept : dept.name
                        const isConfigured = isDepartmentConfigured(deptName)
                        return (
                          <SelectItem 
                            key={deptName} 
                            value={deptName}
                            disabled={isConfigured}
                            className={isConfigured ? 'opacity-60 cursor-not-allowed' : ''}
                          >
                            <div className="flex items-center gap-2">
                              {isConfigured && <Check className="h-4 w-4 text-green-600" />}
                              <span>{deptName}</span>
                              {isConfigured && <span className="text-xs text-muted-foreground ml-auto">(Already added)</span>}
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Configure schedule for each department. Each department will receive a separate email at its configured time.
              </p>

              {config.departmentConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground italic p-4 border rounded-md">
                  No departments configured. Add a department to configure its schedule.
                </p>
              ) : (
                <div className="space-y-4">
                  {config.departmentConfigs.map((deptConfig) => (
                    <Card key={deptConfig.department} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{deptConfig.department}</CardTitle>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`enabled-${deptConfig.department}`} className="text-sm">
                                Enabled
                              </Label>
                              <Switch
                                id={`enabled-${deptConfig.department}`}
                                checked={deptConfig.enabled}
                                onCheckedChange={(checked) =>
                                  updateDepartmentConfig(deptConfig.department, { enabled: checked })
                                }
                                disabled={!config.enabled}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeDepartment(deptConfig.department)}
                              disabled={!config.enabled}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Days of Week */}
                        <div className="space-y-2">
                          <Label>Days of week *</Label>
                          <div className="flex gap-2 mb-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => selectWeekdays(deptConfig.department)}
                              disabled={!config.enabled || !deptConfig.enabled}
                            >
                              Weekdays
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => selectAllDays(deptConfig.department)}
                              disabled={!config.enabled || !deptConfig.enabled}
                            >
                              All Days
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => clearDays(deptConfig.department)}
                              disabled={!config.enabled || !deptConfig.enabled}
                            >
                              Clear
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {DAYS_OF_WEEK.map((day) => (
                              <div key={day.value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`day-${deptConfig.department}-${day.value}`}
                                  checked={deptConfig.daysOfWeek.includes(day.value)}
                                  onCheckedChange={() => toggleDay(deptConfig.department, day.value)}
                                  disabled={!config.enabled || !deptConfig.enabled}
                                />
                                <Label
                                  htmlFor={`day-${deptConfig.department}-${day.value}`}
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
                          <Label htmlFor={`time-${deptConfig.department}`}>Send email at *</Label>
                          <Input
                            id={`time-${deptConfig.department}`}
                            type="time"
                            value={deptConfig.timeOfDay}
                            onChange={(e) =>
                              updateDepartmentConfig(deptConfig.department, { timeOfDay: e.target.value })
                            }
                            className="w-32"
                            disabled={!config.enabled || !deptConfig.enabled}
                          />
                        </div>

                        {/* Last Run Info */}
                        {deptConfig.lastRunAt && (
                          <p className="text-xs text-muted-foreground">
                            Last sent: {new Date(deptConfig.lastRunAt).toLocaleString()}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t">
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
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>Each department can have its own schedule (days and time)</li>
              <li>Each department receives a <strong>separate email</strong> with only its own tasks</li>
              <li>All emails are sent <strong>To:</strong> the configured recipient emails</li>
              <li>Each email includes only employees from that specific department in <strong>CC</strong></li>
              <li>If 4 departments are configured, 4 separate emails will be sent (one per department)</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
