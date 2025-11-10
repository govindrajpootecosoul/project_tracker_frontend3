import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create a test user
  const hashedPassword = await bcrypt.hash('password123', 10)
  
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test User',
      password: hashedPassword,
    },
  })

  console.log('Created user:', user)

  // Create a sample project
  const project = await prisma.project.create({
    data: {
      name: 'Sample Project',
      description: 'This is a sample project',
      status: 'ACTIVE',
      members: {
        create: {
          userId: user.id,
          role: 'owner',
        },
      },
    },
  })

  console.log('Created project:', project)

  // Create a sample task
  const task = await prisma.task.create({
    data: {
      title: 'Sample Task',
      description: 'This is a sample task',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      createdById: user.id,
      projectId: project.id,
      assignees: {
        create: {
          userId: user.id,
        },
      },
    },
  })

  console.log('Created task:', task)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })



