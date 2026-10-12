// SKELETON: Product-neutral activity tracker for Supabase reads, writes, and function calls.
type Listener = () => void;
let activeRequests = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function beginTrackedRequest(): () => void {
  activeRequests += 1;
  emit();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activeRequests = Math.max(0, activeRequests - 1);
    emit();
  };
}

export function subscribeToRequestActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveRequestCount(): number {
  return activeRequests;
}

// MIX: Pass this into Supabase's global fetch so existing product services gain tracking without rewrites.
const nativeFetch = globalThis.fetch.bind(globalThis);

export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const finish = beginTrackedRequest();
  try {
    return await nativeFetch(input, init);
  } finally {
    finish();
  }
}
