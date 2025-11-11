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

    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          {
            assignees: {
              some: {
                userId: session.user.id,
              },
            },
          },
          {
            createdById: session.user.id,
          },
        ],
      },
    })

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

