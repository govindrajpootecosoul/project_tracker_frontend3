export interface TaskComment {
  id: string
  content: string
  taskId: string
  userId: string
  mentions?: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name?: string
    email: string
  }
}

