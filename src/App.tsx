import { AlertCircle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalysisPipelineView } from './components/AnalysisPipelineView';
import { ClipLibraryView } from './components/ClipLibraryView';
import { ClipStudioView } from './components/ClipStudioView';
import { DashboardView } from './components/DashboardView';
import { DownloadCentreView } from './components/DownloadCentreView';
import { HelpSupportView } from './components/HelpSupportView';
import { ProjectsView } from './components/ProjectsView';
import { SettingsView } from './components/SettingsView';
import { TopBar } from './components/TopBar';
import {
  analyzeLocalVideoFile,
  analyzeLocalYouTubeUrl,
  deleteLocalProject,
  getLocalDashboard,
  regenerateLocalCandidates,
  saveLocalSettings,
} from './lib/localWorkspace';
import {
  CaptionConfig,
  GeneratedClip,
  NavSection,
  ProjectDetail,
  UserSettings,
  UserUsage,
} from './shared/types';

type StudioSubView = 'pipeline' | 'studio' | 'downloads';

interface ClipLibraryEntry extends GeneratedClip {
  projectTitle: string;
  thumbnailUrl: string;
}

function isStaticUnavailableApi(res: Response): boolean {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 404 || res.status === 405) return true;
  if (res.ok && ct.includes('text/html')) return true;
  return false;
}

