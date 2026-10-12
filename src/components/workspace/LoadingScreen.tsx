// SKELETON: Shared loading state used for auth, workspace resolution, and missing configuration.
import { Activity } from "lucide-react";

export function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">
      <div className="flex items-center gap-3 text-sm">
        <Activity className="animate-pulse text-sky-400" size={20} />
        {message}
      </div>
    </main>
  );
}
