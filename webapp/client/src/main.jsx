import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { CardZoomProvider } from './CardZoomContext.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CardZoomProvider>
      <App />
    </CardZoomProvider>
  </React.StrictMode>
);