async function safeReadJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status} with an empty response.`);
    }
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `ClipHunt API returned an unexpected response (HTTP ${res.status}). Please refresh or retry in a moment.`,
    );
  }
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [studioSubView, setStudioSubView] = useState<StudioSubView>('studio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [libraryClips, setLibraryClips] = useState<ClipLibraryEntry[]>([]);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const useLocalFallbackRef = useRef(false);

  const loadLocalState = useCallback(() => {
    const local = getLocalDashboard();
    setUsage(local.usage);
    setProjects(local.projects);
    setSettings(local.settings);
    setLibraryClips(local.clips);
    return local.projects;
  }, []);

  const fetchDashboard = useCallback(
    async (retries = 2) => {
      if (useLocalFallbackRef.current) {
        return loadLocalState();
      }
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const [dashRes, clipsRes] = await Promise.all([
            fetch('/api/dashboard'),
            fetch('/api/clips'),
          ]);
          if (isStaticUnavailableApi(dashRes)) {
            useLocalFallbackRef.current = true;
            return loadLocalState();
          }
          if (!dashRes.ok) {
            if (
              attempt < retries &&
              (dashRes.status === 502 || dashRes.status === 503 || dashRes.status === 504)
            ) {
              await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
              continue;
            }
            throw new Error(`Failed to load workspace data (HTTP ${dashRes.status}).`);
          }
          const dashData = await safeReadJson<{
            usage: UserUsage;
            projects: ProjectDetail[];
            settings: UserSettings;
          }>(dashRes);
          setUsage(dashData.usage);
          setProjects(dashData.projects);
          setSettings(dashData.settings);

          if (clipsRes.ok) {
            const clipsData = await safeReadJson<{ clips: ClipLibraryEntry[] }>(clipsRes);
            setLibraryClips(clipsData.clips);
          }
          return dashData.projects;
        } catch (err) {
          lastError = err;
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Failed to load workspace data.');
    },
    [loadLocalState],
  );

  useEffect(() => {
    (async () => {
      try {
        const loaded = await fetchDashboard();
        const params = new URLSearchParams(window.location.search);
        const linkedProjectId = params.get('project');
        if (linkedProjectId) {
          const found = loaded.find((p) => p.id === linkedProjectId);
          if (found) {
            setActiveProjectId(found.id);
            setActiveNav('create');
            setStudioSubView(
              found.generatedClips.length > 0 && found.status === 'completed'
                ? 'downloads'
                : found.status === 'candidates_ready' || found.candidates.length > 0
                  ? 'studio'
                  : 'pipeline',
            );
          }
        } else if (loaded.length > 0) {
          setActiveProjectId(loaded[0].id);
        }
      } catch (err) {
        setGlobalError(err instanceof Error ? err.message : 'Unable to connect to ClipHunt API.');
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchDashboard]);

  // Poll active background job until completion, restriction, or failure
  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/status/${encodeURIComponent(activeJobId)}`);
        if (!res.ok) return;
        const data = await safeReadJson<{
          job: NonNullable<ProjectDetail['job']>;
          project: ProjectDetail | null;
        }>(res);

        if (cancelled || !data.project) return;
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === data.project!.id);
          return exists
            ? prev.map((p) => (p.id === data.project!.id ? data.project! : p))
            : [data.project!, ...prev];
        });

        if (data.job.status === 'completed') {
          setActiveJobId(null);
          setIsRendering(false);
          await fetchDashboard();
          if (data.project.status === 'completed' && data.project.generatedClips.length > 0) {
            setStudioSubView('downloads');
          } else {
            setStudioSubView('studio');
          }
        } else if (data.job.status === 'failed' || data.job.status === 'restricted') {
          setActiveJobId(null);
          setIsRendering(false);
          await fetchDashboard();
        }
      } catch {
        // Keep polling on transient network hiccup
      }
    }, 850);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeJobId, fetchDashboard]);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  const openProject = (projectId: string) => {
    const found = projects.find((p) => p.id === projectId);
    if (!found) return;
    setActiveProjectId(found.id);
    setActiveNav('create');
    if (found.status === 'analyzing' || found.status === 'rendering') {
      setActiveJobId(found.job?.id ?? null);
      setStudioSubView('pipeline');
    } else if (found.status === 'restricted' || found.status === 'failed') {
      setStudioSubView('pipeline');
    } else if (found.status === 'completed' && found.generatedClips.length > 0) {
      setStudioSubView('downloads');
    } else {
      setStudioSubView('studio');
    }
  };

  const handleAnalyzeUrl = async (url: string) => {
    setIsSubmitting(true);
    setGlobalError(null);
    try {
      if (!useLocalFallbackRef.current) {
        const res = await fetch('/api/video/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        if (!isStaticUnavailableApi(res)) {
          const data = await safeReadJson<{ projectId?: string; jobId?: string; error?: string }>(
            res,
          );
          if (!res.ok) throw new Error(data.error || 'Failed to start analysis.');
          if (!data.projectId || !data.jobId) {
            throw new Error('Server did not return an analysis job ID.');
          }
          await fetchDashboard(0);
          setActiveProjectId(data.projectId);
          setActiveJobId(data.jobId);
          setActiveNav('create');
          setStudioSubView('pipeline');
          return;
        }
        useLocalFallbackRef.current = true;
      }

      const project = await analyzeLocalYouTubeUrl(url);
      loadLocalState();
      setActiveProjectId(project.id);
      setActiveJobId(null);
      setActiveNav('create');
      setStudioSubView('pipeline');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Analysis request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadVideo = async (file: File) => {
    setIsSubmitting(true);
    setGlobalError(null);
    try {
      if (!useLocalFallbackRef.current) {
        const form = new FormData();
        form.append('video', file);
        const res = await fetch('/api/video/upload', {
          method: 'POST',
          body: form,
        });
        if (!isStaticUnavailableApi(res)) {
          const data = await safeReadJson<{ projectId?: string; jobId?: string; error?: string }>(
            res,
          );
          if (!res.ok) throw new Error(data.error || 'Upload failed.');
          if (!data.projectId || !data.jobId) {
            throw new Error('Server did not return an upload job ID.');
          }
          await fetchDashboard(0);
          setActiveProjectId(data.projectId);
          setActiveJobId(data.jobId);
          setActiveNav('create');
          setStudioSubView('pipeline');
          return;
        }
        useLocalFallbackRef.current = true;
      }

      const project = await analyzeLocalVideoFile(file);
      loadLocalState();
      setActiveProjectId(project.id);
      setActiveJobId(null);
      setActiveNav('create');
      setStudioSubView('studio');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Video upload failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectAndRender = async (params: {
    candidateId: string;
    startSec: number;
    endSec: number;
    captionConfig: CaptionConfig;
  }) => {
    if (!activeProject) return;
    setIsRendering(true);
    setGlobalError(null);
    try {
      if (useLocalFallbackRef.current) {
        throw new Error(
          'Dual 16:9 & 9:16 MP4 rendering requires the ClipHunt FFmpeg backend server. Previewing, candidate scoring, and timeline trimming are active in browser mode.',
        );
      }

      await fetch('/api/video/select-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, ...params }),
      });

      const res = await fetch('/api/video/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, ...params }),
      });
      if (isStaticUnavailableApi(res)) {
        useLocalFallbackRef.current = true;
        throw new Error(
          'Dual 16:9 & 9:16 MP4 rendering requires the ClipHunt FFmpeg backend server.',
        );
      }
      const data = await safeReadJson<{ jobId?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || 'Unable to start clip rendering.');
      if (!data.jobId) {
        throw new Error('Server did not return a render job ID.');
      }
      setActiveJobId(data.jobId);
      setStudioSubView('pipeline');
    } catch (err) {
      setIsRendering(false);
      setGlobalError(err instanceof Error ? err.message : 'Clip render error.');
    }
  };

  const handleRegenerateCandidates = async () => {
    if (!activeProject) return;
    setIsRegenerating(true);
    setGlobalError(null);
    try {
      if (!useLocalFallbackRef.current) {
        const res = await fetch('/api/video/regenerate-candidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: activeProject.id }),
        });
        if (!isStaticUnavailableApi(res)) {
          const data = await safeReadJson<{ project?: ProjectDetail; error?: string }>(res);
          if (!res.ok || !data.project)
            throw new Error(data.error || 'Could not regenerate candidates.');
          setProjects((prev) => prev.map((p) => (p.id === data.project!.id ? data.project! : p)));
          return;
        }
        useLocalFallbackRef.current = true;
      }

      const updated = regenerateLocalCandidates(activeProject.id);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Regeneration failed.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!useLocalFallbackRef.current) {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      });
      if (!isStaticUnavailableApi(res)) {
        if (res.ok) {
          const remaining = await fetchDashboard(0);
          if (activeProjectId === projectId) {
            setActiveProjectId(remaining[0]?.id ?? null);
          }
        }
        return;
      }
      useLocalFallbackRef.current = true;
    }

    deleteLocalProject(projectId);
    const remaining = loadLocalState();
    if (activeProjectId === projectId) {
      setActiveProjectId(remaining[0]?.id ?? null);
    }
  };

  const handleSaveSettings = async (next: UserSettings) => {
    if (!useLocalFallbackRef.current) {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!isStaticUnavailableApi(res)) {
        const data = await safeReadJson<{ settings?: UserSettings; error?: string }>(res);
        if (!res.ok || !data.settings) throw new Error(data.error || 'Failed to save settings.');
        setSettings(data.settings);
        return;
      }
      useLocalFallbackRef.current = true;
    }

    const updated = saveLocalSettings(next);
    setSettings(updated);
  };

  const handleSelectNav = (nav: NavSection) => {
    setActiveNav(nav);
    if (nav === 'create' && activeProject) {
      if (activeProject.status === 'completed' && activeProject.generatedClips.length > 0) {
        setStudioSubView('downloads');
      } else if (activeProject.candidates.length > 0) {
        setStudioSubView('studio');
      } else {
        setStudioSubView('pipeline');
      }
    }
  };

  const used = usage?.monthlyClipsUsed ?? 0;
  const limit = usage?.monthlyClipsLimit ?? 60;

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <TopBar
        activeNav={activeNav}
        onSelectNav={handleSelectNav}
        mobileOpen={mobileMenuOpen}
        onToggleMobile={() => setMobileMenuOpen((v) => !v)}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onNewClip={() => setActiveNav('dashboard')}
      />

      <main className="flex-1 px-4 py-4 sm:px-8 sm:py-8">
        {globalError && (
          <div
            role="alert"
            className="mx-auto mb-6 max-w-[1200px] flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{globalError}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setGlobalError(null);
                  try {
                    await fetchDashboard(0);
                  } catch (err) {
                    setGlobalError(
                      err instanceof Error ? err.message : 'Unable to connect to ClipHunt API.',
                    );
                  }
                }}
                className="min-h-[36px] rounded border border-rose-400/40 px-2.5 text-rose-100 hover:bg-rose-900/40 font-medium"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setGlobalError(null)}
                className="min-h-[36px] px-2 text-rose-300 hover:text-white font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center gap-3 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
            <span>Loading ClipHunt studio...</span>
          </div>
        ) : (
          <>
            {activeNav === 'dashboard' && (
              <DashboardView
                usage={usage}
                projects={projects}
                onAnalyzeUrl={handleAnalyzeUrl}
                onUploadVideo={handleUploadVideo}
                onOpenProject={openProject}
                onViewAllProjects={() => setActiveNav('projects')}
                onOpenHelp={() => setActiveNav('help')}
                isSubmitting={isSubmitting}
              />
            )}

            {activeNav === 'create' && (
              <>
                {!activeProject ? (
                  <DashboardView
                    usage={usage}
                    projects={projects}
                    onAnalyzeUrl={handleAnalyzeUrl}
                    onUploadVideo={handleUploadVideo}
                    onOpenProject={openProject}
                    onViewAllProjects={() => setActiveNav('projects')}
                    onOpenHelp={() => setActiveNav('help')}
                    isSubmitting={isSubmitting}
                  />
                ) : studioSubView === 'pipeline' ? (
                  <AnalysisPipelineView
                    project={activeProject}
                    onUploadFallback={handleUploadVideo}
                    onBackToDashboard={() => setActiveNav('dashboard')}
                  />
                ) : studioSubView === 'downloads' && activeProject.generatedClips.length > 0 ? (
                  <DownloadCentreView
                    project={activeProject}
                    onBackToStudio={() => setStudioSubView('studio')}
                  />
                ) : (
                  <ClipStudioView
                    project={activeProject}
                    onSelectAndRender={handleSelectAndRender}
                    onRegenerateCandidates={handleRegenerateCandidates}
                    onViewDownloads={() => setStudioSubView('downloads')}
                    isRendering={isRendering}
                    isRegenerating={isRegenerating}
                  />
                )}
              </>
            )}

            {activeNav === 'projects' && (
              <ProjectsView
                projects={projects}
                onOpenProject={openProject}
                onDeleteProject={handleDeleteProject}
              />
            )}

            {activeNav === 'library' && (
              <ClipLibraryView
                clips={libraryClips}
                onGoCreate={() => setActiveNav('dashboard')}
              />
            )}

            {activeNav === 'settings' && settings && (
              <SettingsView settings={settings} onSaveSettings={handleSaveSettings} />
            )}

            {activeNav === 'help' && (
              <HelpSupportView onGoDashboard={() => setActiveNav('dashboard')} />
            )}
          </>
        )}
      </main>

      {/* Quiet Footer (extra bottom padding on mobile to clear bottom tab bar) */}
      <footer className="border-t border-white/15 px-4 pt-6 pb-24 md:py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1200px] flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="font-display font-medium text-white">ClipHunt</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {used} / {limit} monthly clips
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{usage?.storageUsedMb ?? 0} MB used</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6">
            <button
              type="button"
              onClick={() => setActiveNav('projects')}
              className="min-h-[36px] hover:text-white transition-colors"
            >
              My Projects
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('library')}
              className="min-h-[36px] hover:text-white transition-colors"
            >
              Clip Library
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('settings')}
              className="min-h-[36px] hover:text-white transition-colors"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('help')}
              className="min-h-[36px] hover:text-white transition-colors"
            >
              Help & Support
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
