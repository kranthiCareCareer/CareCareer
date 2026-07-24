---
inclusion: manual
---

# Demo Video Production Guide

## Overview

This guide explains how to produce narrated demo videos for CareCareer using automated tools.
No manual screen recording needed — everything is scripted and reproducible.

## Tools Required

| Tool                 | Purpose                              | Install Command                     |
| -------------------- | ------------------------------------ | ----------------------------------- |
| Playwright (Node.js) | Browser automation + video recording | Already in workspace                |
| Python 3.12+         | TTS generation + video composition   | `winget install Python.Python.3.12` |
| edge-tts             | Microsoft neural TTS (no API key)    | `pip install edge-tts`              |
| ffmpeg               | Video composition + encoding         | `winget install Gyan.FFmpeg`        |

Python path on this machine: `C:\Users\Lenovo\AppData\Local\Programs\Python\Python312\python.exe`

## Pipeline (3 Steps)

### Step 1: Record Browser Segments

```bash
# Ensure demo environment is running
make demo-up
make demo-seed

# Record all scenes (headless, 1920x1080)
node scripts/demo-video/record_demo.cjs
```

Output: `scripts/demo-video/recordings/*.webm` (one per scene)

### Step 2: Generate Voiceover Audio

```bash
python scripts/demo-video/generate_voiceover.py
```

Output: `scripts/demo-video/voiceover/*.mp3` (one per scene)

Voice: `en-US-AvaNeural` (Microsoft's best natural female voice)
Rate: -5% (slightly slower for clarity)

### Step 3: Compose Final Video

```bash
python scripts/demo-video/compose_final_video.py
```

Output: `scripts/demo-video/output/CareCareer_Demo_Final.mp4`

This combines each video segment with its voiceover audio, then concatenates
all segments into one continuous video.

## Available Voices (Female, English US)

| Voice ID             | Character                        |
| -------------------- | -------------------------------- |
| en-US-AvaNeural      | Professional, warm (RECOMMENDED) |
| en-US-EmmaNeural     | Clear, articulate                |
| en-US-JennyNeural    | Friendly, approachable           |
| en-US-AriaNeural     | Confident, broadcast-style       |
| en-US-MichelleNeural | Warm, conversational             |

To change voice, edit `VOICE` in `generate_voiceover.py`.

## Adding New Scenes

1. Add a new `recordScene()` call in `record_demo.cjs`
2. Add matching narration text in `generate_voiceover.py` NARRATIONS list
3. Add the scene mapping in `compose_final_video.py` SCENES list
4. Re-run all three steps

## Narration Tips

- Keep each segment 5-15 seconds of narration
- Use present tense ("The administrator sees...")
- Focus on business value, not technical details
- No jargon the audience wouldn't understand
- End each segment with a natural pause

## Troubleshooting

### Video recording shows blank

- Ensure Docker Compose is running and seeded
- Check http://localhost:8080 is accessible before recording

### ffmpeg not found

- Restart terminal after winget install (PATH updated)
- Or use full path: `C:\Users\Lenovo\scoop\shims\ffmpeg.exe`

### edge-tts fails

- Requires internet connection (calls Microsoft Edge API)
- No API key needed — uses same service as Edge browser read-aloud
- If rate-limited, add `await asyncio.sleep(1)` between generations

### Video too short for narration

- The compositor uses `tpad` to extend video to match audio length
- If still mismatched, increase sleep times in record_demo.cjs

## File Structure

```
scripts/demo-video/
  record_demo.cjs           # Playwright recorder
  generate_voiceover.py     # TTS generator
  compose_final_video.py    # ffmpeg compositor
  list_voices.py            # Voice listing utility
  recordings/               # .webm video segments
  voiceover/                # .mp3 audio segments
  screenshots/              # .png snapshots
  output/                   # Final composed video
```

## Quality Settings

- Video: 1920x1080, libx264, CRF 20 (high quality)
- Audio: AAC 192kbps
- Output: .mp4 with faststart for web streaming
