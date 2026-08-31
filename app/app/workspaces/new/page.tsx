import { createWorkspaceAction } from "@/app/actions/workspaces";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { PRODUCT_NAME } from "@/config/platform";
import { requireSession } from "@/lib/authz";
import { CreateWorkspaceSubmitButton } from "./submit-button";

export const metadata = { title: `Create Workspace — ${PRODUCT_NAME}` };

type Props = { searchParams: Promise<{ kind?: string; error?: string }> };

export default async function NewWorkspacePage({ searchParams }: Props) {
  await requireSession();
  const { kind, error } = await searchParams;
  const isTeam = kind === "team";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-200 px-4 py-16">
      <div className="flex w-full max-w-sm flex-col items-center">
        {/* Logo */}
        <div className="mb-8">
          <Logo className="h-9 w-auto" height={40} width={160} />
        </div>

        {/* Heading */}
        <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
          {isTeam ? "Create your team workspace" : "Create your workspace"}
        </h1>
        <p className="mb-8 text-center text-sm text-base-content/70">
          {isTeam
            ? "A shared space for your team to organise, write, and ship."
            : "Your personal space to capture ideas and stay organised."}
        </p>

        {/* Form card */}
        <div className="w-full overflow-hidden rounded-lg border border-base-300 bg-base-100">
          <form action={createWorkspaceAction} className="px-7 pt-7 pb-5">
            <input
              name="kind"
              type="hidden"
              value={isTeam ? "team" : "personal"}
            />

            <div className="space-y-1.5">
              <Label
                className="text-sm font-medium text-base-content"
                htmlFor="name"
              >
                {isTeam ? "Team name" : "Workspace name"}
              </Label>
              <Input
                autoFocus
                className="w-full focus-visible:border-primary"
                id="name"
                maxLength={100}
                name="name"
                placeholder={isTeam ? "e.g. Acme Corp" : "e.g. My Projects"}
                required
                type="text"
              />
              {error === "empty-name" && (
                <p className="text-xs text-error">
                  Please enter a name for your workspace.
                </p>
              )}
            </div>

            <CreateWorkspaceSubmitButton
              label={isTeam ? "Create team workspace" : "Create workspace"}
            />
          </form>

          <div className="border-t border-base-300 px-7 py-4">
            <p className="text-center text-xs text-base-content/50">
              You can rename or create more workspaces later in settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
