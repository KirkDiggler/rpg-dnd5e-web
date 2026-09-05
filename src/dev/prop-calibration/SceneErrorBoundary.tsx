import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error?: Error;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Prop Calibration Lab scene failed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: 16, color: '#ffb1b1' }}>
          Scene error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
