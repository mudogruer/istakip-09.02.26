import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App';
import './assets/styles.css';

const theme = createTheme({
  palette: { mode: 'light' },
  components: {
    MuiSvgIcon: {
      styleOverrides: {
        root: { verticalAlign: 'middle' },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

