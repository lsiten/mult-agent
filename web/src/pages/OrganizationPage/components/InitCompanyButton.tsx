import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";

interface InitCompanyButtonProps {
  companyId: number;
  onInitialized: (result: { department_id: number; office_id: number; agents: any[] }) => void;
}

export function InitCompanyButton({ companyId, onInitialized }: InitCompanyButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [agentCount, setAgentCount] = useState(3);
  const [saving, setSaving] = useState(false);

  const handleInit = async () => {
    setSaving(true);
    try {
      const result = await api.initDirectorOffice({ companyId, agentCount });
      setOpen(false);
      onInitialized(result);
    } catch (error) {
      console.error("Failed to init director office:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title={t.organization.initDirectorOffice || "Initialize company"}
      >
        <span className="text-lg">⚡</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.organization.initDirectorOffice || "Initialize Company"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="agentCount">
                {t.organization.agentCount || "Number of director agents (default 3)"}
              </Label>
              <Input
                id="agentCount"
                type="number"
                min={1}
                max={10}
                value={agentCount}
                onChange={(e) => setAgentCount(Number(e.target.value))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleInit} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
