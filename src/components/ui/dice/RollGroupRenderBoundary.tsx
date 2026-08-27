import { Component, type ReactNode } from 'react';

export class RollGroupRenderBoundary extends Component<
  Readonly<{ onError: (reason: string) => void; children: ReactNode }>,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(`render failure: ${error.message}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
