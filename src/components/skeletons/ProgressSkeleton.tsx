import { Skeleton } from '@/components/ui/skeleton';

export default function ProgressSkeleton() {
  return (
    <div className="min-h-screen pb-24 px-5 pt-14 bg-background">
      <Skeleton className="h-8 w-24 mb-6" />
      <div className="glass rounded-card p-6 mb-5 shadow-card text-center">
        <Skeleton className="h-4 w-24 mx-auto mb-3" />
        <Skeleton className="w-24 h-24 rounded-full mx-auto mb-3" />
        <Skeleton className="h-3 w-40 mx-auto" />
      </div>
      <Skeleton className="h-16 w-full rounded-card mb-5" />
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="glass rounded-card p-4 shadow-card">
            <Skeleton className="h-5 w-5 mb-2" />
            <Skeleton className="h-5 w-12 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-card" />
    </div>
  );
}
