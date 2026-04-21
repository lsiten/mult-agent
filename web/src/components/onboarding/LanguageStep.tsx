import { useI18n } from "@/i18n";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LanguageStepProps {
  value: string;
  onChange: (value: string) => void;
}

export function LanguageStep({ value, onChange }: LanguageStepProps) {
  const { t, setLocale } = useI18n();

  const handleLanguageChange = (newLang: string) => {
    onChange(newLang);
    // Immediately update UI language
    setLocale(newLang as "zh" | "en");
  };

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">
          {t.onboarding.step1.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.onboarding.step1.subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
        <Label htmlFor="language">{t.onboarding.step1.languageLabel}</Label>
        <Select value={value} onValueChange={handleLanguageChange}>
          <SelectTrigger id="language">
            <SelectValue placeholder={t.onboarding.step1.languagePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh">🇨🇳 中文（简体）</SelectItem>
            <SelectItem value="en">🇺🇸 English</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground">
          💡 {t.onboarding.step1.note}
        </p>
      </div>
    </div>
  );
}
