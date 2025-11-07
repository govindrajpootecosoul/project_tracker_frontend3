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

    // Get user's projects to filter activities
    const userProjects = await prisma.projectMember.findMany({
      where: { userId: session.user.id },
      select: { projectId: true },
    })

    const projectIds = userProjects.map(p => p.projectId)

    // Get tasks assigned to user or in user's projects
    const userTasks = await prisma.task.findMany({
      where: {
        OR: [
          { assignees: { some: { userId: session.user.id } } },
          { projectId: { in: projectIds } },
        ],
      },
      select: { id: true },
    })

    const taskIds = userTasks.map(t => t.id)

    // Get activities related to user's tasks and projects
    const activities = await prisma.activityLog.findMany({
      where: {
        OR: [
          { userId: session.user.id },
          {
            entityType: 'task',
            entityId: { in: taskIds },
          },
          {
            entityType: 'project',
            entityId: { in: projectIds },
          },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // Get last 50 activities
    })

    return NextResponse.json(activities)
  } catch (error) {
    console.error('Error fetching activities:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


