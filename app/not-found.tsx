import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-lg bg-base-200 ring-1 ring-base-300">
          <FileQuestion
            className="size-6 text-base-content/70"
            strokeWidth={1.5}
          />
        </div>
        <h1 className="mb-2 text-lg font-bold text-base-content">
          Page not found
        </h1>
        <p className="text-sm leading-relaxed text-base-content/70">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Go back home</Link>
        </Button>
      </div>
    </main>
  );
}
