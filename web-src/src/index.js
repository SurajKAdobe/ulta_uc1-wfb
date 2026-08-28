import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './components/App'
import './styles/ulta-theme.css'

// Provider (and its colorScheme) now lives inside App.js — dark mode is a
// toggle in the Header, so the Provider needs to be state-driven, not fixed
// here at the root.
const root = createRoot(document.getElementById('root'))
root.render(<App />)
