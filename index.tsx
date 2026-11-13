
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LoginGate from './components/LoginGate';
import { installGeminiProxyFetch } from './utils/geminiProxyFetch';

// Gemini の呼び出しはサーバーの中継経由にする（画面に鍵を持たせない）
installGeminiProxyFetch();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LoginGate>
      <App />
    </LoginGate>
  </React.StrictMode>
);
