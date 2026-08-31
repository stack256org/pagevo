import { redirect } from "next/navigation";

type Props = { params: Promise<{ workspace: string }> };

export default async function SettingsIndexPage({ params }: Props) {
  const { workspace } = await params;
  redirect(`/app/${workspace}/settings/profile`);
}
