// ACW v2 — refusal channel.
//
// A tiny pub/sub used so visual surfaces (Canvas2D drag handlers,
// the group affordance, etc.) can route validator-sourced refusals
// back to the single shared refusal banner inside AuthoringPanel.
// Without this channel, every callsite would need to thread a
// setRefusal callback down through props, and the banner would
// silently miss visual-layer refusals.
//
// The channel transports refusal *strings only* — the same neutral
// strings the validator already produces. It carries no codes, no
// severities, no remediation. Subscribers receive the message
// verbatim and surface it as plain text.
let lastMessage: string | null = null;
const subscribers = new Set<(message: string) => void>();

export function publishRefusal(message: string): void {
  lastMessage = message;
  for (const fn of subscribers) {
    try {
      fn(message);
    } catch {
      // Subscribers must not escalate; drop and continue.
    }
  }
}

export function subscribeRefusals(fn: (message: string) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

// Test affordance: lets invariants probe what the channel last
// transported without subscribing.
export const __acwRefusalChannelInternals = Object.freeze({
  peekLast(): string | null {
    return lastMessage;
  },
  reset(): void {
    lastMessage = null;
  },
});
