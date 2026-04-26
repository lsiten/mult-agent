/**
 * Simplified PageController for content script
 */

export interface BrowserState {
  url: string
  title: string
  content: string
  header: string
  footer: string
}

export class PageController {
  private maskElement: HTMLElement | null = null
  private highlights: HTMLElement[] = []

  constructor(options?: { enableMask?: boolean; viewportExpansion?: number }) {
    console.log('[PageController] Initialized with options:', options)
  }

  getBrowserState(): BrowserState {
    const tree = this.getAccessibilityTree()

    return {
      url: window.location.href,
      title: document.title,
      content: tree,
      header: `<url>${window.location.href}</url>\n<title>${document.title}</title>`,
      footer: '',
    }
  }

  private getAccessibilityTree(): string {
    const elements: string[] = []
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node: Element) => {
          if (node.shadowRoot) return NodeFilter.FILTER_SKIP
          const role = node.getAttribute('role') || this.getImplicitRole(node)
          if (!role && !node.textContent?.trim()) return NodeFilter.FILTER_SKIP
          return NodeFilter.FILTER_ACCEPT
        },
      }
    )

    let node: Element | null
    let index = 0
    while ((node = walker.nextNode() as Element | null)) {
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const tag = node.tagName.toLowerCase()
      const id = node.id ? `#${node.id}` : ''
      const classes = node.className && typeof node.className === 'string'
        ? '.' + node.className.split(' ').filter(Boolean).join('.')
        : ''
      const role = node.getAttribute('role') || this.getImplicitRole(node)
      const text = node.textContent?.slice(0, 100).replace(/\s+/g, ' ').trim() || ''
      const rectStr = `[${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}]`

      const descriptor = role ? `role=${role}` : tag
      const interactive = this.isInteractive(node) ? ' [interactive]' : ''

      elements.push(
        `${index}: ${rectStr} <${tag}${id}${classes}> ${descriptor} "${text}"${interactive}`
      )
      index++
    }

    return elements.join('\n')
  }

  private getImplicitRole(element: Element): string {
    const tag = element.tagName.toLowerCase()
    const map: Record<string, string> = {
      a: 'link',
      button: 'button',
      input: 'textbox',
      select: 'listbox',
      textarea: 'textbox',
      img: 'img',
      nav: 'navigation',
      header: 'banner',
      footer: 'contentinfo',
      main: 'main',
      aside: 'complementary',
      section: 'region',
      article: 'article',
    }
    return map[tag] || ''
  }

  private isInteractive(element: Element): boolean {
    const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'menuitem', 'tab', 'switch']
    const role = element.getAttribute('role')
    if (role && interactiveRoles.includes(role)) return true

    const tag = element.tagName.toLowerCase()
    return ['button', 'a', 'input', 'select', 'textarea'].includes(tag)
  }

  initMask(): void {
    if (this.maskElement) return

    this.maskElement = document.createElement('div')
    this.maskElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      pointer-events: none;
      z-index: 2147483646;
    `
    document.body.appendChild(this.maskElement)
  }

  showMask(): void {
    if (this.maskElement) {
      this.maskElement.style.display = 'block'
    }
  }

  hideMask(): void {
    if (this.maskElement) {
      this.maskElement.style.display = 'none'
    }
  }

  cleanUpHighlights(): void {
    for (const el of this.highlights) {
      el.style.outline = ''
      el.style.outlineOffset = ''
    }
    this.highlights = []
  }

  async clickElement(selector: string): Promise<{ success: boolean; error?: string }> {
    const element = document.querySelector(selector) as HTMLElement
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` }
    }
    element.click()
    return { success: true }
  }

  async inputText(selector: string, text: string): Promise<{ success: boolean; error?: string }> {
    const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement
    if (!element) {
      return { success: false, error: `Input element not found: ${selector}` }
    }
    element.value = text
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return { success: true }
  }

  async selectOption(selector: string, value: string): Promise<{ success: boolean; error?: string }> {
    const element = document.querySelector(selector) as HTMLSelectElement
    if (!element) {
      return { success: false, error: `Select element not found: ${selector}` }
    }
    element.value = value
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return { success: true }
  }

  async scroll(selector: string, direction: 'up' | 'down'): Promise<{ success: boolean; error?: string }> {
    const element = selector ? document.querySelector(selector) as HTMLElement : document.documentElement
    if (!element) {
      return { success: false, error: `Element not found: ${selector || 'body'}` }
    }
    element.scrollBy({
      top: direction === 'down' ? 300 : -300,
      behavior: 'smooth',
    })
    return { success: true }
  }

  async scrollHorizontally(selector: string, direction: 'left' | 'right'): Promise<{ success: boolean; error?: string }> {
    const element = document.querySelector(selector) as HTMLElement
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` }
    }
    element.scrollBy({
      left: direction === 'right' ? 300 : -300,
      behavior: 'smooth',
    })
    return { success: true }
  }

  async executeJavascript(code: string): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      const result = eval(code)
      return { success: true, result }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  getLastUpdateTime(): number {
    return Date.now()
  }

  dispose(): void {
    this.hideMask()
    this.cleanUpHighlights()
    if (this.maskElement) {
      this.maskElement.remove()
      this.maskElement = null
    }
  }
}
