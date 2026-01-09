'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  FolderKanban,
  Mail,
  Menu,
  X,
  Key,
  CreditCard,
  Settings,
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

const menuItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, requirePermission: null, requireSuperAdmin: false },
  { name: 'My Tasks', href: '/tasks', icon: CheckSquare, requirePermission: null, requireSuperAdmin: false },
  { name: 'Projects', href: '/projects', icon: FolderKanban, requirePermission: null, requireSuperAdmin: false },
  { name: 'Team Management', href: '/team', icon: Users, requirePermission: null, requireSuperAdmin: false },
  { name: 'Credential Manager', href: '/credentials', icon: Key, requirePermission: 'hasCredentialAccess', requireSuperAdmin: false },
  { name: 'My Subscriptions', href: '/subscriptions', icon: CreditCard, requirePermission: 'hasSubscriptionAccess', requireSuperAdmin: false },
  { name: 'Manage Auto Send Mail', href: '/admin/auto-email', icon: Settings, requirePermission: null, requireSuperAdmin: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [thoughts, setThoughts] = useState<Array<{ id: string; content: string; selectedForDate?: string | null }>>([])
  const [dailyThought, setDailyThought] = useState<string | null>(null)
  const [userPermissions, setUserPermissions] = useState<{
    hasCredentialAccess?: boolean
    hasSubscriptionAccess?: boolean
    role?: string
  }>({})
  const [isThoughtDialogOpen, setIsThoughtDialogOpen] = useState(false)
  const [newThought, setNewThought] = useState('')
  const [isSavingThought, setIsSavingThought] = useState(false)
  const [isSelectThoughtDialogOpen, setIsSelectThoughtDialogOpen] = useState(false)

  useEffect(() => {
    const fetchUserPermissions = async () => {
      try {
        const token = getToken()
        if (!token) {
          // If no token, set default permissions (no access to credential/subscription)
          setUserPermissions({
            hasCredentialAccess: false,
            hasSubscriptionAccess: false,
            role: 'USER',
          })
          return
        }

        const user = await apiClient.getUserRole()
        setUserPermissions({
          hasCredentialAccess: user.hasCredentialAccess || false,
          hasSubscriptionAccess: user.hasSubscriptionAccess || false,
          role: user.role || 'USER',
        })
      } catch (error: any) {
        console.error('Failed to fetch user permissions:', error)
        // Set default permissions on error
        setUserPermissions({
          hasCredentialAccess: false,
          hasSubscriptionAccess: false,
          role: 'USER',
        })
      }
    }

    fetchUserPermissions()

    // Listen for permission updates
    const handlePermissionUpdate = () => {
      fetchUserPermissions()
    }
    window.addEventListener('userPermissionsUpdated', handlePermissionUpdate)

    return () => {
      window.removeEventListener('userPermissionsUpdated', handlePermissionUpdate)
    }
  }, [])

  const fetchThoughts = async () => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const res = await fetch(`${base}/thoughts`)
      const data = await res.json()
      const list = Array.isArray(data.thoughts) ? data.thoughts : []
      const thoughtsList = list
        .map((item: any) => ({
          id: item.id || '',
          content: typeof item?.content === 'string' ? item.content.trim() : '',
          selectedForDate: item.selectedForDate || null,
        }))
        .filter((item: any) => item.content && item.id)
      setThoughts(thoughtsList)
      
      // Set daily thought from API (automatically rotated based on day)
      if (data.dailyThought?.content) {
        setDailyThought(data.dailyThought.content)
      } else if (thoughtsList.length > 0) {
        // Fallback: calculate based on day index
        const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
        const thoughtIndex = dayIndex % thoughtsList.length
        setDailyThought(thoughtsList[thoughtIndex]?.content || null)
      } else {
        setDailyThought(null)
      }
    } catch (error) {
      console.error('Failed to load thoughts', error)
      setThoughts([])
      setDailyThought(null)
    }
  }

  useEffect(() => {
    fetchThoughts()
    
    // Poll for updates every 30 seconds so all users see new thoughts
    const interval = setInterval(() => {
      fetchThoughts()
    }, 30000) // 30 seconds

    // Listen for thought update events
    const handleThoughtUpdate = () => {
      fetchThoughts()
    }
    window.addEventListener('thoughtsUpdated', handleThoughtUpdate)

    return () => {
      clearInterval(interval)
      window.removeEventListener('thoughtsUpdated', handleThoughtUpdate)
    }
  }, [])

  const displayThought = useMemo(() => {
    const fallback = 'We do not have any notice for you yet. Share your thoughts with your peers.'
    if (dailyThought) return dailyThought
    if (!thoughts.length) return fallback
    // Fallback: calculate based on day index
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
    const thoughtIndex = dayIndex % thoughts.length
    return thoughts[thoughtIndex]?.content || fallback
  }, [dailyThought, thoughts])

  const isSuperAdmin = useMemo(() => {
    const roleUpper = userPermissions.role?.toUpperCase() || ''
    return roleUpper === 'SUPER_ADMIN'
  }, [userPermissions.role])

  const handleAddThought = async () => {
    if (!newThought.trim()) {
      return
    }

    setIsSavingThought(true)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const token = getToken()
      
      if (!token) {
        alert('You must be logged in to add thoughts.')
        return
      }

      // Get current thoughts and add the new one
      const currentThoughts = thoughts.length > 0 ? thoughts.map(t => t.content) : []
      const updatedThoughts = [...currentThoughts, newThought.trim()]

      const res = await fetch(`${base}/thoughts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ thoughts: updatedThoughts }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data.details || data.error || 'Failed to add thought'
        throw new Error(errorMsg)
      }

      // Refresh thoughts list
      await fetchThoughts()

      // Dispatch event to notify other components/users
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('thoughtsUpdated'))
      }

      // Reset form and close dialog
      setNewThought('')
      setIsThoughtDialogOpen(false)
      
      // Show success message
      alert('Thought added successfully!')
    } catch (error: any) {
      console.error('Failed to add thought:', error)
      alert(error?.message || 'Failed to add thought. Please try again.')
    } finally {
      setIsSavingThought(false)
    }
  }

  const handleSelectThought = async (thoughtId: string) => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const token = getToken()
      
      if (!token) {
        alert('You must be logged in to select thoughts.')
        return
      }

      const res = await fetch(`${base}/thoughts/${thoughtId}/select`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to select thought')
      }

      // Refresh thoughts list
      await fetchThoughts()

      // Dispatch event to notify other components/users
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('thoughtsUpdated'))
      }

      setIsSelectThoughtDialogOpen(false)
      alert('Thought selected successfully! It will show for all users today.')
    } catch (error: any) {
      console.error('Failed to select thought:', error)
      alert(error?.message || 'Failed to select thought. Please try again.')
    }
  }

  // Check if a thought is selected for today
  const isSelectedForToday = (thought: { selectedForDate?: string | null }) => {
    if (!thought.selectedForDate) return false
    const selectedDate = new Date(thought.selectedForDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    selectedDate.setHours(0, 0, 0, 0)
    return selectedDate.getTime() === today.getTime()
  }

  // Filter menu items based on permissions
  // Check permissions for all users, including admins
  const visibleMenuItems = menuItems.filter(item => {
    // Check super admin requirement
    if (item.requireSuperAdmin && !isSuperAdmin) {
      return false
    }
    
    // Always show items that don't require permissions
    if (!item.requirePermission) return true
    
    // For items that require permissions, check if user has the permission
    // Even admins need to have the permission enabled to see these items
    const hasPermission = userPermissions[item.requirePermission as keyof typeof userPermissions] === true
    
    return hasPermission
  })

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
        >
          {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-card border-r z-40 transition-transform duration-300',
          'lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full p-4 pt-20 lg:pt-4">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 bg-clip-text text-transparent">
                Project Hub
              </h1>
              <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
                <img
                  src="/project-initiation.gif"
                  alt="Project Hub Icon"
                  className="w-full h-full object-contain"
                  onError={() => {
                    console.log('GIF not found at /project-initiation.gif')
                    setImageError(true)
                  }}
                />
              </div>
            </div>
          </div>
          
          <nav className="flex-1 space-y-2">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    setIsMobileOpen(false)
                    router.push(item.href)
                  }}
                  className={cn(
                    'w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 transform hover:translate-x-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60',
                    isActive
                      ? 'bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white shadow-orange-500/30'
                      : 'text-foreground hover:bg-accent hover:!text-accent-foreground'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </button>
              )
            })}
          </nav>

          <div className="mt-auto">
            <div className="mt-8 rounded-xl border bg-white shadow-sm p-4 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                <span className="text-xl">💡</span>
              </div>
              <div>
                <p className="font-semibold text-sm">Thoughts Time</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{displayThought}</p>
              </div>
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => setIsThoughtDialogOpen(true)}
                  >
                    Write a message
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => setIsSelectThoughtDialogOpen(true)}
                  >
                    Select Thought for Today
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Add Thought Dialog */}
          <Dialog open={isThoughtDialogOpen} onOpenChange={setIsThoughtDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a Thought</DialogTitle>
                <DialogDescription>
                  Share a thought that will be visible to all users. Thoughts automatically rotate daily (one thought per day).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="thought">Your Thought</Label>
                  <textarea
                    id="thought"
                    placeholder="Enter your thought here..."
                    value={newThought}
                    onChange={(e) => setNewThought(e.target.value)}
                    rows={4}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsThoughtDialogOpen(false)
                    setNewThought('')
                  }}
                  disabled={isSavingThought}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddThought}
                  disabled={!newThought.trim() || isSavingThought}
                >
                  {isSavingThought ? 'Adding...' : 'Add Thought'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Select Thought Dialog */}
          <Dialog open={isSelectThoughtDialogOpen} onOpenChange={setIsSelectThoughtDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Select Thought for Today</DialogTitle>
                <DialogDescription>
                  Choose which thought should be displayed to all users today. This will override the automatic daily rotation for today only.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-4">
                {thoughts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No thoughts available. Add a thought first.
                  </p>
                ) : (
                  thoughts.map((thought) => {
                    const isSelected = isSelectedForToday(thought)
                    return (
                      <div
                        key={thought.id}
                        className={cn(
                          'p-4 rounded-lg border cursor-pointer transition-all',
                          isSelected
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950'
                            : 'border-border hover:border-orange-300 hover:bg-accent'
                        )}
                        onClick={() => handleSelectThought(thought.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{thought.content}</p>
                            {isSelected && (
                              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                Selected for Today
                              </p>
                            )}
                          </div>
                          {isSelected && (
                            <div className="h-5 w-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsSelectThoughtDialogOpen(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </aside>
    </>
  )
}

