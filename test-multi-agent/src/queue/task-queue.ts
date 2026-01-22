export interface Task {
  id: string;
  type: string;
  payload: any;
  priority: 'high' | 'normal' | 'low';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  result?: any;
  error?: string;
}

export class TaskQueue {
  private tasks = new Map<string, Task>();
  private pending: string[] = [];

  async enqueue(task: Task): Promise<string> {
    this.tasks.set(task.id, task);
    task.priority === 'high' ? this.pending.unshift(task.id) : this.pending.push(task.id);
    return task.id;
  }

  async dequeue(): Promise<Task | null> {
    const id = this.pending.shift();
    if (!id) return null;
    const task = this.tasks.get(id);
    if (task) task.status = 'processing';
    return task || null;
  }

  async complete(id: string, result: any) {
    const task = this.tasks.get(id);
    if (task) { task.status = 'completed'; task.result = result; }
  }

  async fail(id: string, error: string) {
    const task = this.tasks.get(id);
    if (task) { task.status = 'failed'; task.error = error; }
  }

  async getTask(id: string) { return this.tasks.get(id) || null; }
}
