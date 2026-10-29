import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppDialogContainer from './components/AppDialog.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <AppDialogContainer />
  </>
);

