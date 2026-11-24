import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="px-5 pt-10 pb-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-7 w-28" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-16 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-56 mb-1" />
        <Skeleton className="h-4 w-40" />
        <div className="mt-6 glass rounded-card p-5 shadow-card">
          <div className="flex justify-between mb-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-2.5 w-full rounded-full" />
          <div className="flex justify-between mt-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
      <div className="px-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass rounded-card p-4 text-center shadow-card">
              <Skeleton className="h-4 w-4 mx-auto mb-1.5 rounded-full" />
              <Skeleton className="h-5 w-8 mx-auto mb-1" />
              <Skeleton className="h-3 w-10 mx-auto" />
            </div>
          ))}
        </div>
        <Skeleton className="h-16 w-full rounded-card" />
        <Skeleton className="h-14 w-full rounded-card" />
        <div className="flex justify-between">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-20 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
