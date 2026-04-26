import * as z from 'zod/v4'
import type { PageAgentTool } from './types'

const pageController = (globalThis as any).__pageController

export const tools = new Map<string, PageAgentTool>()

tools.set('done', {
	name: 'done',
	description: 'Complete the task with a final result',
	inputSchema: z.object({
		success: z.boolean().describe('Whether the task was completed successfully'),
		text: z.string().describe('Final result message'),
	}),
	execute: async (input: { success: boolean; text: string }) => {
		console.log('[done] Task completed:', input)
		return input.text
	},
})

tools.set('click_element', {
	name: 'click_element',
	description: 'Click an element on the page',
	inputSchema: z.object({
		index: z.number().describe('Element index from accessibility tree'),
	}),
	execute: async (input: { index: number }) => {
		if (!pageController) throw new Error('Page controller not available')
		const elements = document.querySelectorAll('*')
		const element = elements[input.index] as HTMLElement
		if (!element) throw new Error(`Element at index ${input.index} not found`)
		element.click()
		return `Clicked element at index ${input.index}`
	},
})

tools.set('input_text', {
	name: 'input_text',
	description: 'Input text into an element',
	inputSchema: z.object({
		index: z.number().describe('Element index from accessibility tree'),
		text: z.string().describe('Text to input'),
	}),
	execute: async (input: { index: number; text: string }) => {
		if (!pageController) throw new Error('Page controller not available')
		const elements = document.querySelectorAll('input, textarea')
		const element = elements[input.index] as HTMLInputElement | HTMLTextAreaElement
		if (!element) throw new Error(`Input element at index ${input.index} not found`)
		element.value = input.text
		element.dispatchEvent(new Event('input', { bubbles: true }))
		element.dispatchEvent(new Event('change', { bubbles: true }))
		return `Input "${input.text}" into element at index ${input.index}`
	},
})

tools.set('wait', {
	name: 'wait',
	description: 'Wait for a specified duration',
	inputSchema: z.object({
		seconds: z.number().describe('Number of seconds to wait'),
	}),
	execute: async (input: { seconds: number }) => {
		await new Promise((resolve) => setTimeout(resolve, input.seconds * 1000))
		return `Waited ${input.seconds} seconds`
	},
})

export function tool<T extends z.ZodType>(config: {
	name: string
	description: string
	inputSchema: T
	execute: (input: z.infer<T>) => Promise<string>
}): PageAgentTool {
	return {
		name: config.name,
		description: config.description,
		inputSchema: config.inputSchema,
		execute: config.execute,
	}
}
