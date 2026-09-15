// A believable Octopod/drive/Mattermost call has network latency; a mock
// that resolves instantly is one of the "signs the data is simulated" the
// epic context explicitly rules out. Previously copy-pasted verbatim into
// every `integrations/mock/*.ts` adapter — consolidated here.
export function withLatency<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 180));
}
