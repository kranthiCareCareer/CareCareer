"""
CareCareer Demo Voiceover Generator

Generates narration audio for each scene using Microsoft Edge TTS.
Voice: en-US-AvaNeural (natural, professional female voice)

Run: python scripts/demo-video/generate_voiceover.py
"""
import asyncio
import os
import edge_tts

VOICE = "en-US-AvaNeural"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "voiceover")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Narration script - each scene with timing-appropriate text
NARRATIONS = [
    ("01-intro", "Welcome to CareCareer, the AI-native healthcare workforce platform. Let me show you how three roles work together to staff a healthcare facility in minutes, not days."),
    ("02-admin-dashboard", "The platform administrator has complete visibility across all tenants, facilities, and workforce. From the dashboard, they can manage every aspect of the operation."),
    ("03-admin-facilities", "Here we see Mercy General Hospital, fully configured with its location, timezone, and geo-fence for clock validation. The emergency department is ready for shift scheduling."),
    ("04-admin-workers", "Our workforce view shows Sarah Johnson, a registered nurse with active status. Her credentials are verified, and she's ready to accept shift assignments."),
    ("05-admin-shifts", "The shifts view displays all current and upcoming opportunities. Each shift shows its role requirement, staffing level, and pay rate at a glance."),
    ("06-admin-audit", "Every action in the system is recorded in an immutable audit trail. From credential verification to timecard approval, nothing escapes the compliance record."),
    ("07-client-signin", "Now let's switch to the client perspective. The hiring manager at Mercy General Hospital signs in to manage their staffing needs."),
    ("08-client-create-shift", "Creating a shift is straightforward. The client specifies the role, date, time, worker count, and rates. One click and the opportunity is live on the marketplace."),
    ("09-client-shifts", "The client can see all their open and filled shifts, track staffing levels in real time, and publish new opportunities instantly."),
    ("10-client-timecards", "When workers complete their shifts, timecards appear here for review. The client can approve or request corrections with full audit tracking."),
    ("11-worker-signin", "Now from the worker's perspective. Sarah Johnson signs in to find her next assignment."),
    ("12-worker-marketplace", "The marketplace shows only shifts Sarah is qualified for, based on her verified credentials and eligibility. She can request any available shift with a single tap."),
    ("13-worker-assignments", "Once confirmed, assignments appear here with clock-in and clock-out controls. GPS coordinates validate presence at the facility."),
    ("14-worker-notifications", "Sarah receives real-time notifications for shift confirmations, timecard approvals, and credential updates. No important update is missed."),
    ("15-mailhog", "Behind the scenes, email notifications are delivered reliably. The system retries on failure and prevents duplicate delivery, ensuring every stakeholder stays informed."),
    ("16-closing", "CareCareer delivers complete healthcare staffing in one integrated platform. Multi-tenant isolation, role-based security, deterministic eligibility, and a full audit trail. Built for compliance. Ready for scale."),
]


async def generate_audio(text, filename):
    """Generate audio file from text using Edge TTS."""
    output_path = os.path.join(OUTPUT_DIR, filename)
    communicate = edge_tts.Communicate(text, VOICE, rate="-5%", pitch="+0Hz")
    await communicate.save(output_path)
    print(f"  Generated: {filename}")


async def main():
    print("\n  CareCareer Voiceover Generator")
    print(f"  Voice: {VOICE}")
    print(f"  Output: {OUTPUT_DIR}\n")

    for scene_id, text in NARRATIONS:
        filename = f"{scene_id}.mp3"
        await generate_audio(text, filename)

    print(f"\n  Done! {len(NARRATIONS)} audio segments generated.\n")


if __name__ == "__main__":
    asyncio.run(main())
