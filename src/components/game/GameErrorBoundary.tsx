/**
 * A game view that throws while rendering shows a sentence and a way out,
 * never a blank page (rpg-project#1004). Without a boundary, React unmounts
 * the whole app on an uncaught render error. Resume-after-refresh routes
 * every load into a running encounter, so a game view that cannot render
 * would leave a white page on every load. The way out is the same Back the
 * game's own header uses, which lands on Home.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface GameErrorBoundaryProps {
  children: ReactNode;
  /** Leaves the game for Home. */
  onBack(): void;
  /** Returns to the studio watching this run, when the game was entered
   * from it. */
  onBackToStudio?: () => void;
  /** Told once the view has failed, so a resume does not repeat it. */
  onError?: (error: Error) => void;
}

interface GameErrorBoundaryState {
  error: Error | null;
}

export class GameErrorBoundary extends Component<
  GameErrorBoundaryProps,
  GameErrorBoundaryState
> {
  state: GameErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): GameErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('The game view failed to render', error, info.componentStack);
    this.props.onError?.(
      error instanceof Error ? error : new Error(String(error))
    );
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section
        role="alert"
        aria-label="The game could not open"
        className="flex flex-col items-center justify-center h-screen gap-4 p-8 text-center"
      >
        <h1 className="text-xl font-bold">The game could not open this run</h1>
        <p className="max-w-xl text-sm opacity-80">{error.message}</p>
        <div className="flex gap-3">
          {this.props.onBackToStudio && (
            <button
              type="button"
              className="px-4 py-2 rounded border"
              onClick={this.props.onBackToStudio}
            >
              Back to the studio
            </button>
          )}
          <button
            type="button"
            className="px-4 py-2 rounded border"
            onClick={this.props.onBack}
          >
            Back to home
          </button>
        </div>
      </section>
    );
  }
}
