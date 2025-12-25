import type { TaskComment } from '@/types/comments'

export interface DepartmentDto {
  id?: string
  name: string
  userCount?: number
  projectCount?: number
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
const CACHE_PREFIX = 'api_cache_'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

class ApiClient {
  private baseUrl: string
  private token: string | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token')
    }
  }

  // Cache helper methods
  private getCacheKey(endpoint: string): string {
    return `${CACHE_PREFIX}${endpoint}`
  }

  private getCachedData<T>(endpoint: string): T | null {
    if (typeof window === 'undefined') return null
    try {
      const cacheKey = this.getCacheKey(endpoint)
      const cached = localStorage.getItem(cacheKey)
      if (!cached) return null

      const { data, timestamp } = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is still valid
      if (now - timestamp < CACHE_DURATION) {
        return data as T
      }
      
      // Cache expired, remove it
      localStorage.removeItem(cacheKey)
      return null
    } catch (e) {
      return null
    }
  }

  private setCachedData<T>(endpoint: string, data: T): void {
    if (typeof window === 'undefined') return
    try {
      const cacheKey = this.getCacheKey(endpoint)
      const cacheData = {
        data,
        timestamp: Date.now()
      }
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
    } catch (e) {
      // Ignore cache errors (e.g., quota exceeded)
    }
  }

  private clearCache(endpoint?: string): void {
    if (typeof window === 'undefined') return
    if (endpoint) {
      localStorage.removeItem(this.getCacheKey(endpoint))
    } else {
      // Clear all cache
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key)
        }
      })
    }
  }

  setToken(token: string | null) {
    this.token = token
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('token', token)
      } else {
        localStorage.removeItem('token')
      }
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    // Get token from localStorage if not set
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('token')
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers,
      })
    } catch (networkError: any) {
      // Handle network errors (connection refused, timeout, etc.)
      console.error('Network Error:', {
        endpoint,
        url,
        error: networkError.message,
        type: networkError.name,
      })
      throw new Error(`Network error: Unable to connect to the backend server. Please ensure the backend is running on ${this.baseUrl.replace('/api', '')}`)
    }

    if (!response.ok) {
      let error: any = {}
      let errorMessage = `HTTP error! status: ${response.status}`
      
      // Clone the response so we can read it without consuming the original
      const clonedResponse = response.clone()
      
      try {
        const contentType = clonedResponse.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const jsonData = await clonedResponse.json()
          error = jsonData || {}
          errorMessage = error.error || error.message || errorMessage
        } else {
          // If response is not JSON, try to get text
          const text = await clonedResponse.text()
          if (text && text.trim()) {
            try {
              error = JSON.parse(text)
              errorMessage = error.error || error.message || errorMessage
            } catch {
              errorMessage = text || errorMessage
            }
          } else {
            // Use status text if no body
            errorMessage = response.statusText || errorMessage
          }
        }
      } catch (e: any) {
        // If we can't parse the error, use the status text
        errorMessage = response.statusText || errorMessage
        if (e?.message) {
          console.warn('Error parsing response:', e.message)
        }
      }
      
      // Provide more helpful error messages
      if (response.status === 500 && errorMessage.includes('subscription')) {
        throw new Error('Backend error: Please ensure Prisma client is regenerated. Stop the backend server, run "npm run db:generate" and "npm run db:push" in the backend directory, then restart the server.')
      }
      
      // Only log errors for non-404 status codes (404s are expected for missing resources)
      if (response.status !== 404) {
        // Build log object with only meaningful data
        const logData: any = {
          endpoint,
          url,
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
        }
        
        // Only include fullError if it has meaningful content
        if (error && typeof error === 'object' && Object.keys(error).length > 0) {
          logData.fullError = error
        }
        
        // Only log if we have meaningful data to show
        if (logData.error || logData.status) {
          console.error('API Error:', logData)
        }
      }
      
      // Provide more helpful error messages
      if (response.status === 500) {
        const detailedMessage = error?.error || error?.message || errorMessage
        throw new Error(detailedMessage || 'Internal server error. Please check the backend logs.')
      }
      
      throw new Error(errorMessage)
    }

    return response.json()
  }

  // Auth
  async signIn(email: string, password: string) {
    const data = await this.request<{ token: string; user: any }>('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    this.setToken(data.token)
    return data
  }

  async signUp(email: string, password: string, name?: string) {
    const data = await this.request<{ token: string; user: any }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    })
    this.setToken(data.token)
    return data
  }

  async requestPasswordReset(email: string) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  async verifyPasswordResetCode(email: string, code: string) {
    return this.request('/auth/verify-reset-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    })
  }

  async resetPassword(email: string, code: string, password: string) {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
    })
  }

  // Tasks - with caching
  async getTasks(useCache: boolean = true) {
    const endpoint = '/tasks'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        // Fetch fresh data in background
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getMyTasks(useCache: boolean = true) {
    const endpoint = '/tasks/my'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getTeamTasks(useCache: boolean = true) {
    const endpoint = '/tasks/team'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getReviewTasks(useCache: boolean = true) {
    const endpoint = '/tasks/review'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getTaskStats(view: 'my' | 'department' | 'all-departments' = 'my', useCache: boolean = true) {
    const endpoint = `/tasks/stats?view=${view}`
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getDepartmentTasks(useCache: boolean = true) {
    const endpoint = '/tasks/department'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getAllDepartmentsTasks(useCache: boolean = true) {
    const endpoint = '/tasks/all-departments'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getTask(id: string) {
    return this.request(`/tasks/${id}`)
  }

  async getAssignableMembers(search?: string) {
    const queryParams = new URLSearchParams()
    if (search) queryParams.append('search', search)
    const query = queryParams.toString()
    return this.request(`/tasks/assignable-members${query ? `?${query}` : ''}`)
  }

  async createTask(data: any) {
    const result = await this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    // Clear task-related cache
    this.clearCache('/tasks')
    this.clearCache('/tasks/my')
    this.clearCache('/tasks/team')
    this.clearCache('/tasks/stats')
    return result
  }

  async updateTask(id: string, data: any) {
    const result = await this.request(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    // Clear task-related cache
    this.clearCache('/tasks')
    this.clearCache('/tasks/my')
    this.clearCache('/tasks/team')
    this.clearCache('/tasks/stats')
    return result
  }

  async deleteTask(id: string) {
    const result = await this.request(`/tasks/${id}`, {
      method: 'DELETE',
    })
    // Clear task-related cache
    this.clearCache('/tasks')
    this.clearCache('/tasks/my')
    this.clearCache('/tasks/team')
    this.clearCache('/tasks/stats')
    return result
  }

  // Projects - with caching
  async getProjects(useCache: boolean = true) {
    const endpoint = '/projects'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getProject(id: string) {
    return this.request(`/projects/${id}`)
  }

  async createProject(data: any) {
    const result = await this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    this.clearCache('/projects')
    return result
  }

  async updateProject(id: string, data: any) {
    const result = await this.request(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    this.clearCache('/projects')
    return result
  }

  async removeProjectMember(projectId: string, memberId: string) {
    const result = await this.request(`/projects/${projectId}/members/${memberId}`, {
      method: 'DELETE',
    })
    this.clearCache('/projects')
    return result
  }

  async deleteProject(id: string) {
    const result = await this.request(`/projects/${id}`, {
      method: 'DELETE',
    })
    this.clearCache('/projects')
    return result
  }

  async requestProjectCollaboration(data: { projectIds: string[]; memberIds: string[]; manualEmails?: string[]; role?: 'member' | 'owner'; message?: string }) {
    const result = await this.request('/projects/collaborations/request', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    this.clearCache('/projects')
    return result
  }

  async getProjectCollaborationRequests() {
    return this.request('/projects/collaborations/requests', {
      method: 'GET',
    })
  }

  async getSentProjectCollaborationRequests() {
    return this.request('/projects/collaborations/requests/sent', {
      method: 'GET',
    })
  }

  async respondProjectCollaborationRequest(requestId: string, accept: boolean) {
    return this.request(`/projects/collaborations/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    })
  }

  // Team - with caching (skips caching only for search queries)
  async getTeamMembers(params?: { department?: string; search?: string }, useCache: boolean = true) {
    const queryParams = new URLSearchParams()
    if (params?.department) queryParams.append('department', params.department)
    if (params?.search) queryParams.append('search', params.search)
    const query = queryParams.toString()
    const endpoint = `/team/members${query ? `?${query}` : ''}`
    
    const shouldCache = !params?.search

    if (useCache && shouldCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        // Fetch fresh data in background
        this.request(endpoint)
          .then(data => this.setCachedData(endpoint, data))
          .catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    if (shouldCache) {
      this.setCachedData(endpoint, data)
    }
    return data
  }

  async getTeamUsers(params?: { department?: string; search?: string }) {
    const queryParams = new URLSearchParams()
    if (params?.department) queryParams.append('department', params.department)
    if (params?.search) queryParams.append('search', params.search)
    const query = queryParams.toString()
    return this.request(`/team/users${query ? `?${query}` : ''}`)
  }

  async getDepartments() {
    return this.request<DepartmentDto[] | string[]>('/team/departments')
  }

  async createDepartment(name: string) {
    const result = await this.request('/team/departments', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    this.clearCache('/team/departments')
    return result
  }

  async deleteDepartment(id: string) {
    const result = await this.request(`/team/departments/${id}`, {
      method: 'DELETE',
    })
    this.clearCache('/team/departments')
    return result
  }

  async updateDepartment(id: string, name: string) {
    const result = await this.request(`/team/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    })
    this.clearCache('/team/departments')
    this.clearCache('/team/members') // Clear team members cache since department names changed
    return result
  }

  async updateMemberDepartment(userId: string, department?: string | null) {
    const result = await this.request(`/team/members/${userId}/department`, {
      method: 'PUT',
      body: JSON.stringify({ department }),
    })
    this.clearCache('/team/members')
    return result
  }

  // Email
  async sendEmail(data: any) {
    return this.request('/email/send', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Auto Email Config
  async getAutoEmailConfig() {
    return this.request('/email/admin/auto-email-config')
  }

  async updateAutoEmailConfig(data: {
    enabled?: boolean
    toEmails?: string[]
    departments?: string[]
    daysOfWeek?: number[]
    timeOfDay?: string
    timezone?: string
    sendWhenEmpty?: boolean
  }) {
    return this.request('/email/admin/auto-email-config', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Notifications
  async getNotifications() {
    return this.request('/notifications')
  }

  async getUnreadNotificationCount() {
    return this.request('/notifications/unread-count')
  }

  async markNotificationAsRead(id: string) {
    return this.request(`/notifications/${id}/read`, {
      method: 'PUT',
    })
  }

  async markAllNotificationsAsRead() {
    return this.request('/notifications/read-all', {
      method: 'PUT',
    })
  }

  // Credentials - with caching
  async getCredentials(useCache: boolean = true) {
    const endpoint = '/credentials'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getCredential(id: string) {
    return this.request(`/credentials/${id}`)
  }

  async createCredential(data: any) {
    const result = await this.request('/credentials', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    this.clearCache('/credentials')
    return result
  }

  async updateCredential(id: string, data: any) {
    const result = await this.request(`/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    this.clearCache('/credentials')
    return result
  }

  async deleteCredential(id: string) {
    const result = await this.request(`/credentials/${id}`, {
      method: 'DELETE',
    })
    this.clearCache('/credentials')
    return result
  }

  async addCredentialMember(credentialId: string, userId: string, role: string = 'viewer') {
    return this.request(`/credentials/${credentialId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    })
  }

  async removeCredentialMember(credentialId: string, memberId: string) {
    return this.request(`/credentials/${credentialId}/members/${memberId}`, {
      method: 'DELETE',
    })
  }

  async toggleCredentialMemberActive(credentialId: string, memberId: string, isActive: boolean) {
    return this.request(`/credentials/${credentialId}/members/${memberId}/active`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    })
  }

  async requestCredentialCollaboration(data: { credentialIds: string[]; memberIds: string[]; role?: 'viewer' | 'editor'; message?: string }) {
    return this.request('/credentials/collaborations/request', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getCredentialCollaborationRequests() {
    return this.request('/credentials/collaborations/requests')
  }

  async respondCredentialCollaborationRequest(requestId: string, accept: boolean) {
    return this.request(`/credentials/collaborations/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    })
  }

  // Subscriptions - with caching
  async getSubscriptions(useCache: boolean = true) {
    const endpoint = '/subscriptions'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  async getSubscription(id: string) {
    return this.request(`/subscriptions/${id}`)
  }

  async createSubscription(data: any) {
    const result = await this.request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    this.clearCache('/subscriptions')
    return result
  }

  async updateSubscription(id: string, data: any) {
    const result = await this.request(`/subscriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    this.clearCache('/subscriptions')
    return result
  }

  async deleteSubscription(id: string) {
    const result = await this.request(`/subscriptions/${id}`, {
      method: 'DELETE',
    })
    this.clearCache('/subscriptions')
    return result
  }

  async addSubscriptionMember(subscriptionId: string, userId: string, role: string = 'viewer') {
    return this.request(`/subscriptions/${subscriptionId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    })
  }

  async removeSubscriptionMember(subscriptionId: string, memberId: string) {
    return this.request(`/subscriptions/${subscriptionId}/members/${memberId}`, {
      method: 'DELETE',
    })
  }

  async toggleSubscriptionMemberActive(subscriptionId: string, memberId: string, isActive: boolean) {
    return this.request(`/subscriptions/${subscriptionId}/members/${memberId}/active`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    })
  }

  async requestSubscriptionCollaboration(data: { subscriptionIds: string[]; memberIds: string[]; role?: 'viewer' | 'editor'; message?: string }) {
    const result = await this.request('/subscriptions/collaborations/request', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    this.clearCache('/subscriptions')
    return result
  }

  async getSubscriptionCollaborationRequests() {
    return this.request('/subscriptions/collaborations/requests', {
      method: 'GET',
    })
  }

  async getSentSubscriptionCollaborationRequests() {
    return this.request('/subscriptions/collaborations/requests/sent', {
      method: 'GET',
    })
  }

  async respondSubscriptionCollaborationRequest(requestId: string, accept: boolean) {
    return this.request(`/subscriptions/collaborations/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    })
  }

  // Get user role / profile
  async getUserRole(useCache: boolean = true) {
    const endpoint = '/auth/me'
    if (useCache) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    this.setCachedData(endpoint, data)
    return data
  }

  // Comments
  async getTaskComments(taskId: string) {
    return this.request<TaskComment[]>(`/tasks/${taskId}/comments`)
  }

  async createComment(taskId: string, content: string, mentions?: string[]) {
    return this.request(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, mentions }),
    })
  }

  // Review workflow
  async requestReview(taskId: string, reviewerId: string) {
    return this.request(`/tasks/${taskId}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviewerId }),
    })
  }

  async acceptReviewRequest(taskId: string, accept: boolean) {
    return this.request(`/tasks/${taskId}/review/accept`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    })
  }

  async respondToReview(taskId: string, action: 'APPROVED' | 'REJECTED', comment?: string) {
    return this.request(`/tasks/${taskId}/review/respond`, {
      method: 'POST',
      body: JSON.stringify({ action, comment }),
    })
  }

  // Team member features
  async updateMemberFeatures(userId: string, hasCredentialAccess?: boolean, hasSubscriptionAccess?: boolean) {
    const result = await this.request(`/team/members/${userId}/features`, {
      method: 'PUT',
      body: JSON.stringify({ hasCredentialAccess, hasSubscriptionAccess }),
    })
    this.clearCache('/auth/me')
    return result
  }

  async updateMemberRole(userId: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN') {
    const result = await this.request(`/team/members/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    })
    this.clearCache('/team/members')
    return result
  }

  async deactivateMember(userId: string) {
    const result = await this.request(`/team/members/${userId}`, {
      method: 'DELETE',
    })
    this.clearCache('/team/members')
    return result
  }

  async createTeamMember(data: {
    name?: string
    email: string
    password: string
    department?: string
    company?: string
    employeeId?: string
    role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
    hasCredentialAccess?: boolean
    hasSubscriptionAccess?: boolean
  }) {
    const result = await this.request('/team/members', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    this.clearCache('/team/members')
    return result
  }

  async updateTeamMember(userId: string, data: {
    name?: string
    email?: string
    password?: string
    department?: string
    company?: string
    employeeId?: string
    role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
    hasCredentialAccess?: boolean
    hasSubscriptionAccess?: boolean
  }) {
    const result = await this.request(`/team/members/${userId}/details`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    this.clearCache('/team/members')
    return result
  }

  // AI Query
  async aiQuery(query: string) {
    return this.request('/ai/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    })
  }

  // Activities - with caching and pagination
  async getActivities(
    view: 'my' | 'department' | 'all-departments' = 'my', 
    options: { limit?: number; skip?: number; useCache?: boolean } = {}
  ) {
    const { limit = 20, skip = 0, useCache = false } = options
    const endpoint = `/activities?view=${view}&limit=${limit}&skip=${skip}`
    
    // Don't use cache for paginated requests to avoid stale data
    const data = await this.request(endpoint)
    return data
  }
}

export const apiClient = new ApiClient(API_BASE_URL)

