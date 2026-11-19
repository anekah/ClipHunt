import {
  AlertCircle,
  CheckCircle2,
  Film,
  FolderOpen,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatTimestamp } from '../lib/urlValidation';
import { ProjectDetail } from '../shared/types';

interface ProjectsViewProps {
  projects: ProjectDetail[];
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => Promise<void>;
}

export function ProjectsView({
  projects,
  onOpenProject,
  onDeleteProject,
}: ProjectsViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'completed' | 'candidates_ready' | 'attention'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchesQuery =
        !query.trim() ||
        p.title.toLowerCase().includes(query.toLowerCase()) ||
        p.sourceUrl.toLowerCase().includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (filter === 'completed') return p.status === 'completed';
      if (filter === 'candidates_ready') return p.status === 'candidates_ready';
      if (filter === 'attention') return p.status === 'restricted' || p.status === 'failed';
      return true;
    });
  }, [projects, query, filter]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-white">My Projects</h1>
          <p className="text-sm text-zinc-400">
            Reopen any analyzed video, inspect candidate timestamps, or download clips.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-3.5 sm:w-3.5 text-zinc-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
              className="h-11 sm:h-9 w-full sm:w-56 rounded-lg border border-white/20 bg-[#080808] pl-9 sm:pl-8 pr-3 text-base sm:text-xs text-white placeholder:text-zinc-500 focus:border-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-[#080808] p-1 border border-white/15">
            {(
              [
                ['all', 'All'],
                ['completed', 'Completed'],
                ['candidates_ready', 'Ready'],
                ['attention', 'Needs Upload'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`min-h-[38px] sm:min-h-0 rounded-md px-3 py-1.5 sm:py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 touch-manipulation ${
                  filter === key
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-[#050505] p-10 sm:p-12 text-center">
          <FolderOpen className="mx-auto h-7 w-7 text-zinc-500" aria-hidden="true" />
          <h2 className="mt-3 font-display text-base font-medium text-white">
            No matching projects
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Adjust your search filter or start a new analysis from the Dashboard.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/15 bg-[#080808]">
          <div className="divide-y divide-white/10">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                  <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-950 border border-white/10 flex items-center justify-center">
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Film className="h-5 w-5 text-zinc-600" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id)}
                      className="block truncate text-left font-display text-sm font-medium text-white hover:underline"
                    >
                      {project.title}
                    </button>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 tabular-nums">
                      <span>
                        {project.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 text-white">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Completed
                          </span>
                        ) : project.status === 'candidates_ready' ? (
                          <span className="text-zinc-200">Candidates ready</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <AlertCircle className="h-3 w-3" aria-hidden="true" />
                            {project.status}
                          </span>
                        )}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {project.metadata?.durationSec
                          ? formatTimestamp(project.metadata.durationSec)
                          : '--:--'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{project.candidates.length} candidates</span>
                      <span aria-hidden="true">·</span>
                      <span>{project.generatedClips.length} clips</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onOpenProject(project.id)}
                    className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 rounded-lg bg-white px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 transition-colors whitespace-nowrap touch-manipulation"
                  >
                    Open Project
                  </button>

                  {confirmDeleteId === project.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeleteProject(project.id);
                          setConfirmDeleteId(null);
                        }}
                        className="min-h-[44px] sm:min-h-0 rounded-lg bg-rose-600 px-3 py-2 sm:py-1.5 text-xs font-semibold text-white hover:bg-rose-500 touch-manipulation"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[44px] sm:min-h-0 rounded-lg border border-white/20 px-2.5 py-2 sm:py-1.5 text-xs text-zinc-300 hover:text-white touch-manipulation"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete project ${project.title}`}
                      onClick={() => setConfirmDeleteId(project.id)}
                      className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/15 text-zinc-400 hover:border-rose-500/50 hover:text-rose-400 transition-colors touch-manipulation"
                    >
                      <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
