import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Assuming you have base styles here (like for Tailwind)
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);