import type {ServerResponse} from 'node:http';
/** SSE comments reset idle transport timers without inventing model output. */
export function startInferenceHeartbeat(response:ServerResponse,intervalMs=10000){
 const stop=()=>{clearInterval(timer);response.off('close',stop);};
 const timer=setInterval(()=>{if(response.destroyed||response.writableEnded){stop();return;}response.write(': inference keep-alive\n\n');},intervalMs);
 timer.unref();response.once('close',stop);return stop;
}
