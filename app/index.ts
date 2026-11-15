import { registerRootComponent } from 'expo';

import App from './App';
import QuickApp from './QuickApp';

// One codebase, two apps. EXPO_PUBLIC_APP=quick builds Quick Dial; anything else builds Dial.
registerRootComponent(process.env.EXPO_PUBLIC_APP === 'quick' ? QuickApp : App);
