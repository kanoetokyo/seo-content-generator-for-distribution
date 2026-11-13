
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SessionCheck from './components/SessionCheck';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <SessionCheck>
      <App />
    </SessionCheck>
  </React.StrictMode>
);
