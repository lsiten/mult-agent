import { Loader2 } from "lucide-react";

export function OrganizationLoadingState() {
  return (
    <div className="flex h-[620px] items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
    </div>
  );
}
