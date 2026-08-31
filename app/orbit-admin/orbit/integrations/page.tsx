import { GoogleOAuthSettingsForm } from "@/components/orbit/integration-settings/google-oauth-settings-form";
import { SmtpSettingsForm } from "@/components/orbit/integration-settings/smtp-settings-form";
import { StorageSettingsForm } from "@/components/orbit/integration-settings/storage-settings-form";
import { getIntegrationSettingsSummary } from "@/lib/integration-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations – Orbit Admin" };

export default async function IntegrationsPage() {
  const settings = await getIntegrationSettingsSummary();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-base-content">
          Integrations
        </h1>
        <p className="mt-1 text-sm text-base-content/70">
          Optional — the app works without any of these. Configure what you need
          here instead of editing .env; everything below applies live except
          Google Sign-in, which needs a restart.
        </p>
      </div>

      <SmtpSettingsForm initial={settings.smtp} />
      <GoogleOAuthSettingsForm initial={settings.google} />
      <StorageSettingsForm initial={settings.storage} />
    </div>
  );
}
