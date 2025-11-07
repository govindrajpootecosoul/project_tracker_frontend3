# Project & Task Tracker

A full-stack web application for managing projects, tasks, and team collaboration built with Next.js, TypeScript, TailwindCSS, Shadcn UI, Prisma, and NextAuth.

## Features

- ✅ **Authentication**: Secure user authentication with NextAuth.js
- 📊 **Dashboard**: Visual overview with KPI cards and charts
- ✅ **Tasks Management**: Create, edit, delete, and track tasks with status and priority
- 📁 **Projects**: Organize tasks by projects with team collaboration
- 👥 **Team Management**: View team workload and send emails
- 🎨 **Modern UI**: Beautiful, responsive design with TailwindCSS and Shadcn UI
- ✨ **Animations**: Smooth transitions with Framer Motion
- 📱 **Responsive**: Works on desktop, tablet, and mobile

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **UI Components**: Shadcn UI (Radix UI)
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Charts**: Recharts
- **Database**: Prisma ORM with SQLite
- **Authentication**: NextAuth.js

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure:
   - `DATABASE_URL="file:./dev.db"` (SQLite)
   - `NEXTAUTH_URL="http://localhost:3000"`
   - `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)

3. **Set up database**
   ```bash
   npm run db:generate  # Generate Prisma client
   npm run db:push     # Push schema to database
   ```

4. **Create initial user** (optional)
   - Use Prisma Studio: `npm run db:studio`
   - Or create a seed script to add users

5. **Run development server**
   ```bash
   npm run dev
   ```

6. **Open application**
   - Navigate to http://localhost:3000
   - Sign in with your credentials

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio

## Project Structure

```
frontend/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # API endpoints
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Dashboard page
│   ├── tasks/             # Tasks page
│   ├── projects/          # Projects page
│   └── team/              # Team Management page
├── components/            # React components
│   ├── ui/                # Shadcn UI components
│   └── layout/            # Layout components
├── lib/                   # Utility functions and configurations
├── prisma/                # Database schema
└── types/                 # TypeScript type definitions
```

## Database Schema

The application uses Prisma with the following main models:
- **User**: User accounts with authentication
- **Task**: Tasks with status, priority, assignees
- **Project**: Projects with members
- **Team**: Team organization
- **Comment**: Task comments
- **EmailLog**: Email sending logs

## Features Overview

### Dashboard
- KPI cards showing task statistics
- Charts for task status breakdown, tasks by project, and tasks by team member
- Visual overview of performance

### Tasks
- **My Tasks**: View and manage your assigned tasks
- **Team Tasks**: View tasks assigned to team members
- Full CRUD operations
- Status and priority management
- Recurring tasks support
- Comments functionality

### Projects
- **Overview Dashboard**: KPI cards and charts
- **Manage Projects**: CRUD operations for projects
- Team collaboration
- Task tracking per project

### Team Management
- **Team Overview**: View team member statistics
- **Send Email**: Compose and send emails to team members
- Workload visualization

## Authentication

The application uses NextAuth.js with a Credentials provider. Users can sign in with email and password. All routes are protected by middleware.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For issues and questions, please open an issue on the repository.
