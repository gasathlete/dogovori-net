import { Component, type ReactNode } from "react";

interface State {
  failed: boolean;
}

/**
 * Last-resort boundary for failed lazy chunk loads (e.g. after a new deploy
 * when Safari reports "Importing a module script failed"). Instead of a blank
 * screen, the visitor sees a short message and a reload action.
 */
export class ChunkErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  private reload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(Date.now()));
    window.location.replace(url.toString());
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6 py-16">
        <h1 className="font-serif text-2xl text-foreground">Страницата не се зареди</h1>
        <p className="text-muted-foreground">
          Вероятно сайтът току-що е обновен. Презаредете страницата, за да заредите новата версия.
        </p>
        <div>
          <button
            type="button"
            onClick={this.reload}
            className="min-h-11 rounded-md bg-primary px-5 py-2 text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Презаредете
          </button>
        </div>
      </main>
    );
  }
}
