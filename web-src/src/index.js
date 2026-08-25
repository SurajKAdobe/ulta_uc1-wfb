import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider, defaultTheme } from '@adobe/react-spectrum'
import App from './components/App'
import './styles/ulta-theme.css'

const root = createRoot(document.getElementById('root'))
root.render(
  <Provider theme={defaultTheme} colorScheme="light">
    <App />
  </Provider>
)
