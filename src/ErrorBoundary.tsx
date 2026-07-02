import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Without this, any render-time exception anywhere in the tree unmounts the whole app —
// and since this is a local-first PWA with no server round-trip to fall back to, that
// means a permanently blank white screen with no way to recover short of clearing site
// data. This catches it and offers a reload instead (the user's data in IndexedDB is
// untouched either way, since nothing here writes to it).
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error in app tree:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="view" style={{ padding: 24, textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p className="muted">
            The app hit an unexpected error. Your saved data is safe — reloading should fix it.
          </p>
          <button style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
