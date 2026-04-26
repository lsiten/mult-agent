import { BookOpen, Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { siGithub } from 'simple-icons'

import { cn } from '../lib/utils'

type AgentStatus = 'idle' | 'running' | 'completed' | 'error'

export function StatusDot({ status }: { status: AgentStatus }) {
	const colorClass = {
		idle: 'bg-muted-foreground',
		running: 'bg-blue-500',
		completed: 'bg-green-500',
		error: 'bg-destructive',
	}[status]

	const label = {
		idle: 'Ready',
		running: 'Running',
		completed: 'Done',
		error: 'Error',
	}[status]

	return (
		<div className="flex items-center gap-1.5 mr-2">
			<span
				className={cn('size-2 rounded-full', colorClass, status === 'running' && 'animate-pulse')}
			/>
			<span className="text-xs text-muted-foreground">{label}</span>
		</div>
	)
}

export function Logo({ className }: { className?: string }) {
	return <img src="/assets/page-agent-256.webp" alt="Page Agent" className={cn('', className)} />
}

export function MotionOverlay({ active }: { active: boolean }) {
	if (!active) return null

	return (
		<div
			className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
			style={{
				background: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.15), transparent 70%)',
			}}
		/>
	)
}

export function EmptyState() {
	const words = [
		'Enter a task to automate this page',
		'Execute multi-page tasks',
		'Configure MCP server in settings',
	]
	const [currentWord, setCurrentWord] = useState(0)
	const [displayedText, setDisplayedText] = useState('')
	const [isDeleting, setIsDeleting] = useState(false)

	useEffect(() => {
		const word = words[currentWord]
		let timeout: NodeJS.Timeout

		if (!isDeleting) {
			if (displayedText.length < word.length) {
				timeout = setTimeout(() => {
					setDisplayedText(word.slice(0, displayedText.length + 1))
				}, 100)
			} else {
				timeout = setTimeout(() => setIsDeleting(true), 2000)
			}
		} else {
			if (displayedText.length > 0) {
				timeout = setTimeout(() => {
					setDisplayedText(word.slice(0, displayedText.length - 1))
				}, 50)
			} else {
				setIsDeleting(false)
				setCurrentWord((prev) => (prev + 1) % words.length)
			}
		}

		return () => clearTimeout(timeout)
	}, [displayedText, isDeleting, currentWord])

	return (
		<div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
			<div className="relative select-none pointer-events-none">
				<div className="absolute inset-0 -m-6 rounded-full bg-blue-500/20 blur-2xl animate-pulse" />
				<Logo className="relative size-20 opacity-80" />
			</div>
			<div>
				<h2 className="text-base font-medium text-foreground mb-1">Page Agent (MCP)</h2>
				<p className="text-sm text-muted-foreground">
					{displayedText}
					<span className="animate-pulse">|</span>
				</p>
			</div>
			<div className="flex items-center gap-3 mt-1 text-muted-foreground">
				<a
					href="https://github.com/alibaba/page-agent"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-foreground transition-colors"
					title="GitHub"
				>
					<svg role="img" viewBox="0 0 24 24" className="size-4 fill-current">
						<path d={siGithub.path} />
					</svg>
				</a>
				<a
					href="https://alibaba.github.io/page-agent"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-foreground transition-colors"
					title="Website"
				>
					<Globe className="size-4" />
				</a>
			</div>
		</div>
	)
}
