import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  return crypto.randomUUID()
}

export async function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

export async function fetchLlmsTxt(url: string): Promise<string | undefined> {
  try {
    const urlObj = new URL(url)
    const llmsTxtUrl = `${urlObj.origin}/llms.txt`
    const response = await fetch(llmsTxtUrl)
    if (response.ok) {
      return await response.text()
    }
  } catch {
  }
  return undefined
}

export function normalizeResponse(res: unknown, tools: Map<string, unknown>): unknown {
  return res
}
