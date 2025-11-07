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

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      let error: any = {}
      let errorMessage = `HTTP error! status: ${response.status}`
      
      // Clone the response so we can read it without consuming the original
      const clonedResponse = response.clone()
      
      try {
        const contentType = clonedResponse.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          error = await clonedResponse.json()
          errorMessage = error.error || error.message || errorMessage
        } else {
          // If response is not JSON, try to get text
          const text = await clonedResponse.text()
          if (text) {
            try {
              error = JSON.parse(text)
              errorMessage = error.error || error.message || errorMessage
            } catch {
              errorMessage = text || errorMessage
            }
          }
        }
      } catch (e) {
        // If we can't parse the error, use the status text
        errorMessage = response.statusText || errorMessage
      }
      
      // Provide more helpful error messages
      if (response.status === 500 && errorMessage.includes('subscription')) {
        throw new Error('Backend error: Please ensure Prisma client is regenerated. Stop the backend server, run "npm run db:generate" and "npm run db:push" in the backend directory, then restart the server.')
      }
      
      // Log the full error for debugging
      console.error('API Error:', {
        endpoint,
        url,
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        fullError: error,
      })
      
      // Provide more helpful error messages
      if (response.status === 500) {
        const detailedMessage = error.error || error.message || errorMessage
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

  async getTaskStats(useCache: boolean = true) {
    const endpoint = '/tasks/stats'
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

  async deleteProject(id: string) {
    const result = await this.request(`/projects/${id}`, {
      method: 'DELETE',
    })
    this.clearCache('/projects')
    return result
  }

  // Team - with caching (only for default requests without params)
  async getTeamMembers(params?: { department?: string; search?: string }, useCache: boolean = true) {
    const queryParams = new URLSearchParams()
    if (params?.department) queryParams.append('department', params.department)
    if (params?.search) queryParams.append('search', params.search)
    const query = queryParams.toString()
    const endpoint = `/team/members${query ? `?${query}` : ''}`
    
    // Only use cache for default requests (no params)
    if (useCache && !params?.department && !params?.search) {
      const cached = this.getCachedData<any>(endpoint)
      if (cached) {
        // Fetch fresh data in background
        this.request(endpoint).then(data => this.setCachedData(endpoint, data)).catch(() => {})
        return Promise.resolve(cached)
      }
    }
    const data = await this.request(endpoint)
    // Only cache default requests (no params)
    if (!params?.department && !params?.search) {
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
    return this.request('/team/departments')
  }

  // Email
  async sendEmail(data: any) {
    return this.request('/email/send', {
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
    return this.request(`/tasks/${taskId}/comments`)
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

  // AI Query
  async aiQuery(query: string) {
    return this.request('/ai/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    })
  }

  // Activities - with caching
  async getActivities(useCache: boolean = true) {
    const endpoint = '/activities'
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
}

export const apiClient = new ApiClient(API_BASE_URL)

