import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#ff4d4f', background: '#1c1c1d', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>App Rendering Error</h2>
          <pre style={{ fontSize: '12px', marginTop: '10px', whiteSpace: 'pre-wrap', opacity: 0.8 }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ fontSize: '10px', marginTop: '10px', whiteSpace: 'pre-wrap', opacity: 0.6 }}>
            {this.state.errorInfo?.componentStack}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', padding: '10px 20px', background: '#2481cc', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
