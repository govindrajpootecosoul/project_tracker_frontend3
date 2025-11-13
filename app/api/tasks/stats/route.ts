import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get view parameter (my/department/all-departments)
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'my'

    // Get current user's role and department
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
        department: true,
      },
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userRole = currentUser.role?.toLowerCase()
    const isAdmin = userRole === 'admin'
    const isSuperAdmin = userRole === 'superadmin'

    let tasks: any[] = []

    // Determine which tasks to fetch based on view
    if (view === 'my') {
      // My tasks - only tasks assigned to the user
      tasks = await prisma.task.findMany({
        where: {
          assignees: {
            some: {
              userId: session.user.id,
            },
          },
        },
      })
    } else if (view === 'department') {
      // Department tasks - only for admin/super admin
      if (!isAdmin && !isSuperAdmin) {
        return NextResponse.json({ error: 'Only admins can access department tasks' }, { status: 403 })
      }

      if (!currentUser.department) {
        return NextResponse.json({ error: 'User does not have a department assigned' }, { status: 400 })
      }

      // Get all users in the same department
      const departmentUsers = await prisma.user.findMany({
        where: {
          department: currentUser.department,
          isActive: true,
        },
        select: {
          id: true,
        },
      })

      const departmentUserIds = departmentUsers.map(u => u.id)

      // Get tasks assigned to department users
      tasks = await prisma.task.findMany({
        where: {
          assignees: {
            some: {
              userId: {
                in: departmentUserIds,
              },
            },
          },
        },
      })
    } else if (view === 'all-departments') {
      // All departments tasks - only for super admin
      if (!isSuperAdmin) {
        return NextResponse.json({ error: 'Only super admins can access all departments tasks' }, { status: 403 })
      }

      // Get all tasks
      tasks = await prisma.task.findMany({})
    } else {
      // Default to my tasks if invalid view - only assigned tasks
      tasks = await prisma.task.findMany({
        where: {
          assignees: {
            some: {
              userId: session.user.id,
            },
          },
        },
      })
    }

    // Debug: Log all task statuses to see what we're getting
    const allStatuses = tasks.map(t => ({ id: t.id, status: t.status, title: t.title }))
    console.log('=== TASK STATS DEBUG ===')
    console.log('Total tasks found:', tasks.length)
    console.log('All task statuses:', allStatuses)
    console.log('Unique statuses found:', Array.from(new Set(tasks.map(t => t.status))))
    
    // Helper function to normalize status for comparison
    const normalizeStatus = (status: string | null | undefined): string => {
      if (!status) return ''
      return String(status).toUpperCase().trim()
    }
    
    // Count tasks by status - handle all variations
    const statusCounts = {
      IN_PROGRESS: tasks.filter(t => normalizeStatus(t.status) === 'IN_PROGRESS').length,
      COMPLETED: tasks.filter(t => normalizeStatus(t.status) === 'COMPLETED').length,
      YTS: tasks.filter(t => normalizeStatus(t.status) === 'YTS').length,
      ON_HOLD: tasks.filter(t => {
        const status = normalizeStatus(t.status)
        return status === 'ON_HOLD' || status === 'ONHOLD' || status === 'ON HOLD'
      }).length,
      RECURRING: tasks.filter(t => normalizeStatus(t.status) === 'RECURRING').length,
    }
    console.log('Status counts (raw):', statusCounts)
    
    // Also log individual task statuses for debugging
    tasks.forEach(t => {
      console.log(`Task: ${t.title}, Status: "${t.status}" (type: ${typeof t.status})`)
    })

    const stats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => normalizeStatus(t.status) === 'COMPLETED').length,
      inProgress: tasks.filter(t => normalizeStatus(t.status) === 'IN_PROGRESS').length,
      yts: tasks.filter(t => normalizeStatus(t.status) === 'YTS').length,
      onHold: tasks.filter(t => {
        const status = normalizeStatus(t.status)
        return status === 'ON_HOLD' || status === 'ONHOLD' || status === 'ON HOLD'
      }).length,
      overdue: tasks.filter(t => {
        if (!t.dueDate) return false
        return new Date(t.dueDate) < new Date() && normalizeStatus(t.status) !== 'COMPLETED'
      }).length,
      recurring: tasks.filter(t => t.recurring !== null).length,
    }

    console.log('Final stats:', stats)
    console.log('=== END DEBUG ===')

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching task stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

