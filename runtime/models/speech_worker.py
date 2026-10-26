"""Local speech-to-text worker. Receives only validated local paths over private stdio."""
import os, sys, json, wave, gc
from pathlib import Path
from speech_filter import speech_window
protocol = sys.stdout
sys.stdout = sys.stderr
import numpy as np
import torch
torch.set_num_threads(max(1, min(4, (os.cpu_count() or 2) // 2)))
from transformers import AutoProcessor, AutoModelForSpeechSeq2Seq, AutoModelForCTC
cached_path = None
processor = model = None

def audio_samples(path):
    try:
        with wave.open(path, 'rb') as wav:
            if wav.getsampwidth() != 2 or wav.getnchannels() not in (1, 2):
                raise ValueError('Use mono/stereo 16-bit PCM WAV audio.')
            if wav.getnframes() / wav.getframerate() > 120:
                raise ValueError('Record up to two minutes at a time.')
            rate, channels = wav.getframerate(), wav.getnchannels()
            data = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768
            if channels == 2:
                data = data.reshape(-1, 2).mean(axis=1)
    except (wave.Error, EOFError):
        raise ValueError('Local speech recognition requires a 16-bit PCM WAV recording. Convert other audio formats to WAV first.')
    if rate != 16000:
        data = np.interp(np.arange(int(len(data) * 16000 / rate)), np.arange(len(data)) * 16000 / rate, data).astype(np.float32)
    return data

def transcribe(args):
    global cached_path, processor, model
    path = str(Path(args['modelPath']).resolve())
    config = json.loads((Path(path) / 'config.json').read_text(encoding='utf-8'))
    kind = config.get('model_type')
    if kind not in ('whisper', 'wav2vec2', 'hubert', 'wavlm') or config.get('auto_map'):
        raise ValueError('This speech architecture is not supported by the local adapter.')
    samples = audio_samples(args['audioPath'])
    duration = len(samples) / 16000
    if speech_window(samples) is None:
        return {'text': '', 'durationSeconds': duration, 'device': 'cpu', 'architecture': kind}
    if cached_path != path:
        model = processor = None
        gc.collect()
        processor = AutoProcessor.from_pretrained(path, local_files_only=True, trust_remote_code=False)
        cls = AutoModelForSpeechSeq2Seq if kind == 'whisper' else AutoModelForCTC
        model = cls.from_pretrained(path, local_files_only=True, trust_remote_code=False, use_safetensors=True).to('cpu').eval()
        cached_path = path
    parts = []
    for offset in range(0, len(samples), 30 * 16000):
        segment = samples[offset:offset + 30 * 16000]
        window = speech_window(segment)
        if window is None:
            continue
        inputs = processor(segment[window[0]:window[1]], sampling_rate=16000, return_tensors='pt')
        with torch.inference_mode():
            if kind == 'whisper':
                kwargs = {'max_new_tokens': max(1, min(384, int(getattr(model.config, 'max_target_positions', 448)) - 16))}
                if args.get('language') and model.config.vocab_size > 51864:
                    kwargs.update(language=args['language'].split('-')[0], task='transcribe')
                ids = model.generate(**inputs, **kwargs)
            else:
                ids = model(**inputs).logits.argmax(dim=-1)
        parts.append(processor.batch_decode(ids, skip_special_tokens=True)[0].strip())
    return {'text': ' '.join(parts), 'durationSeconds': len(samples) / 16000, 'device': 'cpu', 'architecture': kind}

for line in sys.stdin:
    try:
        message = json.loads(line)
        result = transcribe(message['args'])
        protocol.write(json.dumps({'id': message['id'], 'result': result}, ensure_ascii=True) + '\n')
    except Exception as error:
        protocol.write(json.dumps({'id': message.get('id') if 'message' in locals() else None, 'error': str(error)}, ensure_ascii=True) + '\n')
    protocol.flush()
