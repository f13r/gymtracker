import { SetMetadata } from '@nestjs/common'

export const IS_AGENT_ONLY = 'auth:isAgentOnly'

/**
 * Marks a route (or a whole controller) as the Agent's: only the Agent may call it, and the Agent
 * may call nothing else. Every other caller, a signed-in User included, gets 403.
 */
export const AgentOnly = () => SetMetadata(IS_AGENT_ONLY, true)
