import { useState, useEffect } from "react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { LanguageStep } from "@/components/onboarding/LanguageStep";
import { ProviderStep } from "@/components/onboarding/ProviderStep";
import { OptionalFeaturesStep } from "@/components/onboarding/OptionalFeaturesStep";
import { CompletionStep } from "@/components/onboarding/CompletionStep";
import { PROVIDER_CONFIGS, getDefaultProviderId } from "@/lib/providers";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

// Helper function to extract model name from full model string (remove any provider prefix)
function extractModelName(fullModelName: string): string {
  if (!fullModelName) return "";
  // Remove any provider prefix (format: "provider/model-name")
  const slashIndex = fullModelName.indexOf("/");
  if (slashIndex > 0) {
    return fullModelName.substring(slashIndex + 1);
  }
  return fullModelName;
}

function normalizeModelNameForProvider(modelName: string, providerId: string): string {
  const trimmed = modelName.trim();
  if (!trimmed) return "";

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0) return trimmed;

  const prefix = trimmed.substring(0, slashIndex);
  const bareModel = trimmed.substring(slashIndex + 1);
  if (prefix === providerId && providerId !== "openrouter") {
    return bareModel;
  }
  return trimmed;
}

export function OnboardingModal({ open, onComplete, onSkip }: OnboardingModalProps) {
  const { t, locale } = useI18n();
  const [currentStep, setCurrentStep] = useState(1);
  const [language, setLanguage] = useState<string>(locale);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [modelName, setModelName] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Pre-fill configuration from existing env vars
  useEffect(() => {
    if (open) {
      loadExistingConfiguration();
    }
  }, [open]);

  const loadExistingConfiguration = async () => {
    try {
      const [envVars, config] = await Promise.all([
        api.getEnvVars(),
        api.getConfig(),
      ]);

      const configuredSet = new Set<string>();

      // Collect all configured environment variables
      for (const [key, info] of Object.entries(envVars)) {
        if (info.is_set) {
          configuredSet.add(key);
        }
      }

      // Get default provider ID based on language
      const defaultProviderId = getDefaultProviderId(language);
      let providerToSelect = defaultProviderId;

      // Load current model/provider from config.
      if (typeof config.model === "string" && config.model.trim()) {
        setModelName(extractModelName(config.model.trim()));
      } else if (
        config.model &&
        typeof config.model === "object" &&
        !Array.isArray(config.model)
      ) {
        const modelConfig = config.model as Record<string, unknown>;
        const configuredModel =
          typeof modelConfig.default === "string"
            ? modelConfig.default
            : typeof modelConfig.name === "string"
              ? modelConfig.name
              : "";
        const configuredProvider =
          typeof modelConfig.provider === "string" ? modelConfig.provider : "";

        if (configuredModel.trim()) {
          setModelName(configuredModel.trim());
        }
        if (configuredProvider.trim()) {
          providerToSelect = configuredProvider.trim();
        }
      }

      // Store which keys are already configured
      setConfiguredKeys(configuredSet);

      // Initialize form data with default values from selected provider
      const defaultProvider = PROVIDER_CONFIGS.find((p) => p.id === providerToSelect);
      const initialFormData: Record<string, string> = {};
      if (defaultProvider) {
        defaultProvider.fields.forEach((field) => {
          if (field.defaultValue) {
            initialFormData[field.key] = field.defaultValue;
          }
        });
      }
      setFormData(initialFormData);

      setSelectedProvider(providerToSelect);
    } catch (error) {
      console.error("Failed to load existing configuration:", error);
      // Fallback to default provider based on language
      setSelectedProvider(getDefaultProviderId(language));
    }
  };

  // Update default provider when language changes
  useEffect(() => {
    if (language && !selectedProvider) {
      setSelectedProvider(getDefaultProviderId(language));
    }
  }, [language, selectedProvider]);

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      // Click on backdrop
      onSkip();
    }
  };

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onSkip();
    }
  };

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open]);

  // Validation
  const isStep2Valid = () => {
    const provider = PROVIDER_CONFIGS.find((p) => p.id === selectedProvider);
    if (!provider) return false;
    if (provider.isOAuth) return true; // OAuth doesn't need form validation
    return provider.fields
      .filter((f) => f.required)
      .every((f) => {
        // Field is valid if either:
        // 1. User has entered a new value, OR
        // 2. Field is already configured
        return formData[f.key]?.trim() || configuredKeys.has(f.key);
      });
  };

  // Save current step's data to backend
  const saveCurrentStepData = async () => {
    setIsSaving(true);
    try {
      const keysToSave: string[] = [];

      if (currentStep === 2) {
        // Save provider configuration
        const provider = PROVIDER_CONFIGS.find((p) => p.id === selectedProvider);
        if (provider && !provider.isOAuth) {
          provider.fields.forEach((field) => {
            // Only save if user has entered a value (not empty)
            if (formData[field.key]?.trim()) {
              keysToSave.push(field.key);
            }
          });
        }
      } else if (currentStep === 3) {
        // Save optional features
        const optionalKeys = [
          "FAL_KEY",
          "BROWSER_CDP_URL",
          "BROWSERBASE_API_KEY",
          "BROWSERBASE_PROJECT_ID",
          "EXA_API_KEY",
          "FIRECRAWL_API_KEY",
        ];
        optionalKeys.forEach((key) => {
          // Only save if user has entered a value (not empty)
          if (formData[key]?.trim()) {
            keysToSave.push(key);
          }
        });
      }

      // Save all keys in parallel
      await Promise.all(
        keysToSave.map((key) => api.setEnvVar(key, formData[key]))
      );
    } catch (error) {
      console.error("Failed to save step data:", error);
      // Don't block navigation on save errors - user can fix in settings
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = async () => {
    // Save current step before proceeding
    if (currentStep === 2 || currentStep === 3) {
      await saveCurrentStepData();
    }

    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - save and complete
      await saveCurrentStepData();
      try {
        const config = await api.getConfig();
        const existingModel =
          config.model &&
          typeof config.model === "object" &&
          !Array.isArray(config.model)
            ? config.model as Record<string, unknown>
            : {};
        const currentDefault =
          typeof existingModel.default === "string"
            ? existingModel.default
            : typeof config.model === "string"
              ? extractModelName(config.model)
              : "";
        const nextModel = { ...existingModel };
        delete nextModel.base_url;

        config.model = {
          ...nextModel,
          provider: selectedProvider,
          default: normalizeModelNameForProvider(modelName.trim() || currentDefault, selectedProvider),
        };
        await api.saveConfig(config);
      } catch (error) {
        console.error("Failed to save model configuration:", error);
      }
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    // Save any configured data before skipping
    await saveCurrentStepData();
    onSkip();
  };

  // Test provider connection with backend API
  const handleTestConnection = async () => {
    const provider = PROVIDER_CONFIGS.find((p) => p.id === selectedProvider);
    if (!provider || provider.isOAuth) {
      throw new Error("Provider not found or is OAuth-based");
    }

    // Validate all required fields are filled
    for (const field of provider.fields) {
      if (field.required && !formData[field.key]?.trim() && !configuredKeys.has(field.key)) {
        throw new Error(`${field.label} is required`);
      }
    }

    // Basic format validation
    for (const field of provider.fields) {
      const value = formData[field.key];
      if (!value) continue;

      // Validate API key format (basic check: should be non-empty and reasonable length)
      if (field.key.includes("API_KEY") || field.key.includes("KEY")) {
        if (value.length < 10) {
          throw new Error(`${field.label} seems too short`);
        }
      }

      // Validate URL format
      if (field.type === "url" && value) {
        try {
          new URL(value);
        } catch {
          throw new Error(`${field.label} is not a valid URL`);
        }
      }
    }

    // Build credentials object with current form data
    const credentials: Record<string, string> = {};
    for (const field of provider.fields) {
      const value = formData[field.key];
      if (value) {
        credentials[field.key] = value;
      }
    }

    const result = await api.testProvider({
      provider: selectedProvider,
      credentials,
      model: modelName.trim() || undefined,
    });

    if (!result.ok) {
      throw new Error(result.error || "Connection test failed");
    }
  };

  const canProceed = () => {
    if (currentStep === 1) return !!language;
    if (currentStep === 2) return isStep2Valid();
    return true; // Steps 3 and 4 are always valid
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={cn(
          "fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none"
        )}
        onClick={handleClose}
      >
        <div
          className={cn(
            "relative w-full max-w-3xl max-h-[90vh] overflow-y-auto pointer-events-auto",
            "bg-card border-2 border-[var(--color-border-prominent)] rounded-lg"
          )}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header with progress */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">
              {t.app.brand} {t.onboarding.common.stepProgress.replace("{current}", String(currentStep)).replace("{total}", "4")}
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={isSaving}
          >
            {t.onboarding.common.skipGuide}
          </Button>
        </div>

        {/* Step Content */}
        <div className="px-6">
          {currentStep === 1 && (
            <LanguageStep value={language} onChange={setLanguage} />
          )}
          {currentStep === 2 && (
            <ProviderStep
              selectedProvider={selectedProvider}
              modelName={modelName}
              formData={formData}
              configuredKeys={configuredKeys}
              onProviderChange={setSelectedProvider}
              onModelNameChange={setModelName}
              onFieldChange={handleFieldChange}
              onTestConnection={handleTestConnection}
            />
          )}
          {currentStep === 3 && (
            <OptionalFeaturesStep
              selectedProvider={selectedProvider}
              formData={formData}
              configuredKeys={configuredKeys}
              onFieldChange={handleFieldChange}
            />
          )}
          {currentStep === 4 && (
            <CompletionStep
              language={language}
              selectedProvider={selectedProvider}
              formData={formData}
              onComplete={onComplete}
            />
          )}
        </div>

        {/* Footer with navigation */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={isSaving}
              >
                {t.onboarding.common.previous}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Progress dots */}
            <div className="flex gap-1 mr-4">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors",
                    step === currentStep
                      ? "bg-primary"
                      : step < currentStep
                      ? "bg-primary/50"
                      : "bg-muted"
                  )}
                />
              ))}
            </div>

            {currentStep < 4 ? (
              <>
                {currentStep === 3 && (
                  <Button
                    variant="outline"
                    onClick={handleNext}
                    disabled={isSaving}
                  >
                    {t.onboarding.common.skip}
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  disabled={!canProceed() || isSaving}
                >
                  {isSaving ? t.common.saving : t.onboarding.common.next}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleNext}
                disabled={isSaving}
                size="lg"
              >
                {isSaving ? t.common.saving : t.onboarding.step4.startButton}
              </Button>
            )}
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
