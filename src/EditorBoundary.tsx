import { Component } from "react";
import type { ReactNode } from "react";

export default class EditorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="editor-load-error" role="alert">
          <h2>The PDF editor couldn’t load.</h2>
          <p>
            Refresh LocalPDFSign, then choose your PDF again. Your original file
            is unchanged and has not been uploaded.
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Refresh LocalPDFSign
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
