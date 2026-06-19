/**
 * perfProbe — đo thời gian tạm thời để dò nguyên nhân lag (DEV-only, gỡ sau khi xong).
 *
 * Bật/tắt tại runtime trong console:
 *   __perf.on()   → bắt đầu log
 *   __perf.off()  → ngừng log
 *   __perf.stats() → in trung bình/đỉnh các mốc đã đo rồi reset
 *
 * Dùng `mark(label, ms)` để nạp 1 số đo; probe tự gom theo label.
 */
type Bucket = { count: number; sum: number; max: number; last: number };

const buckets = new Map<string, Bucket>();
let enabled = false;

export function perfEnabled(): boolean {
    return enabled;
}

export function perfMark(label: string, ms: number): void {
    if (!enabled) return;
    let b = buckets.get(label);
    if (!b) {
        b = { count: 0, sum: 0, max: 0, last: 0 };
        buckets.set(label, b);
    }
    b.count++;
    b.sum += ms;
    b.max = Math.max(b.max, ms);
    b.last = ms;
}

function stats(): void {
    if (buckets.size === 0) {
        // eslint-disable-next-line no-console
        console.log("[perf] chưa có số đo nào");
        return;
    }
    // eslint-disable-next-line no-console
    console.table(
        Object.fromEntries(
            [...buckets.entries()].map(([k, b]) => [
                k,
                {
                    "n": b.count,
                    "avg": +(b.sum / b.count).toFixed(2),
                    "max": +b.max.toFixed(2),
                    "last": +b.last.toFixed(2),
                },
            ]),
        ),
    );
    buckets.clear();
}

// Phơi API ra window cho DEV bật/tắt nhanh trong console.
if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __perf: unknown }).__perf = {
        on: () => {
            enabled = true;
            // eslint-disable-next-line no-console
            console.log("[perf] ON — click chọn vật + orbit, rồi __perf.stats()");
        },
        off: () => {
            enabled = false;
            // eslint-disable-next-line no-console
            console.log("[perf] OFF");
        },
        stats,
    };
}
