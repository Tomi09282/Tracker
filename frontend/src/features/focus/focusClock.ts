import { useEffect, useState } from 'react';

/**
 * THE CLIENT TIMER — it runs only while the focus page (or Ma) is open. There is no push and no
 * background timer: a block that runs out while the app is closed is found ran-out (`ended`) on the
 * next read, and the server's clock decides every minute and check-in anyway (B-focus api.md).
 *
 * The figure is corrected for the device's clock: the read carries the server's `now` and the
 * moment it arrived on this device (`receivedAt`), so the server's time NOW is
 * `now + (device now - receivedAt)` — a device clock that is minutes off does not move the countdown.
 */
export function useServerNow(serverNow: number | undefined, receivedAt: number | undefined, running: boolean): number {
  const [device, setDevice] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!running) return undefined;
    setDevice(Date.now() / 1000);
    // One tick a second, aligned to the device's second so the colon never stutters.
    let timer = 0;
    const tick = () => {
      setDevice(Date.now() / 1000);
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timer);
  }, [running]);
  if (serverNow === undefined || receivedAt === undefined) return device;
  return serverNow + (device - receivedAt);
}
