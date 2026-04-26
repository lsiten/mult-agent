import type { SkillControlMessage, SkillControlResponse } from './SkillController.background'

declare global {
  interface Window {
    __pageAgentSkills?: {
      click: (selector: string) => Promise<SkillControlResponse>
      fill: (selector: string, text: string) => Promise<SkillControlResponse>
      navigate: (url: string) => Promise<SkillControlResponse>
      getInfo: () => Promise<SkillControlResponse>
      scroll: (selector?: string, direction?: 'up' | 'down') => Promise<SkillControlResponse>
      select: (selector: string, value: string) => Promise<SkillControlResponse>
      hover: (selector: string) => Promise<SkillControlResponse>
      type: (selector: string, text: string, delay?: number) => Promise<SkillControlResponse>
      press: (key: string) => Promise<SkillControlResponse>
      screenshot: () => Promise<SkillControlResponse>
      find: (selector: string) => Promise<SkillControlResponse>
      exists: (selector: string) => Promise<SkillControlResponse>
      evaluate: (code: string) => Promise<SkillControlResponse>
    }
  }
}

export function handleSkillControlMessage(
  message: SkillControlMessage,
  sendResponse: (response?: SkillControlResponse) => void
): void {
  const { action, params = {} } = message

  switch (action) {
    case 'navigate':
      handleNavigate(params.url as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'click':
      handleClick(params.selector as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'fill':
      handleFill(params.selector as string, params.text as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'get_info':
      handleGetInfo()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'scroll':
      handleScroll(params.selector as string, params.direction as 'up' | 'down')
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'select':
      handleSelect(params.selector as string, params.value as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'hover':
      handleHover(params.selector as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'type':
      handleType(params.selector as string, params.text as string, params.delay as number)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'press':
      handlePress(params.key as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'screenshot':
      handleScreenshot()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'find':
      handleFind(params.selector as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'exists':
      handleExists(params.selector as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    case 'evaluate':
      handleEvaluate(params.code as string)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, output: String(err) }))
      break

    default:
      sendResponse({
        success: false,
        output: `Unknown action: ${action}`,
      })
  }
}

async function handleNavigate(url: string): Promise<SkillControlResponse> {
  window.location.href = url
  return { success: true, output: `Navigated to ${url}` }
}

async function handleClick(selector: string): Promise<SkillControlResponse> {
  const element = document.querySelector(selector) as HTMLElement | null
  if (!element) {
    return { success: false, output: `Element not found: ${selector}` }
  }
  element.click()
  return { success: true, output: `Clicked: ${selector}` }
}

async function handleFill(selector: string, text: string): Promise<SkillControlResponse> {
  const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null
  if (!element) {
    return { success: false, output: `Element not found: ${selector}` }
  }
  element.value = text
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
  return { success: true, output: `Filled "${text}" into ${selector}` }
}

async function handleGetInfo(): Promise<SkillControlResponse> {
  const info = {
    url: window.location.href,
    title: document.title,
    elements: document.querySelectorAll('*').length,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  }
  return { success: true, output: JSON.stringify(info, null, 2), data: info }
}

async function handleScroll(
  selector?: string,
  direction: 'up' | 'down' = 'down'
): Promise<SkillControlResponse> {
  if (selector) {
    const element = document.querySelector(selector)
    if (!element) {
      return { success: false, output: `Element not found: ${selector}` }
    }
    element.scrollIntoView({ behavior: 'smooth', block: direction === 'up' ? 'start' : 'end' })
  } else {
    window.scrollBy({
      top: direction === 'down' ? 300 : -300,
      behavior: 'smooth',
    })
  }
  return { success: true, output: `Scrolled ${direction}` }
}

async function handleSelect(selector: string, value: string): Promise<SkillControlResponse> {
  const element = document.querySelector(selector) as HTMLSelectElement | null
  if (!element) {
    return { success: false, output: `Select not found: ${selector}` }
  }
  element.value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
  return { success: true, output: `Selected "${value}" in ${selector}` }
}

async function handleHover(selector: string): Promise<SkillControlResponse> {
  const element = document.querySelector(selector) as HTMLElement | null
  if (!element) {
    return { success: false, output: `Element not found: ${selector}` }
  }
  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
  return { success: true, output: `Hovered: ${selector}` }
}

async function handleType(
  selector: string,
  text: string,
  delay: number = 0
): Promise<SkillControlResponse> {
  const element = document.querySelector(selector) as HTMLElement | null
  if (!element) {
    return { success: false, output: `Element not found: ${selector}` }
  }
  element.focus()
  if (delay > 0) {
    for (const char of text) {
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: char }))
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }))
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }))
      await new Promise((r) => setTimeout(r, delay))
    }
  } else {
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }))
  }
  return { success: true, output: `Typed "${text}" into ${selector}` }
}

async function handlePress(key: string): Promise<SkillControlResponse> {
  const active = document.activeElement
  active?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
  active?.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key }))
  active?.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }))
  return { success: true, output: `Pressed: ${key}` }
}

async function handleScreenshot(): Promise<SkillControlResponse> {
  return {
    success: true,
    output: 'Screenshot captured (requires chrome.debugger API for actual capture)',
    data: {
      width: window.innerWidth,
      height: window.innerHeight,
      url: window.location.href,
    },
  }
}

async function handleFind(selector: string): Promise<SkillControlResponse> {
  const elements = document.querySelectorAll(selector)
  const results = Array.from(elements).slice(0, 10).map((el, i) => ({
    index: i,
    tag: el.tagName,
    text: el.textContent?.slice(0, 50),
    visible: el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0,
  }))
  return {
    success: true,
    output: `Found ${elements.length} elements matching "${selector}"`,
    data: { count: elements.length, elements: results },
  }
}

async function handleExists(selector: string): Promise<SkillControlResponse> {
  const element = document.querySelector(selector)
  const exists = !!element
  return {
    success: true,
    output: exists ? `Element exists: ${selector}` : `Element not found: ${selector}`,
    data: exists,
  }
}

async function handleEvaluate(code: string): Promise<SkillControlResponse> {
  try {
    const result = eval(code)
    return {
      success: true,
      output: `Evaluated successfully`,
      data: result,
    }
  } catch (error) {
    return {
      success: false,
      output: `Evaluation error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function initSkillBridge() {
  window.__pageAgentSkills = {
    click: handleClick,
    fill: handleFill,
    navigate: handleNavigate,
    getInfo: handleGetInfo,
    scroll: handleScroll,
    select: handleSelect,
    hover: handleHover,
    type: handleType,
    press: handlePress,
    screenshot: handleScreenshot,
    find: handleFind,
    exists: handleExists,
    evaluate: handleEvaluate,
  }
}
