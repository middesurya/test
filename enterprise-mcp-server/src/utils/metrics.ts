let requestCount = 0;
const durations: number[] = [];

export function recordRequest(duration: number): void {
  requestCount++;
  durations.push(duration);
  if (durations.length > 1000) durations.shift();
}

export function getMetrics(): string {
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  return `# HELP mcp_requests_total Total requests
# TYPE mcp_requests_total counter
mcp_requests_total ${requestCount}

# HELP mcp_request_duration_avg Avg duration ms
# TYPE mcp_request_duration_avg gauge
mcp_request_duration_avg ${avg.toFixed(2)}
`;
}
