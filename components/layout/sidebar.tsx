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
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api'
import { getToken } from '@/lib/auth-client'

const menuItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, requirePermission: null },
  { name: 'My Tasks', href: '/tasks', icon: CheckSquare, requirePermission: null },
  { name: 'Projects', href: '/projects', icon: FolderKanban, requirePermission: null },
  { name: 'Team Management', href: '/team', icon: Users, requirePermission: null },
  { name: 'Credential Manager', href: '/credentials', icon: Key, requirePermission: 'hasCredentialAccess' },
  { name: 'My Subscriptions', href: '/subscriptions', icon: CreditCard, requirePermission: 'hasSubscriptionAccess' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [userPermissions, setUserPermissions] = useState<{
    hasCredentialAccess?: boolean
    hasSubscriptionAccess?: boolean
    role?: string
  }>({})

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

  // Filter menu items based on permissions
  // Check permissions for all users, including admins
  const roleUpper = userPermissions.role?.toUpperCase() || ''
  const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SUPER_ADMIN'
  const visibleMenuItems = menuItems.filter(item => {
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
        </div>
      </aside>
    </>
  )
}

