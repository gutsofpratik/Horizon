export function runtimePacks(platform=process.platform){return [
 {id:'llama-cpu',name:'CPU llama.cpp',installable:true,status:'Available',description:'Direct GGUF inference with CPU fallback; verifies the pinned llama-cpp-python runtime.'},
 {id:'llama-cuda',name:'CUDA llama.cpp',installable:platform!=='darwin',status:platform==='darwin'?'Unavailable on macOS':'Available · requires NVIDIA CUDA',description:'Direct GPU GGUF inference. Uses the same private worker, without a llama-server.'},
 {id:'llama-vulkan',name:'Vulkan llama.cpp',installable:false,status:'Not integrated',description:'Requires a compatible Vulkan build and a verified binding. Current installer does not provide this backend.'},
 {id:'executorch',name:'ExecuTorch · XNNPACK CPU · PTE',installable:false,status:'Not integrated',description:'Runs compatible PTE programs exported for the XNNPACK CPU backend. Requires a matching tokenizer and model execution interface; integration is not yet available.'},
 {id:'torch-asr-cuda',name:'Torch ASR CUDA',installable:false,status:'Not integrated',description:'Speech recognition runtime; requires a separate ASR model and transcription pipeline.'},
 {id:'harmony',name:'Harmony',installable:false,status:'Not integrated',description:'No compatible Harmony runtime pack is configured. Current inference uses the loaded model chat template; Harmony-specific packages need a separate verified integration.'},
 {id:'office',name:'Office document processor',installable:true,status:'Local Python � no Docker',description:'App-managed PDF, Word, Excel and PowerPoint generation/editing. Installs its own Python environment and libraries; Docker is optional for other sandbox tasks.'},
 ];}


