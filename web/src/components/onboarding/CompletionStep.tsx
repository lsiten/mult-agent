import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { getProviderById } from "@/lib/providers";

interface CompletionStepProps {
  language: string;
  selectedProvider: string;
  formData: Record<string, string>;
  onComplete: () => void;
}

export function CompletionStep({
  language,
  selectedProvider,
  formData,
  onComplete,
}: CompletionStepProps) {
  const { t } = useI18n();
  const provider = getProviderById(selectedProvider);

  const getOptionalFeaturesCount = () => {
    let count = 0;
    if (formData.FAL_KEY) count++;
    if (formData.BROWSER_CDP_URL || formData.BROWSERBASE_API_KEY) count++;
    if (formData.EXA_API_KEY) count++;
    if (formData.FIRECRAWL_API_KEY) count++;
    return count;
  };

  const optionalCount = getOptionalFeaturesCount();

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="text-center">
        <div className="text-5xl mb-4">✓</div>
        <h2 className="text-2xl font-semibold mb-2">
          {t.onboarding.step4.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.onboarding.step4.subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
        {/* Configuration Summary */}
        <div className="border border-border p-4 rounded-lg flex flex-col gap-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            {t.onboarding.step4.summaryTitle}
          </h3>

          {/* Language */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t.onboarding.step4.summaryLanguage}
            </span>
            <span className="text-sm font-medium">
              {language === "zh" ? "🇨🇳 中文（简体）" : "🇺🇸 English"}
            </span>
          </div>

          {/* Provider */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t.onboarding.step4.summaryProvider}
            </span>
            <span className="text-sm font-medium">
              {provider?.emoji} {provider?.name}
            </span>
          </div>

          {/* Optional Features */}
          {optionalCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t.onboarding.step4.summaryOptional}
              </span>
              <span className="text-sm font-medium">
                {t.onboarding.step4.summaryOptionalCount.replace("{count}", String(optionalCount))}
              </span>
            </div>
          )}
        </div>

        {/* Ready Message */}
        <p className="text-sm text-center text-muted-foreground">
          {t.onboarding.step4.readyMessage}
        </p>

        {/* Start Button */}
        <Button
          size="lg"
          onClick={onComplete}
          className="w-full"
        >
          {t.onboarding.step4.startButton}
        </Button>
      </div>
    </div>
  );
}
