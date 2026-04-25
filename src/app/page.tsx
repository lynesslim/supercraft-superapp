const navItems = ["Dashboard", "Projects", "Prompt Lab", "Exports"];

const workflowSteps = [
  {
    label: "Brief intake",
    status: "Ready",
    description: "Collect client goals, audience, offers, and uploaded notes.",
  },
  {
    label: "Sitemap draft",
    status: "Next",
    description: "Generate editable page hierarchy from the approved brief.",
  },
  {
    label: "Webcopy pass",
    status: "Queued",
    description: "Create page-by-page copy from strict system prompts.",
  },
];

const recentProjects = [
  { name: "Studio North", pages: "12 pages", stage: "Sitemap review" },
  { name: "Luma Clinic", pages: "8 pages", stage: "Brief intake" },
  { name: "Aster Home", pages: "16 pages", stage: "Copy draft" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff9ef_0,#f5f1ea_38%,#efe5d7_100%)] p-3 text-foreground sm:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-border/80 bg-card/80 shadow-soft backdrop-blur lg:min-h-[calc(100vh-2.5rem)] lg:flex-row">
        <aside className="border-b border-border/80 bg-primary p-5 text-primary-foreground lg:w-72 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <p className="text-xs font-semibold tracking-[0.35em] text-primary-foreground/60 uppercase">
                Supercraft
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                Sitemap Studio
              </h1>
            </div>
            <div className="rounded-full border border-white/15 px-3 py-1 text-xs text-primary-foreground/70 lg:mt-8 lg:inline-block">
              Prototype
            </div>
          </div>

          <nav className="mt-8 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {navItems.map((item) => (
              <a
                className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                  item === "Dashboard"
                    ? "bg-white text-primary shadow-panel"
                    : "text-primary-foreground/70 hover:bg-white/10 hover:text-white"
                }`}
                href="#"
                key={item}
              >
                {item}
              </a>
            ))}
          </nav>

          <div className="mt-8 hidden rounded-3xl border border-white/10 bg-white/8 p-4 lg:block">
            <p className="text-sm font-medium">Prompt health</p>
            <p className="mt-2 text-3xl font-semibold">92%</p>
            <p className="mt-2 text-sm leading-6 text-primary-foreground/60">
              Sitemap and webcopy rules are ready for the playground phase.
            </p>
          </div>
        </aside>

        <main className="flex-1 p-5 sm:p-8 lg:p-10">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-accent uppercase tracking-[0.22em]">
                AI workspace
              </p>
              <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Build client sitemaps and conversion-ready webcopy from one brief.
              </h2>
            </div>
            <button className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-panel transition hover:-translate-y-0.5 hover:bg-foreground">
              New project
            </button>
          </header>

          <section className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="rounded-[2rem] border border-border bg-white/70 p-6 shadow-panel">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted">Current flow</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                    Generate, review, approve
                  </h3>
                </div>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">
                  Phase 1 shell
                </span>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {workflowSteps.map((step, index) => (
                  <article
                    className="rounded-3xl border border-border bg-card p-5"
                    key={step.label}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {index + 1}
                      </span>
                      <span className="text-xs font-semibold text-success uppercase tracking-[0.2em]">
                        {step.status}
                      </span>
                    </div>
                    <h4 className="mt-5 text-lg font-semibold">{step.label}</h4>
                    <p className="mt-3 text-sm leading-6 text-muted">
                      {step.description}
                    </p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-border bg-primary p-6 text-primary-foreground shadow-panel">
              <p className="text-sm font-semibold text-primary-foreground/60">
                Next milestone
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Playground and prompts data layer
              </h3>
              <p className="mt-4 text-sm leading-6 text-primary-foreground/65">
                Phase 2 will add prompt persistence, an admin testing route, and a shared AI generation endpoint.
              </p>
              <div className="mt-8 rounded-3xl bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary-foreground/50">
                  UI status
                </p>
                <p className="mt-3 text-4xl font-semibold">Shell ready</p>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-[2rem] border border-border bg-white/70 p-6 shadow-panel">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-muted">Recent projects</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                  Production queue
                </h3>
              </div>
              <a className="text-sm font-semibold text-accent" href="#">
                View all
              </a>
            </div>

            <div className="mt-6 grid gap-3">
              {recentProjects.map((project) => (
                <article
                  className="grid gap-3 rounded-3xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  key={project.name}
                >
                  <p className="font-semibold">{project.name}</p>
                  <p className="text-sm text-muted">{project.pages}</p>
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">
                    {project.stage}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
