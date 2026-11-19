import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Recorder } from '../src/recorder.js';

const rate = 48_000;
const size = 4_096;
const frameCount = Math.ceil(45 * rate / size);
const sources = ['mic', 'system', 'both'];
const recorder = new Recorder();
recorder.context = { sampleRate: rate };
recorder.captureSource = 'both';

for (const [sourceIndex, name] of sources.entries()) {
  recorder.ring[name] = Array.from({ length: frameCount }, (_, block) => {
    const left = new Float32Array(size);
    const right = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const sample = block * size + i;
      left[i] = .7 * Math.sin(sample / (19 + sourceIndex));
      right[i] = .6 * Math.cos(sample / (23 + sourceIndex));
    }
    return [left, right];
  });
}

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function measure(seconds) {
  global.gc();
  const startMemory = process.memoryUsage().arrayBuffers;
  const start = performance.now();
  const outputs = recorder.captureReplay(seconds).channels;
  const ms = performance.now() - start;
  const memory = process.memoryUsage().arrayBuffers - startMemory;
  for (const name of sources) assert.equal(outputs[name].size, 44 + seconds * rate * 4);
  return [ms, memory / 1024 ** 2];
}

const results = [10, 30, 45].map(seconds => {
  measure(seconds);
  const runs = Array.from({ length: 5 }, () => measure(seconds));
  return { seconds, 'median ms': median(runs.map(run => run[0])).toFixed(2),
    'extra ArrayBuffer MiB': median(runs.map(run => run[1])).toFixed(2) };
});
console.log('Instant Replay WAV encoding at 48 kHz, with mic, system audio, and mixed stereo outputs.');
console.table(results);
