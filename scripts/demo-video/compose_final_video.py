"""
CareCareer Demo Video Compositor

Combines recorded screen segments with voiceover audio into one final demo video.
Uses ffmpeg to concatenate and overlay audio.

Run: python scripts/demo-video/compose_final_video.py
Prerequisites: ffmpeg installed, recordings/ and voiceover/ populated
"""
import os
import subprocess
import json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RECORDINGS_DIR = os.path.join(SCRIPT_DIR, "recordings")
VOICEOVER_DIR = os.path.join(SCRIPT_DIR, "voiceover")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ffmpeg path (winget install location)
FFMPEG = r"C:\Users\Lenovo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
FFPROBE = r"C:\Users\Lenovo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffprobe.exe"

# Scene definitions: (video_file, audio_file)
SCENES = [
    ("01-intro-persona-selector.webm", "01-intro.mp3"),
    ("02-admin-dashboard.webm", "02-admin-dashboard.mp3"),
    ("03-admin-facilities.webm", "03-admin-facilities.mp3"),
    ("04-admin-workers.webm", "04-admin-workers.mp3"),
    ("05-admin-shifts.webm", "05-admin-shifts.mp3"),
    ("06-admin-audit.webm", "06-admin-audit.mp3"),
    ("07-client-signin.webm", "07-client-signin.mp3"),
    ("08-client-create-shift.webm", "08-client-create-shift.mp3"),
    ("09-client-shifts.webm", "09-client-shifts.mp3"),
    ("10-client-timecards.webm", "10-client-timecards.mp3"),
    ("11-worker-signin.webm", "11-worker-signin.mp3"),
    ("12-worker-marketplace.webm", "12-worker-marketplace.mp3"),
    ("13-worker-assignments.webm", "13-worker-assignments.mp3"),
    ("14-worker-notifications.webm", "14-worker-notifications.mp3"),
    ("15-mailhog-inbox.webm", "15-mailhog.mp3"),
]


def get_duration(file_path):
    """Get media file duration in seconds using ffprobe."""
    cmd = [
        FFPROBE, "-v", "quiet", "-print_format", "json",
        "-show_format", file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def combine_scene(video_path, audio_path, output_path):
    """Combine a video segment with its audio narration."""
    # Get audio duration to ensure video is at least as long
    audio_dur = get_duration(audio_path)

    # Combine: use video as base, overlay audio, extend video if needed
    cmd = [
        FFMPEG, "-y",
        "-i", video_path,
        "-i", audio_path,
        "-filter_complex",
        f"[0:v]tpad=stop_duration={audio_dur + 1}:stop_mode=clone[v]",
        "-map", "[v]",
        "-map", "1:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, timeout=60)


def concatenate_scenes(scene_files, output_path):
    """Concatenate all scene files into one final video."""
    # Create concat file
    concat_file = os.path.join(OUTPUT_DIR, "concat_list.txt")
    with open(concat_file, "w") as f:
        for scene_file in scene_files:
            f.write(f"file '{scene_file}'\n")

    cmd = [
        FFMPEG, "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, timeout=300)
    os.remove(concat_file)


def main():
    print("\n  CareCareer Demo Video Compositor\n")

    # Step 1: Combine each scene's video + audio
    combined_scenes = []
    for video_file, audio_file in SCENES:
        video_path = os.path.join(RECORDINGS_DIR, video_file)
        audio_path = os.path.join(VOICEOVER_DIR, audio_file)
        output_name = f"combined_{video_file.replace('.webm', '.mp4')}"
        output_path = os.path.join(OUTPUT_DIR, output_name)

        if not os.path.exists(video_path):
            print(f"  Skipping (no video): {video_file}")
            continue
        if not os.path.exists(audio_path):
            print(f"  Skipping (no audio): {audio_file}")
            continue

        print(f"  Combining: {video_file} + {audio_file}")
        combine_scene(video_path, audio_path, output_path)
        combined_scenes.append(output_path)

    if not combined_scenes:
        print("\n  No scenes to combine. Run record_demo.cjs and generate_voiceover.py first.")
        return

    # Step 2: Concatenate all combined scenes
    final_output = os.path.join(OUTPUT_DIR, "CareCareer_Demo_Final.mp4")
    print(f"\n  Concatenating {len(combined_scenes)} scenes...")
    concatenate_scenes(combined_scenes, final_output)

    if os.path.exists(final_output):
        size_mb = os.path.getsize(final_output) / (1024 * 1024)
        duration = get_duration(final_output)
        print(f"\n  Final video: {final_output}")
        print(f"  Size: {size_mb:.1f} MB")
        print(f"  Duration: {duration:.0f} seconds ({duration/60:.1f} minutes)")
    else:
        print("\n  Error: Final video was not created.")

    print("\n  Done!\n")


if __name__ == "__main__":
    main()
