import {RuntimeReady} from './app/RuntimeReady';
import './styles/ecosystem.css';
import {SessionGate} from './app/SessionGate';
import {ProfileGate} from './app/ProfileGate';
import {RemoteSession} from './app/RemoteSession';
import React from 'react';import {createRoot} from 'react-dom/client';
import App from './app/App';import './styles/app.css';import 'katex/dist/katex.min.css';
import './styles/chat-detail.css';import './styles/tokens.css';
import './styles/research.css';
import './styles/creative.css';
import './styles/workspace-controls.css';
import './styles/settings-layout.css';
import {ComputerIndicator} from './chat/ComputerIndicator';
import {Notifications} from './app/Notifications';

import '@fontsource/dm-sans/400.css';import '@fontsource/dm-sans/500.css';import '@fontsource/dm-sans/600.css';import '@fontsource/lora/400.css';import '@fontsource/lora/500.css';
const controlOverlay=location.pathname.endsWith('/control-indicator');
if(controlOverlay)document.documentElement.classList.add('computer-overlay-root');
createRoot(document.getElementById('root')!).render(location.pathname==='/remote'?<RemoteSession/>:controlOverlay?<ComputerIndicator active nativeOverlay/>:<SessionGate><ProfileGate><RuntimeReady><App/></RuntimeReady></ProfileGate><Notifications/></SessionGate>);
