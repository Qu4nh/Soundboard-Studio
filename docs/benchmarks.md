# Performance measurements

The packaged Soundboard Studio v1.0.0 build was measured on Windows x64 with an Intel Core i7-10700K and 16 logical processors. The tests used isolated profiles, software rendering, and synthetic audio with automatic Windows microphone switching disabled. Mic mixing, Instant Replay, and automatic catalog refresh were off in the idle and playback scenarios.

## Playback and Soundlab

| Workload | CPU usage | Private committed memory |
| --- | ---: | ---: |
| Idle with the window open | 0.05% average | 204 MiB median |
| Three overlapping 45-second stereo clips | 1.35% average | 346 MiB median |

CPU usage is the app's share of capacity across all logical processors. CPU and private committed memory are summed across the Electron processes using `app.getAppMetrics()`, with 31 samples at 250 ms intervals for each workload.

With the window open and idle, the Windows **private working set** totaled **129.9–133.2 MiB** over three fresh launches. Each sample used `Win32_PerfRawData_PerfProc_Process.WorkingSetPrivate` for the app's Electron processes about 6.5 seconds after the dock appeared. Private working set is the app's private memory resident in physical RAM. The table above reports private committed memory, which also includes pages that need not be resident.

In Soundlab, saving a copy of a 45-second stereo clip with a +7 semitone pitch shift took **1.94 s**, from clicking **Save a copy** to the new pad appearing. The output was a 48 kHz stereo PCM WAV. Private committed memory peaked at **442 MiB** during the sampling window for the save.

Recently decoded clips are kept in a **64 MiB** least-recently-used cache so repeated playback can reuse audio buffers. Active and paused sounds keep their buffers until playback ends. The WAV save path transfers audio bytes as a typed array through Electron IPC.

## Playback interface

With 240 pads and three active clips, the visible window used **7.18–8.39 ms of renderer JavaScript time per second** across two samples. The minimized window used **0.31 ms of renderer task time per second**, and the hidden window used **0.28 ms**. Renderer metrics came from Chromium DevTools over roughly four seconds per sample.

The dock and active pads handle progress updates. When the window was minimized or hidden, the progress timer registered zero ticks during each sample. An injected shortcut event started a clip while minimized, and restoring the window showed the active playback state.

## Virtual microphone latency

Direct Web Audio output to VB-CABLE measured **114 ms** and **128 ms** median across two local loopback trials. Each trial scheduled 24 synthetic 1,537 Hz pulses into the audio graph and measured when an AudioWorklet detected them on the actual CABLE Output capture endpoint. Across the trials, samples ranged from **112.7 to 134 ms**. The Windows default devices were left intact.

The result includes graph processing, output and capture buffers, and VB-CABLE. The probe injected audio inside the app, so physical microphone capture, voice processing, the receiving app, and network transport were outside the measured path. The operating system and driver can vary the buffer size. [VB-CABLE reference manual](https://vb-audio.com/Cable/VBCABLE_ReferenceManual.pdf)

## Experimental Rust WASAPI probe

A standalone Rust probe sent 24 synthetic 1,537 Hz pulses per run to CABLE Input and detected them on CABLE Output. Across four runs, all **96 pulses** were detected. Median latency per run was **70–90 ms** and the highest run p95 was **90.86 ms**. The probe timed submission of the first pulse frames to detection in the native capture client. Both endpoints reported a 10 ms minimum shared-mode engine period.

The probe bypassed the app mixer and used WASAPI for both playback and capture. The app uses Web Audio and the timing origin differs from the Web Audio measurement above. These results apply to the local cable path and exclude physical mic capture and voice calls. Default Windows devices stayed the same.

## Instant Replay encoding

The encoder writes the requested range directly from captured PCM blocks and produces three stereo WAVs for microphone, system audio, and their mix.

| Replay length | Median encoding time | Median additional `ArrayBuffer` memory |
| ---: | ---: | ---: |
| 10 s | 46.08 ms | 10.99 MiB |
| 30 s | 115.57 ms | 32.96 MiB |
| 45 s | 167.82 ms | 49.44 MiB |

The benchmark uses Node.js 24.16.0 and synthetic 48 kHz stereo PCM in 4,096-frame blocks. Each duration has one warm-up and five timed calls to `Recorder.captureReplay()`. Memory is the change in tracked `ArrayBuffer` bytes during the call after a pre-run garbage collection. Each run checks the byte length of all three WAV outputs.

```powershell
npm run bench:replay
```
