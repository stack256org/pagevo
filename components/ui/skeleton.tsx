import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "skeleton rounded-sm animate-pulse bg-base-200",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
