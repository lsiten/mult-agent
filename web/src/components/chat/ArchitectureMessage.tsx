import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ArchitectureMessageProps {
  mermaidCode: string;
  senderRole: string;
  senderName?: string;
  content: string;
  version?: number;
  onAdjust?: (mermaidCode: string) => void;
}

// Initialize mermaid once
mermaid.initialize({ startOnLoad: false, theme: "default" });

export function ArchitectureMessage({
  mermaidCode,
  senderRole,
  senderName,
  content,
  version = 1,
  onAdjust,
}: ArchitectureMessageProps) {
  const svgRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editCode, setEditCode] = useState(mermaidCode);

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

  const handleAdjust = () => {
    setEditCode(mermaidCode);
    setEditing(true);
  };

  const handleSave = () => {
    setEditing(false);
    if (onAdjust && editCode !== mermaidCode) {
      onAdjust(editCode);
    }
  };

  return (
    <Card className="p-4 max-w-[600px]">
      <div className="flex items-start gap-3 mb-3">
        {/* Agent头像 */}
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
          {senderName?.[0] || senderRole?.[0] || "A"}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{senderName || `${senderRole} Agent`}</span>
            <Badge variant="outline" className="text-xs">{senderRole}</Badge>
            {version > 1 && (
              <Badge variant="secondary" className="text-xs">v{version}</Badge>
            )}
          </div>
        </div>

        {onAdjust && !editing && (
          <Button variant="outline" size="sm" onClick={handleAdjust}>
            调整
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-3">{content}</p>

      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full h-32 p-2 border rounded-md font-mono text-sm"
            value={editCode}
            onChange={(e) => setEditCode(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleSave}>
              保存
            </Button>
          </div>
        </div>
      ) : (
        <div ref={svgRef} className="mermaid-container" data-testid="mermaid-container" />
      )}
    </Card>
  );
}
