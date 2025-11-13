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
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const skip = parseInt(searchParams.get('skip') || '0', 10)

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

    let taskIds: string[] = []
    let projectIds: string[] = []
    let userIds: string[] = []

    // Determine which activities to fetch based on view
    if (view === 'my') {
      // My activities - activities from user's assigned tasks only
      const userProjects = await prisma.projectMember.findMany({
        where: { userId: session.user.id },
        select: { projectId: true },
      })

      projectIds = userProjects.map(p => p.projectId)

      // Only get tasks assigned to the user (not created by them)
      const userTasks = await prisma.task.findMany({
        where: {
          assignees: {
            some: {
              userId: session.user.id,
            },
          },
        },
        select: { id: true },
      })

      taskIds = userTasks.map(t => t.id)
      userIds = [session.user.id]
    } else if (view === 'department') {
      // Department activities - only for admin/super admin
      if (!isAdmin && !isSuperAdmin) {
        return NextResponse.json({ error: 'Only admins can access department activities' }, { status: 403 })
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

      userIds = departmentUsers.map(u => u.id)

      // Get tasks assigned to department users
      const departmentTasks = await prisma.task.findMany({
        where: {
          assignees: {
            some: {
              userId: {
                in: userIds,
              },
            },
          },
        },
        select: { id: true },
      })

      taskIds = departmentTasks.map(t => t.id)

      // Get projects that department users are members of
      const departmentProjects = await prisma.projectMember.findMany({
        where: {
          userId: {
            in: userIds,
          },
        },
        select: { projectId: true },
      })

      projectIds = departmentProjects
        .map(p => p.projectId)
        .filter((projectId, index, arr) => arr.indexOf(projectId) === index)
    } else if (view === 'all-departments') {
      // All departments activities - only for super admin
      if (!isSuperAdmin) {
        return NextResponse.json({ error: 'Only super admins can access all departments activities' }, { status: 403 })
      }

      // Get all tasks
      const allTasks = await prisma.task.findMany({
        select: { id: true },
      })

      taskIds = allTasks.map(t => t.id)

      // Get all projects
      const allProjects = await prisma.project.findMany({
        select: { id: true },
      })

      projectIds = allProjects.map(p => p.id)

      // Get all users
      const allUsers = await prisma.user.findMany({
        select: { id: true },
      })

      userIds = allUsers.map(u => u.id)
    } else {
      // Default to my activities if invalid view - only assigned tasks
      const userProjects = await prisma.projectMember.findMany({
        where: { userId: session.user.id },
        select: { projectId: true },
      })

      projectIds = userProjects.map(p => p.projectId)

      // Only get tasks assigned to the user (not created by them)
      const userTasks = await prisma.task.findMany({
        where: {
          assignees: {
            some: {
              userId: session.user.id,
            },
          },
        },
        select: { id: true },
      })

      taskIds = userTasks.map(t => t.id)
      userIds = [session.user.id]
    }

    // Get activities related to tasks, projects, and users
    const activities = await prisma.activityLog.findMany({
      where: {
        OR: [
          { userId: { in: userIds } },
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
      take: limit,
      skip: skip,
    })

    return NextResponse.json(activities)
  } catch (error) {
    console.error('Error fetching activities:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}



