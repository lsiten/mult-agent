import { Skill, SkillResult, SkillContext } from './types'

export interface PageAgentSkillConfig {
  extensionId?: string
  timeout?: number
}

export class PageAgentSkill implements Skill {
  name = 'page-agent'
  description = 'Control browser pages, click elements, fill forms, and automate web interactions through the Page Agent Chrome extension'

  private extensionId: string
  private timeout: number

  constructor(config: PageAgentSkillConfig = {}) {
    this.extensionId = config.extensionId || 'page-agent-ext'
    this.timeout = config.timeout || 60000
  }

  async execute(params: Record<string, unknown>, context?: SkillContext): Promise<SkillResult> {
    const action = params.action as string

    if (!action) {
      return {
        success: false,
        output: 'Missing required parameter: action',
      }
    }

    try {
      switch (action) {
        case 'navigate':
          return await this.navigate(params.url as string)
        case 'click':
          return await this.click(params.selector as string)
        case 'fill':
          return await this.fill(params.selector as string, params.text as string)
        case 'scroll':
          return await this.scroll(params.selector as string, params.direction as 'up' | 'down')
        case 'get_info':
          return await this.getPageInfo()
        case 'submit':
          return await this.submit(params.selector as string)
        case 'select':
          return await this.select(params.selector as string, params.value as string)
        case 'hover':
          return await this.hover(params.selector as string)
        case 'type':
          return await this.type(params.selector as string, params.text as string, params.delay as number)
        case 'press':
          return await this.press(params.key as string)
        case 'screenshot':
          return await this.screenshot()
        default:
          return {
            success: false,
            output: `Unknown action: ${action}. Supported actions: navigate, click, fill, scroll, get_info, submit, select, hover, type, press, screenshot`,
          }
      }
    } catch (error) {
      return {
        success: false,
        output: `Page Agent error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async sendToExtension(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Extension communication timeout after ${this.timeout}ms`))
      }, this.timeout)

      chrome.runtime.sendMessage(
        this.extensionId,
        { type: 'SKILL_CONTROL', action, params },
        (response) => {
          clearTimeout(timeoutId)
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else {
            resolve(response)
          }
        }
      )
    })
  }

  private async navigate(url: string): Promise<SkillResult> {
    if (!url) {
      return { success: false, output: 'URL is required for navigate action' }
    }

    try {
      await this.sendToExtension('navigate', { url })
      return {
        success: true,
        output: `Navigated to ${url}`,
        data: { url },
      }
    } catch (error) {
      return {
        success: false,
        output: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async click(selector: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for click action' }
    }

    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: 'element_click',
        params: { selector },
      }) as { success: boolean; output: string }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async fill(selector: string, text: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for fill action' }
    }
    if (!text) {
      return { success: false, output: 'Text is required for fill action' }
    }

    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: 'element_fill',
        params: { selector, text, clear: true },
      }) as { success: boolean; output: string }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Fill failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async scroll(selector: string, direction: 'up' | 'down'): Promise<SkillResult> {
    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: selector ? 'element_scroll' : 'page_scroll',
        params: selector
          ? { selector, behavior: 'smooth', block: direction === 'up' ? 'start' : 'end' }
          : { y: direction === 'down' ? 300 : -300 },
      }) as { success: boolean; output: string }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async getPageInfo(): Promise<SkillResult> {
    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: 'page_info',
        params: {},
      }) as { success: boolean; output: string; data: unknown }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Get page info failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async submit(selector: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for submit action' }
    }

    try {
      await this.click(selector)
      return {
        success: true,
        output: `Submitted form: ${selector}`,
      }
    } catch (error) {
      return {
        success: false,
        output: `Submit failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async select(selector: string, value: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for select action' }
    }
    if (!value) {
      return { success: false, output: 'Value is required for select action' }
    }

    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: 'element_select_option',
        params: { selector, value, by: 'value' },
      }) as { success: boolean; output: string }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Select failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async hover(selector: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for hover action' }
    }

    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: 'element_hover',
        params: { selector },
      }) as { success: boolean; output: string }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Hover failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async type(selector: string, text: string, delay: number = 0): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for type action' }
    }
    if (!text) {
      return { success: false, output: 'Text is required for type action' }
    }

    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: 'keyboard_type',
        params: { selector, text, delay },
      }) as { success: boolean; output: string }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Type failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async press(key: string): Promise<SkillResult> {
    if (!key) {
      return { success: false, output: 'Key is required for press action' }
    }

    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: 'keyboard_press',
        params: { key },
      }) as { success: boolean; output: string }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Press failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async screenshot(): Promise<SkillResult> {
    try {
      const result = await this.sendToExtension('execute_skill', {
        skill: 'page_screenshot',
        params: {},
      }) as { success: boolean; output: string; data: unknown }

      return result
    } catch (error) {
      return {
        success: false,
        output: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}

export default PageAgentSkill
