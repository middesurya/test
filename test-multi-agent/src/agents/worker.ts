import { TaskQueue, Task } from '../queue/task-queue';
import { StateManager } from '../state/manager';
import { logger } from '../utils/logger';

interface Config { id: string; queue: TaskQueue; state: StateManager; }

export function createWorker(config: Config) {
  let running = false;
  let interval: NodeJS.Timeout | null = null;

  const process = async (task: Task) => {
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return { processed: task.payload, workerId: config.id };
  };

  const poll = async () => {
    if (!running) return;
    const task = await config.queue.dequeue();
    if (task) {
      try {
        const result = await process(task);
        await config.queue.complete(task.id, result);
      } catch (e) {
        await config.queue.fail(task.id, (e as Error).message);
      }
    }
  };

  return {
    start: async () => { running = true; interval = setInterval(poll, 50); logger.info({ id: config.id }, 'Worker started'); },
    stop: async () => { running = false; if (interval) clearInterval(interval); logger.info({ id: config.id }, 'Worker stopped'); }
  };
}
