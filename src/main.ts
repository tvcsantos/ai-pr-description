import { ActionOrchestrator } from './action-orchestrator.js'

export async function run(): Promise<void> {
  await new ActionOrchestrator().run()
}
