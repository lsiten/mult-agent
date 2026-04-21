import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Shortcut {
  keys: string;
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  { keys: "⌘N / Ctrl+N", description: "新建会话", category: "会话管理" },
  { keys: "⌘K / Ctrl+K", description: "聚焦搜索", category: "会话管理" },
  { keys: "⌘/ / Ctrl+/", description: "切换侧边栏", category: "会话管理" },
  { keys: "↑/↓", description: "导航会话列表", category: "会话管理" },
  { keys: "Enter", description: "选择当前会话", category: "会话管理" },
  { keys: "Esc", description: "清空搜索框", category: "会话管理" },
  { keys: "Enter", description: "发送消息", category: "消息输入" },
  { keys: "Shift+Enter", description: "换行", category: "消息输入" },
];

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  const categories = Array.from(new Set(shortcuts.map(s => s.category)));

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            键盘快捷键
          </AlertDialogTitle>
          <AlertDialogDescription>
            使用这些快捷键提升您的工作效率
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {categories.map(category => (
            <div key={category}>
              <h3 className="text-sm font-semibold mb-2">{category}</h3>
              <div className="space-y-2">
                {shortcuts
                  .filter(s => s.category === category)
                  .map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded bg-accent/30"
                    >
                      <span className="text-sm text-muted-foreground">
                        {shortcut.description}
                      </span>
                      <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            关闭
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function KeyboardShortcutsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="gap-2"
      title="查看快捷键 (?)"
    >
      <Keyboard className="h-4 w-4" />
      <span className="text-xs">快捷键</span>
    </Button>
  );
}
