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

    // Get all tasks where user is not assigned but is part of the same projects
    const userProjects = await prisma.projectMember.findMany({
      where: { userId: session.user.id },
      select: { projectId: true },
    })

    const projectIds = userProjects.map(p => p.projectId)

    const tasks = await prisma.task.findMany({
      where: {
        projectId: {
          in: projectIds,
        },
        assignees: {
          none: {
            userId: session.user.id,
          },
        },
      },
      include: {
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(tasks)
  } catch (error) {
    console.error('Error fetching team tasks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}



