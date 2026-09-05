/** Keep only the latest edit, but never discard it when an editor closes. */
export function createDeferredWrite(delay = 500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: (() => void) | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const write = pending;
    pending = undefined;
    write?.();
  };
  return {
    flush,
    schedule(write: () => void) {
      clearTimeout(timer);
      pending = write;
      timer = setTimeout(flush, delay);
    },
  };
}
