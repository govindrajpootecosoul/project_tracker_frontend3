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
    console.error('Error fetching tasks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, status, priority, dueDate, projectId, brand, tags, recurring, assignees } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        status: status || 'IN_PROGRESS',
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId: projectId || null,
        brand: brand || null,
        tags: tags || null,
        recurring: recurring || null,
        createdById: session.user.id,
        assignees: {
          create: assignees && assignees.length > 0
            ? assignees.map((userId: string) => ({ userId }))
            : [{ userId: session.user.id }],
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
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Log activity
    try {
      const project = task.projectId ? await prisma.project.findUnique({
        where: { id: task.projectId },
        select: { name: true },
      }) : null

      await prisma.activityLog.create({
        data: {
          type: 'TASK_CREATED',
          action: 'Task Created',
          description: `Created task "${task.title}"${project ? ` in project "${project.name}"` : ''}`,
          entityType: 'task',
          entityId: task.id,
          metadata: JSON.stringify({
            taskTitle: task.title,
            projectName: project?.name,
            status: task.status,
            priority: task.priority,
          }),
          userId: session.user.id,
        },
      })
    } catch (activityError) {
      console.error('Error logging activity:', activityError)
      // Don't fail the request if activity logging fails
    }

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

