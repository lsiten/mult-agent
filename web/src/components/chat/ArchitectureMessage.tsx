import { useEffect, useRef } from "react";
import mermaid from "mermaid";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ArchitectureMessageProps {
  mermaidCode: string;
  senderRole: string;
  content: string;
  version?: number;
}

// Initialize mermaid once
mermaid.initialize({ startOnLoad: false, theme: "default" });

export function ArchitectureMessage({
  mermaidCode,
  senderRole,
  content,
  version = 1,
}: ArchitectureMessageProps) {
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (svgRef.current && mermaidCode) {
        try {
          const { svg } = await mermaid.render(
            `mermaid-${Date.now()}`,
            mermaidCode
          );
          svgRef.current.innerHTML = svg;
        } catch (error) {
          console.error("Mermaid render error:", error);
          svgRef.current.innerHTML = `<pre>${mermaidCode}</pre>`;
        }
      }
    };
    renderDiagram();
  }, [mermaidCode]);

  return (
    <Card className="p-4 max-w-[600px]">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline">{senderRole} Agent</Badge>
        {version > 1 && (
          <Badge variant="secondary">v{version}</Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-3">{content}</p>

      <div ref={svgRef} className="mermaid-container" data-testid="mermaid-container" />
    </Card>
  );
}
