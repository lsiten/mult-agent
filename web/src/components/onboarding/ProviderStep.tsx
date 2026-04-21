import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/i18n";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROVIDER_CONFIGS } from "@/lib/providers";

interface ProviderStepProps {
  selectedProvider: string;
  modelName?: string;
  formData: Record<string, string>;
  configuredKeys?: Set<string>;
  onProviderChange: (providerId: string) => void;
  onModelNameChange?: (name: string) => void;
  onFieldChange: (key: string, value: string) => void;
  onTestConnection?: () => Promise<void>;
}

export function ProviderStep({
  selectedProvider,
  modelName = "",
  formData,
  configuredKeys = new Set(),
  onProviderChange,
  onModelNameChange,
  onFieldChange,
  onTestConnection,
}: ProviderStepProps) {
  const { t } = useI18n();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { success: boolean; message: string } | null
  >(null);

  const provider = PROVIDER_CONFIGS.find((p) => p.id === selectedProvider);

  const handleTestConnection = async () => {
    if (!onTestConnection) return;

    setTesting(true);
    setTestResult(null);

    try {
      await onTestConnection();
      setTestResult({
        success: true,
        message: t.onboarding.step2.connectionSuccess,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: t.onboarding.step2.connectionFailed + ": " + (error as Error).message,
      });
    } finally {
      setTesting(false);
    }
  };

  const isFormValid = () => {
    if (!provider) return false;
    if (provider.isOAuth) return true; // OAuth doesn't need form validation

    return provider.fields
      .filter((f) => f.required)
      .every((f) => formData[f.key]?.trim());
  };

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">
          {t.onboarding.step2.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.onboarding.step2.subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
        {/* Provider Selection */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="provider">{t.onboarding.step2.providerLabel}</Label>
          <Select value={selectedProvider} onValueChange={onProviderChange}>
            <SelectTrigger id="provider">
              <SelectValue placeholder={t.onboarding.step2.providerPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_CONFIGS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.emoji} {t.providers[p.id]?.name || p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Model Name (Optional) */}
        {onModelNameChange && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="modelName">
              {t.onboarding.step2.modelNameLabel || "Model Name"} ({t.common.optional || "optional"})
            </Label>
            <Input
              id="modelName"
              type="text"
              placeholder={t.onboarding.step2.modelNamePlaceholder || "e.g., claude-3-5-sonnet-20241022"}
              value={modelName}
              onChange={(e) => onModelNameChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t.onboarding.step2.modelNameHint || "Specify the model identifier to use with this provider"}
            </p>
          </div>
        )}

        {/* Provider Details */}
        {provider && (
          <div className="border border-border p-4 rounded-lg flex flex-col gap-4">
            <div className="flex items-start gap-2">
              <span className="text-2xl">{provider.emoji}</span>
              <div className="flex-1">
                <h3 className="font-semibold">
                  {t.providers[provider.id]?.name || provider.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t.providers[provider.id]?.description || provider.description}
                </p>
              </div>
            </div>

            {/* OAuth Special Case */}
            {provider.isOAuth ? (
              <Alert>
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium">
                    ⚠️ {t.onboarding.step2.oauthNote}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.onboarding.step2.oauthInstruction}
                  </p>
                  <code className="block bg-muted p-2 rounded text-xs">
                    $ {provider.oauthCommand}
                  </code>
                  <p className="text-xs text-muted-foreground">
                    {t.onboarding.step2.oauthCommand}
                  </p>
                </div>
              </Alert>
            ) : (
              <>
                {/* Dynamic Form Fields */}
                {provider.fields.map((field) => {
                  const isConfigured = configuredKeys.has(field.key);
                  return (
                    <div key={field.key} className="flex flex-col gap-2">
                      <Label htmlFor={field.key}>
                        {field.label} {field.required && <span className="text-destructive">*</span>}
                        {isConfigured && (
                          <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                            (Already configured)
                          </span>
                        )}
                      </Label>
                      <Input
                        id={field.key}
                        type={field.type}
                        placeholder={
                          isConfigured
                            ? "Leave empty to keep current value"
                            : field.placeholder
                        }
                        value={formData[field.key] || field.defaultValue || ""}
                        onChange={(e) => onFieldChange(field.key, e.target.value)}
                        required={field.required && !isConfigured}
                      />
                      {field.hint && (
                        <p className="text-xs text-muted-foreground">{field.hint}</p>
                      )}
                    </div>
                  );
                })}

                {/* Test Connection Button */}
                {onTestConnection && (
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testing || !isFormValid()}
                  >
                    {testing ? t.onboarding.step2.testing : t.onboarding.step2.testConnection}
                  </Button>
                )}

                {/* Test Result */}
                {testResult && (
                  <div
                    className={`text-sm p-2 rounded ${
                      testResult.success
                        ? "bg-green-500/10 text-green-600"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}
              </>
            )}

            {/* Documentation Link */}
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              🔗 {t.onboarding.step2.getKey}: {provider.docsUrl.replace('https://', '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
