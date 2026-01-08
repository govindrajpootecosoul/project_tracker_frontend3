import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function TeamMemberCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-6 w-16" />
          </div>
          <div>
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      </CardContent>
    </Card>
  )
}

export function TeamMemberListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
      {Array.from({ length: count }).map((_, i) => (
        <TeamMemberCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function TeamMemberTableSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-4"><Skeleton className="h-4 w-24" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-20" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-16" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-20" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-24" /></th>
              <th className="text-left p-4"><Skeleton className="h-4 w-16" /></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }).map((_, i) => (
              <tr key={i} className="border-b">
                <td className="p-4">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-40" />
                </td>
                <td className="p-4"><Skeleton className="h-6 w-24" /></td>
                <td className="p-4"><Skeleton className="h-6 w-20" /></td>
                <td className="p-4"><Skeleton className="h-6 w-16" /></td>
                <td className="p-4"><Skeleton className="h-6 w-20" /></td>
                <td className="p-4"><Skeleton className="h-8 w-8" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

