import { Skill, SkillResult, SkillContext } from './types'

export interface PageAgentSkillConfig {
  extensionId?: string
  timeout?: number
}

export class PageAgentSkill implements Skill {
  name = 'page-agent'
  description = 'Control browser pages, click elements, fill forms, and automate web interactions through the Page Agent Chrome extension'

  private extensionId: string | null
  private timeout: number

  constructor(config: PageAgentSkillConfig = {}) {
    this.extensionId = config.extensionId || null
    this.timeout = config.timeout || 60000
  }

  private async getExtensionId(): Promise<string> {
    if (this.extensionId) return this.extensionId

    return new Promise((resolve, reject) => {
      const extensionId = (window as any).__pageAgentExtensionId__
      if (extensionId) {
        resolve(extensionId)
        return
      }

      chrome.runtime.sendMessage({ type: 'GET_EXTENSION_ID' }, (response) => {
        if (response?.id) {
          resolve(response.id)
        } else {
          chrome.runtime.sendMessage({ type: 'PING' }, (pong) => {
            if (pong?.ok) {
              chrome.runtime.getId((id) => resolve(id))
            } else {
              reject(new Error('Page Agent extension is not installed or not loaded'))
            }
          })
        }
      })
    })
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
      const extId = await this.getExtensionId()
      switch (action) {
        case 'navigate':
          return await this.navigate(params.url as string, extId)
        case 'click':
          return await this.click(params.selector as string, extId)
        case 'fill':
          return await this.fill(params.selector as string, params.text as string, extId)
        case 'scroll':
          return await this.scroll(params.selector as string, params.direction as 'up' | 'down', extId)
        case 'get_info':
          return await this.getPageInfo(extId)
        case 'submit':
          return await this.submit(params.selector as string, extId)
        case 'select':
          return await this.select(params.selector as string, params.value as string, extId)
        case 'hover':
          return await this.hover(params.selector as string, extId)
        case 'type':
          return await this.type(params.selector as string, params.text as string, params.delay as number, extId)
        case 'press':
          return await this.press(params.key as string, extId)
        case 'screenshot':
          return await this.screenshot(extId)
        case 'wait':
          return await this.wait(params.seconds as number)
        case 'find':
          return await this.find(params.selector as string, extId)
        case 'exists':
          return await this.exists(params.selector as string, extId)
        case 'evaluate':
          return await this.evaluate(params.code as string, extId)
        case 'login':
          return await this.login(params.username as string, params.password as string, extId)
        default:
          return {
            success: false,
            output: `Unknown action: ${action}. Supported actions: navigate, click, fill, scroll, get_info, submit, select, hover, type, press, screenshot, wait, find, exists, evaluate, login`,
          }
      }
    } catch (error) {
      return {
        success: false,
        output: `Page Agent error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async sendToExtension(extensionId: string, action: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Extension communication timeout after ${this.timeout}ms`))
      }, this.timeout)

      chrome.runtime.sendMessage(
        extensionId,
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

  private async navigate(url: string, extId: string): Promise<SkillResult> {
    if (!url) {
      return { success: false, output: 'URL is required for navigate action' }
    }

    try {
      await this.sendToExtension(extId, 'navigate', { url })
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

  private async click(selector: string, extId: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for click action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'click', { selector }) as { success: boolean; output: string }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async fill(selector: string, text: string, extId: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for fill action' }
    }
    if (!text) {
      return { success: false, output: 'Text is required for fill action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'fill', { selector, text, clear: true }) as { success: boolean; output: string }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Fill failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async scroll(selector: string, direction: 'up' | 'down', extId: string): Promise<SkillResult> {
    try {
      const result = await this.sendToExtension(extId, 'scroll', {
        selector: selector || undefined,
        direction: direction || 'down',
      }) as { success: boolean; output: string }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async getPageInfo(extId: string): Promise<SkillResult> {
    try {
      const result = await this.sendToExtension(extId, 'get_info') as { success: boolean; output: string; data: unknown }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Get page info failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async submit(selector: string, extId: string): Promise<SkillResult> {
    try {
      await this.click(selector, extId)
      return {
        success: true,
        output: `Submitted form: ${selector || 'current form'}`,
      }
    } catch (error) {
      return {
        success: false,
        output: `Submit failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async select(selector: string, value: string, extId: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for select action' }
    }
    if (!value) {
      return { success: false, output: 'Value is required for select action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'select', { selector, value, by: 'value' }) as { success: boolean; output: string }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Select failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async hover(selector: string, extId: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for hover action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'hover', { selector }) as { success: boolean; output: string }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Hover failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async type(selector: string, text: string, delay: number = 0, extId: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for type action' }
    }
    if (!text) {
      return { success: false, output: 'Text is required for type action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'type', { selector, text, delay }) as { success: boolean; output: string }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Type failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async press(key: string, extId: string): Promise<SkillResult> {
    if (!key) {
      return { success: false, output: 'Key is required for press action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'press', { key }) as { success: boolean; output: string }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Press failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async screenshot(extId: string): Promise<SkillResult> {
    try {
      const result = await this.sendToExtension(extId, 'screenshot') as { success: boolean; output: string; data: unknown }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async wait(seconds: number = 1): Promise<SkillResult> {
    await new Promise(r => setTimeout(r, (seconds || 1) * 1000))
    return { success: true, output: `Waited ${seconds || 1} seconds` }
  }

  private async find(selector: string, extId: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for find action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'find', { selector }) as { success: boolean; output: string; data: unknown }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Find failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async exists(selector: string, extId: string): Promise<SkillResult> {
    if (!selector) {
      return { success: false, output: 'CSS selector is required for exists action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'exists', { selector }) as { success: boolean; output: string; data: boolean }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Exists check failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async evaluate(code: string, extId: string): Promise<SkillResult> {
    if (!code) {
      return { success: false, output: 'JavaScript code is required for evaluate action' }
    }

    try {
      const result = await this.sendToExtension(extId, 'evaluate', { code }) as { success: boolean; output: string; data: unknown }
      return result
    } catch (error) {
      return {
        success: false,
        output: `Evaluate failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async login(username: string, password: string, extId: string): Promise<SkillResult> {
    if (!username || !password) {
      return { success: false, output: 'Username and password are required for login action' }
    }

    try {
      const steps = []

      const navResult = await this.sendToExtension(extId, 'navigate', { url: 'https://github.com/login' }) as { success: boolean }
      if (!navResult.success) {
        return { success: false, output: 'Failed to navigate to GitHub login page' }
      }

      await new Promise(r => setTimeout(r, 1000))

      const userResult = await this.sendToExtension(extId, 'fill', { selector: '#login_field', text: username, clear: true }) as { success: boolean }
      if (!userResult.success) {
        return { success: false, output: 'Failed to fill username field' }
      }

      const passResult = await this.sendToExtension(extId, 'fill', { selector: '#password', text: password, clear: true }) as { success: boolean }
      if (!passResult.success) {
        return { success: false, output: 'Failed to fill password field' }
      }

      const clickResult = await this.sendToExtension(extId, 'click', { selector: 'input[type="submit"]' }) as { success: boolean }
      if (!clickResult.success) {
        return { success: false, output: 'Failed to click sign in button' }
      }

      return {
        success: true,
        output: `Login attempted for user: ${username}`,
        data: { username },
      }
    } catch (error) {
      return {
        success: false,
        output: `Login failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}

export default PageAgentSkill
