import { Skeleton } from '@/components/ui/skeleton';

export default function CoachSkeleton() {
  return (
    <div className="min-h-screen pb-24 flex flex-col bg-background">
      <div className="px-5 pt-14 pb-3 bg-card/90 border-b border-border/40">
        <div className="flex items-center gap-2 mb-3">
          {[1, 2].map(i => (
            <div key={i} className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-card bg-secondary/40">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div>
                <Skeleton className="h-3.5 w-12 mb-1" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Skeleton className="h-5 w-16 mb-1" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center py-12">
        <Skeleton className="w-20 h-20 rounded-full mb-4" />
        <Skeleton className="h-4 w-48 mb-2" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  );
}
