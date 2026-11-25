import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CARD_HEIGHTS = ["h-56", "h-72", "h-44", "h-64", "h-80", "h-52"];

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="flex gap-4 overflow-x-auto border-b pb-2.5">
        {["w-14", "w-16", "w-10", "w-16"].map((w, i) => (
          <Skeleton key={i} className={cn("h-5 shrink-0", w)} />
        ))}
      </div>

      <Skeleton className="h-10 w-full sm:max-w-sm" />

      <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-6">
        {Array.from({ length: 18 }).map((_, i) => (
          <li key={i} className="mb-3 break-inside-avoid">
            <Skeleton className={cn("w-full rounded-xl", CARD_HEIGHTS[i % CARD_HEIGHTS.length])} />
          </li>
        ))}
      </ul>
    </div>
  );
}
