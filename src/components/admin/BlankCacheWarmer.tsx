import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Pause, Square, Download, Flame } from "lucide-react";
import { buildBlankTasks, type BlankTask } from "@/lib/blankCatalog";
import { toast } from "sonner";

type Status = "pending" | "running" | "skipped" | "generated" | "queued" | "failed";

interface TaskResult {
  task: BlankTask;
  status: Status;
  error?: string;
  attempts?: number;
}

// Generation now runs as a background task on the edge function and returns
// "queued" immediately. We throttle the client loop so the AI gateway isn't
// flooded — ~8s per queued task ≈ steady ~7 concurrent generations.
const STEP_DELAY_MS = 500;
const QUEUED_DELAY_MS = 8000;
const RATE_LIMIT_BACKOFF_MS = 10_000;
const NETWORK_RETRIES = 2;

export function BlankCacheWarmer() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskResult[]>([]);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [pausedRef] = useState({ current: false });
  const [stoppedRef] = useState({ current: false });
  const currentTaskRef = useRef<BlankTask | null>(null);

  const counts = useMemo(() => {
    const c = { pending: 0, skipped: 0, generated: 0, queued: 0, failed: 0 };
    for (const t of tasks) {
      if (t.status === "skipped") c.skipped++;
      else if (t.status === "generated") c.generated++;
      else if (t.status === "queued") c.queued++;
      else if (t.status === "failed") c.failed++;
      else c.pending++;
    }
    return c;
  }, [tasks]);

  const total = tasks.length;
  const done = counts.skipped + counts.generated + counts.queued + counts.failed;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  // Initialise the task list when dialog opens.
  useEffect(() => {
    if (open && tasks.length === 0) {
      const list = buildBlankTasks();
      setTasks(list.map((task) => ({ task, status: "pending" as Status })));
      setIndex(0);
    }
  }, [open, tasks.length]);

  // Warn before tab close while running.
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  const updateTask = (i: number, patch: Partial<TaskResult>) => {
    setTasks((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  };

  async function callWarm(task: BlankTask): Promise<{ status: Status; error?: string; httpStatus?: number }> {
    for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke("warm-blank-cache", {
          body: {
            sector_id: task.sector_id,
            document_name: task.document_name,
            sector_title: task.sector_title,
            bilingual: task.bilingual,
          },
        });

        if (error) {
          // supabase-js wraps non-2xx as error; check context for status.
          const ctx = (error as { context?: { status?: number } }).context;
          const httpStatus = ctx?.status;
          if (httpStatus === 429) {
            await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
            continue;
          }
          if (httpStatus === 403 || httpStatus === 401) {
            return { status: "failed", error: `auth: ${httpStatus}`, httpStatus };
          }
          if (attempt < NETWORK_RETRIES) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          return { status: "failed", error: error.message ?? "network error", httpStatus };
        }

        const result = data as { status?: Status; error?: string } | null;
        if (!result?.status) {
          return { status: "failed", error: "empty response" };
        }
        if (result.status === "failed" && /429|rate/i.test(result.error ?? "") && attempt < NETWORK_RETRIES) {
          await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
          continue;
        }
        return { status: result.status, error: result.error };
      } catch (e) {
        if (attempt < NETWORK_RETRIES) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return { status: "failed", error: (e as Error)?.message ?? "unknown" };
      }
    }
    return { status: "failed", error: "exhausted retries" };
  }

  async function run(startFrom: number) {
    setRunning(true);
    stoppedRef.current = false;
    pausedRef.current = false;

    for (let i = startFrom; i < tasks.length; i++) {
      if (stoppedRef.current) break;

      while (pausedRef.current && !stoppedRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (stoppedRef.current) break;

      setIndex(i);
      const task = tasks[i].task;
      currentTaskRef.current = task;
      updateTask(i, { status: "running" });

      const res = await callWarm(task);
      updateTask(i, { status: res.status, error: res.error });

      // Tiny throttle between tasks (skip if already cached, no AI load).
      if (res.status !== "skipped") {
        await new Promise((r) => setTimeout(r, STEP_DELAY_MS));
      }
    }

    setRunning(false);
    currentTaskRef.current = null;
    if (!stoppedRef.current) {
      toast.success("Cache warming complete");
    }
  }

  function handleStart() {
    if (running) return;
    // Find first pending task.
    const next = tasks.findIndex((t) => t.status === "pending");
    if (next < 0) {
      toast.info("Nothing to do — all tasks already processed.");
      return;
    }
    void run(next);
  }

  function handlePause() {
    pausedRef.current = !pausedRef.current;
    // Force re-render by toggling a state.
    setRunning((r) => r);
    setIndex((v) => v);
  }

  function handleStop() {
    stoppedRef.current = true;
    pausedRef.current = false;
  }

  function handleReset() {
    if (running) return;
    setTasks(buildBlankTasks().map((task) => ({ task, status: "pending" as Status })));
    setIndex(0);
  }

  function downloadFailedLog() {
    const failed = tasks.filter((t) => t.status === "failed");
    const blob = new Blob([JSON.stringify(failed, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blank-cache-warm-failures-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const currentTask = currentTaskRef.current;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-gold/40"
        onClick={() => setOpen(true)}
      >
        <Flame className="h-4 w-4 mr-1 text-gold" /> Warm blanks cache
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!running) setOpen(v); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-gold" /> Warm blanks cache
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pre-generates all blank templates from the catalog and uploads them to Storage.
              Already-cached blanks are skipped. Safe to run multiple times.
            </p>
            {running && (
              <p className="text-xs text-amber-600 font-medium">
                ⚠️ Don't close this tab — the process runs in the browser.
              </p>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline">Total: {total}</Badge>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">Generated: {counts.generated}</Badge>
              <Badge variant="outline" className="border-blue-500/40 text-blue-700">Skipped: {counts.skipped}</Badge>
              <Badge variant="outline" className="border-red-500/40 text-red-700">Failed: {counts.failed}</Badge>
              <Badge variant="outline">Pending: {counts.pending}</Badge>
            </div>

            <Progress value={percent} />
            <p className="text-xs text-muted-foreground">{done} / {total} ({percent}%)</p>

            {currentTask && running && (
              <div className="text-sm border rounded-md p-2 bg-muted/40">
                <div className="font-medium truncate">
                  {pausedRef.current ? "⏸ Paused at:" : "⏳ Working on:"} {currentTask.document_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentTask.sector_title} · {currentTask.bilingual ? "BG/EN" : "BG"}
                </div>
              </div>
            )}

            <div className="max-h-48 overflow-auto border rounded-md text-xs">
              {tasks.slice(Math.max(0, index - 3), Math.min(tasks.length, index + 30)).map((t, idx) => {
                const realIdx = Math.max(0, index - 3) + idx;
                const color =
                  t.status === "generated" ? "text-emerald-600"
                    : t.status === "skipped" ? "text-blue-600"
                      : t.status === "failed" ? "text-red-600"
                        : t.status === "running" ? "text-amber-600 font-semibold"
                          : "text-muted-foreground";
                return (
                  <div key={`${t.task.sector_id}-${t.task.document_name}-${t.task.bilingual}-${realIdx}`} className={`px-2 py-1 border-b last:border-b-0 flex items-center gap-2 ${color}`}>
                    <span className="w-12 tabular-nums">{realIdx + 1}.</span>
                    <span className="flex-1 truncate">{t.task.document_name}{t.task.bilingual ? " (BG/EN)" : ""}</span>
                    <span className="uppercase text-[10px]">{t.status}</span>
                  </div>
                );
              })}
            </div>

            {counts.failed > 0 && (
              <Button variant="outline" size="sm" onClick={downloadFailedLog}>
                <Download className="h-4 w-4 mr-1" /> Download failures log
              </Button>
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            {!running ? (
              <>
                <Button variant="outline" onClick={handleReset} disabled={running}>Reset</Button>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Close</Button>
                <Button onClick={handleStart} className="bg-gold text-gold-foreground hover:bg-gold/90">
                  <Play className="h-4 w-4 mr-1" /> {done > 0 ? "Resume" : "Start"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handlePause}>
                  <Pause className="h-4 w-4 mr-1" /> {pausedRef.current ? "Resume" : "Pause"}
                </Button>
                <Button variant="destructive" onClick={handleStop}>
                  <Square className="h-4 w-4 mr-1" /> Stop
                </Button>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground self-center" />
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
