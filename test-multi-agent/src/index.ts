import { createOrchestrator } from './agents/orchestrator';
import { createWorker } from './agents/worker';
import { TaskQueue } from './queue/task-queue';
import { StateManager } from './state/manager';
import { logger } from './utils/logger';

const queue = new TaskQueue();
const state = new StateManager();

const orchestrator = createOrchestrator({ name: 'test-multi-agent', queue, state });
const workers = [
  createWorker({ id: 'worker-1', queue, state }),
  createWorker({ id: 'worker-2', queue, state })
];

async function start() {
  logger.info({}, 'Starting multi-agent system');
  await Promise.all(workers.map(w => w.start()));
  await orchestrator.start();

  process.on('SIGTERM', async () => {
    await orchestrator.stop();
    await Promise.all(workers.map(w => w.stop()));
    process.exit(0);
  });
}

start().catch(e => { logger.error({ error: e }, 'Failed'); process.exit(1); });
