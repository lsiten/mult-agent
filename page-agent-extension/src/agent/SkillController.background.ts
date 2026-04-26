import type { MCPToolResult } from '../mcp/MCPClient'

export interface SkillControlMessage {
  type: 'SKILL_CONTROL'
  action: string
  params?: Record<string, unknown>
}

export interface SkillControlResponse {
  success: boolean
  output: string
  data?: unknown
}

export function handleSkillControlMessage(
  message: SkillControlMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: SkillControlResponse) => void
): true {
  const tabId = sender.tab?.id

  if (!tabId) {
    sendResponse({
      success: false,
      output: 'No tab ID available',
    })
    return
  }

  chrome.tabs.sendMessage(
    tabId,
    { type: 'SKILL_CONTROL', ...message },
    (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          output: chrome.runtime.lastError.message,
        })
      } else {
        sendResponse(response as SkillControlResponse)
      }
    }
  )

  return true
}
