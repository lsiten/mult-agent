/**
 * TiptapEditor - Rich text editor with @mention support using Tiptap
 * Replaces the plain Textarea in InputArea
 */

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { useEditor, EditorContent, type Editor, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Mention } from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import { createMentionConfig } from "./createMentionConfig";

export interface TiptapEditorRef {
  getText: () => string;
  clear: () => void;
  focus: () => void;
  insertText: (text: string) => void;
}

interface TiptapEditorProps {
  value?: string;
  onChange?: (text: string) => void;
  onSend?: () => void;
  placeholder?: string;
  disabled?: boolean;
  currentCompanyId?: number;
  className?: string;
}

// Serialize editor content to plain text for sending
function editorToPlainText(editor: Editor | null): string {
  if (!editor) return "";
  return editor.getText();
}

// Extension to handle Enter key for sending
// Only triggers when mention suggestion is NOT open
const SendOnEnter = Extension.create({
  name: "sendOnEnter",
  addOptions() {
    return {
      onSend: () => {},
      isSuggestionOpen: () => false,
    };
  },
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => {
        // Let HardBreak handle Shift+Enter
        return false;
      },
      Enter: () => {
        // If suggestion popover is open, don't intercept
        if (this.options.isSuggestionOpen()) {
          return false;
        }
        // Trigger send
        this.options.onSend();
        return true;
      },
    };
  },
});

export const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(
  ({ value = "", onChange, onSend, placeholder, currentCompanyId, className }, ref) => {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
    const onSendRef = useRef(onSend);
    onSendRef.current = onSend;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          bold: false,
          italic: false,
          strike: false,
          code: false,
          codeBlock: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          horizontalRule: false,
          hardBreak: {
            keepMarks: true,
          },
        }),
        Mention.configure({
          HTMLAttributes: {
            class: "mention-chip",
          },
          renderLabel({ node }) {
            const agentId = node.attrs.id;
            const label = node.attrs.label || node.attrs.id;
            return `@${label} [id:${agentId}]`;
          },
          suggestion: createMentionConfig({
            currentCompanyId,
            onOpenChange: setIsSuggestionOpen,
          }),
        }),
        Placeholder.configure({
          placeholder,
        }),
        SendOnEnter.configure({
          onSend: () => onSendRef.current?.(),
          isSuggestionOpen: () => isSuggestionOpen,
        }),
      ],
      content: "",
      onUpdate: ({ editor }) => {
        onChangeRef.current?.(editorToPlainText(editor));
      },
    });

    // Sync external value changes (e.g., clear after send)
    useEffect(() => {
      if (editor && value === "") {
        const currentContent = editor.getText();
        if (currentContent !== "") {
          editor.commands.clearContent();
        }
      }
    }, [editor, value]);

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      getText: () => editorToPlainText(editor),
      clear: () => editor?.commands.clearContent(),
      focus: () => editor?.commands.focus(),
      insertText: (text: string) => editor?.commands.insertContent(text),
    }));

    if (!editor) {
      return null;
    }

    return (
      <div
        className={`tiptap-editor ${className || ""}`}
        onKeyDown={(e) => {
          // Stop arrow keys from bubbling to parent components (e.g. sidebar) when suggestion is open
          if (isSuggestionOpen && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter")) {
            e.stopPropagation();
          }
        }}
      >
        <EditorContent
          editor={editor}
          className="min-h-[48px] max-h-[200px] overflow-y-auto px-3 py-3 bg-background/40 text-sm"
        />
        <style>{`
          .tiptap-editor .tiptap {
            outline: none;
            width: 100%;
            font-size: 0.875rem;
            line-height: 1.5;
          }
          .tiptap-editor .tiptap.is-editor-empty > :first-child::before {
            content: attr(data-placeholder);
            float: left;
            color: hsl(var(--muted-foreground));
            pointer-events: none;
            height: 0;
          }
          .tiptap-editor .tiptap p {
            margin: 0;
          }
          .tiptap-editor .mention-chip {
            background: hsl(var(--primary) / 0.1);
            color: hsl(var(--primary));
            padding: 0.125rem 0.375rem;
            border-radius: 0.25rem;
            font-size: 0.875rem;
            font-weight: 500;
          }
        `}</style>
      </div>
    );
  }
);
