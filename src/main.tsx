import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppDialogContainer from './components/AppDialog.tsx';
import { LanguageProvider } from './translations.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
    <AppDialogContainer />
  </LanguageProvider>
);
