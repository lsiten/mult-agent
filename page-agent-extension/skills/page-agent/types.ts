export interface Skill {
  name: string
  description: string
  execute: (params: Record<string, unknown>, context?: SkillContext) => Promise<SkillResult>
}

export interface SkillResult {
  success: boolean
  output: string
  data?: unknown
}

export interface SkillContext {
  pageInfo?: {
    url: string
    title: string
    elements: number
  }
  userTask?: string
}
