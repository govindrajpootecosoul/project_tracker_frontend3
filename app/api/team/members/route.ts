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

    // Get all users who are in the same projects as the current user
    const userProjects = await prisma.projectMember.findMany({
      where: { userId: session.user.id },
      select: { projectId: true },
    })

    const projectIds = userProjects.map(p => p.projectId)

    const projectMembers = await prisma.projectMember.findMany({
      where: {
        projectId: {
          in: projectIds,
        },
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
    })

    // Get unique users
    const userIds = Array.from(new Set(projectMembers.map(pm => pm.userId)))
    
    // Get task statistics for each user
    const teamMembers = await Promise.all(
      userIds.map(async (userId) => {
        const tasks = await prisma.task.findMany({
          where: {
            OR: [
              {
                assignees: {
                  some: {
                    userId,
                  },
                },
              },
              {
                createdById: userId,
              },
            ],
          },
        })

        const projects = await prisma.projectMember.findMany({
          where: { userId },
          select: { projectId: true },
        })

        return {
          id: userId,
          name: projectMembers.find(pm => pm.userId === userId)?.user.name,
          email: projectMembers.find(pm => pm.userId === userId)?.user.email,
          tasksAssigned: tasks.length,
          projectsInvolved: projects.length,
          statusSummary: {
            inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
            completed: tasks.filter(t => t.status === 'COMPLETED').length,
            yts: tasks.filter(t => t.status === 'YTS').length,
            onHold: tasks.filter(t => {
              const status = String(t.status).toUpperCase().trim()
              return status === 'ON_HOLD' || status === 'ONHOLD' || status === 'ON HOLD'
            }).length,
            recurring: tasks.filter(t => t.status === 'RECURRING').length,
          },
        }
      })
    )

    return NextResponse.json(teamMembers)
  } catch (error) {
    console.error('Error fetching team members:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

