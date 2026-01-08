import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function TaskCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="flex flex-wrap gap-2 mb-3">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex items-center gap-4 text-sm mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2 mt-auto">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
        </div>
      </CardContent>
    </Card>
  )
}

export function TaskListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
      {Array.from({ length: count }).map((_, i) => (
        <TaskCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function TaskTableSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-4"><Skeleton className="h-4 w-20" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-16" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-16" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-20" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-24" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-24" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-16" /></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }).map((_, i) => (
              <tr key={i} className="border-b">
                <td className="p-4">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </td>
                <td className="p-4"><Skeleton className="h-6 w-20" /></td>
                <td className="p-4"><Skeleton className="h-6 w-16" /></td>
                <td className="p-4"><Skeleton className="h-6 w-24" /></td>
                <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                <td className="p-4"><Skeleton className="h-8 w-8" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

