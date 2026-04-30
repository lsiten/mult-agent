/**
 * createMentionConfig - Tiptap suggestion configuration for @ mentions
 */

import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance, type Props } from "tippy.js";
import type { MentionListRef, MentionItem } from "./MentionList";
import { MentionList } from "./MentionList";
import type { SuggestionProps, SuggestionOptions } from "@tiptap/suggestion";

interface MentionConfigOptions {
  currentCompanyId?: number;
  onOpenChange?: (open: boolean) => void;
}

export function createMentionConfig(options: MentionConfigOptions = {}) {
  return {
    items: (): MentionItem[] => {
      return [];
    },
    render: () => {
      let reactRenderer: ReactRenderer<MentionListRef>;
      let popup: Instance<Props> | null = null;

      return {
        onStart: (props: SuggestionProps) => {
          reactRenderer = new ReactRenderer(MentionList, {
            props: {
              query: props.query,
              command: props.command,
              currentCompanyId: options.currentCompanyId,
            },
            editor: props.editor,
          });

          const rect = props.clientRect?.();
          if (!rect) {
            return;
          }

          options.onOpenChange?.(true);

          popup = tippy(document.body, {
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
            appendTo: () => document.body,
            content: reactRenderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props: SuggestionProps) {
          reactRenderer.updateProps({
            query: props.query,
            command: props.command,
            currentCompanyId: options.currentCompanyId,
          });
        },

        onKeyDown(props: { event: KeyboardEvent }) {
          // Stop propagation for all navigation keys to prevent sidebar from reacting
          props.event.stopPropagation();
          props.event.stopImmediatePropagation();

          if (props.event.key === "Escape") {
            popup?.hide();
            options.onOpenChange?.(false);
            return true;
          }
          const handled = reactRenderer.ref?.onKeyDown?.(props) ?? false;
          return handled;
        },

        onExit() {
          popup?.destroy();
          reactRenderer.destroy();
          options.onOpenChange?.(false);
        },
      };
    },
  } satisfies Partial<SuggestionOptions>;
}
