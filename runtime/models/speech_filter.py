"""Energy gate for local ASR; silence must not be decoded into invented words."""
import math


def speech_window(samples, rate=16000):
    frame = max(1, round(rate * .02))
    first, last, active = None, 0, 0
    for start in range(0, len(samples), frame):
        end = min(len(samples), start + frame)
        rms = math.sqrt(sum(float(value) ** 2 for value in samples[start:end]) / (end - start))
        if rms >= .004:
            if first is None:
                first = start
            last = end
            active += end - start
    if first is None or active < rate * .1:
        return None
    pad = round(rate * .15)
    return max(0, first - pad), min(len(samples), last + pad)
