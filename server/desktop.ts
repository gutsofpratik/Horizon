import {startHost} from './start.ts';
import {registerNativeBroker} from './runtime/native-broker.ts';
import {registerModelRuntime} from './models/runtime.ts';
if(process.env.OPENCLAUDE_DESKTOP_OWNED!=='1')throw new Error('Desktop host must be launched by Horizon Desktop');
await startHost((app,context)=>{registerNativeBroker(app,context);registerModelRuntime(app,context);});
