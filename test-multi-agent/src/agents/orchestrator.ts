import { TaskQueue, Task } from '../queue/task-queue';
import { StateManager } from '../state/manager';
import { logger } from '../utils/logger';

interface Config { name: string; queue: TaskQueue; state: StateManager; }

export function createOrchestrator(config: Config) {
  const submitTask = async (task: Omit<Task, 'id' | 'status' | 'createdAt'>): Promise<string> => {
    const id = crypto.randomUUID();
    await config.queue.enqueue({ ...task, id, status: 'pending', createdAt: Date.now() });
    logger.info({ taskId: id }, 'Task submitted');
    return id;
  };

  const distributeWork = async (items: any[]): Promise<string[]> => {
    return Promise.all(items.map(item => submitTask({ type: 'process', payload: item, priority: 'normal' })));
  };

  return {
    submitTask,
    distributeWork,
    start: async () => logger.info({ name: config.name }, 'Orchestrator started'),
    stop: async () => logger.info({ name: config.name }, 'Orchestrator stopped')
  };
}
